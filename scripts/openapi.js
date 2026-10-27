import { writeFile } from 'node:fs/promises';
import SwaggerParser from '@apidevtools/swagger-parser';
import { connectDatabase } from '../src/db/database.js';
import { buildApp } from '../src/app.js';
const db=await connectDatabase({ url:'',directory:':memory:' });
const app=await buildApp(db);
try {
  const spec=app.swagger();await SwaggerParser.validate(structuredClone(spec));
  await writeFile(new URL('../docs/openapi.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
  console.log(`OpenAPI validado: ${Object.keys(spec.paths).length} caminhos.`);
} finally { await app.close();await db.close(); }
