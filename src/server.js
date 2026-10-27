import { buildApp } from './app.js';
import { connectDatabase } from './db/database.js';
const db = await connectDatabase();
await db.migrate();
const app = await buildApp(db,{ logger:{ level:'info',serializers:{ req:req=>({ method:req.method,url:req.url?.split('?')[0],id:req.id }) },redact:['req.headers.cookie','req.headers.authorization','req.body','res.headers["set-cookie"]'] } });
await app.listen({ port:Number(process.env.PORT||3000),host:process.env.HOST||'127.0.0.1' });
for (const signal of ['SIGINT','SIGTERM']) process.once(signal,async()=>{ await app.close();await db.close();process.exit(0); });
