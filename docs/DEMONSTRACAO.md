# Roteiro de apresentação — backend e Swagger

Duração sugerida: 8 a 12 minutos. Inicie com `npm start` após `npm run setup`. Abra http://localhost:3000/docs/ e execute login em **01 • Acesso** usando `rh@example.com` / `DemoRH!2026`. As credenciais são exclusivas da demonstração local.

## 1. Explicar a entrega (30 segundos)

“Esta etapa entrega o backend. O Swagger é a interface de demonstração: cada operação envia uma requisição HTTP real, passa pelas validações e grava ou consulta o banco. Os dados são fictícios.”

## 2. Consultar o dashboard (1 minuto)

Em `GET /api/v1/dashboard`, informe:

```text
data_inicio: 2026-10-01
data_fim:    2026-10-31
```

Na massa inicial, antes de modificações:

| Dado | Resultado |
| --- | --- |
| Turnover mensal | 66,67%: uma saída + uma entrada em experiência, divididas por efetivo 3 |
| Absenteísmo P5 | 4,65%: média dos índices positivos |
| Absenteísmo ponderado | 3,49%: horas ausentes / 616 horas previstas |
| Custo de turnover registrado | R$ 8.228,50 |
| Horas extras positivas | 3,50 h / R$ 42,61 |
| Saldo líquido | 2,50 h / R$ 32,38 |

O turnover elevado é consequência da pequena massa de demonstração. Não é diagnóstico de uma empresa real. O dashboard devolve dados para gráficos; a interface gráfica de negócio pertence a uma etapa futura.

## 3. Demonstrar cálculo de horas extras (2 minutos)

Em `GET /api/v1/horas-extras`, filtre outubro/2026. Mostre os três registros de Ana:

| Data | Saldo | Adicional | Valor |
| --- | --- | --- | --- |
| 2026-10-01 | −1 h | 50% | −R$ 10,23 |
| 2026-10-02 | 1,50 h | 50% | R$ 15,34 |
| 2026-10-04, domingo | 2 h | 100% | R$ 27,27 |

Explique: salário de R$ 1.500,00 / divisor 220 × saldo × fator de adicional. Os registros guardam o salário, o divisor, o percentual e o parâmetro utilizados.

Para criar um novo registro, em `POST /api/v1/horas-extras` use uma data ainda não lançada:

```json
{
  "colaborador_id": "30000000-0000-4000-8000-000000000001",
  "data": "2026-10-09",
  "quantidade_horas": "1.50"
}
```

Resposta: HTTP 201 e `valor_calculado: "15.34"`. Repetir o mesmo dia retorna 409. Esse lançamento altera os totalizadores do dashboard; os valores da tabela inicial deixam de ser a referência após a alteração.

## 4. Mostrar histórico salarial sem reescrever o passado (2 minutos)

Use `PATCH /api/v1/colaboradores/{id}`, com o ID de Ana acima:

```json
{
  "salario_atual": "1650.00",
  "data_vigencia": "2026-10-10"
}
```

Depois consulte `GET /api/v1/colaboradores/{id}/historico` e os registros de horas extras. Os lançamentos anteriores continuam com base de R$ 1.500,00 e seus valores originais. Um novo lançamento de 1h30 em `2026-10-12` usa a base de R$ 1.650,00 e retorna R$ 16,88. Um lançamento retroativo anterior à vigência usa o histórico correspondente à data.

Essa mudança tem vigência única e não deve ser repetida com a mesma data. Para repetir a apresentação, mantenha os dados já alterados e explique o histórico, ou use uma nova massa em outro diretório de PGlite.

## 5. Demonstrar validações e transações (1 a 2 minutos)

Envie uma saída sem classificação:

```json
{
  "colaborador_id": "30000000-0000-4000-8000-000000000002",
  "tipo": "saida",
  "data": "2026-10-21"
}
```

Resposta: HTTP 422. Daniel continua ativo; o sistema não grava uma saída parcial.

Em `DELETE /api/v1/cargos/{id}`, use `20000000-0000-4000-8000-000000000001`. Resposta: 409 porque há histórico vinculado. A mensagem orienta a inativar com `PATCH` e `{"ativo":false}`.

## 6. Mostrar memória e versões de indicadores (1 minuto)

Consulte `GET /api/v1/indicadores/turnover?periodo=2026-10`. Mostre `numerador`, `denominador`, `versao_regra`, `revisao_dados` e `calculado_em`.

Em `POST /api/v1/indicadores/recalcular`, envie:

```json
{
  "tipo": "turnover",
  "periodo": "2026-10"
}
```

Depois consulte `GET /api/v1/indicadores/historico` com `tipo=turnover_geral`. Os dois snapshots permanecem disponíveis. Uma consulta sem mudanças reutiliza o snapshot vigente; um recálculo explícito sempre cria outro.

## 7. Encerrar com segurança e testes (1 minuto)

Consulte a auditoria. Mostre que há autor, momento, entidade e nomes dos campos alterados, sem senha, token ou texto do motivo.

Execute logout. Uma consulta seguinte a colaboradores retorna HTTP 401. O perfil local `consulta@example.com` / `Consulta!2026` demonstra HTTP 403 para dados de RH.

Em terminal, `npm test` executa a suíte e `npm run openapi` valida o contrato. `npm run demo` oferece uma apresentação automática reexecutável, sem criar novos lançamentos operacionais.
