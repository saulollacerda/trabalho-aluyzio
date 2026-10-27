import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile, mkdir } from 'node:fs/promises';
const tables = new Set(['usuario','sessao','departamento','cargo','colaborador','historico_colaborador',
  'parametro_calculo','parametro_custo','jornada_referencia','efetivo_referencia','hora_extra','movimentacao',
  'custo_turnover','ausencia','indicador','auditoria']);
export function repository(client) {
  const dateColumns = new Set(['data','data_admissao','data_desligamento','vigencia_inicio','vigencia_fim','competencia','periodo_inicio','periodo_fim']);
  const query = async (sql, params = []) => (await client.query(sql, params)).rows.map(row =>
    Object.fromEntries(Object.entries(row).map(([key,value]) => [key,dateColumns.has(key) && value instanceof Date ? value.toISOString().slice(0,10) : value])));
  const one = async (sql, params = []) => (await query(sql, params))[0];
  const check = table => { if (!tables.has(table)) throw new Error('Tabela não permitida.'); };
  return {
    query, one,
    async insert(table, data) {
      check(table);
      const keys = Object.keys(data);
      if (!keys.every(k => /^[a-z_]+$/.test(k))) throw new Error('Coluna inválida.');
      return one(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING *`, Object.values(data));
    },
    async update(table, id, data) {
      check(table);
      const keys = Object.keys(data);
      if (!keys.every(k => /^[a-z_]+$/.test(k))) throw new Error('Coluna inválida.');
      return one(`UPDATE ${table} SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...Object.values(data)]);
    },
    async get(table, id) { check(table); return one(`SELECT * FROM ${table} WHERE id=$1`, [id]); },
  };
}
export async function connectDatabase({ url = process.env.DATABASE_URL, directory = process.env.PGLITE_DIR || '.data/postgres' } = {}) {
  if (process.env.VERCEL && !url) throw new Error('Vercel exige DATABASE_URL de um PostgreSQL externo.');
  if (process.env.NODE_ENV === 'production' && !url) throw new Error('Produção exige DATABASE_URL.');
  if (url) {
    pg.types.setTypeParser(1082, v => v); // DATE sempre YYYY-MM-DD; não depende do fuso do host.
    const pool = new pg.Pool({ connectionString: url, max: 3, connectionTimeoutMillis: 10000 });
    return {
      kind: 'postgresql',
      async run(work) {
        for (let attempt = 0; ; attempt++) {
          const client = await pool.connect();
          try {
            await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
            const result = await work(repository(client));
            await client.query('COMMIT'); return result;
          } catch (e) {
            await client.query('ROLLBACK');
            if (e.code === '40001' && attempt < 3) continue;
            throw e;
          } finally { client.release(); }
        }
      },
      async migrate() {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(13032026)');
          if (!(await client.query("SELECT to_regclass('public.schema_migration') AS t")).rows[0].t)
            await client.query(await readFile(new URL('./001-initial.sql', import.meta.url), 'utf8'));
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
      },
      close: () => pool.end(),
    };
  }
  if (directory !== ':memory:') await mkdir(directory, { recursive:true });
  const db = new PGlite(directory === ':memory:' ? undefined : directory);
  await db.waitReady;
  let tail = Promise.resolve();
  return {
    kind: 'pglite',
    run(work) {
      const task = tail.then(() => db.transaction(tx => work(repository(tx))));
      tail = task.catch(() => {}); return task;
    },
    async migrate() {
      if (!(await db.query("SELECT to_regclass('public.schema_migration') AS t")).rows[0].t)
        await db.transaction(async tx => tx.exec(await readFile(new URL('./001-initial.sql', import.meta.url), 'utf8')));
    },
    close: () => db.close(),
  };
}
