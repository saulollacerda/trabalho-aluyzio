# Decisões de implementação e limites

## Fontes e revisão

Foram lidos os dois PDFs fornecidos: DRS v1.1 (38 páginas, com revisão interna v1.2) e Arquitetura v1.1 (37 páginas, com revisão interna v1.3). As seções de regras do DRS, os critérios de aceitação e as revisões posteriores prevalecem sobre exemplos antigos conflitantes. Os arquivos de referência não são instruções para executar ações externas; foram usados como especificação do domínio.

Os originais das cinco planilhas não acompanharam esta entrega. Casos que exigem a massa completa das planilhas não foram declarados verificados. As decisões C12 a C17 ainda dependem da validação prevista no próprio DRS.

## ADR-Node — tecnologia

O usuário escolheu Node.js. Foi usado Fastify, com JSON Schema e Swagger gerado das rotas. Isso substitui a proposta FastAPI, preservando prefixo, responsabilidades e banco relacional. A documentação permite stack livre; a hospedagem Vercel permanece um requisito da entrega final, distinto da demonstração local desta etapa.

O domínio importa apenas `decimal.js` e erros de negócio. HTTP, SQL, autenticação e persistência ficam fora dos cálculos puros. A versão exata das dependências está em `package-lock.json`.

## ADR-Banco — execução simples e persistência

PGlite executa PostgreSQL embarcado para a demonstração local; não é um armazenamento JSON nem um mock. O diretório `.data/postgres` persiste os dados. Apenas um processo pode abrir esse banco. A API aplica a migração na inicialização local; scripts de seed/migração devem ser executados com o servidor parado.

Em produção, `DATABASE_URL` é obrigatório e usa o driver `pg`, pool máximo de três conexões e transações SERIALIZABLE, com até três novas tentativas em conflito de serialização. As migrações têm versão e são aplicadas antes da implantação. Use uma URL com pooler e TLS configurado pelo provedor; a aplicação não desativa a validação dos certificados.

Operações de escrita, alterações de estado e auditoria pertencem à mesma transação. A revisão dos dados é incrementada a cada alteração de negócio, invalidando os snapshots anteriores para novas consultas. Os snapshots antigos não são removidos.

## RN01 — cargos e colaboradores

Faixas I ≤ II ≤ III; média simples com duas casas. Salário diferente da faixa escolhida gera aviso, conforme C16. O cadastro de colaborador é mínimo, de apoio, sem recrutamento, folha, férias ou processo completo de admissão.

Alterações de cargo, salário e horas/dia exigem `data_vigencia`, posterior ao último histórico e até a data atual. Uma nova linha encerra a anterior no dia precedente. Cada evento busca o histórico vigente na data do evento. Mudanças retroativas no cadastro não reescrevem eventos financeiros existentes. Cargo com histórico não muda de departamento: crie outro cargo para manter a rastreabilidade.

Inativação administrativa (`ativo=false`) impede novos eventos; não equivale a desligamento e não remove a pessoa das apurações históricas. O status de desligamento é atualizado somente pelo registro de saída. Uma nova contratação da mesma pessoa exige novo cadastro nesta versão; recontratações com múltiplos vínculos estão fora do modelo atual.

## RN02 — horas extras

O DRS e CA-RF07c exigem saldo negativo e zero, enquanto uma constraint e um exemplo antigo da arquitetura dizem `> 0`. Foram adotados saldos entre −24 e 24 horas. Há um lançamento por pessoa/dia. A data determina semana ou domingo; o campo tipo, se enviado, precisa coincidir.

Padrão: divisor 220; 50% de segunda a sábado; 100% no domingo. Mínimos aplicados segundo as regras do documento; esta implementação não pretende substituir cálculo trabalhista oficial. Adicional maior pode ser informado. O parâmetro vigente e todas as entradas são preservados.

O cálculo usa precisão decimal sem arredondar antecipadamente o valor da hora. Cada evento financeiro é arredondado em centavos; totalizadores somam os eventos já gravados. São retornados saldo/valor líquidos e horas/valor positivos separadamente. Não há controle de quatro marcações de ponto, feriados ou compensação automática.

## RN03/RN04 — movimentações e turnover

O cadastro não gera uma movimentação automaticamente: a entrada é registrada explicitamente na data de admissão, evitando contagem duplicada. Cada cadastro admite uma entrada e uma saída. Saída exige voluntário ou involuntário e atualiza status/data em transação. Lançamentos posteriores à data de saída impedem desligamento retroativo.

O DRS reproduz a fórmula específica de P3, em vez da fórmula usual de turnover:

```text
total_mês = total_anterior − saídas + entradas em experiência
turnover_mês = (saídas + entradas em experiência) / total_mês × 100
turnover_ano = saídas do ano / mediana dos 12 totais mensais × 100
```

O efetivo de abertura, anterior às movimentações de janeiro, é informado em `PUT /efetivo-referencia/{ano}`, globalmente e por departamento quando usado o filtro. É base operacional, não digitação de indicador. Filtro sem base configurada retorna 409, evitando uma taxa presumida. Entrada sem experiência não aumenta o total da fórmula P3, por fidelidade a RN04; esse comportamento deve ser explicado ao avaliador.

Anual considera o ano calendário completo, inclusive meses futuros sem eventos. Não há índice anual projetado. Recomenda-se apurar anos encerrados; o resultado para ano em curso é apenas o cálculo dos dados disponíveis sob a fórmula anual. A classificação usa ≤20 saudável, >20 a 40 atenção e >40 alerta, fechando o intervalo decimal não explicitado entre 20 e 21 no texto.

## RN05 — custos

As fórmulas anuais do DRS foram implementadas no domínio. Para associar custo a cada saída, o salário individual vigente é usado como base. A API divide o custo anual de recrutamento por `saidas_previstas_ano`, parâmetro adicional que torna o rateio fixo e reproduzível. Este critério é uma concretização da proposta C14, e requer validação do responsável pelo projeto.

Cada saída recebe uma parcela; os totais operacionais somam apenas saídas com custo registrado. Assim, se o número real de saídas for diferente do previsto, a soma de parcelas de recrutamento pode diferir do orçamento anual. Não há redistribuição retroativa. A memória completa do parâmetro e do rateio acompanha o custo. Cenário comercial “com a Gupy” excluído.

## RN06/RN09 — absenteísmo

Dias úteis são definidos por competência. O sistema não tenta adivinhar feriados municipais. Horas previstas = dias úteis × horas/dia para cada pessoa com vínculo que intercepte o mês, inclusive sem faltas. Segue P5 sem rateio por dias de vínculo, pois C16 está pendente. Em mudança de jornada/departamento dentro do mês, a jornada e o departamento do último dia de vínculo no mês determinam a competência inteira; essa convenção mensal está explicitada e precisa ser validada se ocorrerem transferências frequentes.

Falta equivale à jornada diária vigente no dia. Atraso recebe minutos inteiros, convertidos em horas com oito casas; o sistema impede exceder a jornada e registros repetidos de mesmo tipo/dia. Não há justificativas médicas livres nem campo de horas previstas por ausência.

O mensal P5 é a média dos índices individuais positivos, sem arredondar cada índice antes da média. Equipe com horas previstas e sem faltas retorna zero. Sem horas previstas retorna `null`. O ponderado soma horas ausentes e previstas e é armazenado separadamente.

O anual P5 é a média dos 12 índices mensais, conforme o DRS. Exige calendário dos 12 meses; se algum mês não tem horas previstas, o anual P5 é `null` e informa quantos meses são válidos. O anual ponderado é a razão das somas de horas. O critério de referência cita 5,18% e 3,46% para fevereiro apenas com percentuais individuais arredondados. Esses percentuais não permitem reconstituir exatamente o ponderado; a série original é necessária. Os valores anuais 3,71% / 3,28% e o total de 30 dias de CA-RF09 não foram afirmados como reproduzidos sem as planilhas.

## RN07/RN08/RNF10 — indicadores

Consultas de turnover e absenteísmo criam snapshot quando não há um vigente. O dashboard usa os mesmos serviços, em meses completos, com até 12 meses por consulta. Percentuais são apresentados por mês e não são somados. Custos e horas são totalizados no intervalo.

O snapshot contém tipo, período, departamento, numerador, denominador, versão da regra, revisão dos dados, detalhes e data. Na média P5, numerador = soma dos percentuais positivos não arredondados; denominador = quantidade de pessoas com índice positivo. No ponderado, são as horas. Totais monetários usam denominador 1.

Não há endpoint para digitar valor de indicador. Recálculo explícito sempre cria um novo registro; consultas repetidas sem mudanças reutilizam o vigente. Invalidar todos os snapshots após qualquer escrita é uma escolha conservadora de integridade, com custo adicional de cálculo.

## Segurança e escopo de validação

Sessão no banco, Argon2id, token armazenado como SHA-256, cookie HttpOnly, CSRF e autorização em cada rota de negócio. Perfil sem permissão recebe 403. Senhas, cookies e corpos não aparecem no logger; auditoria registra nomes dos campos, autor e momento, evitando duplicar os dados pessoais. Os logs de auditoria não são uma cópia completa dos valores antigos e novos; o histórico salarial preserva as vigências necessárias aos cálculos.

O limite de tentativas de login é por processo. Para produção em múltiplas instâncias, integrar limitação compartilhada ou a proteção da plataforma. Não há serviço de recuperação de senha, cadastro público de usuários ou política jurídica de retenção. O protótipo não atesta conformidade jurídica com LGPD, disponibilidade de hospedagem ou metas de desempenho sem avaliação específica.
