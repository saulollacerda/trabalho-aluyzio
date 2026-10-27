import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { connectDatabase } from '../src/db/database.js';
import { passwordHash } from '../src/http/auth.js';
import * as op from '../src/services/operations.js';
export const ids={
  admin:'00000000-0000-4000-8000-000000000001',consulta:'00000000-0000-4000-8000-000000000002',
  dept:'10000000-0000-4000-8000-000000000001',cargo:'20000000-0000-4000-8000-000000000001',
  ana:'30000000-0000-4000-8000-000000000001',daniel:'30000000-0000-4000-8000-000000000002',marina:'30000000-0000-4000-8000-000000000003',
  extra:'30000000-0000-4000-8000-000000000004',
};
export async function seedDatabase(db,{ email=process.env.SEED_ADMIN_EMAIL||'rh@example.com',password=process.env.SEED_ADMIN_PASSWORD||'DemoRH!2026',demo=true }={}) {
  if ((process.env.NODE_ENV==='production'||process.env.VERCEL) && (!process.env.SEED_ADMIN_PASSWORD || password==='DemoRH!2026'))
    throw new Error('Defina SEED_ADMIN_PASSWORD própria para produção. O seed de produção não inclui demonstração.');
  return db.run(async r=>{
    if (await r.one('SELECT id FROM usuario LIMIT 1')) return { criado:false,mensagem:'Seed ignorado: banco já possui usuário. Nenhum dado foi apagado.' };
    const admin={ id:ids.admin,email:email.toLowerCase(),perfil:'admin_rh' };
    await r.insert('usuario',{ ...admin,senha_hash:await passwordHash(password) });
    if (!demo) return { criado:true,email };
    await r.insert('usuario',{ id:ids.consulta,email:'consulta@example.com',perfil:'consulta',senha_hash:await passwordHash('Consulta!2026') });
    await r.insert('departamento',{ id:ids.dept,nome:'Tecnologia (demonstração)' });
    await r.insert('cargo',{ id:ids.cargo,codigo:'DEMO-01',nome:'Analista — dados fictícios',departamento_id:ids.dept,nivel:'Júnior',faixa_i:'1500.00',faixa_ii:'2200.00',faixa_iii:'3000.00' });
    for (const [id,nome,date] of [[ids.ana,'Ana Santos (fictícia)','2026-01-01'],[ids.daniel,'Daniel Pires (fictício)','2026-01-01'],[ids.marina,'Marina Ávila (fictícia)','2026-01-01'],[ids.extra,'Pessoa Experiência (fictícia)','2026-10-01']]) {
      await r.insert('colaborador',{ id,nome,cargo_id:ids.cargo,salario_atual:'1500.00',faixa:'faixa_i',horas_por_dia:'7.00',jornada_semanal_horas:'35.00',data_admissao:date });
      await r.insert('historico_colaborador',{ id:randomUUID(),colaborador_id:id,cargo_id:ids.cargo,departamento_id:ids.dept,salario:'1500.00',horas_por_dia:'7.00',vigencia_inicio:date });
    }
    await op.create(r,admin,'parametro_calculo',{ versao:'hex-v1',vigencia_inicio:'2020-01-01',divisor_jornada:'220.00',percentual_semana:'50.00',percentual_domingo:'100.00' });
    await op.create(r,admin,'parametro_custo',{ versao:'custo-v1',vigencia_inicio:'2020-01-01',fator_produtividade:'2.00',dias_vaga_aberta:'60.00',dias_alta_performance:'60.00',percentual_baixa_produtividade:'25.00',percentual_adaptacao:'15.00',rs_pessoas:5,rs_percentual_tempo:'0.70',rs_salario_medio:'2500.00',ferramentas_ano:'20000.00',consultorias_ano:'0.00',infraestrutura_ano:'5000.00',saidas_previstas_ano:50 });
    const businessDays=[22,20,22,21,21,22,23,21,22,22,20,23];
    for (let i=0;i<12;i++) await op.create(r,admin,'jornada_referencia',{ competencia:`2026-${String(i+1).padStart(2,'0')}-01`,dias_uteis:businessDays[i] });
    for (const department of [null,ids.dept]) await op.create(r,admin,'efetivo_referencia',{ ano:2026,departamento_id:department,total_inicial:3 });
    await op.movementCreate(r,admin,{ colaborador_id:ids.extra,tipo:'entrada',data:'2026-10-01',contrato_experiencia:true });
    for (const [data,horas] of [['2026-10-01','-1.00'],['2026-10-02','1.50'],['2026-10-04','2.00']])
      await op.overtimeCreate(r,admin,{ colaborador_id:ids.ana,data,quantidade_horas:horas });
    for (const [colaborador_id,data,tipo,minutos] of [[ids.ana,'2026-10-05','falta'],[ids.ana,'2026-10-06','falta'],[ids.ana,'2026-10-07','atraso',20],[ids.daniel,'2026-10-07','atraso',10],[ids.marina,'2026-10-08','falta']])
      await op.absenceCreate(r,admin,{ colaborador_id,data,tipo,...(minutos?{ minutos_atraso:minutos }:{}) });
    const movement=await op.movementCreate(r,admin,{ colaborador_id:ids.marina,tipo:'saida',data:'2026-10-20',classificacao:'voluntario' });
    await op.costCreate(r,admin,movement.id,{});
    await op.audit(r,admin,'usuario',admin.id,'seed',['massa_sintetica']);
    return { criado:true,email,ids,mensagem:'Demonstração sintética de outubro/2026 carregada.' };
  });
}
if (process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const db=await connectDatabase();
  try { await db.migrate();console.log(JSON.stringify(await seedDatabase(db,{ demo:process.env.NODE_ENV!=='production'&&!process.env.VERCEL }),null,2)); }
  finally { await db.close(); }
}
