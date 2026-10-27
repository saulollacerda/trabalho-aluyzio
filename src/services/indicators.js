import { randomUUID } from 'node:crypto';
import { ensure } from '../domain/errors.js';
import { D, sum, mean, median, money, turnover, absenteeism } from '../domain/calculations.js';
import { dateString, overtimeQuery, costsQuery } from './operations.js';
export function periodBounds(periodo) {
  ensure(/^\d{4}(-\d{2})?$/.test(periodo), 'Use periodo no formato YYYY-MM ou YYYY.');
  const year = Number(periodo.slice(0,4)), month = periodo.length === 7 ? Number(periodo.slice(5)) : null;
  ensure(year >= 1900 && year <= 2100 && (month === null || month >= 1 && month <= 12), 'Período inválido.');
  return { year, month, inicio: month ? periodo + '-01' : `${year}-01-01`,
    fim: month ? new Date(Date.UTC(year, month, 0)).toISOString().slice(0,10) : `${year}-12-31` };
}
export function monthsBetween(start, end) {
  const result = [];
  let cursor = start.slice(0,7);
  while (cursor <= end.slice(0,7)) {
    result.push(cursor);
    const d = new Date(cursor + '-01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); cursor = d.toISOString().slice(0,7);
  }
  return result;
}
async function turnoverData(r, periodo, department) {
  const { year, month } = periodBounds(periodo);
  const base = await r.one('SELECT * FROM efetivo_referencia WHERE ano=$1 AND departamento_id IS NOT DISTINCT FROM $2::uuid', [year, department ?? null]);
  ensure(base, `Configure o efetivo de abertura de ${year} para este filtro.`, { efetivo_referencia: 'Use PUT /efetivo-referencia/{ano}.' }, 409);
  const args = [`${year}-01-01`,`${year}-12-31`];
  if (department) args.push(department);
  const events = await r.query('SELECT * FROM movimentacao WHERE data BETWEEN $1 AND $2' + (department ? ' AND departamento_id=$3' : ''), args);
  let total = Number(base.total_inicial);
  const months = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2,'0')}`;
    const part = events.filter(e => dateString(e.data).startsWith(key));
    const voluntarios = part.filter(e => e.tipo === 'saida' && e.classificacao === 'voluntario').length;
    const involuntarios = part.filter(e => e.tipo === 'saida' && e.classificacao === 'involuntario').length;
    const experiencia = part.filter(e => e.tipo === 'entrada' && e.contrato_experiencia).length;
    total = total - voluntarios - involuntarios + experiencia;
    ensure(total >= 0, `Efetivo negativo em ${key}; revise a base e as movimentações.`, {}, 409);
    months.push({ periodo: key, total, voluntarios, involuntarios, experiencia,
      ...turnover({ voluntarios, involuntarios, experiencia, total }) });
    // A propriedade 'total' de turnover é percentual: mantenha denominador em campo separado.
    months[months.length - 1].efetivo = total;
  }
  if (month) {
    const m = months[month - 1];
    return { valor: m.total, numerador: String(m.voluntarios + m.involuntarios + m.experiencia), denominador: String(m.efetivo),
      versao_regra: 'p3_mensal', detalhes: { ...m, base_inicial: base.total_inicial },
      adicionais: [{ tipo: 'turnover_voluntario', valor: m.voluntario, numerador: String(m.voluntarios) },
        { tipo: 'turnover_involuntario', valor: m.involuntario, numerador: String(m.involuntarios) }] };
  }
  const exits = sum(months.map(m => m.voluntarios + m.involuntarios));
  const denominator = median(months.map(m => m.efetivo));
  const v = sum(months.map(m => m.voluntarios)), i = sum(months.map(m => m.involuntarios));
  const rate = turnover({ voluntarios: v, involuntarios: i, total: denominator, anual: true });
  return { valor: rate.total, numerador: exits.toString(), denominador: denominator.toString(), versao_regra: 'p3_anual',
    detalhes: { meses: months, base_inicial: base.total_inicial,
      faixa: rate.total === null ? null : D(rate.total).lte(20) ? 'saudavel' : D(rate.total).lte(40) ? 'atencao' : 'alerta' },
    adicionais: [{ tipo: 'turnover_voluntario', valor: rate.voluntario, numerador: v.toString() },
      { tipo: 'turnover_involuntario', valor: rate.involuntario, numerador: i.toString() }] };
}
async function absenceMonth(r, periodo, department) {
  const { inicio, fim } = periodBounds(periodo);
  const calendar = await r.one('SELECT * FROM jornada_referencia WHERE competencia=$1', [inicio]);
  ensure(calendar, `Defina os dias úteis de ${periodo}.`, { jornada_referencia: 'Use PUT /jornada-referencia/{competencia}.' }, 409);
  const people = await r.query(`SELECT * FROM colaborador WHERE data_admissao <= $1 AND
    (data_desligamento IS NULL OR data_desligamento >= $2) ORDER BY id`, [fim, inicio]);
  const histories = await r.query(`SELECT * FROM historico_colaborador WHERE vigencia_inicio <= $1 AND
    (vigencia_fim IS NULL OR vigencia_fim >= $2) ORDER BY vigencia_inicio DESC`, [fim, inicio]);
  const absences = await r.query('SELECT * FROM ausencia WHERE data BETWEEN $1 AND $2', [inicio, fim]);
  const data = [];
  for (const p of people) {
    // P5 considera mês inteiro: não há rateio por dias de vínculo (C16 pendente).
    const lastDate = p.data_desligamento && dateString(p.data_desligamento) < fim ? dateString(p.data_desligamento) : fim;
    const h = histories.find(h => h.colaborador_id === p.id && dateString(h.vigencia_inicio) <= lastDate &&
      (!h.vigencia_fim || dateString(h.vigencia_fim) >= lastDate));
    if (!h || department && h.departamento_id !== department) continue;
    data.push({ colaborador_id: p.id, previstas: D(calendar.dias_uteis).times(h.horas_por_dia).toFixed(8),
      ausentes: sum(absences.filter(a => a.colaborador_id === p.id).map(a => a.horas_ausentes)).toFixed(8) });
  }
  return { periodo, dias_uteis: calendar.dias_uteis, ...absenteeism(data) };
}
async function absenceData(r, periodo, department) {
  const bounds = periodBounds(periodo);
  if (bounds.month) {
    const data = await absenceMonth(r, periodo, department);
    return { valor: data.valor, numerador: data.numerador, denominador: data.denominador,
      versao_regra: 'p5_media', detalhes: data,
      adicionais: [{ tipo: 'absenteismo', versao_regra: 'ponderado', valor: data.ponderado,
        numerador: data.horas_ausentes, denominador: data.horas_previstas }] };
  }
  const months = [];
  for (const m of monthsBetween(bounds.inicio, bounds.fim)) months.push(await absenceMonth(r, m, department));
  const full = months.every(m => m.valor !== null);
  const n = sum(months.filter(m => m.valor !== null).map(m => m.valor));
  const absent = sum(months.map(m => m.horas_ausentes)), planned = sum(months.map(m => m.horas_previstas));
  return { valor: full ? money(n.div(12)) : null, numerador: n.toFixed(8), denominador: full ? '12' : '0',
    versao_regra: 'p5_media_anual', detalhes: { meses: months, meses_validos: months.filter(m => m.valor !== null).length },
    adicionais: [{ tipo: 'absenteismo', versao_regra: 'ponderado_anual', valor: planned.isZero() ? null : money(absent.div(planned).times(100)),
      numerador: absent.toFixed(8), denominador: planned.toFixed(8) }] };
}
const typeNames = { turnover: 'turnover_geral', absenteismo: 'absenteismo', custos: 'custo_turnover', 'horas-extras': 'horas_extras' };
function present(row) { return { ...row, valor: row.valor == null ? null : money(row.valor) }; }
export async function indicator(r, tipo, periodo, department, force = false) {
  const bounds = periodBounds(periodo), type = typeNames[tipo];
  ensure(type, 'Tipo de indicador inválido.');
  const rev = (await r.one('SELECT versao FROM revisao_dados WHERE id=1')).versao;
  const mainRule = tipo === 'turnover' ? bounds.month ? 'p3_mensal' : 'p3_anual' : tipo === 'absenteismo' ? bounds.month ? 'p5_media' : 'p5_media_anual' : 'operacional_v1';
  if (!force) {
    const cached = await r.one(`SELECT * FROM indicador WHERE tipo=$1 AND periodo_inicio=$2 AND periodo_fim=$3
      AND departamento_id IS NOT DISTINCT FROM $4::uuid AND revisao_dados=$5 AND versao_regra=$6
      ORDER BY calculado_em DESC,id DESC LIMIT 1`, [type, bounds.inicio, bounds.fim, department ?? null, rev, mainRule]);
    if (cached) return present(cached);
  }
  let data;
  if (tipo === 'turnover') data = await turnoverData(r, periodo, department);
  else if (tipo === 'absenteismo') data = await absenceData(r, periodo, department);
  else {
    const q = { data_inicio: bounds.inicio, data_fim: bounds.fim, departamento_id: department };
    const details = tipo === 'custos' ? await costsQuery(r, q) : await overtimeQuery(r, q);
    data = { valor: tipo === 'custos' ? details.custo_total : details.totais.valor_horas_extras,
      numerador: tipo === 'custos' ? details.custo_total : details.totais.valor_horas_extras,
      denominador: '1', versao_regra: 'operacional_v1', detalhes: tipo === 'custos' ? { custo_total: details.custo_total, evolucao: details.evolucao } : details.totais };
  }
  const common = { periodo_inicio: bounds.inicio, periodo_fim: bounds.fim, departamento_id: department ?? null, revisao_dados: rev };
  const companions = [];
  for (const extra of data.adicionais ?? []) {
    const row = await r.insert('indicador', { id: randomUUID(), ...common, tipo: extra.tipo, valor: extra.valor,
      numerador: extra.numerador, denominador: extra.denominador ?? data.denominador,
      versao_regra: extra.versao_regra ?? data.versao_regra, detalhes: JSON.stringify({ origem: type }) });
    companions.push(present(row));
  }
  const row = await r.insert('indicador', { id: randomUUID(), ...common, tipo: type, valor: data.valor,
    numerador: data.numerador, denominador: data.denominador, versao_regra: data.versao_regra,
    detalhes: JSON.stringify({ ...data.detalhes, complementares: companions }) });
  return present(row);
}
export async function history(r, q) {
  const args = [], where = [];
  for (const [key, op, value] of [['tipo','=',q.tipo],['periodo_inicio','>=',q.data_inicio],['periodo_fim','<=',q.data_fim],
    ['departamento_id','=',q.departamento_id],['versao_regra','=',q.versao_regra]]) {
    if (value !== undefined) { args.push(value); where.push(`${key}${op}$${args.length}`); }
  }
  const filter = where.length ? ' WHERE ' + where.join(' AND ') : '';
  const total = Number((await r.one('SELECT count(*) AS n FROM indicador' + filter, args)).n);
  const page = q.page ?? 1, size = q.page_size ?? 20;
  const rows = await r.query('SELECT * FROM indicador' + filter + ` ORDER BY calculado_em DESC,id LIMIT $${args.length+1} OFFSET $${args.length+2}`,
    [...args, size, (page-1)*size]);
  return { itens: rows.map(present), total, page, page_size: size };
}
export async function dashboard(r, q) {
  const months = monthsBetween(q.data_inicio, q.data_fim);
  ensure(months.length <= 12, 'Dashboard aceita até 12 meses por consulta.');
  ensure(q.data_inicio === periodBounds(months[0]).inicio && q.data_fim === periodBounds(months.at(-1)).fim,
    'Dashboard usa meses completos para manter comparabilidade dos índices.');
  const series = [];
  for (const periodo of months) {
    const item = { periodo };
    for (const tipo of Object.keys(typeNames)) item[tipo.replace('-', '_')] = await indicator(r, tipo, periodo, q.departamento_id);
    series.push(item);
  }
  return { data_inicio: q.data_inicio, data_fim: q.data_fim, series,
    totais: { horas_extras: (await overtimeQuery(r,q)).totais, custos: (await costsQuery(r,q)).custo_total },
    leitura: 'Índices percentuais estão na série mensal. Custos e horas são somados no período.' };
}
