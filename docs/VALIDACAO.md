# Validação executada

Data: **27/10/2026**, horário de Fortaleza. Ambiente: macOS, Node.js 25.8.1, com o runtime mínimo do projeto definido em Node.js 22.19. O workflow do GitHub usa Node.js 22; seu resultado deve ser consultado no repositório após o push.

| Verificação local | Resultado |
| --- | --- |
| `npm test` com PGlite em memória e teste de persistência em disco | 29 testes aprovados, zero falhas |
| Mesma suíte com `TEST_DATABASE_URL` em PostgreSQL convencional local isolado | 29 testes aprovados, zero falhas |
| `npm run openapi` com Swagger Parser | OpenAPI 3.0.3 válido; 27 caminhos / 39 operações |
| Migração e seed na pasta solicitada pelo usuário | Aplicados; demonstração fictícia de outubro/2026 |
| Swagger UI em navegador | Contrato carregado; login retornou 200; recálculo autenticado retornou 201 com CSRF automático |
| Demonstração por HTTP | Totais de horas, turnover, absenteísmo, custos, histórico e logout conferidos pelo roteiro automático |

## Valores de referência verificados

- Média de faixas 1.200 / 1.800 / 2.300 = R$ 1.766,67.
- Hora extra com salário R$ 1.500: 1h30 em dia útil = R$ 15,34; 2h no domingo = R$ 27,27; saldo −1h em dia útil = −R$ 10,23.
- Turnover de referência mensal: 4 / 57 = 7,02%; anual: 34 / mediana 49 = 69,39%.
- Custo anual de referência: R$ 50.925,00, com os quatro componentes do DRS.
- Dias úteis 22 × jornada 7 = 154 horas previstas por pessoa, mesmo sem ausência.
- Absenteísmo individual do caso de janeiro: 9,31%, 0,11%, 4,55%; média P5 = 4,65%.

## Integridade e segurança verificadas

A suíte cobre validação 422, JSON inválido 400, sessão ausente 401, perfil/CSRF 403 e conflitos 409; preservação de lançamentos após mudança de salário; histórico por vigência; paginação com totalizadores completos; rollback de saída inválida; exclusão de cargo com vínculo; concorrência na criação de custos; reutilização e invalidação de snapshots; revogação de sessão e persistência após reabrir o banco.

Dois testes de regressão verificam o interceptor do Swagger: carregar o contrato sem um método HTTP explícito e obter CSRF para escritas. A interface foi conferida em navegador, além da validação estática do contrato.

## Limites da evidência

Não foram executados testes de carga representativa, restauro de backup gerenciado, testes de frontend de negócio, avaliação jurídica/LGPD ou implantação hospedada na Vercel. Docker/Compose estão preparados, mas não foram executados, pois o daemon Docker local estava indisponível; a integração com PostgreSQL foi verificada diretamente. As planilhas completas não foram fornecidas para reproduzir todas as suas linhas.

O cálculo anual no ano em curso segue os 12 meses da fórmula documentada e deve ser interpretado com a limitação descrita em DECISOES.md. Os pontos em aberto do DRS dependem do professor/RH.
