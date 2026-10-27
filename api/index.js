import { connectDatabase } from '../src/db/database.js';
import { buildApp } from '../src/app.js';
let ready;
function bootstrap() {
  return ready ??= (async()=>{
    const db=await connectDatabase();
    // Migrações são executadas antes da implantação com npm run db:migrate.
    // Não alteramos o esquema em cada cold start da função.
    return buildApp(db);
  })().catch(error=>{ ready=undefined;throw error; });
}
export default async function handler(req,res) {
  try { const app=await bootstrap();app.server.emit('request',req,res); }
  catch { res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ erro:{ codigo:'INDISPONIVEL',mensagem:'Verifique DATABASE_URL e as migrações do banco.',campos:{} } })); }
}
