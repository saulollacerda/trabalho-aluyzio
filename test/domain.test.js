import test from 'node:test';
import assert from 'node:assert/strict';
import { D, salaryMean,overtime,turnover,median,turnoverCost,absenteeism } from '../src/domain/calculations.js';
test('CA-RN01: média das três faixas e ordem',()=>{
  assert.equal(salaryMean({ faixa_i:'5000',faixa_ii:'7000',faixa_iii:'9000' }),'7000.00');
  assert.equal(salaryMean({ faixa_i:'1200',faixa_ii:'1800',faixa_iii:'2300' }),'1766.67');
  assert.throws(()=>salaryMean({ faixa_i:'4500',faixa_ii:'4000',faixa_iii:'9000' }));
});
test('CA-RF07a/b/c: dia útil, domingo, saldo zero e negativo',()=>{
  const calc=(horas,adicional=50)=>overtime({ salario:1500,divisor:220,horas,adicional });
  assert.equal(calc('1.5'),'15.34');assert.equal(calc(2),'20.45');
  assert.equal(calc(2,100),'27.27');assert.equal(calc(0),'0.00');assert.equal(calc(-1),'-10.23');
});
test('CA-RF12: fórmula específica P3 e denominador zero',()=>{
  assert.deepEqual(turnover({ voluntarios:1,involuntarios:1,experiencia:2,total:57 }),{ total:'7.02',voluntario:'1.75',involuntario:'1.75' });
  assert.equal(turnover({ voluntarios:0,involuntarios:0,total:0 }).total,null);
});
test('CA-RF12b: mediana de 12 meses e anual',()=>{
  const m=median([57,57,57,54,53,51,47,46,47,44,43,42]);
  assert.equal(m.toString(),'49');
  assert.equal(turnover({ voluntarios:13,involuntarios:21,experiencia:10,total:m,anual:true }).total,'69.39');
});
export const costExample={ fator_produtividade:'2',dias_vaga_aberta:'60',dias_alta_performance:'60',percentual_baixa_produtividade:'25',percentual_adaptacao:'15',rs_pessoas:5,rs_percentual_tempo:'0.7',rs_salario_medio:'2500',ferramentas_ano:'20000',consultorias_ano:'0',infraestrutura_ano:'5000' };
test('CA-RF16: custo anual de referência R$ 50.925,00',()=>{
  assert.deepEqual(turnoverCost({ salario:100,saidas:50,parametros:costExample }),{
    custo_vaga_aberta:'20000.00',custo_recrutamento:'25175.00',custo_baixa_produtividade:'5000.00',custo_adaptacao:'750.00',custo_total:'50925.00' });
});
test('CA-RN09 e CA-RF21: dias sem ausência compõem denominador',()=>{
  const planned=D(22).times(7).toString();assert.equal(planned,'154');
  const data=absenteeism([{ previstas:planned,ausentes:D(14).plus(D(20).div(60)) },{ previstas:planned,ausentes:D(10).div(60) },{ previstas:planned,ausentes:7 }]);
  assert.deepEqual(data.individuais.map(i=>i.indice),['9.31','0.11','4.55']);assert.equal(data.valor,'4.65');
  assert.equal(absenteeism([{ previstas:0,ausentes:0 }]).valor,null);
});
test('CA-RF23: P5 ignora zeros, ponderado inclui toda a equipe',()=>{
  const data=absenteeism([{ previstas:140,ausentes:'7.294' },{ previstas:140,ausentes:'7.210' },{ previstas:140,ausentes:0 }]);
  assert.equal(data.valor,'5.18');assert.equal(data.ponderado,'3.45');
  // Apenas os percentuais arredondados constam no CA de fevereiro. Esses valores
  // ilustram que não bastam para garantir 3,46%; veja docs/DECISOES.md.
});
