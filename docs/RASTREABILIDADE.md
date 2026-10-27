# Rastreabilidade da entrega de backend

| Requisitos | Rotas / implementação | Verificação incluída |
| --- | --- | --- |
| RF01–RF05, RN01 | `/cargos`, `/cargos/{id}`, `/departamentos`; faixas, média, edição e exclusão protegida | Média, ordem, validação, vínculo e inativação |
| RF28–RF29 | `/colaboradores`, `/{id}`, `/{id}/historico` | Edição salarial cria vigência e preserva eventos antigos |
| RF06–RF09, RN02 | `/horas-extras`, `/indicadores/horas-extras` | Semana, domingo, zero/negativo, filtros e total além da página |
| RF10–RF11, RN03 | `/movimentacoes` | Classificação obrigatória, rollback e estado de desligamento |
| RF12–RF14, RN04 | `/indicadores/turnover`, `/efetivo-referencia/{ano}`, `/indicadores/historico` | Mensal/anual, mediana, global/departamento e histórico |
| RF15–RF18, RN05 | `/parametros-custo`, `/movimentacoes/{id}/custos`, `/indicadores/custos` | Referência anual R$ 50.925,00, unicidade, rateio, filtro e evolução mensal |
| RF19–RF24, RN06/RN09 | `/ausencias`, `/jornada-referencia`, `/indicadores/absenteismo` | Tipo, minutos, denominador com pessoas sem faltas, P5 e ponderado, mensal/anual |
| RF25–RF27, RN07 | `/dashboard` | Resposta consolidada confere com consultas; séries prontas para gráficos |
| RN08, RNF10 | Entradas congeladas; snapshots em `/indicadores/recalcular` e `/indicadores/historico` | Salário posterior não altera hora extra; novas versões preservam anteriores |
| RNF03/RNF09 | `/auth/login`, `/auth/me`, `/auth/logout`, `/auditoria` | 401, 403, CSRF, revogação, cookie e ausência de senhas na auditoria |
| RNF04 | NUMERIC, decimal.js, constraints, FK e transações | Casos monetários, concorrência de custo, integridade e persistência |
| RNF07 | Camadas separadas, migração, OpenAPI e CI | Domínio puro; testes executáveis; contrato validado |

## Fora da comprovação desta etapa

- RNF01 e RNF06: usabilidade e responsividade da interface de negócio dependem do frontend e dos testes com usuários. Swagger é a interface técnica de demonstração.
- RF25–RF27: backend fornece dados e séries; gráficos/tabelas visuais da interface final não foram construídos.
- RNF02: não foi executada carga representativa para comprovar p95 ≤ 2 s, incluindo cold start hospedado.
- RNF05: disponibilidade, backups gerenciados, RPO/RTO e restauração ainda dependem do ambiente de hospedagem.
- RNF08: evolução genérica de indicadores não foi demonstrada por inclusão de um tipo novo sem alteração de código.
- RNF09: há controles técnicos básicos; base legal, retenção e avaliação institucional de LGPD não estão validadas.
- Publicação Vercel: configuração preparada; acesso hospedado e execução serverless ainda precisam ser verificados após criar banco e implantação.
- Validação com professor/RH e aprovação das divergências C12–C17 continuam pendentes.

A existência de implementação ou teste parcial não significa que todos os critérios de um requisito tenham sido aprovados pelo professor. Use [DECISOES.md](DECISOES.md) para explicar as convenções adotadas.
