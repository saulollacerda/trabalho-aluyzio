import * as s from './schemas.js';
import { ensure, found } from '../domain/errors.js';
import { salaryMean, D } from '../domain/calculations.js';
import * as op from '../services/operations.js';
import * as ind from '../services/indicators.js';
import { login, logout } from './auth.js';

export function registerRoutes(app, db) {
  const route = (method, path, tag, summary, options, handler) => {
    const { body, query, params, requiredQuery, requiredParams, requirements, status = 200, public: isPublic, ...extra } = options;
    app.route({ method, url: '/api/v1' + path,
      schema: { tags: [tag], summary, description: extra.description,
        'x-requisitos': requirements ?? [],
        security: isPublic ? [] : [{ cookieAuth: [] }],
        ...(body ? { body } : {}),
        ...(query ? { querystring: s.object(query,requiredQuery) } : {}),
        ...(params ? { params: s.object(params, requiredParams ?? Object.keys(params)) } : {}),
        response: { [status]: s.anyObject, ...Object.fromEntries([400,401,403,404,409,422,500].map(n => [n,s.errorResponse])) } },
      ...(extra.config ? { config: extra.config } : {}),
      handler: async (req, reply) => {
        if (req.query?.data_inicio && req.query?.data_fim) ensure(req.query.data_inicio <= req.query.data_fim, 'data_inicio deve ser anterior ou igual a data_fim.');
        const result = await db.run(r => handler(r, req, reply));
        reply.code(status); return result;
      },
    });
  };
  route('POST','/auth/login','01 • Acesso','Entrar e iniciar sessão', {
    public: true, body: s.object({ email: { type:'string',format:'email',maxLength:255,example:'rh@example.com' }, senha: { ...s.text(128,'DemoRH!2026'),format:'password' } },['email','senha']),
    config: { rateLimit: { max:10,timeWindow:'15 minutes' } },
    description:'O cookie HttpOnly é enviado automaticamente pelo navegador. O Swagger busca o token CSRF automaticamente para escritas.'
  },(r,req,reply) => login(r,req.body,reply));
  route('GET','/auth/me','01 • Acesso','Consultar usuário e token CSRF', {}, (_r,req) => ({ usuario: { id:req.user.id,email:req.user.email,perfil:req.user.perfil },csrf_token:req.csrfToken }));
  route('POST','/auth/logout','01 • Acesso','Encerrar sessão', {}, (r,req,reply) => logout(r,req.user,reply));

  route('GET','/departamentos','02 • Cargos','Listar departamentos',{ query:s.paging },(r,req) => op.list(r,'departamento',req.query));
  route('POST','/departamentos','02 • Cargos','Criar departamento', { body:s.object({ nome:s.text(100,'Tecnologia') },['nome']),status:201 },(r,req) => op.create(r,req.user,'departamento',req.body));
  route('GET','/cargos','02 • Cargos','Listar cargos e faixas salariais', { query:{ ...s.paging,nome:s.text(),codigo:s.text(),departamento_id:s.uuid,ativo:s.bool }, requirements:['RF02','RF05'] },(r,req) => op.list(r,'cargo',req.query));
  route('POST','/cargos','02 • Cargos','Cadastrar cargo', { body:s.object(s.cargo,['codigo','nome','departamento_id','faixa_i','faixa_ii','faixa_iii']),status:201,requirements:['RF01','RN01'] },(r,req) => op.cargoSave(r,req.user,req.body));
  route('GET','/cargos/:id','02 • Cargos','Consultar cargo', { params:{ id:s.uuid } },async (r,req) => { const c=found(await r.get('cargo',req.params.id),'Cargo'); return { ...c,media_salarial:salaryMean(c) }; });
  route('PATCH','/cargos/:id','02 • Cargos','Editar ou inativar cargo', { params:{ id:s.uuid },body:{ ...s.object(s.cargo),minProperties:1 },requirements:['RF03','RF04'] },(r,req) => op.cargoSave(r,req.user,req.body,req.params.id));
  route('DELETE','/cargos/:id','02 • Cargos','Excluir cargo sem vínculos', { params:{ id:s.uuid },requirements:['RF04'] },async(r,req) => { await op.cargoDelete(r,req.user,req.params.id); return { mensagem:'Cargo excluído.' }; });

  route('GET','/colaboradores','03 • Colaboradores','Listar colaboradores', { query:{ ...s.paging,nome:s.text(),status:s.choice(['ativo','desligado']),ativo:s.bool,departamento_id:s.uuid,cargo_id:s.uuid },requirements:['RF28'] },(r,req) => op.list(r,'colaborador',req.query));
  route('POST','/colaboradores','03 • Colaboradores','Cadastrar colaborador de apoio', {
    body:s.object(s.collaborator,['nome','cargo_id','salario_atual','faixa','horas_por_dia','jornada_semanal_horas','data_admissao']),status:201,requirements:['RF28'],
    description:'O cadastro não cria uma movimentação automaticamente. Registre a entrada em /movimentacoes para compor o turnover. Inativar é administrativo; desligar exige movimentação de saída.'
  },(r,req) => op.collaboratorSave(r,req.user,req.body));
  route('GET','/colaboradores/:id','03 • Colaboradores','Consultar colaborador',{ params:{ id:s.uuid } },async(r,req) => found(await r.get('colaborador',req.params.id),'Colaborador'));
  const { data_admissao, ...editCollaborator } = s.collaborator;
  route('PATCH','/colaboradores/:id','03 • Colaboradores','Editar ou inativar e preservar histórico', { params:{ id:s.uuid },body:{ ...s.object({ ...editCollaborator,data_vigencia:s.date }),minProperties:1 },requirements:['RF28','RF29','RN08'] },(r,req) => op.collaboratorSave(r,req.user,req.body,req.params.id));
  route('GET','/colaboradores/:id/historico','03 • Colaboradores','Consultar histórico de cargo, salário e jornada', { params:{ id:s.uuid },requirements:['RF29'] },async(r,req) => {
    found(await r.get('colaborador',req.params.id),'Colaborador');
    return { itens:await r.query('SELECT * FROM historico_colaborador WHERE colaborador_id=$1 ORDER BY vigencia_inicio',[req.params.id]) };
  });

  route('POST','/horas-extras','04 • Horas extras','Registrar saldo diário e calcular valor', {
    body:s.object({ colaborador_id:s.uuid,data:s.date,quantidade_horas:{ type:'string',pattern:'^-?\\d{1,2}(\\.\\d{1,2})?$',example:'1.50' },tipo:s.choice(['semana','domingo']),percentual_adicional:s.amount('50.00'),parametro_id:s.uuid },['colaborador_id','data','quantidade_horas']),
    status:201,requirements:['RF06','RF07','RN02','RN08'],description:'Saldo pode ser negativo ou zero, conforme CA-RF07c. Domingo é derivado da data; se informado, tipo deve coincidir. Um lançamento por colaborador/dia. Use os IDs retornados em /colaboradores; exemplos completos em docs/DEMONSTRACAO.md.'
  },(r,req) => op.overtimeCreate(r,req.user,req.body));
  route('GET','/horas-extras','04 • Horas extras','Listar saldos e totalizar todo o filtro', { query:{ ...s.paging,...s.dates,colaborador_id:s.uuid,departamento_id:s.uuid },requirements:['RF08','RF09'] },(r,req) => op.overtimeQuery(r,req.query));
  route('POST','/movimentacoes','05 • Movimentações','Registrar entrada ou desligamento', {
    body:s.object({ colaborador_id:s.uuid,tipo:s.choice(['entrada','saida']),data:s.date,classificacao:s.choice(['voluntario','involuntario']),contrato_experiencia:s.bool,motivo:s.text(500) },['colaborador_id','tipo','data']),status:201,requirements:['RF10','RF11','RN03']
  },(r,req) => op.movementCreate(r,req.user,req.body));
  route('GET','/movimentacoes','05 • Movimentações','Consultar movimentações', { query:{ ...s.paging,...s.dates,tipo:s.choice(['entrada','saida']),colaborador_id:s.uuid,departamento_id:s.uuid } },(r,req) => op.list(r,'movimentacao',req.query));
  route('POST','/movimentacoes/:id/custos','06 • Custo de turnover','Calcular e associar custo à saída', { params:{ id:s.uuid },body:s.object({ parametro_custo_id:s.uuid }),status:201,requirements:['RF15','RF16','RN05','RN08'] },(r,req) => op.costCreate(r,req.user,req.params.id,req.body));
  route('GET','/movimentacoes/:id/custos','06 • Custo de turnover','Consultar custo da saída', { params:{ id:s.uuid } },async(r,req) => found(await r.one('SELECT * FROM custo_turnover WHERE movimentacao_id=$1',[req.params.id]),'Custo'));
  route('GET','/indicadores/custos','06 • Custo de turnover','Totalizar custos e evolução mensal', { query:{ ...s.paging,...s.dates,departamento_id:s.uuid },requirements:['RF16','RF17','RF18'] },(r,req) => op.costsQuery(r,req.query));

  route('POST','/ausencias','07 • Absenteísmo','Registrar falta ou atraso', { body:s.object({ colaborador_id:s.uuid,data:s.date,tipo:s.choice(['falta','atraso']),minutos_atraso:s.integer(1,1440,20) },['colaborador_id','data','tipo']),status:201,requirements:['RF19','RF20','RN06'] },(r,req) => op.absenceCreate(r,req.user,req.body));
  route('GET','/ausencias','07 • Absenteísmo','Consultar ausências',{ query:{ ...s.paging,...s.dates,colaborador_id:s.uuid,departamento_id:s.uuid,tipo:s.choice(['falta','atraso']) } },(r,req) => op.list(r,'ausencia',req.query));

  for (const [path,table,props,tag] of [
    ['/parametros-calculo','parametro_calculo',s.calcParameter,'08 • Parâmetros'],
    ['/parametros-custo','parametro_custo',s.costParameter,'08 • Parâmetros']]) {
    route('GET',path,tag,'Listar versões de ' + path.slice(1),{ query:s.paging },(r,req) => op.list(r,table,req.query));
    route('POST',path,tag,'Criar versão imutável de ' + path.slice(1),{ body:s.object(props,Object.keys(props)),status:201 },async(r,req) => {
      if (table === 'parametro_calculo') ensure(D(req.body.divisor_jornada).gt(0) && D(req.body.percentual_semana).gte(50) && D(req.body.percentual_domingo).gte(100),'Divisor positivo; mínimos de 50% e 100%.');
      return op.create(r,req.user,table,req.body);
    });
  }
  route('GET','/jornada-referencia','08 • Parâmetros','Listar calendário de dias úteis',{ query:{ ...s.paging,competencia:s.date } },(r,req) => op.list(r,'jornada_referencia',req.query));
  route('PUT','/jornada-referencia/:competencia','08 • Parâmetros','Definir dias úteis do mês', { params:{ competencia:{ type:'string',pattern:'^\\d{4}-(0[1-9]|1[0-2])$' } },body:s.object({ dias_uteis:s.integer(0,31,22) },['dias_uteis']),requirements:['RN09'] },async(r,req) => {
    const competencia=req.params.competencia+'-01';
    const old=await r.one('SELECT * FROM jornada_referencia WHERE competencia=$1',[competencia]);
    const maxDays=Number(ind.periodBounds(req.params.competencia).fim.slice(-2));
    ensure(req.body.dias_uteis<=maxDays,'Dias úteis excedem os dias do mês.');
    return old ? op.update(r,req.user,'jornada_referencia',old.id,req.body) : op.create(r,req.user,'jornada_referencia',{ competencia,...req.body });
  });
  route('GET','/efetivo-referencia','08 • Parâmetros','Consultar efetivo de abertura de janeiro',{ query:{ ...s.paging,ano:s.integer(1900,2100),departamento_id:s.uuid } },(r,req) => op.list(r,'efetivo_referencia',req.query));
  route('PUT','/efetivo-referencia/:ano','08 • Parâmetros','Definir base do turnover (não é indicador)', { params:{ ano:s.integer(1900,2100) },body:s.object({ departamento_id:s.uuid,total_inicial:s.integer(0,1000000,3) },['total_inicial']),requirements:['RN04'],description:'Base operacional anterior às movimentações de janeiro. Informe uma base global e uma por departamento quando usar o filtro.' },async(r,req) => {
    const dept=req.body.departamento_id??null;
    if (dept) found(await r.get('departamento',dept),'Departamento');
    const old=await r.one('SELECT * FROM efetivo_referencia WHERE ano=$1 AND departamento_id IS NOT DISTINCT FROM $2::uuid',[req.params.ano,dept]);
    return old ? op.update(r,req.user,'efetivo_referencia',old.id,{ total_inicial:req.body.total_inicial }) : op.create(r,req.user,'efetivo_referencia',{ ano:req.params.ano,departamento_id:dept,total_inicial:req.body.total_inicial });
  });

  for (const [tipo,tag] of [['turnover','09 • Indicadores'],['absenteismo','09 • Indicadores']])
    route('GET','/indicadores/'+tipo,tag,'Calcular ou consultar '+tipo+' mensal/anual', { query:{ periodo:s.period,departamento_id:s.uuid },requiredQuery:['periodo'],requirements:tipo==='turnover'?['RF12','RF13','RF14']:['RF21','RF22','RF23','RF24'] },(r,req) => ind.indicator(r,tipo,req.query.periodo,req.query.departamento_id));
  route('GET','/indicadores/horas-extras','09 • Indicadores','Totalizar horas extras', { query:{ ...s.dates,departamento_id:s.uuid,colaborador_id:s.uuid } },async(r,req) => ({ totais:(await op.overtimeQuery(r,req.query)).totais }));
  route('POST','/indicadores/recalcular','09 • Indicadores','Criar novo snapshot e preservar os anteriores', { body:s.object({ tipo:s.choice(['turnover','absenteismo','custos','horas-extras']),periodo:s.period,departamento_id:s.uuid },['tipo','periodo']),status:201,requirements:['RN07','RN08','RNF10'] },(r,req) => ind.indicator(r,req.body.tipo,req.body.periodo,req.body.departamento_id,true));
  route('GET','/indicadores/historico','09 • Indicadores','Consultar snapshots e memória de cálculo', { query:{ ...s.paging,...s.dates,tipo:s.choice(['turnover_geral','turnover_voluntario','turnover_involuntario','custo_turnover','absenteismo','horas_extras']),departamento_id:s.uuid,versao_regra:s.text(50) },requirements:['RF14','RF24','RNF10'] },(r,req) => ind.history(r,req.query));
  route('GET','/dashboard','10 • Dashboard','Consultar série mensal consolidada', { query:{ ...s.dates,departamento_id:s.uuid },requiredQuery:['data_inicio','data_fim'],requirements:['RF25','RF26','RF27','RN07'],description:'Use meses completos, até 12 meses. Exemplo: 2026-10-01 a 2026-10-31. Nenhum índice é digitado diretamente.' },(r,req) => ind.dashboard(r,req.query));
  route('GET','/auditoria','11 • Auditoria','Consultar quem alterou e quais campos', { query:{ ...s.paging,...s.dates,entidade:s.text(50) },requirements:['RNF09'],description:'Registra autor, entidade, campos e momento. Não expõe senhas, tokens nem conteúdo do motivo.' },(r,req) => op.list(r,'auditoria',req.query));
}
