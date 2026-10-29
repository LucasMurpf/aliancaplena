# Gestão da Igreja

Sistema web de gestão financeira para igrejas (Fases 1 e 2): contas, categorias, membros, lançamentos de entrada e saída (realizados ou previstos), transferências entre contas, anexos de comprovantes, histórico de alterações, permissões por papel e um painel mensal, mais calculadora de cédulas, recibos, relatórios, prestação de contas pública e indicadores (Fase 2). Feito com Next.js (App Router), TypeScript, Prisma e PostgreSQL.

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
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2, onde ficam os comprovantes. Obrigatórias em produção: sem as quatro, o envio de comprovantes falha com "Armazenamento de anexos não configurado". Em desenvolvimento, sem elas os comprovantes ficam só na memória do servidor (somem ao reiniciar) e o navegador os envia para a rota local `/api/anexos-memoria`, que não existe em produção. |
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

## Fase 2

**Calculadora de cédulas** (menu *Calculadora*). Feita para o celular: botões grandes de mais e menos para cada cédula e moeda, com o total sempre visível. Tem dois modos:

- **Conferir culto**: compara o que foi contado com as entradas realizadas da conta na data do culto.
- **Conferir caixa**: compara com o saldo atual da conta.

Se a contagem divergir do esperado, a observação explicando a diferença é obrigatória. A contagem fica registrada com histórico e, quando há diferença, a tela do detalhe oferece "Lançar ajuste" (sobra vira entrada, falta vira saída).

**Recibos.** Entradas realizadas de categorias nominais (como o dízimo) com membro informado têm o botão **Gerar recibo** na tela do lançamento. A numeração é por ano e sequencial (`AAAA/NNNNNN`) e nunca se repete. No celular o PDF abre a folha de compartilhamento; no computador ele é baixado como `recibo-AAAA-NNNNNN.pdf`. Gerar de novo mantém o mesmo número. **Depois de emitido, o lançamento não pode ter valor, membro, categoria, tipo ou data editados**: para corrigir, cancele o lançamento e lance de novo. A cidade que aparece no recibo vem de *Configurações > Dados da igreja* (campo **Cidade**).

**Relatórios** (menu *Relatórios*): geral, arrecadação, despesas e contribuições (este só para quem pode ver nomes). Cada um pode ser visto na tela, baixado em **PDF** ou em **CSV**. O CSV usa `;` como separador e vírgula decimal, então abre direto no Excel em português (com acentos corretos).

**Prestação de contas pública** (*Relatórios > Prestação de contas*). Escolha um mês, veja a prévia (é exatamente o que os membros verão) e publique. O sistema gera um link `/p/<código>` que qualquer pessoa abre, sem login.

- O que aparece: nome e logo da igreja, entradas, saídas, resultado do mês, saldo na data de corte e totais por categoria. Se o mês ainda não terminou, a página avisa que é uma prestação **parcial** e até que data.
- O que nunca aparece: nomes de membros, contas, usuários, anexos e descrições de lançamentos (exceto nas saídas de categorias marcadas para detalhar).
- **Detalhar por categoria**: em *Configurações > Categorias*, ative "Mostrar gastos detalhados na prestação pública" em uma categoria de saída (a semente e a migração já marcam 7 categorias de saída) para listar data, descrição e valor de cada saída dela.
  Antes da primeira publicação, revise as descrições das categorias marcadas para detalhar, porque lançamentos antigos passam a aparecer.
- **Versões**: publicar de novo o mesmo mês cria uma nova versão com novo link. O link antigo continua mostrando o que foi publicado, com a faixa "Existe uma versão mais recente".
- **Retirar**: na lista de prestações, *Retirar* informa o motivo e o link passa a mostrar "Esta prestação foi retirada pela igreja". Nada é apagado.
- A página é `noindex` e cada abertura conta uma visualização.

**Indicadores** (menu *Indicadores*): gráficos e números da evolução financeira da igreja ao longo dos meses.

Os novos eventos de uso estão em [docs/metricas.md](docs/metricas.md).

## Instalar para uma nova igreja

Cada igreja tem o próprio banco, bucket e site. Todos os serviços abaixo têm plano gratuito; confira os limites atuais no site de cada provedor antes de escolher.

1. **Banco de dados (Neon).** Crie uma conta e um projeto PostgreSQL em [neon.tech](https://neon.tech). Copie a *connection string* (começa com `postgresql://`); ela será o `DATABASE_URL`.
2. **Aplicar as migrações no banco novo.** Na sua máquina, com a connection string do Neon:
   ```bash
   DATABASE_URL="postgresql://..." npm run db:deploy
   ```
3. **Armazenamento de comprovantes (Cloudflare R2).** No painel da Cloudflare, abra *R2* e crie um bucket (privado). Anote o ID da conta. Em *Gerenciar tokens de API do R2*, crie um token com permissão de leitura e escrita nesse bucket e anote a chave de acesso e a chave secreta. Eles viram `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`.
4. **Hospedagem (Vercel).** Importe este repositório em [vercel.com](https://vercel.com) como novo projeto e cadastre as variáveis de ambiente do `.env.example`: `DATABASE_URL`, `SESSION_SECRET` (gere um valor aleatório, por exemplo com `openssl rand -base64 48`), as quatro variáveis `R2_*` e `TZ=America/Sao_Paulo`. Não cadastre `DATABASE_URL_TEST` em produção. Faça o deploy.
5. **Permitir o envio de comprovantes pelo site (CORS do R2).** O navegador envia cada comprovante direto para o R2 (até 10 MB; o arquivo não passa pela Vercel, que limita requisições a 4,5 MB). Para isso o bucket precisa aceitar o endereço do site. No painel da Cloudflare, abra *R2 > (seu bucket) > Configurações > Política de CORS*, clique em *Adicionar política de CORS* e cole o JSON abaixo, trocando o endereço pelo do seu site (sem barra no fim):
   ```json
   [
     {
       "AllowedOrigins": ["https://sua-igreja.vercel.app"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   Se usar um domínio próprio, inclua os dois endereços na lista `AllowedOrigins`. Sem essa política, salvar um lançamento funciona, mas todo comprovante mostra o aviso "não foi possível enviar".
6. **Primeiro acesso.** Abra o endereço do site. Enquanto não houver usuários, o app leva à tela **/instalacao**: informe o nome da igreja, a primeira conta (caixa ou banco) com o saldo inicial e os dados do administrador. Depois disso a tela de instalação deixa de funcionar e o acesso passa a ser pelo login.
7. Cadastre os demais usuários em *Configurações > Usuários* e confira as categorias em *Configurações > Categorias*.

## Atualizar uma instalação existente

Para levar a Fase 2 (ou qualquer versão nova) a uma igreja que já usa o sistema:

1. Atualize o código e instale as dependências: `npm install`.
2. Aplique as migrações pendentes no banco da igreja: `DATABASE_URL="postgresql://..." npm run db:deploy`. Para a Fase 2 isso aplica a migração `20261027000000_fase2`. Faça um [backup](#backup-manual) antes.
3. Faça o deploy (na Vercel, um novo push ou *Redeploy*).
4. Em *Configurações > Dados da igreja*, preencha a **Cidade** (aparece no recibo).

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
