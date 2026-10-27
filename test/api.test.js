import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import SwaggerParser from '@apidevtools/swagger-parser';
import { connectDatabase } from '../src/db/database.js';
import { buildApp } from '../src/app.js';
import { seedDatabase, ids } from '../scripts/seed.js';
import { dateString } from '../src/services/operations.js';

test('API, banco relacional e fluxos de aceitação',async t=>{
  const db=await connectDatabase({ url:process.env.TEST_DATABASE_URL||'',directory:':memory:' });
  if (process.env.TEST_DATABASE_URL) {
    const existing=await db.run(r=>r.one("SELECT to_regclass('public.usuario') AS tabela"));
    if (existing.tabela) { await db.close();throw new Error('TEST_DATABASE_URL deve apontar para um banco de teste vazio. Recusado banco já inicializado.'); }
  }
  await db.migrate();await seedDatabase(db);
  const app=await buildApp(db);
  t.after(async()=>{ await app.close();await db.close(); });
  let cookie,csrf;
  const request=async(method,path,payload,options={})=>{
    const result=await app.inject({ method,url:'/api/v1'+path,payload,
      headers:{ ...(cookie?{ cookie }:{}),...(csrf?{ 'x-csrf-token':csrf }:{}),...options.headers } });
    return { status:result.statusCode,data:result.json(),raw:result };
  };
  const ok=async(method,path,payload,status=200)=>{
    const res=await request(method,path,payload);assert.equal(res.status,status,JSON.stringify(res.data));return res.data;
  };
  await t.test('RNF03: bloqueia sem sessão',async()=>{
    assert.equal((await request('GET','/colaboradores')).status,401);
  });
  await t.test('login, cookie HttpOnly e CSRF',async()=>{
    const res=await request('POST','/auth/login',{ email:'rh@example.com',senha:'DemoRH!2026' });
    assert.equal(res.status,200,JSON.stringify(res.data));
    cookie=res.raw.headers['set-cookie'].split(';')[0];csrf=res.data.csrf_token;
    assert.match(res.raw.headers['set-cookie'],/HttpOnly/);assert.match(res.raw.headers['set-cookie'],/SameSite=Strict/);
    assert.equal((await request('POST','/departamentos',{ nome:'Bloqueado' },{ headers:{ 'x-csrf-token':'errado' } })).status,403);
  });
  await t.test('CA-RF01: valida e calcula média; 400 para JSON quebrado',async()=>{
    assert.equal((await request('POST','/cargos',{ nome:'Incompleto' })).status,422);
    assert.equal((await request('POST','/departamentos','{',{ headers:{ 'content-type':'application/json' } })).status,400);
    const res=await ok('GET','/cargos/'+ids.cargo);assert.equal(res.media_salarial,'2233.33');
    assert.equal((await request('POST','/departamentos',{ nome:'Exemplo',extra:123 })).status,422);
  });
  await t.test('CA-RF04: protege vínculos e permite inativar',async()=>{
    assert.equal((await request('DELETE','/cargos/'+ids.cargo)).status,409);
    assert.equal((await ok('PATCH','/cargos/'+ids.cargo,{ ativo:false })).ativo,false);
    await ok('PATCH','/cargos/'+ids.cargo,{ ativo:true });
    const cargo=await ok('POST','/cargos',{ codigo:'SEM-VINCULO',nome:'Temporário',departamento_id:ids.dept,faixa_i:'1',faixa_ii:'2',faixa_iii:'3' },201);
    await ok('DELETE','/cargos/'+cargo.id);
  });
  await t.test('CA-RF08: filtro e totalizador usam todos os registros, além da página',async()=>{
    const res=await ok('GET',`/horas-extras?colaborador_id=${ids.ana}&data_inicio=2026-10-01&data_fim=2026-10-31&page_size=1`);
    assert.equal(res.total,3);assert.equal(res.itens.length,1);
    assert.deepEqual(res.totais,{ horas_liquidas:'2.50',horas_extras:'3.50',valor_liquido:'32.38',valor_horas_extras:'42.61' });
    assert.equal((await request('GET','/horas-extras?data_inicio=2026-10-10&data_fim=2026-10-01')).status,422);
  });
  await t.test('CA-RN08: salário alterado não reescreve eventos; retroativo usa histórico',async()=>{
    await ok('PATCH','/colaboradores/'+ids.ana,{ salario_atual:'1650.00',data_vigencia:'2026-10-10' });
    const res=await ok('GET',`/horas-extras?colaborador_id=${ids.ana}`);
    assert.ok(res.itens.every(r=>r.salario_base==='1500.00'));
    const old=await ok('POST','/horas-extras',{ colaborador_id:ids.ana,data:'2026-10-09',quantidade_horas:'1.50' },201);
    assert.equal(old.valor_calculado,'15.34');
    const current=await ok('POST','/horas-extras',{ colaborador_id:ids.ana,data:'2026-10-12',quantidade_horas:'1.50' },201);
    assert.equal(current.valor_calculado,'16.88');assert.equal(current.salario_base,'1650.00');
    const history=await ok('GET','/colaboradores/'+ids.ana+'/historico');assert.equal(history.itens.length,2);
    assert.equal(dateString(history.itens[0].vigencia_fim),'2026-10-09');
    assert.equal((await request('PATCH','/colaboradores/'+ids.ana,{ salario_atual:'1700.00' })).status,422);
  });
  await t.test('regra de calendário de domingo e saldos zero/negativo',async()=>{
    assert.equal((await request('POST','/horas-extras',{ colaborador_id:ids.daniel,data:'2026-10-11',quantidade_horas:'1',tipo:'semana' })).status,422);
    const res=await ok('POST','/horas-extras',{ colaborador_id:ids.daniel,data:'2026-10-11',quantidade_horas:'2' },201);
    assert.equal(res.tipo,'domingo');assert.equal(res.valor_calculado,'27.27');
    const zero=await ok('POST','/horas-extras',{ colaborador_id:ids.daniel,data:'2026-10-12',quantidade_horas:'0' },201);
    assert.equal(zero.valor_calculado,'0.00');
  });
  await t.test('CA-RF10/11: saída sem classificação falha sem alterar status',async()=>{
    assert.equal((await request('POST','/movimentacoes',{ colaborador_id:ids.daniel,tipo:'saida',data:'2026-10-21' })).status,422);
    assert.equal((await ok('GET','/colaboradores/'+ids.daniel)).status,'ativo');
    assert.equal((await request('POST','/movimentacoes',{ colaborador_id:ids.marina,tipo:'saida',data:'2026-10-21',classificacao:'voluntario' })).status,409);
    assert.equal((await request('POST','/movimentacoes',{ colaborador_id:ids.marina,tipo:'saida',data:'2026-10-20',classificacao:'voluntario' })).status,409);
  });
  await t.test('CA-RF15: custo único, só para saída, filtros e entradas preservadas',async()=>{
    const movements=await ok('GET','/movimentacoes?tipo=saida');const id=movements.itens[0].id;
    const cost=await ok('GET',`/movimentacoes/${id}/custos`);assert.equal(cost.salario_base,'1500.00');
    assert.equal(cost.custo_total,'8228.50');assert.equal(cost.entradas.parametros.rs_percentual_tempo,'0.70');
    assert.equal((await request('POST',`/movimentacoes/${id}/custos`,{})).status,409);
    const entry=(await ok('GET','/movimentacoes?tipo=entrada')).itens[0];
    assert.equal((await request('POST',`/movimentacoes/${entry.id}/custos`,{})).status,422);
    const costs=await ok('GET','/indicadores/custos?data_inicio=2026-10-01&data_fim=2026-10-31');
    assert.equal(costs.custo_total,'8228.50');assert.equal(costs.evolucao[0].periodo,'2026-10');
  });
  await t.test('CA-RF19: ausência tipada, jornada e prevenção de duplicidade',async()=>{
    assert.equal((await request('POST','/ausencias',{ colaborador_id:ids.ana,data:'2026-10-13' })).status,422);
    assert.equal((await request('POST','/ausencias',{ colaborador_id:ids.ana,data:'2026-10-13',tipo:'atraso',minutos_atraso:500 })).status,422);
    assert.equal((await request('POST','/ausencias',{ colaborador_id:ids.ana,data:'2026-10-05',tipo:'falta' })).status,422);
  });
  await t.test('CA-RF13 e RN04: índice global e por departamento',async()=>{
    const res=await ok('GET','/indicadores/turnover?periodo=2026-10');
    assert.equal(res.valor,'66.67');assert.equal(res.numerador,'2.00000000');assert.equal(res.denominador,'3.00000000');
    const dept=await ok('GET',`/indicadores/turnover?periodo=2026-10&departamento_id=${ids.dept}`);assert.equal(dept.valor,res.valor);
    const annual=await ok('GET','/indicadores/turnover?periodo=2026');assert.equal(annual.valor,'33.33');
    assert.equal((await request('GET','/indicadores/turnover?periodo=2026-13')).status,422);
  });
  await t.test('CA-RN09/RF21: P5 e ponderado distintos, todos os colaboradores no denominador',async()=>{
    const res=await ok('GET','/indicadores/absenteismo?periodo=2026-10');
    assert.equal(res.valor,'4.65');assert.equal(res.detalhes.complementares[0].valor,'3.49');
    assert.equal(res.detalhes.individuais.length,4);
    assert.equal(res.detalhes.horas_previstas,'616.00000000');
    const year=await ok('GET','/indicadores/absenteismo?periodo=2026');assert.equal(year.valor,'0.39');
  });
  await t.test('RNF10: cache, recálculo explícito e invalidação mantêm histórico',async()=>{
    const first=await ok('GET','/indicadores/turnover?periodo=2026-10');
    assert.equal((await ok('GET','/indicadores/turnover?periodo=2026-10')).id,first.id);
    const second=await ok('POST','/indicadores/recalcular',{ tipo:'turnover',periodo:'2026-10' },201);
    assert.notEqual(second.id,first.id);
    await ok('POST','/departamentos',{ nome:'Nova revisão' },201);
    const third=await ok('GET','/indicadores/turnover?periodo=2026-10');
    assert.notEqual(third.id,second.id);assert.ok(third.revisao_dados>second.revisao_dados);
    const hist=await ok('GET','/indicadores/historico?tipo=turnover_geral');assert.ok(hist.total>=3);
  });
  await t.test('CA-RF25: dashboard coincide com consultas e valida meses completos',async()=>{
    const res=await ok('GET','/dashboard?data_inicio=2026-10-01&data_fim=2026-10-31');
    const extra=await ok('GET','/indicadores/horas-extras?data_inicio=2026-10-01&data_fim=2026-10-31');
    assert.deepEqual(res.totais.horas_extras,extra.totais);assert.equal(res.totais.custos,'8228.50');
    assert.equal(res.series[0].turnover.valor,'66.67');
    assert.equal((await request('GET','/dashboard?data_inicio=2026-10-02&data_fim=2026-10-31')).status,422);
  });
  await t.test('transações: concorrência não cria dois custos para uma saída',async()=>{
    const exit=await ok('POST','/movimentacoes',{ colaborador_id:ids.extra,tipo:'saida',data:'2026-10-22',classificacao:'involuntario' },201);
    const results=await Promise.all([request('POST',`/movimentacoes/${exit.id}/custos`,{}),request('POST',`/movimentacoes/${exit.id}/custos`,{})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
  });
  await t.test('RNF09: auditoria sem segredos e perfil sem permissão recebe 403',async()=>{
    const audits=await ok('GET','/auditoria');assert.ok(audits.total>0);
    assert.ok(!JSON.stringify(audits).includes('DemoRH!2026'));
    assert.ok(!JSON.stringify(audits).includes('senha_hash'));
    const user=await request('POST','/auth/login',{ email:'consulta@example.com',senha:'Consulta!2026' });
    assert.equal(user.status,200);
    const res=await request('GET','/colaboradores',undefined,{ headers:{ cookie:user.raw.headers['set-cookie'].split(';')[0] } });
    assert.equal(res.status,403);
  });
  await t.test('contrato OpenAPI válido e Swagger disponível',async()=>{
    await SwaggerParser.validate(structuredClone(app.swagger()));
    for (const path of ['/api/v1/auth/login','/api/v1/cargos','/api/v1/colaboradores/{id}/historico',
      '/api/v1/horas-extras','/api/v1/movimentacoes/{id}/custos','/api/v1/ausencias',
      '/api/v1/indicadores/recalcular','/api/v1/dashboard']) assert.ok(app.swagger().paths[path],path);
    const docs=await app.inject('/docs/');assert.equal(docs.statusCode,200);assert.match(docs.body,/swagger-ui/);
  });
  await t.test('logout revoga sessão no banco',async()=>{
    await ok('POST','/auth/logout');assert.equal((await request('GET','/auth/me')).status,401);
  });
});

test('persistência local sobrevive ao fechamento do banco',async()=>{
  // Diretório temporário isolado; o processo de teste nunca usa a massa local do aluno.
  const { mkdtemp,rm }=await import('node:fs/promises');const { tmpdir }=await import('node:os');const { join }=await import('node:path');
  const directory=await mkdtemp(join(tmpdir(),'rh-persist-'));
  try {
    const first=await connectDatabase({ url:'',directory });await first.migrate();
    const id=randomUUID();await first.run(r=>r.insert('departamento',{ id,nome:'Persistiu' }));await first.close();
    const second=await connectDatabase({ url:'',directory });
    try { assert.equal((await second.run(r=>r.get('departamento',id))).nome,'Persistiu'); } finally { await second.close(); }
  } finally { await rm(directory,{ recursive:true,force:true }); }
});
