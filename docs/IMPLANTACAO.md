# Implantação

## Demonstração local

```bash
npm ci
cp .env.example .env
npm run setup
npm start
```

Abra http://localhost:3000/docs/. Para outra massa isolada, com o servidor parado, altere `PGLITE_DIR` para um diretório novo antes de executar `npm run setup`. Preserve o diretório antigo; não é necessário apagar dados para repetir a demonstração.

## PostgreSQL externo

Defina `DATABASE_URL` no `.env` e execute migração e seed. O banco deve ser dedicado ao projeto. Em produção use uma URL de pooler com TLS; a aplicação respeita o `sslmode` da conexão e não usa `rejectUnauthorized=false`.

```bash
npm run db:migrate
npm run db:seed
npm start
```

Com `NODE_ENV=production`, defina `SEED_ADMIN_EMAIL` e uma `SEED_ADMIN_PASSWORD` própria. O seed exige senha diferente da demonstração e cria apenas o administrador, sem os registros fictícios e sem o perfil consulta. Nenhuma credencial deve ir para o Git.

## Vercel

1. Crie um PostgreSQL gerenciado dedicado e obtenha sua URL de pooler.
2. Em um ambiente administrativo, configure a URL e aplique `npm run db:migrate` e o seed apropriado. Não exponha a URL em prints ou no repositório.
3. Importe o repositório GitHub na Vercel; a configuração `vercel.json` aponta todas as rotas para `api/index.js` usando função Node.js.
4. Configure `DATABASE_URL` e `NODE_ENV=production` como variáveis de ambiente. O seed é executado separadamente; a função não cria usuários automaticamente.
5. Publique um preview e confira `/health`, `/docs/`, login, consulta e escrita com cookie Secure/CSRF, logout e persistência entre requisições.
6. Só considere o ambiente pronto depois de conferir essas operações e fornecer o link `https://...vercel.app/docs/` ao avaliador.

O adapter mantém o pool e a aplicação apenas durante a vida da instância; sessões e dados pertencem ao PostgreSQL externo. A ausência de `DATABASE_URL` impede o uso do armazenamento local efêmero em produção.

O Swagger inclui assets do pacote no bundle da função. A configuração foi preparada para hospedagem; não há comprovação de deploy online neste repositório até que exista uma implantação real validada.

Referência oficial consultada: [Fastify na Vercel](https://vercel.com/docs/frameworks/backend/fastify). O adapter de função deste projeto usa configuração explícita, em vez de depender da detecção automática do arquivo de entrada.

## Testar PostgreSQL sem tocar na base da apresentação

Use um banco **vazio e descartável**. Os testes criam a migração e a massa fictícia nesse banco, e não a removem automaticamente.

```bash
TEST_DATABASE_URL=postgresql://usuario:senha@localhost:5432/rh_teste npm test
```

O GitHub Actions fornece PostgreSQL 16 isolado, executa a suíte nos dois modos e valida o OpenAPI. A execução local com PGlite usa banco em memória e um diretório temporário para o teste de persistência; não usa `.data/postgres`.
