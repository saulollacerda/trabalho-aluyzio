import { connectDatabase } from '../src/db/database.js';
const db=await connectDatabase();
try { await db.migrate();console.log('Migração 001 aplicada/verificada. Banco: '+db.kind); }
finally { await db.close(); }
