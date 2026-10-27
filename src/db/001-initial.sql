CREATE TABLE IF NOT EXISTS schema_migration (versao text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now());
CREATE TABLE usuario (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, senha_hash text NOT NULL,
 perfil text NOT NULL CHECK (perfil IN ('admin_rh','consulta')), ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE sessao (
 id uuid PRIMARY KEY, usuario_id uuid NOT NULL REFERENCES usuario(id), token_hash text NOT NULL UNIQUE,
 csrf_hash text NOT NULL, expira_em timestamptz NOT NULL, revogada boolean NOT NULL DEFAULT false
);
CREATE TABLE departamento (id uuid PRIMARY KEY, nome varchar(100) NOT NULL UNIQUE);
CREATE TABLE cargo (
 id uuid PRIMARY KEY, codigo varchar(30) NOT NULL UNIQUE, nome varchar(120) NOT NULL,
 departamento_id uuid NOT NULL REFERENCES departamento(id), nivel varchar(50), descricao text,
 faixa_i numeric(12,2) NOT NULL CHECK (faixa_i >= 0), faixa_ii numeric(12,2) NOT NULL,
 faixa_iii numeric(12,2) NOT NULL, ativo boolean NOT NULL DEFAULT true,
 CHECK (faixa_i <= faixa_ii AND faixa_ii <= faixa_iii)
);
CREATE TABLE colaborador (
 id uuid PRIMARY KEY, nome varchar(160) NOT NULL, cargo_id uuid NOT NULL REFERENCES cargo(id),
 salario_atual numeric(12,2) NOT NULL CHECK (salario_atual >= 0),
 faixa text NOT NULL CHECK (faixa IN ('faixa_i','faixa_ii','faixa_iii')),
 horas_por_dia numeric(4,2) NOT NULL CHECK (horas_por_dia > 0 AND horas_por_dia <= 24),
 jornada_semanal_horas numeric(5,2) NOT NULL CHECK (jornada_semanal_horas > 0 AND jornada_semanal_horas <= 168),
 data_admissao date NOT NULL, data_desligamento date,
 status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','desligado')),
 ativo boolean NOT NULL DEFAULT true,
 CHECK (data_desligamento IS NULL OR data_desligamento >= data_admissao),
 CHECK ((status = 'ativo' AND data_desligamento IS NULL) OR (status = 'desligado' AND data_desligamento IS NOT NULL))
);
CREATE TABLE historico_colaborador (
 id uuid PRIMARY KEY, colaborador_id uuid NOT NULL REFERENCES colaborador(id),
 cargo_id uuid NOT NULL REFERENCES cargo(id), departamento_id uuid NOT NULL REFERENCES departamento(id),
 salario numeric(12,2) NOT NULL CHECK (salario >= 0), horas_por_dia numeric(4,2) NOT NULL CHECK (horas_por_dia > 0),
 vigencia_inicio date NOT NULL, vigencia_fim date,
 UNIQUE (colaborador_id, vigencia_inicio), CHECK (vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio)
);
CREATE TABLE parametro_calculo (
 id uuid PRIMARY KEY, versao varchar(30) NOT NULL UNIQUE, divisor_jornada numeric(7,2) NOT NULL CHECK (divisor_jornada > 0),
 percentual_semana numeric(6,2) NOT NULL CHECK (percentual_semana >= 50),
 percentual_domingo numeric(6,2) NOT NULL CHECK (percentual_domingo >= 100),
 vigencia_inicio date NOT NULL UNIQUE
);
CREATE TABLE parametro_custo (
 id uuid PRIMARY KEY, versao varchar(30) NOT NULL UNIQUE, vigencia_inicio date NOT NULL UNIQUE,
 fator_produtividade numeric(6,2) NOT NULL CHECK (fator_produtividade > 0),
 dias_vaga_aberta numeric(6,2) NOT NULL CHECK (dias_vaga_aberta >= 0),
 dias_alta_performance numeric(6,2) NOT NULL CHECK (dias_alta_performance >= 0),
 percentual_baixa_produtividade numeric(6,2) NOT NULL CHECK (percentual_baixa_produtividade BETWEEN 0 AND 100),
 percentual_adaptacao numeric(6,2) NOT NULL CHECK (percentual_adaptacao BETWEEN 0 AND 100),
 rs_pessoas integer NOT NULL CHECK (rs_pessoas >= 0),
 rs_percentual_tempo numeric(6,2) NOT NULL CHECK (rs_percentual_tempo BETWEEN 0 AND 100),
 rs_salario_medio numeric(12,2) NOT NULL CHECK (rs_salario_medio >= 0),
 ferramentas_ano numeric(12,2) NOT NULL CHECK (ferramentas_ano >= 0),
 consultorias_ano numeric(12,2) NOT NULL CHECK (consultorias_ano >= 0),
 infraestrutura_ano numeric(12,2) NOT NULL CHECK (infraestrutura_ano >= 0),
 saidas_previstas_ano integer NOT NULL CHECK (saidas_previstas_ano > 0)
);
CREATE TABLE jornada_referencia (id uuid PRIMARY KEY, competencia date NOT NULL UNIQUE,
 dias_uteis integer NOT NULL CHECK (dias_uteis BETWEEN 0 AND 31), CHECK (extract(day FROM competencia) = 1));
CREATE TABLE efetivo_referencia (id uuid PRIMARY KEY, ano integer NOT NULL CHECK (ano BETWEEN 1900 AND 2100),
 departamento_id uuid REFERENCES departamento(id), total_inicial integer NOT NULL CHECK (total_inicial >= 0));
CREATE UNIQUE INDEX efetivo_chave ON efetivo_referencia(ano, coalesce(departamento_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE TABLE hora_extra (
 id uuid PRIMARY KEY, colaborador_id uuid NOT NULL REFERENCES colaborador(id), departamento_id uuid NOT NULL REFERENCES departamento(id),
 parametro_id uuid NOT NULL REFERENCES parametro_calculo(id), data date NOT NULL,
 quantidade_horas numeric(7,2) NOT NULL CHECK (quantidade_horas BETWEEN -24 AND 24),
 tipo text NOT NULL CHECK (tipo IN ('semana','domingo')), percentual_adicional numeric(6,2) NOT NULL CHECK (percentual_adicional >= 50),
 salario_base numeric(12,2) NOT NULL, divisor_jornada numeric(7,2) NOT NULL CHECK (divisor_jornada > 0), valor_calculado numeric(12,2) NOT NULL,
 UNIQUE (colaborador_id, data)
);
CREATE TABLE movimentacao (
 id uuid PRIMARY KEY, colaborador_id uuid NOT NULL REFERENCES colaborador(id), departamento_id uuid NOT NULL REFERENCES departamento(id),
 tipo text NOT NULL CHECK (tipo IN ('entrada','saida')), data date NOT NULL,
 classificacao text, contrato_experiencia boolean NOT NULL DEFAULT false, motivo varchar(500),
 CHECK ((tipo = 'saida' AND classificacao IS NOT NULL AND classificacao IN ('voluntario','involuntario') AND NOT contrato_experiencia) OR
 (tipo = 'entrada' AND classificacao IS NULL)), UNIQUE (colaborador_id, tipo)
);
CREATE TABLE custo_turnover (
 id uuid PRIMARY KEY, movimentacao_id uuid NOT NULL UNIQUE REFERENCES movimentacao(id),
 parametro_custo_id uuid NOT NULL REFERENCES parametro_custo(id), salario_base numeric(12,2) NOT NULL,
 entradas jsonb NOT NULL, custo_vaga_aberta numeric(12,2) NOT NULL CHECK (custo_vaga_aberta >= 0),
 custo_baixa_produtividade numeric(12,2) NOT NULL CHECK (custo_baixa_produtividade >= 0),
 custo_adaptacao numeric(12,2) NOT NULL CHECK (custo_adaptacao >= 0),
 custo_recrutamento numeric(12,2) NOT NULL CHECK (custo_recrutamento >= 0), custo_total numeric(12,2) NOT NULL,
 CHECK (custo_total = custo_vaga_aberta + custo_baixa_produtividade + custo_adaptacao + custo_recrutamento)
);
CREATE TABLE ausencia (
 id uuid PRIMARY KEY, colaborador_id uuid NOT NULL REFERENCES colaborador(id), departamento_id uuid NOT NULL REFERENCES departamento(id),
 data date NOT NULL, tipo text NOT NULL CHECK (tipo IN ('falta','atraso')),
 minutos_atraso integer CHECK (minutos_atraso > 0 AND minutos_atraso <= 1440),
 horas_ausentes numeric(12,8) NOT NULL CHECK (horas_ausentes > 0), UNIQUE (colaborador_id, data, tipo)
);
CREATE TABLE revisao_dados (id integer PRIMARY KEY CHECK (id = 1), versao integer NOT NULL);
INSERT INTO revisao_dados VALUES (1,0);
CREATE TABLE indicador (
 id uuid PRIMARY KEY, tipo text NOT NULL, periodo_inicio date NOT NULL, periodo_fim date NOT NULL,
 departamento_id uuid REFERENCES departamento(id), valor numeric(18,8), numerador numeric(24,8), denominador numeric(24,8),
 versao_regra text NOT NULL, revisao_dados integer NOT NULL, detalhes jsonb NOT NULL,
 calculado_em timestamptz NOT NULL DEFAULT now(), CHECK (periodo_inicio <= periodo_fim)
);
CREATE TABLE auditoria (
 id uuid PRIMARY KEY, usuario_id uuid REFERENCES usuario(id), entidade text NOT NULL, registro_id uuid NOT NULL,
 acao text NOT NULL, campos_alterados jsonb NOT NULL, ocorrido_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hora_filtro ON hora_extra(data, colaborador_id);
CREATE INDEX movimento_filtro ON movimentacao(data, departamento_id);
CREATE INDEX ausencia_filtro ON ausencia(data, colaborador_id);
CREATE INDEX indicador_filtro ON indicador(tipo, periodo_inicio, periodo_fim, departamento_id, revisao_dados);
CREATE INDEX auditoria_filtro ON auditoria(ocorrido_em, entidade);
CREATE INDEX historico_vigencia ON historico_colaborador(colaborador_id, vigencia_inicio);
INSERT INTO schema_migration(versao) VALUES ('001');
