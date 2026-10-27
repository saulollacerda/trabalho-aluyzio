// Demonstração reexecutável: usa somente leituras, além de login/logout e snapshots derivados.
const base=(process.env.API_URL||'http://127.0.0.1:3000').replace(/\/$/,'');
let cookie='',csrf='';
async function call(method,path,body) {
  const response=await fetch(base+path,{ method,headers:{ ...(body?{ 'content-type':'application/json' }:{}),...(cookie?{ cookie }:{}),...(csrf?{ 'X-CSRF-Token':csrf }:{}) },...(body?{ body:JSON.stringify(body) }:{}) });
  const data=await response.json();
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);
  if (response.headers.get('set-cookie')) cookie=response.headers.get('set-cookie').split(';')[0];
  if (data.csrf_token) csrf=data.csrf_token;
  return data;
}
try {
  const session=await call('POST','/api/v1/auth/login',{ email:process.env.SEED_ADMIN_EMAIL||'rh@example.com',senha:process.env.SEED_ADMIN_PASSWORD||'DemoRH!2026' });
  console.log('1. Login:',session.usuario.email);
  const extra=await call('GET','/api/v1/horas-extras?data_inicio=2026-10-01&data_fim=2026-10-31');
  console.log('2. Horas extras:',extra.totais);
  const tur=await call('GET','/api/v1/indicadores/turnover?periodo=2026-10');
  console.log('3. Turnover:',tur.valor+'%', 'numerador:',tur.numerador,'denominador:',tur.denominador);
  const abs=await call('GET','/api/v1/indicadores/absenteismo?periodo=2026-10');
  console.log('4. Absenteísmo P5:',abs.valor+'%', 'ponderado:',abs.detalhes.complementares[0].valor+'%');
  const dash=await call('GET','/api/v1/dashboard?data_inicio=2026-10-01&data_fim=2026-10-31');
  console.log('5. Dashboard:',JSON.stringify(dash.totais));
  const snapshot=await call('POST','/api/v1/indicadores/recalcular',{ tipo:'turnover',periodo:'2026-10' });
  console.log('6. Novo snapshot:',snapshot.id);
  const history=await call('GET','/api/v1/indicadores/historico?tipo=turnover_geral');
  console.log('7. Histórico:',history.total,'snapshots de turnover');
  await call('POST','/api/v1/auth/logout');console.log('8. Sessão encerrada. Demonstração concluída.');
} catch(e) { console.error(e.message);process.exitCode=1; }
