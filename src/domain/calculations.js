import Decimal from 'decimal.js';
import { ensure } from './errors.js';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export const D = value => new Decimal(value ?? 0);
export const money = value => D(value).toFixed(2);
export const sum = values => values.reduce((a, b) => a.plus(b), D(0));
export const percent = (n, d) => D(d).isZero() ? null : D(n).div(d).times(100).toFixed(2);
export const mean = values => values.length ? sum(values).div(values.length) : D(0);
export function salaryMean(cargo) {
  ensure(D(cargo.faixa_i).lte(cargo.faixa_ii) && D(cargo.faixa_ii).lte(cargo.faixa_iii),
    'Informe Faixa I ≤ Faixa II ≤ Faixa III.', { faixa_i: 'As faixas devem estar em ordem crescente.' });
  return money(mean([cargo.faixa_i, cargo.faixa_ii, cargo.faixa_iii]));
}
export function overtime({ salario, divisor, horas, adicional }) {
  ensure(D(divisor).gt(0), 'Divisor deve ser positivo.');
  ensure(D(adicional).gte(50), 'Adicional deve ser pelo menos 50%.');
  return money(D(salario).div(divisor).times(horas).times(D(adicional).div(100).plus(1)));
}
export function median(values) {
  if (!values.length) return D(0);
  const sorted = values.map(D).sort((a, b) => a.cmp(b));
  const i = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[i] : sorted[i - 1].plus(sorted[i]).div(2);
}
export function turnover({ voluntarios, involuntarios, experiencia = 0, total, anual = false }) {
  return {
    total: percent(D(voluntarios).plus(involuntarios).plus(anual ? 0 : experiencia), total),
    voluntario: percent(voluntarios, total), involuntario: percent(involuntarios, total),
  };
}
export function recruitment(p) {
  return D(p.rs_pessoas).times(p.rs_percentual_tempo).div(100).times(p.rs_salario_medio)
    .times(p.fator_produtividade).plus(p.ferramentas_ano).plus(p.consultorias_ano).plus(p.infraestrutura_ano);
}
export function turnoverCost({ salario, saidas = 1, parametros: p, parcela_recrutamento }) {
  const base = D(salario).times(saidas);
  const vaga = base.times(p.fator_produtividade).times(p.dias_vaga_aberta).div(30);
  const baixa = base.times(p.fator_produtividade).times(p.dias_alta_performance).div(30)
    .times(p.percentual_baixa_produtividade).div(100);
  const adaptacao = base.times(p.percentual_adaptacao).div(100);
  const rec = parcela_recrutamento == null ? recruitment(p) : D(parcela_recrutamento);
  return {
    custo_vaga_aberta: money(vaga), custo_recrutamento: money(rec),
    custo_baixa_produtividade: money(baixa), custo_adaptacao: money(adaptacao),
    custo_total: money(sum([money(vaga), money(rec), money(baixa), money(adaptacao)])),
  };
}
export function absenteeism(people) {
  const individuais = people.map(p => ({ ...p, indice: percent(p.ausentes, p.previstas) }));
  const positives = people.filter(p => D(p.previstas).gt(0) && D(p.ausentes).gt(0))
    .map(p => D(p.ausentes).div(p.previstas).times(100));
  const ausentes = sum(people.map(p => p.ausentes));
  const previstas = sum(people.map(p => p.previstas));
  return {
    individuais, valor: previstas.isZero() ? null : money(mean(positives)),
    numerador: sum(positives).toFixed(8), denominador: String(positives.length),
    ponderado: percent(ausentes, previstas), horas_ausentes: ausentes.toFixed(8), horas_previstas: previstas.toFixed(8),
  };
}
export function overtimeTotals(rows) {
  const positives = rows.filter(r => D(r.quantidade_horas).gt(0));
  return {
    horas_liquidas: money(sum(rows.map(r => r.quantidade_horas))),
    horas_extras: money(sum(positives.map(r => r.quantidade_horas))),
    valor_liquido: money(sum(rows.map(r => r.valor_calculado))),
    valor_horas_extras: money(sum(positives.map(r => r.valor_calculado))),
  };
}
