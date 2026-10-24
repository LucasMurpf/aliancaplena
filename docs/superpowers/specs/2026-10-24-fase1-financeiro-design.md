# Fase 1 — Base + Financeiro Básico · Design

**Projeto:** Sistema de Gestão Financeira e Administrativa para Igrejas
**Primeira instalação:** Igreja Evangélica Aliança Plena (Colombo/PR)
**Data:** 2026-10-24
**Status:** aguardando revisão do Lucas

---

## 1. Objetivo e contexto

Sistema web, responsivo (celular e computador), para a liderança e a tesouraria da igreja controlarem o financeiro com simplicidade, confiabilidade e transparência.

- **Distribuição:** cada igreja tem **sua própria instalação** (um deploy + um banco por igreja). Não é SaaS multi-igreja; não há isolamento de dados entre igrejas no código.
- **Custo:** a instalação deve rodar em planos gratuitos no uso típico de uma igreja.
- **Público:** liderança e tesouraria, sem perfil técnico. Membros comuns **não** têm login (a prestação de contas para eles vem na Fase 2, por link/PDF).

### Critério de sucesso da Fase 1
1. Um Admin instala o sistema do zero (nome da igreja, logo, primeiro usuário) sem mexer em código.
2. O tesoureiro lança entradas e saídas pelo celular, com anexo, em poucos toques — inclusive vários dízimos seguidos após o culto.
3. O pastor vê saldo por conta, resumo do mês, gráficos por categoria e alertas de vencimento com dados reais.
4. Toda alteração fica registrada no histórico (estilo GLPI) e ninguém consegue apagá-la.

### Fora do escopo da Fase 1
Relatórios e recibos em PDF, prestação de contas pública, indicadores para a liderança e calculadora de cédulas (Fase 2); conciliação bancária e tela geral de logs (Fase 3); eventos (Fase 4); patrimônio (Fase 5); módulo de EBD — Escola Bíblica Dominical, com ofertas integradas ao financeiro (Fase 6); envio de métricas consolidadas para um painel central entre igrejas; recorrência automática de lançamentos; login de membros; perfis de permissão personalizados.

---

## 2. Stack e hospedagem

| Camada | Escolha | Motivo |
|---|---|---|
| App (front + back) | **Next.js + TypeScript** (App Router, Server Actions) | Um projeto, um deploy, uma linguagem |
| Estilo | Tailwind CSS | Responsivo, mobile-first |
| ORM | Prisma | Migrações versionadas, tipos gerados |
| Banco | **PostgreSQL no Neon** (plano Free) | Não pausa por inatividade; desliga e religa sozinho |
| Validação | Zod | Mesma validação no formulário e no servidor |
| Autenticação | Própria: e-mail + senha (hash bcrypt/argon2), sessão em cookie httpOnly | Sem dependência externa; só o Admin cria usuários |
| Anexos | Armazenamento de arquivos compatível com S3 (provedor definido no plano), atrás de `lib/storage.ts` | Não consumir os 0,5 GB do banco |
| Gráficos | Biblioteca leve de gráficos React (definida no plano) | — |
| Testes | Vitest (unit + integração com Postgres real) e Playwright (E2E) | TDD |

**Hospedagem do app:** o código não depende de recursos exclusivos de um provedor. A escolha final (Vercel ou alternativa sem restrição de uso não comercial) é feita no plano de implementação.

**Instalação de uma nova igreja:** criar banco no Neon, criar bucket de anexos, preencher `.env` (ver `.env.example`), fazer deploy, abrir o site e seguir a tela de Instalação.

---

## 3. Modelo de dados

### Tabelas

| Tabela | Campos principais | Observações |
|---|---|---|
| **Configuracao** | id, nomeIgreja, logoUrl?, cnpj?, criadoEm | Uma linha só, criada na Instalação |
| **Usuario** | id, nome, email (único), senhaHash, ativo, criadoEm, atualizadoEm | Sem coluna de papel |
| **UsuarioPapel** | usuarioId, papel | PK composta. Papel ∈ {ADMIN, PASTOR, TESOUREIRO, EVENTOS, PATRIMONIO} |
| **Membro** | id, nome, telefone?, dataNascimento?, ativo, criadoEm | Usado em lançamentos nominais |
| **Conta** | id, nome, tipo (CAIXA \| BANCO), saldoInicial, ativa | Ex.: Caixa tesouraria, Banco, Missões |
| **Categoria** | id, nome, tipo (ENTRADA \| SAIDA), nominal (bool), ativa | Nominal ⇒ lançamento exige membro |
| **Lancamento** | id, tipo (ENTRADA \| SAIDA), valor, descricao?, categoriaId, contaId, membroId?, status (PREVISTO \| REALIZADO \| CANCELADO), dataVencimento, dataRealizacao?, motivoCancelamento?, criadoPorId, atualizadoPorId?, criadoEm, atualizadoEm | Ver regras abaixo |
| **Transferencia** | id, contaOrigemId, contaDestinoId, valor, data, descricao?, status (ATIVA \| CANCELADA), motivoCancelamento?, criadoPorId, criadoEm | Não conta como entrada/saída |
| **Anexo** | id, lancamentoId, url (chave no storage), nomeArquivo, mimeType, tamanho, enviadoPorId, criadoEm | Arquivo fica fora do banco |
| **Log** | id, dataHora, usuarioId?, entidade, entidadeId, acao, campo?, valorAnterior?, valorNovo? | Somente inserção. Ver seção 6 |
| **EventoUso** | id, dataHora, usuarioId?, papeis, sessaoId?, dispositivo (CELULAR \| TABLET \| PC), evento, tela, duracaoMs?, propriedades (JSON) | Métricas de comportamento. Ver seção 6A |

E em **Configuracao**: `metricasAtivas` (bool, padrão `true`).

### Regras de modelagem
1. **Nada é apagado fisicamente.** Lançamentos e transferências são CANCELADOS (motivo obrigatório); cadastros (membro, conta, categoria, usuário) são INATIVADOS.
2. **Saldo é calculado, nunca armazenado:**
   `saldo(conta) = saldoInicial + Σ entradas REALIZADAS − Σ saídas REALIZADAS + Σ transferências ATIVAS recebidas − Σ transferências ATIVAS enviadas`.
3. **Valores monetários em `Decimal(12,2)`**, nunca `float`; sempre > 0 (o tipo define o sinal).
4. **Previsto vs. realizado:** `dataVencimento` é sempre preenchida; `dataRealizacao` é preenchida ao realizar ("dar baixa"). Um lançamento criado já como REALIZADO tem `dataRealizacao = dataVencimento` por padrão (editável).
5. **Coerência:** o tipo da categoria deve ser igual ao tipo do lançamento; categoria nominal exige `membroId`; categoria não nominal não aceita membro. Transferência exige contas diferentes.
6. Categorias, contas e membros inativos não aparecem para novos lançamentos, mas continuam visíveis no histórico.
7. Vínculos com eventos (Fase 4) e patrimônio (Fase 5) serão **colunas opcionais adicionadas por migração** quando chegar a hora. Nada é antecipado agora.

### Dados iniciais (seed)
- **Entradas:** Dízimo (nominal), Oferta, Missões, Doação, Rendimentos.
- **Saídas:** Água, Luz, Aluguel, Combustível, Materiais, Manutenção, Missões (repasse).
- Nenhuma conta é criada no seed; a Instalação pede ao menos uma (sugestão: "Caixa tesouraria").

---

## 4. Permissões

Papéis fixos no código. Um usuário pode ter **vários papéis**; suas permissões são a **união** das permissões dos papéis.

> Exemplo comum em igreja pequena: o secretário/tesoureiro recebe **Tesoureiro + Patrimônio**. Na Fase 1 ele usa o financeiro normalmente; quando a Fase 5 chegar, passa a gerenciar o patrimônio sem nenhuma mudança no cadastro dele.

| Permissão | Admin | Pastor | Tesoureiro | Eventos | Patrimônio |
|---|:-:|:-:|:-:|:-:|:-:|
| `financeiro.ver` (dashboard, lista, detalhe) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `financeiro.lancar` (criar, editar, dar baixa, cancelar, transferir, anexar) | ✅ | ❌ | ✅ | ❌ | ❌ |
| `membros.ver_nomes` (nome do membro nas contribuições) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `membros.gerenciar` | ✅ | ✅ | ✅ | ❌ | ❌ |
| `cadastros.gerenciar` (contas, categorias) | ✅ | ❌ | ✅ | ❌ | ❌ |
| `admin` (usuários, configurações da igreja) | ✅ | ❌ | ❌ | ❌ | ❌ |
| `historico.ver` (aba Histórico) | ✅ | ✅ | ✅ | ❌ | ❌ |

Regras:
1. **Checagem no servidor em toda ação** (`lib/services`), não apenas escondendo botões na tela.
2. Pastor só lê o financeiro; quem movimenta é a tesouraria.
3. Usuários só com Eventos e/ou Patrimônio veem apenas a tela "Módulo em breve" na Fase 1.
4. Só o Admin cria usuários e atribui papéis. Não existe auto-cadastro.
5. O sistema impede remover o último Admin ativo.
6. Cancelar exige motivo (texto não vazio).

---

## 5. Telas e navegação

### Navegação (pedido do tesoureiro: tudo por menu lateral)
- **Computador:** menu lateral sempre visível.
- **Celular:** o mesmo menu lateral abre pelo botão ☰ no topo (gaveta deslizante). Sem barra inferior.
- Botão flutuante **➕ Novo lançamento** (atalho de ação) para quem tem `financeiro.lancar`. Removível se o tesoureiro preferir.
- Menu mostra só o que o usuário pode acessar.
- Formatação pt-BR: `R$ 1.234,56`, datas `dd/mm/aaaa`, fuso America/Sao_Paulo.

### Telas
1. **Instalação** — só acessível quando não há nenhum usuário. Pede nome da igreja, logo (opcional), primeira conta e o primeiro Admin. Depois de concluída, a rota fica bloqueada.
2. **Login** — e-mail e senha. Mensagem genérica em erro ("e-mail ou senha inválidos").
3. **Início (dashboard)** — seletor de mês; cards de Entradas, Saídas e Resultado do mês (só REALIZADOS) e Saldo atual total (tocando abre saldo por conta); alertas de previstos **vencidos** e **vencendo nos próximos 7 dias**; gráfico de entradas por categoria e de saídas por categoria no mês.
4. **Novo lançamento** — alternador Entrada/Saída; valor (teclado numérico); categoria; conta; membro (aparece só se categoria nominal, com busca e "cadastrar rápido"); data (calendário); Realizado/Previsto; descrição; anexos (câmera/galeria no celular, PDF/imagem no computador). Botões **Salvar** e **Salvar e lançar outro** (mantém conta, categoria e data). Aba **Transferência** (conta origem, destino, valor, data, descrição).
5. **Lançamentos** — filtros: período, tipo, categoria, conta, status, membro; busca na descrição; total do filtro no rodapé; cartões no celular, tabela no computador; paginação.
6. **Detalhe do lançamento** — dados, anexos, ações (editar, dar baixa, cancelar com motivo) e aba **Histórico**.
7. **Membros** — lista com busca, cadastro, edição, inativação, aba Histórico.
8. **Configurações** — Contas, Categorias, Usuários (caixas de seleção de papéis, ativar/inativar, redefinir senha), Dados da igreja. Cada cadastro com aba Histórico.
9. **Módulo em breve** — para usuários sem acesso ao financeiro.

### Anexos
- Tipos aceitos: JPG, PNG, WEBP, HEIC e PDF. Tamanho máximo: 10 MB por arquivo.
- Download/visualização por URL temporária assinada (o bucket não é público).

---

## 6. Histórico (log estilo GLPI)

- **Gravação:** toda operação de escrita em `lib/services` registra o log **na mesma transação** do banco. Se a operação falhar, não há log; se o log falhar, a operação é desfeita.
- **Ações registradas:** CRIOU, ALTEROU (uma linha por campo alterado, com valor anterior e novo), DEU_BAIXA, CANCELOU (com motivo), INATIVOU, REATIVOU, ANEXOU, LOGIN, LOGIN_FALHOU, INSTALOU.
- **Imutável:** não existe rota, serviço ou tela que edite ou apague logs — nem para o Admin.
- **Exibição na Fase 1:** aba "Histórico" no detalhe de lançamento, transferência, membro, conta, categoria e usuário — colunas data/hora, usuário, ação, campo, "de" → "para". Valores exibidos de forma legível (nome da categoria em vez do id, R$ formatado).
- **Fase 3:** tela geral de logs com filtros por usuário, período, entidade e ação.

---

## 6A. Métricas de uso (comportamento)

Objetivo: entender como as pessoas usam o app para decidir o que melhorar, simplificar e priorizar. **Mede comportamento, nunca dinheiro nem pessoas contribuintes.**

- **Eventos da Fase 1:** `login`, `sessao_expirou`, `tela_aberta`, `menu_aberto`, `lancamento_iniciado`, `lancamento_salvo` (duracaoMs; props `tipo`, `comAnexo`, `salvarELancarOutro`, `viaAtalho`), `lancamento_abandonado`, `filtro_usado` (props: nomes dos filtros usados, nunca valores), `grafico_interagido`, `erro_validacao` (props `campo`, `regra`), `erro_inesperado`, e ações de negócio registradas pelos serviços (`baixa_dada`, `lancamento_cancelado`, `transferencia_criada`, `anexo_enviado`, `membro_cadastrado_rapido`).
- **Proibido gravar:** valores em R$, nomes de membros, descrições, textos digitados, ids na rota. `propriedades` só aceita chaves de uma **lista fechada por evento**; o resto é descartado no servidor.
- **Coleta não intrusiva:** o navegador envia em lote (a cada 10 s ou ao sair da página, via `sendBeacon`); falhas são ignoradas silenciosamente e nunca afetam o uso.
- **Liga/desliga:** o Admin desliga em Configurações → Dados da igreja (`metricasAtivas`), com texto explicando o que é coletado. Padrão: ligado.
- **Retenção:** eventos com mais de 12 meses são apagados automaticamente (única exceção à regra "nada se apaga", por não ser dado financeiro).
- **Análise:** sem tela no app na Fase 1. Entregues views SQL `vw_uso_diario`, `vw_funil_lancamento`, `vw_erros` e instruções para criar um **usuário somente-leitura** no Postgres para Power BI.
- **Futuro (fora da Fase 1):** com mais igrejas, envio opcional e consentido de **totais diários anônimos** para um painel central.

---

## 7. Arquitetura e estrutura de pastas

```
aliancaplena/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ src/
│  ├─ app/
│  │  ├─ (publico)/          # login, instalacao
│  │  └─ (sistema)/          # exige sessão
│  │     ├─ layout.tsx       # menu lateral
│  │     ├─ page.tsx         # dashboard
│  │     ├─ lancamentos/     # lista, novo, [id]
│  │     ├─ transferencias/[id]/
│  │     ├─ membros/
│  │     └─ configuracoes/   # contas, categorias, usuarios, igreja
│  ├─ lib/
│  │  ├─ services/           # toda regra de negócio
│  │  ├─ permissoes.ts
│  │  ├─ log.ts
│  │  ├─ auth.ts
│  │  ├─ storage.ts
│  │  ├─ dinheiro.ts         # Decimal + formatação R$
│  │  └─ db.ts
│  └─ components/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ docs/superpowers/specs/
└─ .env.example
```

**Regra de ouro:** telas e Server Actions nunca acessam o Prisma diretamente. Sempre chamam `lib/services`, que faz, nesta ordem: (1) autenticação, (2) checagem de permissão, (3) validação Zod, (4) regra de negócio + gravação + log em uma transação.

**Erros:** os serviços lançam erros tipados (`NaoAutorizado`, `Validacao`, `NaoEncontrado`, `RegraDeNegocio`) com mensagens em pt-BR; as telas exibem a mensagem sem detalhes técnicos. Erros inesperados aparecem como "Algo deu errado, tente novamente" e são registrados no log do servidor.

**Sessão por inatividade:** a sessão expira após **15 minutos sem ação** do usuário. O servidor renova o prazo a cada requisição (expiração deslizante); na tela, um contador de inatividade (toque, clique, teclado) mostra aos 14 minutos o aviso "Sua sessão vai expirar em 1 minuto" com botão **Continuar** e, aos 15, faz logout e volta ao login. Usuário inativado pelo Admin perde o acesso na próxima requisição.

**Segurança:** senhas com hash forte; cookie de sessão httpOnly, Secure, SameSite=Lax; limite de tentativas de login (5 falhas em 15 minutos por e-mail bloqueia novas tentativas temporariamente); nenhum dado sensível em URL.

**Backup:** o Neon mantém histórico de restauração (no plano Free, janela curta). Na Fase 1 a rotina de backup se limita a documentar no README como exportar o banco (`pg_dump`); backup automático agendado fica como item da Fase 3.

---

## 8. Testes (TDD)

- **Unitários (Vitest):** cálculo de saldo; união de permissões de múltiplos papéis; validações Zod; formatação de dinheiro e datas.
- **Integração (Vitest + Postgres real):**
  - previsto não entra no saldo; dar baixa passa a contar;
  - transferência não altera totais de entradas/saídas, mas altera saldo por conta; cancelar transferência desfaz o efeito;
  - cancelar sem motivo é recusado; cancelar gera log;
  - alterar valor gera log com "de" e "para";
  - Pastor tentando lançar é recusado; usuário com Pastor + Tesoureiro consegue;
  - categoria nominal sem membro é recusada; tipo de categoria diferente do tipo do lançamento é recusado;
  - não é possível remover o último Admin;
  - Instalação só funciona com sistema vazio.
- **E2E (Playwright):** login; novo lançamento em viewport de celular (abrindo o menu ☰); dar baixa em um previsto.

---

## 9. Decisões registradas

| Decisão | Escolha |
|---|---|
| Público | Uma instalação por igreja; começa pela Aliança Plena |
| Onde roda | Nuvem, priorizando planos gratuitos |
| Linguagem | Node.js + TypeScript (Next.js full-stack) |
| Identificação de contribuintes | Cadastro de membros obrigatório em categorias nominais |
| Contas | Várias contas, com transferências |
| Lançamentos futuros | Previsto/Realizado + vencimento; sem recorrência na Fase 1 |
| Papéis | Fixos, múltiplos por usuário |
| Transparência para membros | Fase 2: link/PDF mensal sem nomes; sem login de membro |
| Navegação | Menu lateral em todas as telas (gaveta no celular) |
| Logs | Estilo GLPI desde a Fase 1; tela geral na Fase 3 |
| Métricas de uso | Tabela própria `EventoUso`, sem valores/nomes, views para Power BI |
| Anexos | Arquivo na nuvem; banco guarda a chave e metadados em colunas; acesso por link temporário |
| EBD | Nova Fase 6, com spec própria |
