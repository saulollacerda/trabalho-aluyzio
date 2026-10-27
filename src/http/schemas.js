export const text = (maxLength = 160, example) => ({ type: 'string', minLength: 1, maxLength, ...(example ? { example } : {}) });
export const uuid = { type: 'string', format: 'uuid' };
export const date = { type: 'string', format: 'date', example: '2026-10-01' };
export const amount = example => ({ type: 'string', pattern: '^\\d{1,10}(\\.\\d{1,2})?$', example: example ?? '1500.00', description: 'Decimal positivo ou zero como string, até duas casas.' });
export const bool = { type: 'boolean' };
export const integer = (minimum, maximum, example) => ({ type: 'integer', minimum, maximum, ...(example !== undefined ? { example } : {}) });
export const choice = values => ({ type: 'string', enum: values });
export const object = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}) });
export const paging = { page: { ...integer(1,100000), default: 1 }, page_size: { ...integer(1,100), default: 20 } };
export const dates = { data_inicio: date, data_fim: date };
export const period = { type: 'string', pattern: '^\\d{4}(-\\d{2})?$', example: '2026-10' };
export const cargo = {
  codigo: text(30,'DEV-JR'), nome: text(120,'Analista de Desenvolvimento'), departamento_id: uuid,
  nivel: text(50,'Júnior'), descricao: text(2000), faixa_i: amount('1500.00'), faixa_ii: amount('2200.00'), faixa_iii: amount('3000.00'), ativo: bool,
};
export const collaborator = {
  nome: text(160,'Pessoa Fictícia'), cargo_id: uuid, salario_atual: amount('1500.00'),
  faixa: choice(['faixa_i','faixa_ii','faixa_iii']), horas_por_dia: amount('7.00'),
  jornada_semanal_horas: amount('35.00'), data_admissao: date, ativo: bool,
};
export const calcParameter = { versao: text(30,'hex-v1'), vigencia_inicio: date,
  divisor_jornada: amount('220.00'), percentual_semana: amount('50.00'), percentual_domingo: amount('100.00') };
export const costParameter = { versao: text(30,'custo-v1'), vigencia_inicio: date,
  fator_produtividade: amount('2.00'), dias_vaga_aberta: amount('60.00'), dias_alta_performance: amount('60.00'),
  percentual_baixa_produtividade: amount('25.00'), percentual_adaptacao: amount('15.00'),
  rs_pessoas: integer(0,10000,5), rs_percentual_tempo: amount('0.70'), rs_salario_medio: amount('2500.00'),
  ferramentas_ano: amount('20000.00'), consultorias_ano: amount('0.00'), infraestrutura_ano: amount('5000.00'),
  saidas_previstas_ano: integer(1,1000000,50) };
export const anyObject = { type: 'object', additionalProperties: true };
export const errorResponse = object({ erro: object({ codigo: text(), mensagem: text(2000), campos: { type: 'object', additionalProperties: { type: 'string' } } }, ['codigo','mensagem','campos']) }, ['erro']);
