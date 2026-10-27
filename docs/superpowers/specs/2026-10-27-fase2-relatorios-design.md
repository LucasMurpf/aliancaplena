# Fase 2 — Relatórios, recibos, prestação de contas e calculadora · Design

**Projeto:** Sistema de Gestão Financeira e Administrativa para Igrejas
**Base:** Fase 1 em produção (`main` 331d1fb) — ver `2026-10-24-fase1-financeiro-design.md`
**Data:** 2026-10-27
**Status:** aguardando revisão do Lucas
**Decisões:** Lucas escolheu a calculadora com dois modos e a prestação pública com controle por categoria; delegou as demais decisões, registradas na seção 10.

---

## 1. Objetivo

Transformar os dados lançados na Fase 1 em informação para três públicos:

- **Tesouraria:** conferência física do dinheiro (calculadora) e recibos para quem contribui.
- **Liderança (pastor, admin):** relatórios detalhados e indicadores de evolução.
- **Membros:** prestação de contas mensal transparente, **sem nomes de contribuintes**, por link enviado no grupo.

### Critério de sucesso
1. Depois do culto, o tesoureiro conta o envelope na calculadora e vê na hora se bate com o que foi lançado.
2. Ao lançar um dízimo, gera o recibo em PDF e compartilha pelo WhatsApp em dois toques.
3. No fim do mês, publica a prestação de contas e manda o link no grupo; o link mostra exatamente o que foi publicado.
4. O pastor abre "Indicadores" e entende a evolução dos últimos 12 meses sem precisar de planilha.
5. Os quatro relatórios da spec saem em tela, PDF e CSV.

### Fora do escopo
Conciliação bancária e tela geral de logs (Fase 3), eventos (Fase 4), patrimônio (Fase 5), EBD (Fase 6), recorrência automática, login de membros, envio automático de mensagens (WhatsApp/e-mail).

---

## 2. Calculadora de cédulas e moedas

### Modos
- **Conferir culto:** escolhe a conta (padrão: a primeira do tipo CAIXA) e a data (padrão: hoje). **Esperado** = soma das ENTRADAS REALIZADAS naquela conta com `dataRealizacao` = data.
- **Conferir caixa:** escolhe a conta. **Esperado** = saldo atual da conta (fórmula da Fase 1).

### Tela
- Uma linha por denominação, com campo de quantidade (teclado numérico) e subtotal ao lado. Cédulas: 200, 100, 50, 20, 10, 5, 2. Moedas: 1,00 · 0,50 · 0,25 · 0,10 · 0,05 · 0,01.
- Total contado atualiza a cada digitação. Esperado e **diferença** ficam fixos no rodapé: verde quando bate; vermelho com "Faltam R$ X" ou "Sobram R$ X" quando não bate.
- Botão **Registrar contagem**. Com diferença ≠ 0, a observação é obrigatória (ex.: "R$ 30 de troco devolvido").
- Histórico de contagens: lista com data, modo, conta, contado, esperado, diferença e quem contou. Abre o detalhe com as quantidades.

### Regras
- A contagem **não cria lançamento** de ajuste automaticamente. Ela registra a conferência. No detalhe de uma contagem divergente existe o atalho "Lançar ajuste", que abre o formulário de lançamento já preenchido (tipo, conta, data, valor = |diferença|, descrição "Ajuste da contagem de dd/mm").
- O esperado é **gravado no momento** da contagem. Mudanças posteriores nos lançamentos não alteram contagens antigas.
- Contagens não são editadas nem apagadas. Uma contagem errada é refeita, e as duas ficam no histórico.
- Permissões: registrar exige `financeiro.lancar`; ver exige `financeiro.ver`.

---

## 3. Recibo eletrônico

- Disponível para lançamentos **REALIZADOS de categoria nominal** (ex.: Dízimo e ofertas nominais), no detalhe do lançamento e logo após salvar ("Gerar recibo").
- **Número sequencial por ano**: `2026/000123`. É gerado na primeira emissão e fica gravado. Reemitir o mesmo lançamento devolve o mesmo número. A sequência é segura contra concorrência (advisory lock + contador por ano).
- Conteúdo do PDF (A5 retrato):
  - nome da igreja, CNPJ (se houver) e logo (se for URL http/https);
  - "Recebemos de **Nome do Membro** a importância de **R$ 150,00 (cento e cinquenta reais)** referente a **Dízimo**";
  - data da realização, local "Colombo, dd de mês de aaaa" (cidade configurável), nome de quem emitiu e espaço para assinatura;
  - código de verificação: os 8 primeiros caracteres de um hash do número com o id.
- Se o lançamento for **cancelado** depois da emissão, o PDF passa a sair com a marca "CANCELADO".
- **Compartilhar:** no celular, usa o compartilhamento nativo com o arquivo PDF, que permite escolher o WhatsApp. Sem suporte a isso, o arquivo é baixado.
- Permissão: emitir e baixar exige `financeiro.lancar` **e** `membros.ver_nomes`.
- Histórico: ação `EMITIU_RECIBO` no log do lançamento.

---

## 4. Relatórios

Tela **Relatórios** no menu lateral, com quatro abas. Filtros comuns: período (de/até, padrão mês atual), conta e categoria. Todos com **ver em tela**, **baixar PDF** e **baixar CSV** (separador `;`, decimal com vírgula, UTF-8 com BOM, para abrir direto no Excel).

| Relatório | Conteúdo | Nomes de membros? | Permissão |
|---|---|---|---|
| **Geral** | Todos os lançamentos REALIZADOS no período (data, tipo, categoria, conta, descrição, valor), totais de entradas, saídas e resultado. Opção "incluir previstos" (marcados). | Não (coluna membro omitida) | `financeiro.ver` |
| **Arrecadação** | Total de entradas por categoria, com % do total e quantidade de lançamentos. | Não | `financeiro.ver` |
| **Despesas** | Saídas agrupadas por categoria, cada uma com seus lançamentos (data, descrição, conta, valor) e subtotal. | Não | `financeiro.ver` |
| **Contribuições individuais** | Escolhe o membro: lista de contribuições nominais (data, categoria, valor) e total no período. Também tem o modo "todos os membros", com o total por membro. | Sim | `membros.ver_nomes` |

- Cancelados nunca entram. Previstos só entram no Geral e só com a opção marcada.
- Transferências não entram em nenhum total.
- O PDF dos relatórios sai em A4, com cabeçalho (igreja, título, período, filtros, "gerado por Fulano em dd/mm/aaaa hh:mm") e paginação.

---

## 5. Prestação de contas pública

### Publicação
- Em **Relatórios → Prestação de contas**, o tesoureiro escolhe o mês, vê a **prévia** exatamente como o membro verá e clica **Publicar**.
- A publicação grava uma **foto** do mês (snapshot JSON) e gera um link `/{token}` com 32 bytes aleatórios, que ninguém consegue adivinhar.
- Republicar o mesmo mês cria a **versão 2**. Ela ganha um link novo, e os links das versões anteriores passam a mostrar a faixa "Existe uma versão mais recente desta prestação → ver versão N".
- O tesoureiro pode **despublicar** uma versão, e o link passa a mostrar "Esta prestação foi retirada pela igreja". Nada é apagado.
- Permissão: publicar e despublicar exige `financeiro.lancar`; ver a lista e as prévias exige `financeiro.ver`.
- Histórico: ações `PUBLICOU` e `DESPUBLICOU` (entidade `PrestacaoContas`).

### Conteúdo da página pública
- Nome e logo da igreja, mês de referência, "versão N publicada em dd/mm/aaaa".
- **Resumo:** total de entradas, total de saídas, resultado do mês e saldo total da igreja no último dia do mês (soma de todas as contas, sem detalhar por conta).
- **Entradas por categoria**, só os totais.
- **Saídas por categoria**, com os totais. Para categorias com `detalharPublico = true`, cada gasto aparece embaixo (data, descrição, valor).
- Botão **Baixar PDF**, com o mesmo conteúdo.
- **Nunca** aparecem: nomes de membros, contas individuais, previstos, cancelados, anexos ou usuários.
- A página é pública, sem login e sem o menu do sistema. Leva `noindex` e um rodapé "Gerado pelo sistema de gestão da igreja".
- Cada abertura soma +1 no contador `visualizacoes` da versão. A tela de publicação mostra quantas vezes cada versão foi vista.

### Categoria
- Novo campo `Categoria.detalharPublico` (booleano), editável em Configurações → Categorias como "Mostrar gastos detalhados na prestação pública".
- Padrão `true` para as saídas da instalação (Água, Luz, Aluguel, Combustível, Materiais, Manutenção, Missões (repasse)). Padrão `false` para categorias novas e para todas as entradas. O campo só tem efeito em categorias de saída.

---

## 6. Indicadores

Tela **Indicadores** (`financeiro.ver`). Período fixo dos últimos 12 meses fechados mais o mês atual, com tudo baseado em REALIZADOS:

1. **Entradas × saídas por mês**: barras agrupadas, com a linha de resultado.
2. **Saldo total ao fim de cada mês**: linha.
3. **Arrecadação por categoria por mês**: as 5 maiores mais "Outras", em barras empilhadas.
4. **Cartões comparativos**: mês atual × mesmo mês do ano anterior e × média dos 12 meses, tanto para entradas quanto para saídas, com a variação em %.
5. **Contribuintes no mês**: quantidade de membros distintos com contribuição nominal em cada mês, **só o número, sem nomes**.

Cada gráfico tem uma tabela alternativa para leitores de tela.

---

## 7. Melhorias herdadas da Fase 1

Pendências da revisão final que afetam o uso e são baratas de resolver:

1. **Histórico legível:** valores de enums traduzidos ("REALIZADO" vira "Realizado", "ENTRADA" vira "Entrada", "CAIXA" vira "Caixa"). No cancelamento, o motivo aparece numa linha própria ("Motivo: …") em vez de sob "Status".
2. **Data futura:** `dataRealizacao` não pode ser posterior a hoje (SP). A validação dá "A data de realização não pode ser futura".
3. **Sessão encerrada de verdade:** redefinir a senha, inativar ou mudar papéis de um usuário invalida as sessões abertas dele, por meio do campo `Usuario.versaoSessao` incluído no token.
4. **Anexos:** índice único em `Anexo.url`. O objeto no R2 é conferido de novo no momento da confirmação, contra regravação com a URL pré-assinada.

---

## 8. Modelo de dados (novas estruturas)

| Tabela / campo | Campos principais | Observações |
|---|---|---|
| **ContagemCaixa** | id, modo (CULTO \| CAIXA), contaId, data (Date), totalContado, esperado, diferenca (Decimal 12,2), observacao?, criadoPorId, criadoEm | Só inserção |
| **ContagemItem** | contagemId, denominacaoCentavos (Int), quantidade (Int) | PK composta |
| **Recibo** | id, lancamentoId (único), ano, numero (Int), codigoVerificacao, emitidoPorId, emitidoEm | `@@unique([ano, numero])` |
| **SequenciaRecibo** | ano (PK), ultimo (Int) | Contador sob advisory lock |
| **PrestacaoContas** | id, ano, mes, versao, token (único), dados (JSON), publicadaPorId, publicadaEm, despublicada (bool), despublicadaEm?, visualizacoes (Int) | `@@unique([ano, mes, versao])` |
| `Categoria.detalharPublico` | Boolean @default(false) | A migração liga nas saídas padrão da instalação |
| `Usuario.versaoSessao` | Int @default(0) | Incrementado nos eventos da seção 7.3 |
| `Configuracao.cidade` | String? | Usado no recibo ("Colombo, dd de …") |
| `Anexo.url` | `@unique` | Seção 7.4 |

Novas ações de log: `EMITIU_RECIBO`, `PUBLICOU`, `DESPUBLICOU`, `REGISTROU_CONTAGEM`. Novas entidades: `Contagem`, `PrestacaoContas`.

Migrações continuam em SQL escrito à mão, conferido pelo `prisma migrate diff` no CI.

---

## 9. Arquitetura

- **Serviços novos:** `services/contagens.ts`, `services/recibos.ts`, `services/relatorios.ts` (consultas e montagem dos dados, tudo em Decimal), `services/prestacao.ts` e `services/indicadores.ts`. Mesma regra de ouro da Fase 1: autenticação, permissão, Zod, transação e log.
- **PDF:** biblioteca JS pura que roda em função serverless, sem navegador headless. A escolha concreta é feita no plano, avaliando compatibilidade com Next 16 e React 19. Todos os PDFs saem por **rotas GET** (`/api/pdf/...`) que conferem a sessão e a permissão. A página pública tem rota própria, validada pelo token.
- **CSV:** gerado no servidor a partir dos mesmos dados do relatório, num único gerador para os quatro relatórios.
- **Valor por extenso** (`lib/extenso.ts`): função pura em pt-BR com testes, de centavos até bilhões ("um real", "dois mil e cinquenta reais e cinco centavos").
- **Página pública:** fora do grupo `(sistema)`, em `app/(publico)/p/[token]`, liberada no `proxy.ts`.
- **Métricas novas** (catálogo fechado): `relatorio_gerado {relatorio, formato}`, `recibo_emitido {compartilhado}`, `prestacao_publicada {versao}`, `contagem_registrada {modo, divergente}`, `indicadores_aberto`.

---

## 10. Decisões tomadas

| Decisão | Escolha | Quem |
|---|---|---|
| Comparação da calculadora | Dois modos: culto (lançado no dia) e caixa (saldo da conta) | Lucas |
| Detalhe das saídas na prestação pública | Por categoria, com a opção `detalharPublico` | Lucas |
| Mudanças depois de publicar | Foto do mês com versões; o link antigo aponta para a versão nova | Claude (delegado) |
| Ajuste por divergência | Não é automático; atalho "Lançar ajuste" | Claude |
| Número do recibo | Sequencial por ano, fixo por lançamento | Claude |
| Compartilhar recibo | Compartilhamento nativo do celular com o PDF; senão, download | Claude |
| Formatos dos relatórios | Tela, PDF e CSV (padrão Excel BR) | Claude |
| Relatório individual | Restrito a `membros.ver_nomes` | Claude |
| Saldo na página pública | Só o total da igreja, sem detalhar por conta | Claude |
| Contribuintes nos indicadores | Só a contagem, nunca nomes | Claude |
| Pendências da Fase 1 incluídas | Histórico legível, data futura, invalidar sessão, anexo único | Claude |

---

## 11. Testes

- **Unitários:** valor por extenso, montagem do CSV, denominações e total da calculadora, código de verificação, montagem do snapshot público (com ou sem `detalharPublico`).
- **Integração:**
  - esperado nos dois modos da calculadora;
  - observação obrigatória quando há divergência;
  - sequência de recibos sem buracos nem duplicatas sob concorrência;
  - reemissão devolve o mesmo número;
  - recibo de lançamento não nominal recusado;
  - os quatro relatórios batem com o resumo da Fase 1 no mesmo período;
  - snapshot congelado depois de editar um lançamento;
  - versão nova e link antigo;
  - página pública sem nenhum nome de membro (busca no HTML);
  - despublicar;
  - indicadores com meses vazios;
  - as quatro melhorias da seção 7.
- **E2E:**
  - contar o culto no celular e ver a divergência;
  - gerar um recibo e baixar o PDF;
  - publicar a prestação e abrir o link sem estar logado.
