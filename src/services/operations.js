import { randomUUID } from 'node:crypto';
import { AppError, ensure, found } from '../domain/errors.js';
import { D, money, salaryMean, overtime, turnoverCost, recruitment, overtimeTotals, sum } from '../domain/calculations.js';
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(new Date());
export const dateString = v => typeof v === 'string' ? v.slice(0, 10) : v.toISOString().slice(0, 10);
export async function audit(r, user, entidade, id, acao, changes) {
  await r.insert('auditoria', { id: randomUUID(), usuario_id: user?.id ?? null, entidade,
    registro_id: id, acao, campos_alterados: JSON.stringify(changes) });
}
export async function changed(r) { await r.query('UPDATE revisao_dados SET versao=versao+1 WHERE id=1'); }
export async function create(r, user, table, data) {
  const row = await r.insert(table, { id: randomUUID(), ...data });
  await audit(r, user, table, row.id, 'criar', Object.keys(data)); await changed(r); return row;
}
export async function update(r, user, table, id, data) {
  found(await r.get(table, id));
  const row = await r.update(table, id, data);
  await audit(r, user, table, id, 'alterar', Object.keys(data)); await changed(r); return row;
}
function paginated(rows, q) {
  const page = q.page ?? 1, size = q.page_size ?? 20;
  return { itens: rows.slice((page - 1) * size, page * size), total: rows.length, page, page_size: size };
}
export async function list(r, table, q = {}) {
  // Valores externos entram apenas como parâmetros; nomes de tabela são definidos nas rotas.
  const allowed = new Set(['departamento','cargo','colaborador','parametro_calculo','parametro_custo',
    'jornada_referencia','efetivo_referencia','hora_extra','movimentacao','ausencia','auditoria']);
  if (!allowed.has(table)) throw new Error('Tabela inválida.');
  const where = [], args = [];
  const clause = (sql, value) => { args.push(value); where.push(sql.replace('?', '$' + args.length)); };
  if (q.data_inicio) clause(`${table === 'auditoria' ? 'ocorrido_em::date' : 'data'} >= ?`, q.data_inicio);
  if (q.data_fim) clause(`${table === 'auditoria' ? 'ocorrido_em::date' : 'data'} <= ?`, q.data_fim);
  for (const key of ['colaborador_id','tipo','status','entidade','ano','competencia','ativo','codigo','cargo_id'])
    if (q[key] !== undefined) clause(`${key} = ?`, q[key]);
  if (q.nome) clause('nome ILIKE ?', '%' + q.nome + '%');
  if (q.departamento_id) {
    if (table === 'colaborador') clause('cargo_id IN (SELECT id FROM cargo WHERE departamento_id=?)', q.departamento_id);
    else clause('departamento_id = ?', q.departamento_id);
  }
  const filter = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = Number((await r.one(`SELECT count(*) AS n FROM ${table}${filter}`, args)).n);
  const page = q.page ?? 1, size = q.page_size ?? 20;
  const order = ['hora_extra','movimentacao','ausencia'].includes(table) ? 'data,id' : table === 'auditoria' ? 'ocorrido_em DESC,id' : 'id';
  const rows = await r.query(`SELECT * FROM ${table}${filter} ORDER BY ${order} LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
    [...args, size, (page - 1) * size]);
  return { itens: table === 'cargo' ? rows.map(c => ({ ...c, media_salarial: salaryMean(c) })) : rows, total, page, page_size: size };
}
export async function cargoSave(r, user, body, id) {
  const previous = id ? found(await r.get('cargo', id), 'Cargo') : {};
  const data = { ...previous, ...body };
  salaryMean(data); found(await r.get('departamento', data.departamento_id), 'Departamento');
  if (id && body.departamento_id && body.departamento_id !== previous.departamento_id)
    ensure(!(await r.one('SELECT id FROM historico_colaborador WHERE cargo_id=$1 LIMIT 1', [id])),
      'Cargo com histórico não pode mudar de departamento. Cadastre outro cargo.', {}, 409);
  const row = id ? await update(r, user, 'cargo', id, body) : await create(r, user, 'cargo', body);
  return { ...row, media_salarial: salaryMean(row) };
}
export async function cargoDelete(r, user, id) {
  found(await r.get('cargo', id), 'Cargo');
  const link = await r.one('SELECT id FROM historico_colaborador WHERE cargo_id=$1 LIMIT 1', [id]);
  ensure(!link, 'Cargo vinculado a colaboradores. Use PATCH com ativo=false para inativar.', { ativo: 'Inative o cargo para preservar o histórico.' }, 409);
  await r.query('DELETE FROM cargo WHERE id=$1', [id]);
  await audit(r, user, 'cargo', id, 'excluir', []); await changed(r);
}
export async function collaboratorSave(r, user, body, id) {
  const previous = id ? found(await r.get('colaborador', id), 'Colaborador') : null;
  const { data_vigencia, ...input } = body;
  ensure(Object.keys(input).length > 0, 'Informe ao menos um campo para alterar.');
  const data = { ...previous, ...input };
  const cargo = found(await r.get('cargo', data.cargo_id), 'Cargo');
  if (!previous || data.cargo_id !== previous.cargo_id) ensure(cargo.ativo, 'Selecione um cargo ativo.');
  ensure(data.data_admissao <= today(), 'Admissão futura não é suportada nesta etapa.');
  const needsHistory = !previous || ['cargo_id','salario_atual','horas_por_dia'].some(k => input[k] !== undefined && String(input[k]) !== String(previous[k]));
  const start = previous ? data_vigencia : data.data_admissao;
  if (needsHistory && previous) {
    ensure(start && start <= today() && start >= dateString(previous.data_admissao),
      'Informe data_vigencia entre a admissão e hoje.', { data_vigencia: 'Obrigatória ao alterar cargo, salário ou jornada diária.' });
    const latest = await r.one('SELECT * FROM historico_colaborador WHERE colaborador_id=$1 ORDER BY vigencia_inicio DESC LIMIT 1', [id]);
    ensure(start > dateString(latest.vigencia_inicio), 'A vigência deve ser posterior à última alteração.', {}, 409);
    if (previous.data_desligamento) ensure(start <= dateString(previous.data_desligamento), 'Vigência posterior ao desligamento.');
    const end = new Date(start + 'T00:00:00Z'); end.setUTCDate(end.getUTCDate() - 1);
    await r.update('historico_colaborador', latest.id, { vigencia_fim: end.toISOString().slice(0,10) });
  }
  const row = id ? await update(r, user, 'colaborador', id, input) : await create(r, user, 'colaborador', input);
  if (needsHistory) await r.insert('historico_colaborador', { id: randomUUID(), colaborador_id: row.id,
    cargo_id: data.cargo_id, departamento_id: cargo.departamento_id, salario: data.salario_atual,
    horas_por_dia: data.horas_por_dia, vigencia_inicio: start });
  return { ...row, avisos: D(data.salario_atual).eq(cargo[data.faixa]) ? [] : ['Salário difere da faixa selecionada (C16). Cadastro preservado com aviso.'] };
}
export async function contextAt(r, id, date) {
  const person = found(await r.get('colaborador', id), 'Colaborador');
  ensure(person.ativo, 'Colaborador inativado para novos lançamentos.', {}, 409);
  ensure(date >= dateString(person.data_admissao) && (!person.data_desligamento || date <= dateString(person.data_desligamento)),
    'Data fora do vínculo do colaborador.');
  ensure(date <= today(), 'Lançamentos futuros não são suportados nesta etapa.');
  const history = found(await r.one(`SELECT * FROM historico_colaborador WHERE colaborador_id=$1 AND vigencia_inicio <= $2
    AND (vigencia_fim IS NULL OR vigencia_fim >= $2) ORDER BY vigencia_inicio DESC LIMIT 1`, [id, date]), 'Histórico vigente');
  return { person, history };
}
async function parameter(r, table, date, id) {
  const row = id ? await r.get(table, id) : await r.one(`SELECT * FROM ${table} WHERE vigencia_inicio <= $1 ORDER BY vigencia_inicio DESC LIMIT 1`, [date]);
  ensure(row && dateString(row.vigencia_inicio) <= date, 'Configure parâmetros vigentes na data do evento.', { parametro_id: 'Parâmetro ausente ou com vigência posterior ao evento.' }, 409);
  return row;
}
export async function overtimeCreate(r, user, b) {
  const { history } = await contextAt(r, b.colaborador_id, b.data);
  const p = await parameter(r, 'parametro_calculo', b.data, b.parametro_id);
  const tipo = new Date(b.data + 'T12:00:00Z').getUTCDay() === 0 ? 'domingo' : 'semana';
  if (b.tipo) ensure(b.tipo === tipo, 'O tipo deve corresponder ao dia da semana da data.');
  const min = tipo === 'domingo' ? p.percentual_domingo : p.percentual_semana;
  const additional = b.percentual_adicional ?? min;
  ensure(D(additional).gte(min), 'Adicional inferior ao parâmetro vigente.');
  return create(r, user, 'hora_extra', { colaborador_id: b.colaborador_id, departamento_id: history.departamento_id,
    data: b.data, quantidade_horas: b.quantidade_horas, tipo, percentual_adicional: additional,
    parametro_id: p.id, salario_base: history.salario, divisor_jornada: p.divisor_jornada,
    valor_calculado: overtime({ salario: history.salario, divisor: p.divisor_jornada, horas: b.quantidade_horas, adicional: additional }) });
}
export async function movementCreate(r, user, b) {
  if (b.tipo === 'saida') ensure(found(await r.get('colaborador', b.colaborador_id), 'Colaborador').status === 'ativo', 'Colaborador já desligado.', {}, 409);
  const { person, history } = await contextAt(r, b.colaborador_id, b.data);
  if (b.tipo === 'saida') {
    ensure(person.status === 'ativo', 'Colaborador já desligado.', {}, 409);
    ensure(b.classificacao, 'Classifique a saída.', { classificacao: 'Informe voluntario ou involuntario.' });
    ensure(!b.contrato_experiencia, 'Saída não recebe contrato_experiencia.');
    const futureEvent = await r.one(`SELECT id FROM hora_extra WHERE colaborador_id=$1 AND data>$2
      UNION ALL SELECT id FROM ausencia WHERE colaborador_id=$1 AND data>$2
      UNION ALL SELECT id FROM historico_colaborador WHERE colaborador_id=$1 AND vigencia_inicio>$2 LIMIT 1`, [person.id, b.data]);
    ensure(!futureEvent, 'Há lançamentos posteriores à data de saída.', {}, 409);
    await r.update('colaborador', person.id, { status: 'desligado', data_desligamento: b.data });
    await audit(r, user, 'colaborador', person.id, 'alterar', ['status','data_desligamento']);
  } else {
    ensure(!b.classificacao, 'Entradas não recebem classificação.');
    ensure(b.data === dateString(person.data_admissao), 'Entrada deve coincidir com a data de admissão.');
  }
  return create(r, user, 'movimentacao', { ...b, departamento_id: history.departamento_id });
}
export async function absenceCreate(r, user, b) {
  const { history } = await contextAt(r, b.colaborador_id, b.data);
  ensure(b.tipo === 'atraso' ? b.minutos_atraso > 0 : b.minutos_atraso === undefined,
    'Informe minutos_atraso apenas para atraso.', { minutos_atraso: 'Inteiro positivo, obrigatório para atraso.' });
  const hours = b.tipo === 'falta' ? D(history.horas_por_dia) : D(b.minutos_atraso).div(60);
  const used = await r.one('SELECT coalesce(sum(horas_ausentes),0) AS total FROM ausencia WHERE colaborador_id=$1 AND data=$2', [b.colaborador_id, b.data]);
  ensure(D(used.total).plus(hours).lte(history.horas_por_dia), 'Ausência diária excede a jornada.');
  return create(r, user, 'ausencia', { ...b, departamento_id: history.departamento_id, horas_ausentes: hours.toFixed(8) });
}
export async function costCreate(r, user, movementId, b) {
  const move = found(await r.get('movimentacao', movementId), 'Movimentação');
  ensure(move.tipo === 'saida', 'Custos só podem ser associados a uma saída.');
  ensure(!await r.one('SELECT id FROM custo_turnover WHERE movimentacao_id=$1', [move.id]), 'Saída já possui custo.', {}, 409);
  const { history } = await contextAt(r, move.colaborador_id, dateString(move.data));
  const p = await parameter(r, 'parametro_custo', dateString(move.data), b.parametro_custo_id);
  // Rateio fixo e reproduzível: custo anual de R&S / saídas previstas, conforme decisão C14.
  const part = recruitment(p).div(p.saidas_previstas_ano);
  const inputs = { parametros: p, salario: history.salario, saidas: 1, parcela_recrutamento: part.toFixed(12), criterio_rateio: 'recrutamento_anual / saidas_previstas_ano' };
  return create(r, user, 'custo_turnover', { movimentacao_id: move.id, parametro_custo_id: p.id,
    salario_base: history.salario, entradas: JSON.stringify(inputs), ...turnoverCost(inputs) });
}
export async function overtimeQuery(r, q) {
  const result = await list(r, 'hora_extra', q);
  const args = [], where = [];
  for (const [key, op, value] of [['data','>=',q.data_inicio],['data','<=',q.data_fim],['colaborador_id','=',q.colaborador_id],['departamento_id','=',q.departamento_id]]) {
    if (value !== undefined) { args.push(value); where.push(`${key}${op}$${args.length}`); }
  }
  const rows = await r.query('SELECT quantidade_horas, valor_calculado FROM hora_extra' + (where.length ? ' WHERE ' + where.join(' AND ') : ''), args);
  return { ...result, totais: overtimeTotals(rows) };
}
export async function costsQuery(r, q) {
  const args = [], where = [];
  for (const [key, op, value] of [['m.data','>=',q.data_inicio],['m.data','<=',q.data_fim],['m.departamento_id','=',q.departamento_id]]) {
    if (value !== undefined) { args.push(value); where.push(`${key}${op}$${args.length}`); }
  }
  const rows = await r.query(`SELECT c.*,m.data,m.departamento_id FROM custo_turnover c JOIN movimentacao m ON m.id=c.movimentacao_id` +
    (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY m.data,c.id', args);
  const evolution = new Map();
  for (const row of rows) {
    const month = dateString(row.data).slice(0,7);
    evolution.set(month, (evolution.get(month) ?? D(0)).plus(row.custo_total));
  }
  return { ...paginated(rows, q), custo_total: money(sum(rows.map(r => r.custo_total))),
    evolucao: [...evolution].map(([periodo, v]) => ({ periodo, custo_total: money(v) })),
    criterio: 'Soma dos custos efetivamente associados às saídas; R&S rateado pelas saídas previstas anuais.' };
}
