# Fase 2 — Relatórios, recibos, prestação de contas e calculadora · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar calculadora de cédulas, recibos em PDF, os quatro relatórios (tela/PDF/CSV), prestação de contas pública versionada, indicadores e as melhorias herdadas da Fase 1.

**Architecture:** Mesmo padrão da Fase 1 — regras em `src/lib/services/*` (auth → permissão → Zod → transação + `registrarLog`), telas e rotas só chamam serviços. PDFs gerados no servidor por `@react-pdf/renderer` em rotas GET autenticadas; página pública fora de `(sistema)`, acessada por token.

**Tech Stack:** Next.js 16 (App Router, `proxy.ts`, cacheComponents), TypeScript, Prisma 7 + migrações SQL manuais (CI com `prisma migrate diff`), Zod, `@react-pdf/renderer@4.9.0`, Recharts, Vitest (Postgres real), Playwright (Chrome do sistema via `PW_CHROME_PATH`).

**Spec:** `docs/superpowers/specs/2026-10-27-fase2-relatorios-design.md` (e a da Fase 1 para tudo que não mudou).

**Modelo por tarefa:** campo `Modelo:` em cada tarefa; revisor de tarefa `sonnet`; revisão final `opus`.

## Global Constraints

- Tudo da Fase 1 continua valendo: pt-BR, `R$ 1.234,56`, `dd/mm/aaaa`, fuso `America/Sao_Paulo`, Decimal nunca `number` em dinheiro, nada apagado fisicamente, log na mesma transação, R16 (toda página e Server Action obtém o ator e redireciona/recusa), Decimal/Date nunca atravessam para componentes cliente.
- Nomes de membros só aparecem para quem tem `membros.ver_nomes` e **nunca** na prestação pública, nos relatórios Geral/Arrecadação/Despesas, nos indicadores ou nas métricas.
- Relatórios e indicadores consideram só `REALIZADO` (exceto "incluir previstos" no Geral); cancelados nunca; transferências nunca em totais.
- Recibo só para lançamento REALIZADO de categoria nominal; número `AAAA/NNNNNN` sequencial por ano, fixo por lançamento.
- Prestação pública é snapshot imutável; token de 32 bytes aleatórios base64url; versões por mês; despublicar não apaga.
- CSV: separador `;`, decimal com vírgula, datas `dd/mm/aaaa`, UTF-8 com BOM, cabeçalho em pt-BR.
- Denominações da calculadora (centavos): 20000, 10000, 5000, 2000, 1000, 500, 200 (cédulas); 100, 50, 25, 10, 5, 1 (moedas).
- Novas ações de log: `EMITIU_RECIBO`, `PUBLICOU`, `DESPUBLICOU`, `REGISTROU_CONTAGEM`; novas entidades `Contagem`, `PrestacaoContas`.
- Novos eventos de métrica: `relatorio_gerado {relatorio, formato}`, `recibo_emitido {compartilhado}`, `prestacao_publicada {versao}`, `contagem_registrada {modo, divergente}`, `indicadores_aberto`.
- Migrações: SQL manual em `prisma/migrations/<timestamp>_<nome>/migration.sql`, idêntico ao que o Prisma geraria.
- Commits em pt-BR `tipo: descrição` com os trailers da sessão.

## Review Focus

1. **Vazamento de nome na página pública** — qualquer campo do snapshot que traga membro, descrição de entrada ou conta individual. → teste na Task 6 (busca no JSON e no HTML pelo nome de um membro criado no teste).
2. **Sequência de recibos sob concorrência** — dois "Gerar recibo" simultâneos para lançamentos diferentes não podem gerar o mesmo número, nem buracos; o mesmo lançamento duas vezes devolve o mesmo número. → teste na Task 4.
3. **Fronteira de mês/fuso em relatórios e indicadores** — lançamento realizado em 31/10 entra em outubro com `TZ=UTC`; mês sem lançamentos aparece com zero, não some. → testes nas Tasks 5 e 7.
4. **CSV abrindo certo no Excel BR** — acentos (BOM), `;` e vírgula decimal; descrição com `;`, aspas ou quebra de linha não quebra colunas; célula começando com `=`, `+`, `-`, `@` neutralizada (injeção de fórmula). → teste na Task 2.
5. **Link público após despublicar ou republicar** — versão antiga mostra aviso com link para a nova; despublicada mostra "retirada"; token inexistente dá 404 sem revelar nada. → teste na Task 6 e E2E na Task 14.

---

### Task 1: Banco, catálogos e prova do PDF
**Modelo:** sonnet

**Files:** `prisma/schema.prisma`, migração `20261027000000_fase2`, `prisma/seed.ts`, `src/lib/log.ts`, `src/lib/services/historico.ts` (rótulos), `src/lib/metricas/catalogo.ts`, `src/lib/pdf/prova.tsx` + `src/app/api/pdf/prova/route.ts` (temporários), `next.config.ts` se necessário. Testes: `tests/integration/schema-fase2.test.ts`, ajustes em testes de catálogo/seed.

**Interfaces — Produces:**
- Modelos/campos da spec §8: `ContagemCaixa` (enum `ModoContagem {CULTO CAIXA}`), `ContagemItem` (PK `[contagemId, denominacaoCentavos]`), `Recibo` (`lancamentoId @unique`, `@@unique([ano, numero])`), `SequenciaRecibo (ano Int @id, ultimo Int)`, `PrestacaoContas` (`token @unique`, `@@unique([ano, mes, versao])`, `dados Json`, `visualizacoes Int @default(0)`), `Categoria.detalharPublico Boolean @default(false)`, `Usuario.versaoSessao Int @default(0)`, `Configuracao.cidade String?`, `Anexo.url @unique`.
- A migração faz `UPDATE "Categoria" SET "detalharPublico" = true WHERE tipo='SAIDA' AND nome IN (…7 nomes do seed…)`; o seed passa a criar essas saídas com `detalharPublico: true`.
- `Acao` += `EMITIU_RECIBO | PUBLICOU | DESPUBLICOU | REGISTROU_CONTAGEM`; `Entidade` += `Contagem | PrestacaoContas`; `ROTULO_ACAO` += "Emitiu recibo", "Publicou", "Despublicou", "Registrou contagem".
- Catálogo de métricas += os 5 eventos com chaves da Global Constraints.
- **Prova do PDF:** instalar `@react-pdf/renderer@4.9.0` (fixo), rota GET `/api/pdf/prova` (exige sessão) que devolve `application/pdf` com "Olá" — `npm run build` e uma chamada real no dev provam compatibilidade com Next 16/React 19 (ajustar `serverExternalPackages` se a doc do Next pedir). Depois de provado, **remover** a rota e o arquivo de prova no mesmo commit final da tarefa, deixando um helper `src/lib/pdf/renderizar.ts` com `renderizarPdf(elemento: React.ReactElement): Promise<Buffer>` e um teste unitário que gera um PDF mínimo e confere o cabeçalho `%PDF`.

- [ ] Steps: teste de schema (cria uma linha em cada tabela nova; unique de recibo e de prestação) → FAIL → schema + SQL + seed → PASS; teste de `renderizarPdf` → FAIL → implementar → PASS; `npm test`, `tsc`, `build`. Commit `feat: estruturas da Fase 2 e geração de PDF`.

---

### Task 2: Extenso e CSV
**Modelo:** haiku

**Files:** `src/lib/extenso.ts`, `src/lib/csv.ts`; testes `tests/unit/extenso.test.ts`, `tests/unit/csv.test.ts`.

**Interfaces — Produces:**
- `valorPorExtenso(valor: Prisma.Decimal | string): string`
- `gerarCsv(colunas: { titulo: string; valor: (linha: T) => string | Prisma.Decimal | Date | null }[], linhas: T[]): string` — BOM + `;` + CRLF; Decimal → `1234,56` (sem separador de milhar); Date → `dd/mm/aaaa`; aspas quando houver `;`, `"`, CR/LF; células iniciando com `=`, `+`, `-`, `@`, tab ou CR recebem `'` na frente **exceto** valores numéricos gerados a partir de Decimal (negativos legítimos como `-120,00`).

- [ ] **Testes:** 1 → "um real"; 0,01 → "um centavo"; 2 → "dois reais"; 150 → "cento e cinquenta reais"; 100 → "cem reais"; 1001,05 → "mil e um reais e cinco centavos"; 2050,10 → "dois mil e cinquenta reais e dez centavos"; 1000000 → "um milhão de reais"; 2500000,50 → "dois milhões e quinhentos mil reais e cinquenta centavos"; 9999999999,99 aceito. CSV: BOM presente; `Ação; "x"` vira `"Ação; ""x"""`; `=SOMA(A1)` vira `'=SOMA(A1)`; Decimal -120 vira `-120,00` sem apóstrofo; data 31/10/2026.
- [ ] TDD; commit `feat: valor por extenso e gerador de CSV`.

---

### Task 3: Serviço de contagens
**Modelo:** opus

**Files:** `src/lib/services/contagens.ts`; `tests/integration/contagens.test.ts`.

**Interfaces — Consumes:** `saldoPorConta` (resumo.ts), `exigir`, `registrarLog`, `rastrearServidor`. **Produces:**
- `DENOMINACOES: readonly { centavos: number; rotulo: string; tipo: 'cedula' | 'moeda' }[]`
- `calcularTotal(itens: { denominacaoCentavos: number; quantidade: number }[]): Prisma.Decimal` (puro; quantidades inteiras 0–100000, denominação fora da lista → Validacao)
- `valorEsperado(ator, { modo, contaId, data?: string }): Promise<Prisma.Decimal>` — CULTO: Σ ENTRADA REALIZADO da conta com `dataRealizacao = data`; CAIXA: saldo atual da conta.
- `registrarContagem(ator, { modo, contaId, data?: string, itens, observacao?: string })` — `financeiro.lancar`; calcula total e esperado **dentro da transação**; diferença = contado − esperado; diferença ≠ 0 exige observação (`Validacao` campo 'observacao', regra 'obrigatorio_divergencia'); conta ativa; data não futura; log `REGISTROU_CONTAGEM` (entidade `Contagem`, valorNovo "Contado R$ X · Esperado R$ Y · Diferença R$ Z"); métrica `contagem_registrada {modo, divergente}`.
- `listarContagens(ator, { contaId?, de?, ate?, pagina? })`, `obterContagem(ator, id)` (com itens e nome da conta e de quem contou) — `financeiro.ver`.

- [ ] **Testes:** esperado CULTO soma só entradas realizadas do dia/conta (ignora saídas, previstos, cancelados, outra conta, outro dia); esperado CAIXA = saldoPorConta; contagem que bate dispensa observação; divergente sem observação → Validacao; Pastor → NaoAutorizado; esperado gravado não muda após novo lançamento; quantidade negativa/fracionária → Validacao.
- [ ] TDD; commit `feat: calculadora de cédulas com conferência de culto e de caixa`.

---

### Task 4: Serviço de recibos
**Modelo:** opus

**Files:** `src/lib/services/recibos.ts`; `tests/integration/recibos.test.ts`.

**Interfaces — Produces:**
- `emitirRecibo(ator, lancamentoId): Promise<DadosRecibo>` — exige `financeiro.lancar` e `membros.ver_nomes`; lançamento REALIZADO e categoria nominal (senão `RegraDeNegocio('Recibo disponível apenas para contribuições nominais realizadas')`); se já existe Recibo, devolve o existente (sem novo número, mas registra novo log `EMITIU_RECIBO` com valorNovo "Reemissão"); senão, em transação com `pg_advisory_xact_lock(4244)`: upsert `SequenciaRecibo` do ano da `dataRealizacao`, `ultimo + 1`, cria Recibo com `codigoVerificacao` = 8 primeiros hex de SHA-256(`${ano}/${numero}:${lancamentoId}`), log `EMITIU_RECIBO`.
- `type DadosRecibo = { numeroFormatado: string; codigoVerificacao: string; igreja: { nome; cnpj: string | null; logoUrl: string | null; cidade: string | null }; membro: string; valor: string /*R$*/; valorExtenso: string; categoria: string; dataRealizacao: string /*dd/mm/aaaa*/; dataPorExtenso: string /*"27 de outubro de 2026"*/; emitidoPor: string; cancelado: boolean }`
- `dadosRecibo(ator, lancamentoId): Promise<DadosRecibo>` — leitura do recibo já emitido (NaoEncontrado se não houver), `cancelado` reflete o status atual.

- [ ] **Testes:** primeiro recibo do ano = `2026/000001`; segundo = `000002`; ano novo reinicia; mesmo lançamento duas vezes → mesmo número e 2 logs; **Review Focus 2:** `Promise.all` de 10 emissões em 10 lançamentos → números 1..10 sem repetição; não nominal → RegraDeNegocio; previsto → RegraDeNegocio; usuário sem `membros.ver_nomes` → NaoAutorizado; cancelar depois → `cancelado: true`; extenso correto.
- [ ] TDD; commit `feat: emissão de recibos com numeração anual`.

---

### Task 5: Serviço de relatórios
**Modelo:** sonnet

**Files:** `src/lib/services/relatorios.ts`; `tests/integration/relatorios.test.ts`.

**Interfaces — Produces** (todas recebem `filtros: { de: string; ate: string; contaId?: string; categoriaId?: string }`, validados com Zod; `de ≤ ate`, intervalo ≤ 366 dias):
- `relatorioGeral(ator, filtros & { incluirPrevistos?: boolean })` → `{ linhas: { data; tipo; categoria; conta; descricao; valor: Decimal; previsto: boolean }[]; totalEntradas; totalSaidas; resultado }` (`financeiro.ver`; sem membro)
- `relatorioArrecadacao(ator, filtros)` → `{ categorias: { categoria; total; percentual: Decimal /*2 casas*/; quantidade }[]; total }`
- `relatorioDespesas(ator, filtros)` → `{ grupos: { categoria; itens: { data; descricao; conta; valor }[]; subtotal }[]; total }`
- `relatorioContribuicoes(ator, filtros & { membroId?: string })` → com membro: `{ membro; itens: { data; categoria; valor }[]; total }`; sem: `{ porMembro: { membroId; membro; quantidade; total }[]; total }` (`membros.ver_nomes`; só categorias nominais)
- `csvDe(relatorio: 'geral'|'arrecadacao'|'despesas'|'contribuicoes', dados): string` usando `gerarCsv`.

- [ ] **Testes:** totais do Geral = `resumoMes` no mesmo mês; cancelados/transferências fora; previstos só com a flag; **Review Focus 3:** 31/10 em outubro com `TZ=UTC`; arrecadação soma 100%; despesas agrupadas e subtotal; contribuições sem permissão → NaoAutorizado; nome de membro **não** aparece no Geral/Despesas (busca no objeto serializado); CSV do Geral tem cabeçalho e N+1 linhas.
- [ ] TDD; commit `feat: relatórios geral, arrecadação, despesas e contribuições`.

---

### Task 6: Serviço de prestação de contas
**Modelo:** opus

**Files:** `src/lib/services/prestacao.ts`, `src/lib/prestacao/snapshot.ts` (puro); `tests/unit/snapshot.test.ts`, `tests/integration/prestacao.test.ts`.

**Interfaces — Produces:**
- `type SnapshotPrestacao = { versaoSchema: 1; igreja: { nome; logoUrl: string | null }; ano; mes; resumo: { entradas: string; saidas: string; resultado: string; saldoFimMes: string }; entradas: { categoria; total: string }[]; saidas: { categoria; total: string; itens?: { data: string; descricao: string; valor: string }[] }[] }` — todos os valores já formatados `R$`.
- `montarSnapshot(entrada: {…dados agregados…}): SnapshotPrestacao` (puro; inclui `itens` só para categorias com `detalharPublico`; descrição vazia vira "—").
- `saldoTotalEm(data: Date): Promise<Decimal>` (interno; saldo de todas as contas ativas no fim do dia em SP).
- `previaPrestacao(ator, ano, mes)` (`financeiro.ver`) → snapshot sem gravar.
- `publicarPrestacao(ator, ano, mes)` (`financeiro.lancar`) → grava versão N+1 com token `randomBytes(32).toString('base64url')`, log `PUBLICOU`, métrica `prestacao_publicada {versao}`; mês futuro → RegraDeNegocio.
- `despublicarPrestacao(ator, id, motivo)` → `despublicada = true`, log `DESPUBLICOU`.
- `listarPrestacoes(ator, { ano? })` → versões com token, publicada por, visualizações.
- `abrirPrestacaoPublica(token): Promise<{ estado: 'ok' | 'despublicada' | 'inexistente'; snapshot?; versao?; publicadaEm?: string; versaoMaisRecente?: { versao; token } }>` — **sem ator**; incrementa `visualizacoes` só no estado 'ok' (update atômico `increment`); token com formato inválido → 'inexistente' sem consultar.

- [ ] **Testes:** snapshot puro com/sem detalhes; **Review Focus 1:** criar membro "Zélia Nominal" com dízimo, publicar, `JSON.stringify(snapshot)` não contém "Zélia" nem descrições de entradas; snapshot não muda após editar lançamento; republicar → v2, abrir token v1 traz `versaoMaisRecente` v2; despublicada → estado 'despublicada', sem incrementar; token aleatório → 'inexistente'; Pastor publica → NaoAutorizado; visualizações incrementam.
- [ ] TDD; commit `feat: prestação de contas pública versionada`.

---

### Task 7: Serviço de indicadores
**Modelo:** sonnet

**Files:** `src/lib/services/indicadores.ts`; `tests/integration/indicadores.test.ts`.

**Interfaces — Produces:** `indicadores(ator, hoje = hojeSP())` (`financeiro.ver`) → `{ meses: { ano; mes; rotulo /*"out/26"*/; entradas: Decimal; saidas: Decimal; resultado: Decimal; saldoFim: Decimal; contribuintes: number }[] /*13 itens, do mais antigo ao atual*/; porCategoria: { categoria; valores: Decimal[] /*13*/ }[] /*top 5 + "Outras" das entradas*/; comparativos: { entradas: { atual; mesmoMesAnoAnterior; media12; varAnoAnterior: Decimal | null; varMedia: Decimal | null }; saidas: {…} } }` — poucas consultas agregadas (groupBy por mês via `date_trunc` em SQL), não 13×N.

- [ ] **Testes:** 13 meses mesmo sem dados (zeros); **Review Focus 3** fronteira 31/10 com `TZ=UTC`; contribuintes conta membros distintos (2 dízimos do mesmo membro = 1); variação null quando base zero; top 5 + Outras; nenhum nome no objeto.
- [ ] TDD; commit `feat: indicadores dos últimos 12 meses`.

---

### Task 8: Melhorias herdadas da Fase 1
**Modelo:** sonnet

**Files:** `historico.ts`, `lancamentos.ts`, `auth.ts`/`sessao-token.ts`, `usuarios.ts`, `anexos.ts` (+ testes existentes).

- [ ] **Histórico legível:** `historicoDe` traduz valores de enum conhecidos (StatusLancamento, TipoMovimento, TipoConta, StatusTransferencia, Papel nas listas de papéis) para rótulos pt-BR; para `CANCELOU` devolve `campo: 'Motivo'`, `de: null`, `para: motivo` em vez de "Status: REALIZADO → motivo". Testes.
- [ ] **Data futura:** `dataRealizacao > hojeSP()` em criar/editar/darBaixa → Validacao('A data de realização não pode ser futura', campo 'dataRealizacao', regra 'futura'). Testes (incluindo hoje permitido).
- [ ] **Invalidar sessões:** token passa a carregar `v` = `Usuario.versaoSessao`; `carregarUsuario` compara e devolve null se diferente; `redefinirSenha`, `definirAtivo(false)` e `atualizarUsuario` com mudança de papéis incrementam `versaoSessao` na mesma transação; `renovarSessao` reemite com a versão atual. Tokens antigos sem `v` = versão 0. Testes: token anterior à redefinição de senha → null.
- [ ] **Anexo:** `confirmarAnexo` trata violação de unique em `url` como "já anexado" (sem remover objeto) e confere `inspecionar` de novo imediatamente antes do insert (tamanho/mime iguais aos lidos). Teste de duas confirmações concorrentes → 1 Anexo.
- [ ] Commit(s) `fix: …` por item.

---

### Task 9: Documentos PDF e rotas de download
**Modelo:** sonnet

**Files:** `src/lib/pdf/{estilos.ts, Recibo.tsx, Relatorio.tsx, Prestacao.tsx}`, rotas `src/app/api/pdf/recibo/[lancamentoId]/route.ts`, `src/app/api/pdf/relatorio/[tipo]/route.ts`, `src/app/api/csv/relatorio/[tipo]/route.ts`, `src/app/api/pdf/prestacao/[token]/route.ts`; testes `tests/integration/rotas-pdf.test.ts` (chamando os handlers com Request fabricado e cookie de sessão válido).

- [ ] Recibo A5 conforme spec §3 (marca "CANCELADO" diagonal quando `cancelado`), relatório A4 com cabeçalho/paginação (`Página X de Y`) e tabelas, prestação A4 igual à página pública.
- [ ] Rotas: autenticam via cookie (`obterUsuarioAtual`), chamam o serviço, devolvem `Content-Type` correto e `Content-Disposition: attachment; filename="recibo-2026-000123.pdf"` / `relatorio-geral-2026-10.pdf` / `.csv`; erro de permissão → 403 com texto; inexistente → 404; a rota da prestação é pública por token (estado 'ok' apenas) e **não** incrementa visualizações. Recibo: rota chama `emitirRecibo` (que é idempotente). Métrica `relatorio_gerado {relatorio, formato}` registrada no servidor.
- [ ] Testes: cada rota devolve `%PDF`/BOM com status 200; sem sessão → 401; sem permissão → 403; prestação despublicada → 404.
- [ ] Commit `feat: PDFs de recibo, relatórios e prestação`.

---

### Task 10: Tela da calculadora
**Modelo:** sonnet

**Files:** `src/app/(sistema)/calculadora/{page.tsx, nova/page.tsx, [id]/page.tsx, actions.ts}`, `src/components/calculadora/*`, `src/lib/menu.ts` (item "Calculadora" para `financeiro.lancar`; histórico visível a `financeiro.ver`); teste unitário da lógica de total no cliente (reaproveitar `DENOMINACOES` e um `calcularTotalCentavos` puro em `src/lib/calculadora.ts` que não importa Prisma).

- [ ] Nova contagem: seletor de modo (Conferir culto / Conferir caixa), conta, data (só no culto); lista de denominações com campo numérico grande (`inputMode="numeric"`), botões − / +, subtotal; rodapé fixo com Contado / Esperado / Diferença (verde/vermelho, "Faltam R$ X"/"Sobram R$ X"); esperado vem de Server Action ao trocar modo/conta/data; observação obrigatória quando divergente; Registrar.
- [ ] Histórico (lista) e detalhe (quantidades, quem contou, diferença) com `<AbaHistorico entidade="Contagem">`; no detalhe divergente, botão "Lançar ajuste" → `/lancamentos/novo?tipo=…&conta=…&data=…&valor=…&descricao=…` (o formulário de lançamento passa a aceitar esses parâmetros de pré-preenchimento, validados).
- [ ] Capturas 375px (contagem divergente) e 1280px (histórico). Commit `feat: tela da calculadora de cédulas`.

---

### Task 11: Telas de relatórios e recibo
**Modelo:** sonnet

**Files:** `src/app/(sistema)/relatorios/{page.tsx, layout.tsx (abas), geral/, arrecadacao/, despesas/, contribuicoes/}`, `src/components/relatorios/*`, botão de recibo em `src/app/(sistema)/lancamentos/[id]` e no aviso pós-salvar do formulário, `src/components/BotaoRecibo.tsx`, `src/lib/menu.ts` (item "Relatórios" para `financeiro.ver`).

- [ ] Abas com filtros na URL (período padrão mês atual, conta, categoria; contribuições: seletor de membro com busca ou "todos"), tabela em tela (cartões no celular), botões "Baixar PDF" e "Baixar CSV" apontando para as rotas da Task 9; aba Contribuições só aparece com `membros.ver_nomes`.
- [ ] `BotaoRecibo`: visível só em lançamento REALIZADO nominal e com as duas permissões; ao tocar busca o PDF (`fetch` da rota), e se `navigator.canShare({ files })` usa `navigator.share({ files: [pdf], title })`, senão baixa; registra `recibo_emitido {compartilhado}`. Também oferecido no aviso "Lançamento salvo" quando aplicável.
- [ ] Capturas 375px (relatório de despesas e botão de recibo no detalhe). Commit `feat: telas de relatórios e recibo`.

---

### Task 12: Prestação de contas — telas e página pública
**Modelo:** sonnet

**Files:** `src/app/(sistema)/relatorios/prestacao/{page.tsx, [ano]/[mes]/page.tsx, actions.ts}`, `src/app/(publico)/p/[token]/page.tsx`, `src/components/prestacao/VisaoPrestacao.tsx` (compartilhado prévia/pública), `src/proxy.ts` (liberar `/p/` e `/api/pdf/prestacao/`), categorias: campo `detalharPublico` no formulário (só para saídas) + `atualizarCategoria`/`criarCategoria` aceitando o campo com log "Detalhar na prestação pública"; Dados da igreja: campo "Cidade (usada no recibo)" + `atualizarConfiguracao` aceitando `cidade` (≤ 80 chars, log), com teste.

- [ ] Lista de meses com versões (publicada por, data, visualizações, estado), prévia com `VisaoPrestacao`, botão Publicar (confirmação), copiar link e "Compartilhar" (Web Share com URL), Despublicar (motivo).
- [ ] Página pública: `metadata.robots = { index: false, follow: false }`, sem menu, layout próprio claro e legível no celular, faixa de versão mais recente / retirada, botão "Baixar PDF"; 404 para inexistente.
- [ ] Capturas 375px da página pública e da tela de publicação. Commit `feat: publicação da prestação de contas`.

---

### Task 13: Tela de indicadores
**Modelo:** sonnet

**Files:** `src/app/(sistema)/indicadores/page.tsx`, `src/components/indicadores/*`, `src/lib/menu.ts` (item "Indicadores" para `financeiro.ver`). Ler a skill `dataviz` antes.

- [ ] Quatro blocos da spec §6 (barras agrupadas + linha de resultado; linha de saldo; barras empilhadas top 5 + Outras; cartões comparativos com setas e %; contribuintes por mês) com tabelas `sr-only`; Decimal convertido no servidor (números só para geometria); `indicadores_aberto` ao abrir.
- [ ] Capturas 375px e 1280px. Commit `feat: tela de indicadores`.

---

### Task 14: E2E, README e verificação
**Modelo:** sonnet

**Files:** `tests/e2e/{calculadora,recibo,prestacao}.spec.ts`, `tests/e2e/semear.ts` (dados extras), `README.md`, `docs/metricas.md` (novos eventos).

- [ ] E2E: (1) celular 375px, contar culto com divergência, observação exigida, registrar, ver no histórico; (2) dízimo realizado → "Gerar recibo" baixa PDF (`download` event, nome `recibo-AAAA-NNNNNN.pdf`); (3) publicar prestação, abrir `/p/<token>` em contexto sem cookie, ver totais e **não** ver o nome do membro semeado; republicar e ver a faixa de versão nova no link antigo.
- [ ] README: novas telas, a cidade em Dados da igreja, o que vai na prestação pública, CSV no Excel; `docs/metricas.md` com os novos eventos.
- [ ] Verificação final: `npm test`, `PW_CHROME_PATH=/opt/google/chrome/chrome npm run test:e2e`, `npm run build`, `npx tsc --noEmit`, `npm run lint`. Commit `test: E2E da Fase 2 e documentação`.

---

## Cobertura da spec

| Spec | Tasks |
|---|---|
| §2 Calculadora | 1, 3, 10, 14 |
| §3 Recibo | 1, 2, 4, 9, 11, 14 |
| §4 Relatórios | 2, 5, 9, 11 |
| §5 Prestação pública | 1, 6, 9, 12, 14 |
| §6 Indicadores | 7, 13 |
| §7 Melhorias da Fase 1 | 1, 8 |
| §8 Modelo de dados | 1 |
| §9 Arquitetura / métricas | 1, 9, 10–13 |
| §11 Testes | todas |
