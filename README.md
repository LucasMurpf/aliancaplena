# Gestão da Igreja

Sistema web de gestão financeira para igrejas (Fase 1): contas, categorias, membros, lançamentos de entrada e saída (realizados ou previstos), transferências entre contas, anexos de comprovantes, histórico de alterações, permissões por papel e um painel mensal. Feito com Next.js (App Router), TypeScript, Prisma e PostgreSQL.

As métricas de uso coletadas pelo app (comportamento nas telas, sem dados financeiros) estão descritas em [docs/metricas.md](docs/metricas.md).

## Rodar localmente

Requisitos: Node.js 22 e Docker.

```bash
npm install
cp .env.example .env          # ajuste os valores se precisar
docker compose up -d          # PostgreSQL local
npm run db:migrate            # aplica as migrações no banco de desenvolvimento
npm run dev                   # http://localhost:3000
```

No primeiro acesso o sistema abre a tela **/instalacao**, onde você cria a igreja, a primeira conta e o administrador.

### Variáveis de ambiente

Todas estão em `.env.example`:

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL do app. |
| `DATABASE_URL_TEST` | Banco separado usado pelos testes. **Os testes apagam todas as tabelas dele.** |
| `SESSION_SECRET` | Segredo que assina o login. No mínimo 32 caracteres aleatórios. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2, onde ficam os comprovantes. |
| `TZ` | Fuso horário (`America/Sao_Paulo`). |

### Banco de dados e migrações

As migrações são arquivos SQL em `prisma/migrations/*/migration.sql`, escritos à mão. Por isso os testes não dependem de download de ferramentas do Prisma: o helper `tests/helpers/migracoes.ts` aplica esses arquivos em ordem direto no banco de testes.

- Em uma máquina normal, aplique as migrações pendentes com `npm run db:deploy`.
- Para criar uma migração nova depois de mudar `prisma/schema.prisma`, use `npm run db:migrate`.
- O CI confere que as migrações estão em dia com o `schema.prisma`.

### Testes

```bash
npm test                # unitários e de integração (Vitest; precisa do Postgres e de DATABASE_URL_TEST)
npm run test:e2e        # fluxos de ponta a ponta (Playwright)
```

O E2E faz o build, sobe o app na porta 3100 apontando para `DATABASE_URL_TEST`, recria o schema e semeia dados de teste. Na primeira vez rode `npx playwright install chromium`. Se você já tem um Chrome instalado e não pode baixar navegadores, use `PW_CHROME_PATH=/caminho/do/chrome npm run test:e2e`.

## Instalar para uma nova igreja

Cada igreja tem o próprio banco, bucket e site. Todos os serviços abaixo têm plano gratuito; confira os limites atuais no site de cada provedor antes de escolher.

1. **Banco de dados (Neon).** Crie uma conta e um projeto PostgreSQL em [neon.tech](https://neon.tech). Copie a *connection string* (começa com `postgresql://`); ela será o `DATABASE_URL`.
2. **Aplicar as migrações no banco novo.** Na sua máquina, com a connection string do Neon:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:deploy
   ```
3. **Armazenamento de comprovantes (Cloudflare R2).** No painel da Cloudflare, abra *R2* e crie um bucket (privado). Anote o ID da conta. Em *Gerenciar tokens de API do R2*, crie um token com permissão de leitura e escrita nesse bucket e anote a chave de acesso e a chave secreta. Eles viram `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
4. **Hospedagem (Vercel).** Importe este repositório em [vercel.com](https://vercel.com) como novo projeto e cadastre as variáveis de ambiente do `.env.example`: `DATABASE_URL`, `SESSION_SECRET` (gere um valor aleatório, por exemplo com `openssl rand -base64 48`), as quatro variáveis `R2_*` e `TZ=America/Sao_Paulo`. Não cadastre `DATABASE_URL_TEST` em produção. Faça o deploy.
5. **Primeiro acesso.** Abra o endereço do site. Enquanto não houver usuários, o app leva à tela **/instalacao**: informe o nome da igreja, a primeira conta (caixa ou banco) com o saldo inicial e os dados do administrador. Depois disso a tela de instalação deixa de funcionar e o acesso passa a ser pelo login.
6. Cadastre os demais usuários em *Configurações > Usuários* e confira as categorias em *Configurações > Categorias*.

## Backup manual

Faça backup com `pg_dump` usando a mesma connection string do app (use a conexão direta do Neon, não a "pooled", se houver as duas):

```bash
pg_dump "$DATABASE_URL" > backup-AAAA-MM-DD.sql
```

Para restaurar em um banco vazio:

```bash
psql "$DATABASE_URL" < backup-AAAA-MM-DD.sql
```

O dump cobre os dados do banco. Os comprovantes ficam no bucket do R2 e precisam de cópia própria (por exemplo, com `rclone`). Guarde os arquivos em local seguro: eles contêm dados financeiros e nomes de membros.
