import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import { AppError } from './domain/errors.js';
import { registerAuthentication } from './http/auth.js';
import { registerRoutes } from './http/routes.js';
import { swaggerRequestInterceptor } from './http/swagger.js';
export async function buildApp(db, { logger = false } = {}) {
  const app = Fastify({ logger, bodyLimit: 65536, ajv: { customOptions: { removeAdditional:false, keywords:['example'] } } });
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy:false });
  await app.register(rateLimit, { global:false });
  await app.register(swagger, { openapi: {
    openapi:'3.0.3', info:{ title:'Grupo 3 • Compensação, custos e indicadores',version:'1.0.0',
      description:'Backend acadêmico em Node.js. Faça login em 01 • Acesso e execute as rotas com Try it out. Sessão por cookie HttpOnly; o Swagger envia CSRF automaticamente. Valores monetários usam strings decimais. Dados de demonstração fictícios. Consulte docs/DEMONSTRACAO.md.' },
    components:{ securitySchemes:{ cookieAuth:{ type:'apiKey',in:'cookie',name:process.env.NODE_ENV==='production'||process.env.VERCEL?'__Host-rh_session':'rh_session' } } },
  } });
  await app.register(swaggerUI, { routePrefix:'/docs', uiConfig:{ docExpansion:'none',persistAuthorization:false,
    requestInterceptor: swaggerRequestInterceptor },staticCSP:true });
  app.setErrorHandler((e,req,reply) => {
    let status=e.status??e.statusCode??500, codigo=e.codigo??'ERRO_INTERNO', mensagem=e.message, campos=e.campos??{};
    if (e.validation) {
      status=422; codigo='VALIDACAO'; mensagem='Revise os campos informados.';
      campos=Object.fromEntries(e.validation.map(v=>[(v.instancePath||v.params.missingProperty||v.params.additionalProperty||'requisicao').replace(/^\//,''),v.message]));
    } else if (e.code==='23505') { status=409;codigo='CONFLITO';mensagem='Já existe um registro com esta chave ou vínculo.'; }
    else if (e.code==='23503') { status=409;codigo='CONFLITO';mensagem='Referência inexistente ou registro com vínculos.'; }
    else if (['23514','22003','22007','22008','22P02','23502'].includes(e.code)) { status=422;codigo='VALIDACAO';mensagem='Valores fora dos limites ou inconsistentes com as regras do cadastro.'; }
    else if (status===400) { codigo='REQUISICAO_INVALIDA';mensagem='JSON ou requisição malformada.'; }
    else if (status===429) { codigo='LIMITE_ACESSO';mensagem='Muitas tentativas. Aguarde antes de tentar novamente.'; }
    if (status>=500) { mensagem='Falha interna. Consulte o responsável pela API.'; req.log.error({ code:e.code,requestId:req.id },'Falha na operação'); }
    reply.code(status).send({ erro:{ codigo,mensagem,campos } });
  });
  app.setNotFoundHandler((_req,reply)=>reply.code(404).send({ erro:{ codigo:'NAO_ENCONTRADO',mensagem:'Rota não encontrada.',campos:{} } }));
  app.get('/',{ schema:{ hide:true } },async(_req,reply)=>reply.redirect('/docs'));
  app.get('/health',{ schema:{ hide:true } },async()=>{ await db.run(r=>r.one('SELECT 1 AS ok'));return { status:'ok',banco:db.kind }; });
  app.get('/openapi.json',{ schema:{ hide:true } },async()=>app.swagger());
  registerAuthentication(app,db);
  registerRoutes(app,db);
  await app.ready();
  return app;
}
