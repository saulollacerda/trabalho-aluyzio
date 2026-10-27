import test from 'node:test';
import assert from 'node:assert/strict';
import { swaggerRequestInterceptor } from '../src/http/swagger.js';
test('Swagger carrega contrato mesmo sem method no objeto da requisição',async()=>{
  const result=await swaggerRequestInterceptor({ url:'/docs/json' });
  assert.equal(result.credentials,'same-origin');assert.equal(result.headers,undefined);
});
test('Swagger acrescenta CSRF às escritas, mas permite login sem sessão',async t=>{
  let calls=0;
  t.mock.method(globalThis,'fetch',async url=>{ calls++;assert.equal(url,'/api/v1/auth/me');return { ok:true,json:async()=>({ csrf_token:'teste' }) }; });
  const login=await swaggerRequestInterceptor({ url:'/api/v1/auth/login',method:'POST' });assert.equal(calls,0);assert.equal(login.headers,undefined);
  const write=await swaggerRequestInterceptor({ url:'/api/v1/departamentos',method:'POST' });assert.equal(calls,1);assert.equal(write.headers['X-CSRF-Token'],'teste');
});
