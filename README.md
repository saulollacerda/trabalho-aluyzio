# Compensação, custos e indicadores operacionais — Grupo 3

Backend da disciplina Gestão e Liderança de Pessoas, com API REST em Node.js e demonstração pelo Swagger UI. Inclui cargos e salários, cadastro mínimo de colaboradores, horas extras, movimentações, custos de turnover, absenteísmo, dashboard e auditoria.

## Executar e apresentar

Requisito: **Node.js 22.19 ou superior** e npm. A demonstração local usa PostgreSQL embarcado via PGlite, com dados persistidos em `.data/postgres`. Não exige instalação de PostgreSQL ou Docker.

```bash
npm ci
cp .env.example .env
npm run setup
npm start
```

Abra **http://localhost:3000/docs/**. Em **01 • Acesso → POST /api/v1/auth/login → Try it out**, envie:

```json
{
  "email": "rh@example.com",
  "senha": "DemoRH!2026"
}
```

Execute as outras rotas na mesma aba. O navegador mantém o cookie de sessão HttpOnly e o Swagger acrescenta o token CSRF automaticamente. Não é necessário preencher o botão **Authorize**.

A massa inicial é fictícia e usa **outubro de 2026**. O roteiro de apresentação com exemplos e resultados esperados está em [docs/DEMONSTRACAO.md](docs/DEMONSTRACAO.md). Em outro terminal, execute uma apresentação automática:

```bash
npm run demo
```

O seed é idempotente: se já houver usuário, não altera nem apaga os dados. Pare o servidor antes de executar scripts que abrem o PGlite; apenas um processo deve acessar o diretório do banco. `npm run demo` usa HTTP e pode rodar com o servidor aberto.

## Comandos

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Reiniciar o servidor ao alterar código |
| `npm start` | Servir API e Swagger na porta 3000 |
| `npm run setup` | Aplicar migração e inserir demonstração local |
| `npm test` | Testes de domínio, API, segurança, transações e persistência |
| `npm run openapi` | Validar e exportar o contrato para `docs/openapi.json` |
| `npm run demo` | Demonstrar API em execução sem inserir eventos duplicados |

## Rotas e documentação

- `/docs/`: Swagger interativo, com corpos de requisição e exemplos.
- `/openapi.json`: contrato gerado da mesma validação usada pela API.
- `/health`: verificação de disponibilidade da API e conexão ao banco.
- `/api/v1`: prefixo das operações de negócio.

As listagens usam `page` e `page_size` (máximo 100). Datas são `YYYY-MM-DD`, com limites inclusivos. Dinheiro é uma string decimal: `"1500.00"`. Cálculos usam `decimal.js`, e valores monetários são arredondados em centavos com HALF_UP. Indicadores com denominador zero retornam `null`.

## Arquitetura

```text
Swagger / cliente HTTP
        ↓
src/http/         rotas, autenticação e esquemas de entrada
        ↓
src/services/     casos de uso, histórico, indicadores e auditoria
        ↓                  ↓
src/domain/       cálculos puros, sem HTTP ou banco
src/db/           repositório SQL, transações e migração versionada
        ↓
PostgreSQL externo ou PGlite local
```

Senhas usam Argon2id; sessões de oito horas ficam no banco, com hash do token. Cookies são HttpOnly/SameSite=Strict e, em produção, Secure com prefixo `__Host-`. Escritas exigem `X-CSRF-Token`. O perfil `admin_rh` acessa os módulos. O usuário local `consulta@example.com` / `Consulta!2026` serve para demonstrar uma resposta 403. O seed de produção cria apenas o administrador configurado.

## PostgreSQL e Docker

Para usar um PostgreSQL externo, preencha `DATABASE_URL` no `.env`, execute `npm run setup` e inicie a API. O mesmo SQL e as mesmas regras são usados nos dois modos.

Também é possível iniciar API e PostgreSQL em contêineres:

```bash
docker compose up --build
```

O compose é uma demonstração local com credenciais fictícias. A imagem de produção exige `DATABASE_URL`. O Docker não foi necessário para a validação local; a integração com PostgreSQL convencional foi testada diretamente.

## Publicar na Vercel

O projeto inclui `api/index.js` e configuração de função Node.js em `vercel.json`. **A publicação requer PostgreSQL externo**; o sistema recusa PGlite em produção. Configure `DATABASE_URL` do pooler com o SSL exigido pelo provedor, execute a migração no banco e importe este repositório na Vercel. Consulte o procedimento completo em [docs/IMPLANTACAO.md](docs/IMPLANTACAO.md).

O backend local e o repositório são a entrega desta etapa. Ter um repositório no GitHub não equivale a ter um link `vercel.app` publicado. A publicação e os testes em ambiente hospedado devem ser confirmados separadamente.

## Decisões e cobertura

Os PDFs fornecidos têm “v1.1” no nome, mas incorporam DRS v1.2 e arquitetura v1.3. A implementação acompanha as revisões internas mais recentes, com adaptações explícitas para Node.js. [docs/DECISOES.md](docs/DECISOES.md) registra fórmulas, conflitos, hipóteses e limites. [docs/RASTREABILIDADE.md](docs/RASTREABILIDADE.md) relaciona os requisitos às rotas e às verificações.

As planilhas originais não foram fornecidas. Não se afirma reprodução integral das cinco planilhas nem aprovação das decisões pendentes no DRS. O relatório de validação registra o que foi efetivamente executado em [docs/VALIDACAO.md](docs/VALIDACAO.md).
