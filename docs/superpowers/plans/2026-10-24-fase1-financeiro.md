# Fase 1 — Base + Financeiro Básico · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a instalação do zero, login com papéis múltiplos e o financeiro básico (contas, categorias, membros, lançamentos, transferências, anexos, dashboard, histórico estilo GLPI) de uma igreja.

**Architecture:** Next.js full-stack (App Router + Server Actions). Toda regra de negócio vive em `src/lib/services/*`, que faz autenticação → permissão → validação Zod → escrita + log na mesma transação Prisma. Telas nunca chamam o Prisma diretamente.

**Tech Stack:** Next.js + TypeScript + Tailwind, Prisma + PostgreSQL (Neon em produção, Postgres 16 local/Docker em dev e testes), Zod, `jose` (sessão JWT em cookie), `bcryptjs` (hash, sem build nativo — funciona em Windows), `@aws-sdk/client-s3` (anexos em Cloudflare R2), Recharts, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-fase1-financeiro-design.md`

**Modelo por tarefa** (pedido do Lucas para economizar tokens): cada tarefa traz `Modelo: haiku | sonnet | opus`. O controlador despacha o subagente implementador com esse modelo; o revisor de cada tarefa roda em `sonnet`, e a revisão final do branch em `opus`.

## Global Constraints

- Interface 100% em pt-BR; dinheiro `R$ 1.234,56`; datas `dd/mm/aaaa`; fuso `America/Sao_Paulo`.
- Valores monetários: `Decimal(12,2)` no banco, `Prisma.Decimal` no código, nunca `number` em cálculo; sempre > 0.
- Datas de negócio (`dataVencimento`, `dataRealizacao`, `Transferencia.data`) são `@db.Date` (sem hora).
- Nada é apagado fisicamente: lançamentos/transferências → `CANCELADO`/`CANCELADA` com motivo obrigatório; cadastros → `ativo/ativa = false`.
- Saldo nunca é armazenado; sempre calculado (fórmula da spec §3 regra 2).
- Papéis: `ADMIN | PASTOR | TESOUREIRO | EVENTOS | PATRIMONIO`; vários por usuário; permissão = união.
- Telas/Server Actions só chamam `src/lib/services/*`. Serviço: auth → permissão → Zod → transação (escrita + `registrarLog`).
- Logs: só inserção; nenhum código atualiza ou apaga `Log`.
- Anexos: JPG, PNG, WEBP, HEIC, PDF; máx. 10 MB; bucket privado; acesso por URL assinada.
- Sessão: expira após 15 min sem ação (expiração deslizante no servidor + aviso na tela aos 14 min com botão Continuar; logout aos 15 min).
- Login: 5 falhas em 15 min para o mesmo e-mail bloqueiam novas tentativas; mensagem genérica "E-mail ou senha inválidos".
- Navegação só por menu lateral (fixo ≥ `lg`, gaveta ☰ abaixo disso); botão flutuante "➕ Novo lançamento" apenas para `financeiro.lancar`.
- Categorias seed: Entrada — Dízimo (nominal), Oferta, Missões, Doação, Rendimentos; Saída — Água, Luz, Aluguel, Combustível, Materiais, Manutenção, Missões (repasse).
- Métricas de uso (`EventoUso`): nunca gravar R$, nomes, descrições, textos digitados ou ids na rota; `propriedades` só com chaves da lista fechada por evento; coleta nunca bloqueia nem quebra a tela.
- Commits com mensagens em pt-BR no formato `tipo: descrição`.

## Review Focus

1. **Valor digitado no padrão brasileiro** ("1.234,56", "50", "0,5", "R$ 10,00") deve virar o Decimal certo; "1,234.56", "", "0", "-5" e "abc" devem ser recusados com mensagem clara. → teste na Task 3.
2. **Datas na virada do mês/fuso**: um lançamento com vencimento 31/10 deve cair em outubro no dashboard, mesmo com o servidor em UTC. → teste na Task 12.
3. **Operar em lançamento já cancelado** (editar, dar baixa, cancelar de novo) deve ser recusado; dar baixa em lançamento já realizado também. → teste na Task 10.
4. **Vínculo com cadastro inativo**: criar lançamento com conta/categoria/membro inativo é recusado; editar um lançamento antigo sem trocar esses campos continua permitido. → teste na Task 10.
5. **Instalação disparada duas vezes** (duplo clique, duas abas) cria só um Admin e uma configuração. → teste na Task 7.

---

## Mapa de arquivos

```
docker-compose.yml                 # Postgres 16 local (dev + teste)
.env.example
prisma/schema.prisma, prisma/seed.ts, prisma/migrations/
src/lib/db.ts                      # PrismaClient singleton
src/lib/erros.ts                   # erros tipados
src/lib/dinheiro.ts                # parse/format R$
src/lib/datas.ts                   # parse/format dd/mm/aaaa, limites de mês
src/lib/permissoes.ts              # papel → permissões
src/lib/log.ts                     # registrarLog, diffCampos
src/lib/auth.ts                    # hash, sessão, usuário atual, exigir()
src/lib/storage.ts                 # interface Storage + R2 + memória (testes)
src/lib/services/instalacao.ts
src/lib/services/autenticacao.ts
src/lib/services/usuarios.ts
src/lib/services/cadastros.ts      # contas, categorias, membros
src/lib/services/lancamentos.ts
src/lib/services/transferencias.ts
src/lib/services/resumo.ts         # saldo, resumo do mês, alertas
src/lib/services/anexos.ts
src/lib/services/historico.ts      # leitura de logs legível
src/middleware.ts                  # redireciona sem sessão
src/app/(publico)/login, instalacao
src/app/(sistema)/layout.tsx, page.tsx, em-breve/, lancamentos/, transferencias/[id]/, membros/, configuracoes/{contas,categorias,usuarios,igreja}/
src/components/                    # MenuLateral, AbaHistorico, CampoDinheiro, CampoData, etc.
tests/helpers/db.ts                # reset do banco de teste + fábricas
tests/unit/, tests/integration/, tests/e2e/
```

---

### Task 1: Esqueleto do projeto e infraestrutura de testes
**Modelo:** haiku

**Files:**
- Create: projeto Next.js na raiz (manter `README.md` e `docs/` existentes), `docker-compose.yml`, `.env.example`, `vitest.config.ts`, `tests/helpers/db.ts`, `tests/unit/smoke.test.ts`, `src/lib/db.ts`

**Interfaces:**
- Produces: scripts npm `dev`, `build`, `test` (Vitest, unit + integration), `test:e2e` (Playwright), `db:migrate`, `db:seed`; `prisma` exportado de `src/lib/db.ts`; `resetarBanco(): Promise<void>` em `tests/helpers/db.ts` (TRUNCATE de todas as tabelas com `RESTART IDENTITY CASCADE`).

- [ ] **Step 1:** Rodar `npx create-next-app@latest . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm` (aceitar a pasta não vazia; manter README e docs). Instalar: `prisma @prisma/client zod jose bcryptjs @aws-sdk/client-s3 @aws-sdk/s3-request-presigner recharts` e dev `vitest @vitest/coverage-v8 tsx @types/bcryptjs @playwright/test`. Fixar as versões resolvidas no `package.json` (sem `^`).
- [ ] **Step 2:** `docker-compose.yml` com `postgres:16`, porta 5432, bancos `igreja` e `igreja_test` (script init). `.env.example` com: `DATABASE_URL`, `DATABASE_URL_TEST`, `SESSION_SECRET` (mín. 32 chars), `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `TZ=America/Sao_Paulo` — cada linha com comentário em pt-BR.
- [ ] **Step 3:** `vitest.config.ts`: alias `@`, `environment: node`, `fileParallelism: false` (testes de integração compartilham o banco), `setupFiles` que troca `DATABASE_URL` por `DATABASE_URL_TEST`.
- [ ] **Step 4:** Teste `tests/unit/smoke.test.ts`: `expect(1 + 1).toBe(2)`. Run: `npm test` → PASS.
- [ ] **Step 5:** Commit `chore: esqueleto Next.js, Prisma, Vitest e Postgres local`.

---

### Task 2: Schema do banco, migração e seed
**Modelo:** sonnet

**Files:**
- Create: `prisma/schema.prisma`, `prisma/seed.ts`, primeira migração
- Test: `tests/integration/seed.test.ts`

**Interfaces:**
- Produces: modelos exatamente como spec §3 — `Configuracao (com metricasAtivas Boolean @default(true)), Usuario, UsuarioPapel, Membro, Conta, Categoria, Lancamento, Transferencia, Anexo, Log, EventoUso`; enum `Dispositivo {CELULAR TABLET PC}`; `EventoUso.propriedades Json @default("{}")`, índice `EventoUso(evento, dataHora)`; enums `Papel`, `TipoConta {CAIXA BANCO}`, `TipoMovimento {ENTRADA SAIDA}`, `StatusLancamento {PREVISTO REALIZADO CANCELADO}`, `StatusTransferencia {ATIVA CANCELADA}`. Ids `String @id @default(cuid())`. `semearCategorias(prisma): Promise<void>` exportada de `prisma/seed.ts` (idempotente por `nome + tipo`).
- Índices: `Lancamento(status, dataVencimento)`, `Lancamento(dataRealizacao)`, `Lancamento(contaId)`, `Log(entidade, entidadeId, dataHora)`, `Log(acao, entidadeId, dataHora)`; `@@unique([nome, tipo])` em Categoria; `Usuario.email @unique` (sempre minúsculo).
- `Log.valorAnterior`/`valorNovo`: `String?` (texto legível já formatado no momento da gravação). `Log.usuarioId` opcional (falha de login sem usuário).

- [ ] **Step 1: Teste**
```ts
test('seed cria as 12 categorias e é idempotente', async () => {
  await resetarBanco();
  await semearCategorias(prisma); await semearCategorias(prisma);
  const cats = await prisma.categoria.findMany();
  expect(cats).toHaveLength(12);
  expect(cats.find(c => c.nome === 'Dízimo')).toMatchObject({ tipo: 'ENTRADA', nominal: true, ativa: true });
  expect(cats.filter(c => c.nome.startsWith('Missões')).map(c => c.tipo).sort()).toEqual(['ENTRADA', 'SAIDA']);
});
```
- [ ] **Step 2:** Rodar → FAIL (módulo inexistente).
- [ ] **Step 3:** Escrever schema, `npx prisma migrate dev --name inicial`, implementar seed (nome da saída: "Missões (repasse)").
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** Commit `feat: schema inicial e seed de categorias`.

---

### Task 3: Erros tipados, dinheiro e datas
**Modelo:** haiku

**Files:**
- Create: `src/lib/erros.ts`, `src/lib/dinheiro.ts`, `src/lib/datas.ts`
- Test: `tests/unit/dinheiro.test.ts`, `tests/unit/datas.test.ts`

**Interfaces:**
- Produces:
  - `class ErroApp extends Error { codigo }` e subclasses `NaoAutorizado`, `Validacao`, `NaoEncontrado`, `RegraDeNegocio` (mensagem pt-BR no construtor).
  - `parseValorBR(texto: string): Prisma.Decimal` — lança `Validacao('Valor inválido')`.
  - `formatarBRL(valor: Prisma.Decimal | string): string` → `"R$ 1.234,56"`.
  - `parseDataBR(texto: string): Date` (aceita `dd/mm/aaaa` e `aaaa-mm-dd`, retorna meia-noite UTC daquele dia), `formatarDataBR(d: Date): string`, `limitesDoMes(ano: number, mes: number): { inicio: Date; fim: Date }` (fim exclusivo), `hojeSP(): Date` (data de hoje no fuso de São Paulo, meia-noite UTC).

- [ ] **Step 1: Testes**
```ts
test.each([['1.234,56','1234.56'],['50','50'],['0,5','0.5'],['R$ 10,00','10'],[' 7,90 ','7.9']])
  ('parseValorBR(%s)', (t, esperado) => expect(parseValorBR(t).equals(esperado)).toBe(true));
test.each(['1,234.56','','0','-5','abc','1,234','12,345'])
  ('parseValorBR recusa %s', t => expect(() => parseValorBR(t)).toThrow(Validacao));
test('formata', () => expect(formatarBRL(new Prisma.Decimal('1234.5'))).toBe('R$ 1.234,50'));
test('limites de outubro', () => {
  const { inicio, fim } = limitesDoMes(2026, 10);
  expect(inicio.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  expect(fim.toISOString()).toBe('2026-11-01T00:00:00.000Z');
});
test('parseDataBR', () => expect(parseDataBR('31/10/2026').toISOString()).toBe('2026-10-31T00:00:00.000Z'));
```
(`formatarBRL` pode usar `Intl.NumberFormat('pt-BR')`; normalizar o espaço não separável para comparar.)
- [ ] **Step 2:** Rodar → FAIL. **Step 3:** Implementar. **Step 4:** Rodar → PASS.
- [ ] **Step 5:** Commit `feat: utilitários de dinheiro, datas e erros`.

---

### Task 4: Permissões
**Modelo:** sonnet

**Files:**
- Create: `src/lib/permissoes.ts` · Test: `tests/unit/permissoes.test.ts`

**Interfaces:**
- Produces: `type Permissao = 'financeiro.ver' | 'financeiro.lancar' | 'membros.ver_nomes' | 'membros.gerenciar' | 'cadastros.gerenciar' | 'admin' | 'historico.ver'`; `permissoesDe(papeis: Papel[]): Set<Permissao>`; `pode(papeis: Papel[], p: Permissao): boolean`. Matriz exatamente como spec §4. `EVENTOS` e `PATRIMONIO` mapeiam para conjunto vazio na Fase 1.

- [ ] **Step 1: Testes** — Pastor: tem `financeiro.ver`, não tem `financeiro.lancar`; Pastor+Tesoureiro: tem ambas; Tesoureiro+Patrimônio: igual a Tesoureiro; Eventos sozinho: conjunto vazio; Admin: todas as 7; Tesoureiro não tem `admin`.
- [ ] **Steps 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5:** Commit `feat: matriz de permissões com papéis múltiplos`.

---

### Task 5: Log (histórico)
**Modelo:** sonnet

**Files:**
- Create: `src/lib/log.ts` · Test: `tests/integration/log.test.ts`

**Interfaces:**
- Consumes: `prisma` (Task 1).
- Produces:
  - `type Acao = 'CRIOU' | 'ALTEROU' | 'DEU_BAIXA' | 'CANCELOU' | 'INATIVOU' | 'REATIVOU' | 'ANEXOU' | 'LOGIN' | 'LOGIN_FALHOU' | 'INSTALOU'`
  - `type Entidade = 'Lancamento' | 'Transferencia' | 'Membro' | 'Conta' | 'Categoria' | 'Usuario' | 'Configuracao' | 'Login'`
  - `registrarLog(tx: Prisma.TransactionClient, e: { usuarioId?: string; entidade: Entidade; entidadeId: string; acao: Acao; campo?: string; valorAnterior?: string; valorNovo?: string }): Promise<void>`
  - `diffCampos(antes: Record<string, string | null>, depois: Record<string, string | null>): { campo: string; de: string | null; para: string | null }[]` — só campos diferentes, na ordem das chaves de `depois`.
  - Convenção: o chamador passa valores **já legíveis** (nome da categoria, `formatarBRL`, `formatarDataBR`).

- [ ] **Step 1: Testes** — `diffCampos` retorna só `valor` quando apenas o valor mudou; `registrarLog` dentro de `prisma.$transaction` que depois lança erro → nenhuma linha em `Log` (rollback); fora de erro → 1 linha.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: registro de histórico transacional`.

---

### Task 6: Autenticação (núcleo)
**Modelo:** opus

**Files:**
- Create: `src/lib/auth.ts` · Test: `tests/integration/auth.test.ts`

**Interfaces:**
- Consumes: `prisma`, `permissoes`, `erros`.
- Produces:
  - `hashSenha(s: string): Promise<string>` (bcryptjs, custo 12); `conferirSenha(s, hash): Promise<boolean>`.
  - `criarTokenSessao(usuarioId: string): Promise<string>` / `lerTokenSessao(token: string): Promise<{ usuarioId: string } | null>` — JWT HS256 com `SESSION_SECRET`, `exp` = agora + `TEMPO_SESSAO_SEGUNDOS`.
  - `TEMPO_SESSAO_SEGUNDOS = 15 * 60` exportado.
  - `type UsuarioAtual = { id: string; nome: string; email: string; papeis: Papel[] }`
  - `carregarUsuario(usuarioId: string): Promise<UsuarioAtual | null>` — `null` se não existe ou `ativo=false`.
  - `obterUsuarioAtual(): Promise<UsuarioAtual | null>` — lê o cookie `sessao` (via `next/headers`) e chama `carregarUsuario`.
  - `exigir(usuario: UsuarioAtual | null, p: Permissao): UsuarioAtual` — lança `NaoAutorizado` se nulo ou sem permissão.
  - Cookie: nome `sessao`, `httpOnly`, `secure` em produção, `sameSite: 'lax'`, `path: '/'`, maxAge `TEMPO_SESSAO_SEGUNDOS`. Helpers `gravarCookieSessao(token)` e `apagarCookieSessao()`.
  - **Regra para serviços:** todo serviço recebe `ator: UsuarioAtual | null` como primeiro parâmetro (testável sem cookie); Server Actions passam `await obterUsuarioAtual()`.

- [ ] **Step 1: Testes** — hash ≠ senha e confere; token válido volta o id; token adulterado → `null`; com `vi.setSystemTime`, token criado há 14 min é válido e há 16 min → `null`; `carregarUsuario` de usuário inativo → `null`; `exigir(null, …)` lança `NaoAutorizado`; `exigir(pastor, 'financeiro.lancar')` lança.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: hash de senha, sessão JWT e checagem de permissão`.

---

### Task 7: Instalação e login
**Modelo:** opus

**Files:**
- Create: `src/lib/services/instalacao.ts`, `src/lib/services/autenticacao.ts`
- Test: `tests/integration/instalacao.test.ts`, `tests/integration/login.test.ts`

**Interfaces:**
- Consumes: `auth`, `log`, `semearCategorias`.
- Produces:
  - `sistemaInstalado(): Promise<boolean>` (existe ao menos 1 Usuario).
  - `instalar(d: { nomeIgreja: string; logoUrl?: string; nomeConta: string; tipoConta: TipoConta; saldoInicial: string; adminNome: string; adminEmail: string; adminSenha: string }): Promise<UsuarioAtual>` — numa transação com `SELECT pg_advisory_xact_lock(4242)`, recusa (`RegraDeNegocio('Sistema já instalado')`) se já houver usuário; cria Configuracao, Conta, Usuario com papel ADMIN, semeia categorias, loga `INSTALOU`. Senha mínima 8 caracteres.
  - `entrar(email: string, senha: string): Promise<UsuarioAtual>` — e-mail normalizado (trim + minúsculo). Se houver ≥ 5 logs `LOGIN_FALHOU` com `entidade='Login', entidadeId=email` nos últimos 15 min → `NaoAutorizado('Muitas tentativas. Aguarde 15 minutos.')`. Senha errada, usuário inexistente ou inativo → loga `LOGIN_FALHOU` e lança `NaoAutorizado('E-mail ou senha inválidos')`. Sucesso → loga `LOGIN` (`entidade='Usuario'`).

- [ ] **Step 1: Testes**
  - instala com sistema vazio → 1 usuário ADMIN, 1 configuração, 12 categorias, 1 conta;
  - segunda chamada → `RegraDeNegocio`;
  - **Review Focus 5:** `Promise.allSettled([instalar(d), instalar(d2)])` → exatamente 1 fulfilled, 1 Usuario, 1 Configuracao;
  - login certo retorna usuário; e-mail com maiúsculas/espaços funciona;
  - senha errada → mensagem genérica; usuário inativo → mesma mensagem;
  - 5 falhas seguidas → 6ª tentativa, mesmo com senha certa, recebe "Muitas tentativas".
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: instalação inicial e login com limite de tentativas`.

---

### Task 8: Usuários e papéis
**Modelo:** sonnet

**Files:**
- Create: `src/lib/services/usuarios.ts` · Test: `tests/integration/usuarios.test.ts`

**Interfaces:**
- Consumes: `auth.exigir`, `hashSenha`, `registrarLog`.
- Produces (todas exigem `admin`):
  - `listarUsuarios(ator): Promise<(UsuarioAtual & { ativo: boolean })[]>`
  - `criarUsuario(ator, d: { nome; email; senha; papeis: Papel[] })` — ao menos 1 papel; e-mail único (mensagem "E-mail já cadastrado").
  - `atualizarUsuario(ator, id, d: { nome?; email?; papeis? })` — loga `ALTEROU` com papéis como texto `"PASTOR, TESOUREIRO"`.
  - `definirAtivo(ator, id, ativo: boolean)` — loga `INATIVOU`/`REATIVOU`.
  - `redefinirSenha(ator, id, novaSenha)` — loga `ALTEROU` campo `senha` sem valores.
  - Regra: qualquer operação que deixaria **zero ADMIN ativos** → `RegraDeNegocio('O sistema precisa de ao menos um administrador ativo')`.

- [ ] **Step 1: Testes** — Tesoureiro tentando criar usuário → `NaoAutorizado`; cria usuário com `['TESOUREIRO','PATRIMONIO']` e `permissoesDe` dá as de Tesoureiro; remover papel ADMIN do único admin → recusa; inativar o único admin → recusa; com 2 admins, inativar um → ok; trocar papéis gera log com "de"/"para".
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: gestão de usuários com papéis múltiplos`.

---

### Task 9: Cadastros — contas, categorias, membros
**Modelo:** sonnet

**Files:**
- Create: `src/lib/services/cadastros.ts` · Test: `tests/integration/cadastros.test.ts`

**Interfaces:**
- Produces:
  - Contas (`cadastros.gerenciar` para escrever, `financeiro.ver` para listar): `listarContas(ator, { incluirInativas?: boolean })`, `criarConta(ator, { nome; tipo; saldoInicial: string })`, `atualizarConta(ator, id, {...})`, `definirContaAtiva(ator, id, ativa)`. `saldoInicial` aceita 0 (exceção à regra "> 0"; use `parseValorBR` com opção `{ permitirZero: true }` — adicionar esse parâmetro opcional em `dinheiro.ts` com teste).
  - Categorias: `listarCategorias(ator, { tipo?: TipoMovimento; incluirInativas? })`, `criarCategoria(ator, { nome; tipo; nominal })`, `atualizarCategoria`, `definirCategoriaAtiva`. **Tipo não pode ser alterado** depois de criada.
  - Membros (`membros.gerenciar`; listar exige `membros.ver_nomes`): `buscarMembros(ator, termo: string, { incluirInativos? })` (ilike, máx. 20), `criarMembro(ator, { nome; telefone?; dataNascimento? })`, `atualizarMembro`, `definirMembroAtivo`.
  - Todas as escritas logam (`CRIOU`, `ALTEROU` por campo, `INATIVOU`/`REATIVOU`).

- [ ] **Step 1: Testes** — Pastor cria membro ok, Pastor cria conta → `NaoAutorizado`; categoria duplicada (mesmo nome+tipo) → `Validacao('Categoria já existe')`; tentar mudar tipo de categoria → `RegraDeNegocio`; `buscarMembros('joão')` acha "João Silva" (case/acento-insensível usando `unaccent` ou normalização em JS — escolher uma e testar); inativar membro some da busca padrão.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: cadastros de contas, categorias e membros`.

---

### Task 10: Lançamentos
**Modelo:** opus

**Files:**
- Create: `src/lib/services/lancamentos.ts` · Test: `tests/integration/lancamentos.test.ts`

**Interfaces:**
- Consumes: `exigir`, `registrarLog`, `diffCampos`, `parseValorBR`, `parseDataBR`, `formatarBRL`, `formatarDataBR`.
- Produces:
  - `type DadosLancamento = { tipo: TipoMovimento; valor: string; categoriaId: string; contaId: string; membroId?: string | null; descricao?: string; dataVencimento: string; realizado: boolean; dataRealizacao?: string }`
  - `criarLancamento(ator, d: DadosLancamento): Promise<Lancamento>` — `financeiro.lancar`. Se `realizado` e sem `dataRealizacao` → usa `dataVencimento`.
  - `editarLancamento(ator, id, d: DadosLancamento)` — loga um `ALTEROU` por campo mudado (valores legíveis).
  - `darBaixa(ator, id, dataRealizacao: string)` — só de `PREVISTO`.
  - `cancelarLancamento(ator, id, motivo: string)` — motivo `trim()` não vazio; não de `CANCELADO`.
  - `obterLancamento(ator, id)` — `financeiro.ver`; inclui categoria, conta, membro (nome mascarado como `"Contribuição nominal"` sem `membros.ver_nomes`), anexos.
  - `type FiltroLancamentos = { de?: string; ate?: string; tipo?; categoriaId?; contaId?; status?; membroId?; busca?; pagina?: number }` (período filtra por `dataRealizacao` se REALIZADO, senão `dataVencimento`; 20 por página; ordem data desc).
  - `listarLancamentos(ator, f): Promise<{ itens; total: number; somaEntradas: Prisma.Decimal; somaSaidas: Prisma.Decimal }>` — somas sobre **todo** o filtro, não só a página; `CANCELADO` só aparece se `status=CANCELADO` for pedido explicitamente.
- Validações (todas `Validacao`/`RegraDeNegocio` em pt-BR):
  - categoria.tipo ≠ tipo → "Categoria não corresponde ao tipo do lançamento";
  - categoria nominal sem membro → "Esta categoria exige um membro"; não nominal com membro → "Esta categoria não aceita membro";
  - conta/categoria/membro inativo **ao criar**, ou **ao trocar para** ele na edição → "<Cadastro> inativo"; manter o mesmo vínculo inativo numa edição é permitido;
  - qualquer operação em `CANCELADO` → "Lançamento cancelado não pode ser alterado";
  - `darBaixa` em `REALIZADO` → "Lançamento já realizado".

- [ ] **Step 1: Testes** — cobrindo cada validação acima, mais:
  - Pastor criando → `NaoAutorizado`; Pastor+Tesoureiro → ok;
  - criar realizado sem `dataRealizacao` → igual ao vencimento;
  - editar valor de 100 para 150 → log `ALTEROU` campo `valor`, de `"R$ 100,00"` para `"R$ 150,00"`;
  - cancelar com motivo `"   "` → recusa; com motivo → status `CANCELADO`, `motivoCancelamento` gravado, log `CANCELOU` com o motivo em `valorNovo`;
  - **Review Focus 3:** editar/dar baixa/cancelar um cancelado → recusa; dar baixa em realizado → recusa;
  - **Review Focus 4:** inativar categoria depois de usada → editar só a descrição desse lançamento funciona; criar novo com ela → recusa;
  - máscara do membro: testar a função pura exportada `mascararMembro<T extends { membro: { nome: string } | null }>(l: T, papeis: Papel[]): T` — com `[]` o nome vira `"Contribuição nominal"`, com `['PASTOR']` fica intacto (nenhum papel atual tem `financeiro.ver` sem `membros.ver_nomes`, então a regra só é testável na função pura);
  - `listarLancamentos` com 25 itens → página 1 tem 20, `total` 25, somas sobre os 25.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: serviço de lançamentos com validações e histórico`.

---

### Task 11: Transferências
**Modelo:** sonnet

**Files:**
- Create: `src/lib/services/transferencias.ts` · Test: `tests/integration/transferencias.test.ts`

**Interfaces:**
- Produces: `criarTransferencia(ator, { contaOrigemId; contaDestinoId; valor: string; data: string; descricao? })`, `cancelarTransferencia(ator, id, motivo)`, `obterTransferencia(ator, id)`, `listarTransferencias(ator, { de?; ate?; contaId? })`. Permissões como lançamentos. Regras: contas diferentes ("Escolha contas diferentes"), ambas ativas, motivo obrigatório, não cancelar duas vezes. Logs `CRIOU`/`CANCELOU`.

- [ ] **Step 1: Testes** — mesma conta → recusa; conta inativa → recusa; cancelar duas vezes → recusa; Pastor → `NaoAutorizado`.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: transferências entre contas`.

---

### Task 12: Saldo, resumo do mês e alertas
**Modelo:** opus

**Files:**
- Create: `src/lib/services/resumo.ts` · Test: `tests/integration/resumo.test.ts`

**Interfaces:**
- Consumes: modelos de lançamento/transferência, `limitesDoMes`, `hojeSP`.
- Produces (todas `financeiro.ver`):
  - `saldoPorConta(ator): Promise<{ contaId; nome; tipo; saldo: Prisma.Decimal }[]>` — só contas ativas + contas inativas com saldo ≠ 0; fórmula da spec; uma consulta agregada (`groupBy`/SQL), não N+1.
  - `saldoTotal(ator): Promise<Prisma.Decimal>`
  - `resumoMes(ator, ano, mes): Promise<{ entradas; saidas; resultado: Prisma.Decimal; porCategoriaEntrada: { categoria: string; total: Prisma.Decimal }[]; porCategoriaSaida: {…}[] }>` — só `REALIZADO` com `dataRealizacao` no mês; transferências não entram; listas ordenadas por total desc.
  - `alertas(ator): Promise<{ vencidos: AlertaItem[]; proximos: AlertaItem[] }>` — `PREVISTO` com vencimento `< hojeSP()` (vencidos) ou entre hoje e hoje+7 inclusive (próximos); `AlertaItem = { id; tipo; descricao; categoria; valor; dataVencimento }`.

- [ ] **Step 1: Testes**
  - conta com saldo inicial 100, entrada realizada 50, saída realizada 30, entrada prevista 999 → saldo 120;
  - dar baixa na prevista → saldo 1119;
  - transferência 20 de A para B → A −20, B +20, `resumoMes` inalterado; cancelar → volta;
  - lançamento cancelado não conta em nada;
  - **Review Focus 2:** lançamento realizado em `31/10/2026` aparece em outubro e não em novembro, com `process.env.TZ='UTC'` no teste;
  - alertas: vencido ontem em `vencidos`; vence em 7 dias em `proximos`; em 8 dias em nenhum (usar `vi.setSystemTime`).
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: cálculo de saldo, resumo mensal e alertas`.

---

### Task 13: Anexos
**Modelo:** sonnet

**Files:**
- Create: `src/lib/storage.ts`, `src/lib/services/anexos.ts` · Test: `tests/integration/anexos.test.ts`

**Interfaces:**
- Produces:
  - `interface Storage { enviar(chave: string, dados: Buffer, mime: string): Promise<void>; urlAssinada(chave: string, segundos: number): Promise<string> }`; `storageR2()` (S3 client com endpoint `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, region `auto`); `storageMemoria()` para testes; `obterStorage()` escolhe R2 se as variáveis existirem, senão memória (e loga aviso em dev).
  - `anexarArquivo(ator, lancamentoId, arquivo: { nome: string; mime: string; dados: Buffer }, storage = obterStorage())` — `financeiro.lancar`; MIME em `image/jpeg|image/png|image/webp|image/heic|application/pdf`; ≤ 10 MB (`10 * 1024 * 1024`); não em lançamento cancelado; chave `anexos/<lancamentoId>/<cuid>-<nome-sanitizado>`; loga `ANEXOU` com o nome do arquivo.
  - `urlDoAnexo(ator, anexoId, storage = obterStorage())` — `financeiro.ver`; URL válida por 300 s.

- [ ] **Step 1: Testes** — PDF de 1 KB ok; `.exe`/`text/html` → `Validacao('Tipo de arquivo não permitido')`; 10 MB + 1 byte → `Validacao('Arquivo maior que 10 MB')`; nome `../../x.pdf` vira chave sem `..`; Pastor anexando → `NaoAutorizado`; Pastor pede URL → ok.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: upload de anexos com validação`.

---

### Task 14: Histórico legível
**Modelo:** haiku

**Files:**
- Create: `src/lib/services/historico.ts` · Test: `tests/integration/historico.test.ts`

**Interfaces:**
- Produces: `historicoDe(ator, entidade: Entidade, entidadeId: string): Promise<{ dataHora: Date; usuario: string; acao: string; campo: string | null; de: string | null; para: string | null }[]>` — `historico.ver`; ordem mais recente primeiro; `usuario` = nome ou `"Sistema"`; `acao` traduzida (`CRIOU → "Criou"`, `DEU_BAIXA → "Deu baixa"`, etc.).

- [ ] **Step 1: Testes** — após criar e editar um lançamento, retorna 2+ linhas na ordem certa com ação traduzida; usuário com só `EVENTOS` → `NaoAutorizado`.
- [ ] **Steps 2–4.** **Step 5:** Commit `feat: consulta de histórico`.

---

### Task 14A: Métricas de uso (coleta, proteção e views)
**Modelo:** sonnet

**Files:**
- Create: `src/lib/metricas/catalogo.ts`, `src/lib/services/metricas.ts`, `src/app/api/uso/route.ts`, `src/lib/metricas/cliente.ts`, `prisma/sql/views-metricas.sql` (aplicado por uma migração SQL), `docs/metricas.md`
- Test: `tests/unit/catalogo-metricas.test.ts`, `tests/integration/metricas.test.ts`

**Interfaces:**
- Consumes: `UsuarioAtual`, `obterUsuarioAtual`, `prisma`.
- Produces:
  - `CATALOGO: Record<NomeEvento, readonly string[]>` — chaves permitidas por evento (spec §6A); `type NomeEvento` = união dos nomes.
  - `sanitizarEvento(nome: string, props: unknown): { nome: NomeEvento; props: Record<string, string | number | boolean> } | null` — `null` para evento desconhecido; descarta chaves fora do catálogo e valores que não sejam string ≤ 40 chars, número ou booleano.
  - `normalizarTela(rota: string): string` — troca segmentos com cuid/números por `[id]` e remove query string.
  - `registrarEventos(ator: UsuarioAtual | null, eventos: { nome: string; tela: string; duracaoMs?: number; props?: unknown; dispositivo: Dispositivo; sessaoId?: string }[]): Promise<number>` — não faz nada se `metricasAtivas=false`; máx. 50 eventos por chamada; retorna quantos gravou; **nunca lança** (captura e `console.warn`).
  - `rastrearServidor(tx, ator, nome, props?)` — para eventos de negócio dentro dos serviços (chamada adicionada nas Tasks 10, 11, 13 e 9 em `criarMembro` com `props.origem`) — pode ser feita nesta tarefa editando esses serviços com testes.
  - `limparEventosAntigos(): Promise<number>` — apaga `dataHora < agora − 12 meses`; chamada no máximo 1×/dia (oportunisticamente no `registrarEventos`, guardando a última execução em memória + checagem por data).
  - `POST /api/uso` — corpo `{ eventos: [...] }`; sem sessão → 204 sem gravar; sempre responde 204.
  - Cliente: `rastrear(nome: NomeEvento, props?, duracaoMs?)` — fila em memória, envio a cada 10 s e em `visibilitychange=hidden` com `navigator.sendBeacon`; `dispositivo` por `window.innerWidth` (< 768 CELULAR, < 1024 TABLET, senão PC); `sessaoId` gerado no login e guardado em `sessionStorage` (try/catch).
  - Views: `vw_uso_diario(dia, evento, dispositivo, papeis, total)`, `vw_funil_lancamento(dia, iniciados, salvos, abandonados, mediana_duracao_ms)`, `vw_erros(dia, evento, campo, regra, total)`.

- [ ] **Step 1: Testes**
  - `sanitizarEvento('lancamento_salvo', { tipo: 'ENTRADA', comAnexo: true, valor: '1234,56', descricao: 'x' })` → props só `{ tipo, comAnexo }`;
  - evento desconhecido → `null`; string de 41 chars descartada;
  - `normalizarTela('/lancamentos/clx9a8b7c6d5e4f3g2h1?pagina=2')` → `'/lancamentos/[id]'`;
  - `registrarEventos` com `metricasAtivas=false` → 0 gravados;
  - 60 eventos → grava 50;
  - nenhuma linha gravada contém as strings `"1234"` ou um nome de membro criado no teste (busca no JSON);
  - erro de banco simulado → retorna 0 sem lançar;
  - evento de 13 meses atrás é apagado por `limparEventosAntigos`, o de 11 meses fica;
  - `darBaixa` grava exatamente 1 `EventoUso` `baixa_dada` (o servidor só grava eventos de negócio: `baixa_dada`, `lancamento_cancelado`, `transferencia_criada`, `anexo_enviado`, `membro_cadastrado_rapido`; `lancamento_salvo` vem do cliente porque carrega a duração).
- [ ] **Steps 2–4.** Views aplicadas via migração; teste de integração faz `SELECT * FROM vw_funil_lancamento` sem erro.
- [ ] **Step 5:** `docs/metricas.md` em pt-BR: o que é coletado, o que nunca é, como desligar, como criar usuário somente-leitura (`CREATE ROLE bi_leitura LOGIN PASSWORD '…'; GRANT SELECT ON vw_uso_diario, vw_funil_lancamento, vw_erros TO bi_leitura;`) e conectar no Power BI.
- [ ] **Step 6:** Commit `feat: métricas de uso com catálogo fechado e views para BI`.

---

### Task 15: Casca do app — layout, menu lateral, login, instalação, proteção de rotas
**Modelo:** sonnet

**Files:**
- Create: `src/middleware.ts`, `src/app/(publico)/login/page.tsx` + `actions.ts`, `src/app/(publico)/instalacao/page.tsx` + `actions.ts`, `src/app/(sistema)/layout.tsx`, `src/app/(sistema)/em-breve/page.tsx`, `src/components/MenuLateral.tsx`, `src/components/BotaoNovoLancamento.tsx`, `src/components/ui/*` (Botao, Campo, Alerta, Cartao)
- Test: `tests/unit/menu.test.ts`

**Interfaces:**
- Consumes: `obterUsuarioAtual`, `entrar`, `instalar`, `sistemaInstalado`, `pode`.
- Produces: `itensDoMenu(papeis: Papel[]): { rotulo: string; href: string; icone: string }[]` (função pura em `MenuLateral.tsx` ou `src/lib/menu.ts`): Início `/`, Lançamentos `/lancamentos`, Membros `/membros`, Contas, Categorias, Usuários, Dados da igreja (sob "Configurações") — cada item só se `pode(...)`. Usuário sem `financeiro.ver` recebe só `Início` apontando para `/em-breve`. Componente `<Formulario>` padrão que mostra `ErroApp.message` vindo da action.

- [ ] **Step 1: Testes** — `tests/unit/inatividade.test.ts` da função pura `estadoInatividade(msParado: number): 'ativo' | 'aviso' | 'expirar'` em `src/lib/inatividade.ts`: 13 min → `ativo`, 14 min → `aviso`, 15 min → `expirar`. E de `itensDoMenu`: Pastor não vê Contas/Categorias/Usuários; Tesoureiro vê Contas/Categorias, não Usuários; Admin vê tudo; Eventos vê só o item para `/em-breve`.
- [ ] **Step 2:** FAIL → **Step 3:** implementar telas:
  - `middleware.ts`: sem cookie `sessao` em rota de `(sistema)` → `/login?expirou=1`. Com token válido, **reemite** o cookie com novo `exp` (expiração deslizante) a cada requisição; token inválido/expirado → apaga cookie e redireciona para `/login?expirou=1`. (Checagem de usuário ativo continua no layout via `obterUsuarioAtual`.) O login mostra "Sua sessão expirou por inatividade" quando `expirou=1`.
  - `src/components/MonitorInatividade.tsx` (client, no layout): escuta `pointerdown`, `keydown`, `touchstart`, `scroll`; aos 14 min parado mostra modal "Sua sessão vai expirar em 1 minuto" com botão **Continuar** (chama a Server Action `renovarSessao()`, que reemite o cookie); aos 15 min chama a action `sair()` e vai para `/login?expirou=1`. Interação também chama `renovarSessao()` no máximo 1 vez por minuto (throttle), cobrindo quem digita um formulário longo sem enviar.
  - `/instalacao`: se `sistemaInstalado()` → redireciona para `/login`. Formulário com os campos de `instalar`; sucesso → grava cookie e vai para `/`.
  - `/login`: se não instalado → `/instalacao`. Sucesso → `/`.
  - Layout `(sistema)`: menu fixo em `lg:`; abaixo disso, botão ☰ no topo abre gaveta com overlay (fecha ao tocar fora, ao escolher item e com Esc); mostra nome da igreja e do usuário, botão "Sair". Botão flutuante ➕ (canto inferior direito) se `financeiro.lancar`. Rastreio: `tela_aberta` a cada mudança de rota (componente cliente no layout), `menu_aberto`, `login` após entrar, `sessao_expirou` no logout por inatividade.
- [ ] **Step 4:** `npm test` PASS e `npm run build` sem erros.
- [ ] **Step 5:** Commit `feat: layout com menu lateral, login e instalação`.

---

### Task 16: Dashboard
**Modelo:** sonnet

**Files:**
- Create: `src/app/(sistema)/page.tsx`, `src/components/dashboard/{CardsResumo,SaldoContas,ListaAlertas,GraficoCategorias}.tsx`

**Interfaces:**
- Consumes: `resumoMes`, `saldoPorConta`, `saldoTotal`, `alertas`, `formatarBRL`.

- [ ] **Step 1:** Página server component; mês via `?mes=2026-10` (padrão: mês atual em SP); setas ‹ › trocam o mês.
- [ ] **Step 2:** Cards Entradas (verde), Saídas (vermelho), Resultado, Saldo atual (toque/clique expande `SaldoContas`).
- [ ] **Step 3:** `ListaAlertas`: vencidos em vermelho, próximos em âmbar; item leva a `/lancamentos/[id]`; estado vazio "Nenhuma conta para os próximos 7 dias".
- [ ] **Step 4:** `GraficoCategorias` (Recharts, client component; `rastrear('grafico_interagido', { grafico: 'entradas' | 'saidas' })` no primeiro hover/toque): barras horizontais, top 6 + "Outras"; estado vazio "Sem movimentações neste mês". Ler a skill `dataviz` antes de escrever o gráfico.
- [ ] **Step 5:** Verificar: `npm run build` OK; `npm run dev`, instalar, lançar 3 itens via serviço em script ou tela, conferir valores em 375 px e 1280 px de largura (screenshot no relatório da tarefa).
- [ ] **Step 6:** Commit `feat: dashboard financeiro`.

---

### Task 17: Telas de lançamentos e transferências
**Modelo:** sonnet

**Files:**
- Create: `src/app/(sistema)/lancamentos/page.tsx` (lista), `novo/page.tsx`, `[id]/page.tsx`, `[id]/editar/page.tsx`, `actions.ts`; `src/app/(sistema)/transferencias/[id]/page.tsx`; `src/components/{FormLancamento,FormTransferencia,CampoDinheiro,CampoData,SeletorMembro,UploadAnexos,AbaHistorico,FiltrosLancamentos}.tsx`

**Interfaces:**
- Consumes: serviços das Tasks 9–14.
- Produces: `<AbaHistorico entidade=… entidadeId=… />` (server component reutilizado na Task 18).

- [ ] **Step 1: Lista** — filtros (período, tipo, categoria, conta, status, membro, busca) refletidos na URL; cartões abaixo de `md`, tabela a partir de `md`; rodapé fixo com "Entradas R$ X · Saídas R$ Y" do filtro; paginação 20.
- [ ] **Step 2: Novo** — abas "Lançamento" e "Transferência". Lançamento: alternador grande Entrada/Saída (troca a lista de categorias); `CampoDinheiro` com `inputMode="decimal"`; categoria; conta; `SeletorMembro` aparece só se a categoria for nominal (busca com debounce 300 ms + "Cadastrar rápido" que abre mini-form nome/telefone); `CampoData` (input `date` nativo); Realizado/Previsto (padrão Realizado); descrição; `UploadAnexos` (`accept="image/*,application/pdf"`, `capture` não forçado para permitir galeria). Botões **Salvar** e **Salvar e lançar outro** (este mantém tipo, conta, categoria e data, limpa valor/membro/descrição/anexos e mostra "Lançamento salvo").
- [ ] **Step 3: Detalhe** — dados, anexos (abre URL assinada), botões conforme status e permissão: Editar, Dar baixa (pede data, padrão hoje), Cancelar (modal com motivo obrigatório). `<AbaHistorico>` no fim. Transferência tem detalhe equivalente (cancelar + histórico).
- [ ] **Step 4: Rastreio** — `lancamento_iniciado` ao abrir o form (guarda o instante); `lancamento_salvo` com `duracaoMs` e props `tipo, comAnexo, salvarELancarOutro, viaAtalho`; `lancamento_abandonado` ao sair com campos preenchidos sem salvar; `filtro_usado` com `{ filtros: 'periodo,categoria' }` (nomes, nunca valores); `erro_validacao` com `{ campo, regra }` mapeados do erro do serviço. `ErroApp` ganha campos opcionais `campo` e `regra` (atualizar Task 3/10 se já implementadas, com teste).
- [ ] **Step 4b:** Server Actions capturam `ErroApp` e devolvem `{ erro: string }`; erros inesperados → "Algo deu errado, tente novamente" + `console.error`.
- [ ] **Step 5:** Verificar com `npm run build` e manualmente no `dev` em 375 px: criar dízimo para membro, criar previsto, dar baixa, cancelar, ver histórico.
- [ ] **Step 6:** Commit `feat: telas de lançamentos e transferências`.

---

### Task 18: Telas de membros e configurações
**Modelo:** haiku

**Files:**
- Create: `src/app/(sistema)/membros/{page,novo/page,[id]/page}.tsx`, `src/app/(sistema)/configuracoes/{contas,categorias,usuarios,igreja}/…` (lista + form + detalhe com `<AbaHistorico>`), `actions.ts` por pasta; `src/lib/services/configuracao.ts` com `obterConfiguracao()` e `atualizarConfiguracao(ator, { nomeIgreja; logoUrl?; cnpj? })` (`admin`, com log) + teste em `tests/integration/configuracao.test.ts`.

- [ ] **Step 1:** Teste de `atualizarConfiguracao` (Tesoureiro → `NaoAutorizado`; Admin altera nome → log `ALTEROU`). FAIL → implementar → PASS.
- [ ] **Step 2:** Telas seguindo o padrão da Task 17 (cartões no celular, tabela no PC). Usuários: caixas de seleção dos 5 papéis com rótulos "Administrador, Pastor, Tesoureiro, Responsável por Eventos, Responsável pelo Patrimônio"; botões ativar/inativar e redefinir senha. Categorias: tipo só editável na criação. Itens inativos aparecem acinzentados com filtro "mostrar inativos". Em Dados da igreja: interruptor "Coletar métricas de uso" com o texto explicativo de `docs/metricas.md` (resumo) — `atualizarConfiguracao` aceita `metricasAtivas` e loga a mudança.
- [ ] **Step 3:** `npm run build` OK; teste manual em 375 px.
- [ ] **Step 4:** Commit `feat: telas de membros e configurações`.

---

### Task 19: E2E, README de instalação e verificação final
**Modelo:** sonnet

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/{login,lancamento-celular,dar-baixa,inatividade}.spec.ts`, `tests/e2e/preparar.ts`
- Modify: `README.md`

- [ ] **Step 1:** `preparar.ts`: reseta o banco de teste, roda `instalar` com admin `admin@teste.local` e cria um Tesoureiro `tesoureiro@teste.local` e um lançamento PREVISTO. Playwright sobe `npm run build && npm start` com `DATABASE_URL_TEST`.
- [ ] **Step 2: Testes E2E**
  - `login`: credencial errada mostra "E-mail ou senha inválidos"; certa leva ao dashboard.
  - `lancamento-celular` (viewport 375×812): abre ☰, vai em Lançamentos → ➕, cria Entrada "Dízimo" de "1.234,56" para um membro, volta ao Início e vê `R$ 1.234,56` em Entradas.
  - `dar-baixa`: abre o previsto, dá baixa, status vira Realizado e o histórico mostra "Deu baixa".
  - `inatividade` (com `page.clock` do Playwright): após login, avançar 14 min → aparece o aviso; clicar Continuar → aviso some; avançar 15 min sem interação → volta ao login com "Sua sessão expirou por inatividade".
- [ ] **Step 3:** `npm run test:e2e` → 4 PASS.
- [ ] **Step 4:** README em pt-BR: o que é; rodar localmente (Docker + `npm run db:migrate` + `npm run dev`); **instalar para uma nova igreja** (criar projeto no Neon, bucket R2 com chave, deploy na Vercel com as variáveis do `.env.example`, abrir o site → tela de Instalação); **backup manual** com `pg_dump "$DATABASE_URL" > backup-AAAA-MM-DD.sql` e restauração com `psql`.
- [ ] **Step 5:** Verificação final: `npm test`, `npm run test:e2e`, `npm run build`, `npx tsc --noEmit`, `npm run lint` — todos verdes; colar a saída resumida no relatório.
- [ ] **Step 6:** Commit `test: fluxos E2E e documentação de instalação`.

---

## Cobertura da spec

| Spec | Tasks |
|---|---|
| §2 Stack e hospedagem | 1, 13, 19 |
| §3 Modelo de dados e seed | 2, 3 |
| §3 Regras (cancelar, saldo calculado, Decimal, coerência, inativos) | 10, 11, 12 |
| §4 Permissões e último Admin | 4, 6, 8 |
| §5 Navegação e telas | 15–18 |
| §5 Anexos | 13, 17 |
| §6 Histórico | 5, 14, 17, 18 |
| §7 Erros, segurança, backup | 3, 6, 7, 17, 19 |
| §6A Métricas de uso | 2, 14A, 15–18 |
| §8 Testes | todas; E2E na 19 |
