# Métricas de uso

O app registra **como as telas são usadas** (comportamento) para decidir o que melhorar, simplificar e priorizar. Não mede dinheiro nem pessoas.

## O que é coletado

Cada evento guarda: data e hora, usuário e papéis, identificador da sessão do navegador, tipo de aparelho (celular, tablet ou PC), nome do evento, a tela (com ids trocados por `[id]`), a duração (quando faz sentido) e algumas propriedades de uma **lista fechada por evento**.

Eventos: `login`, `sessao_expirou`, `tela_aberta`, `menu_aberto`, `lancamento_iniciado`, `lancamento_salvo`, `lancamento_abandonado`, `filtro_usado`, `grafico_interagido`, `erro_validacao`, `erro_inesperado`, `baixa_dada`, `lancamento_cancelado`, `transferencia_criada`, `anexo_enviado`, `membro_cadastrado_rapido`.

A lista de eventos e de propriedades permitidas está em `src/lib/metricas/catalogo.ts`. Qualquer outra propriedade é descartada no servidor.

## O que nunca é coletado

- Valores em R$.
- Nomes de membros ou de pessoas contribuintes.
- Descrições e qualquer texto digitado.
- Ids na rota (viram `[id]`).
- Valores de filtros (só o nome do filtro usado).

## Como desligar

O Admin desliga em Configurações → Dados da igreja (campo `metricasAtivas`). Desligado, nada novo é gravado. Padrão: ligado.

## Retenção

Eventos com mais de 12 meses são apagados automaticamente, no máximo uma vez por dia.

## Views para análise

- `vw_uso_diario(dia, evento, dispositivo, papeis, total)`
- `vw_funil_lancamento(dia, iniciados, salvos, abandonados, mediana_duracao_ms)`
- `vw_erros(dia, evento, campo, regra, total)`

O dia é calculado no fuso America/Sao_Paulo. A origem das views é `prisma/sql/views-metricas.sql` (aplicada pela migração `20261024020000_views_metricas`).

## Usuário somente-leitura (Power BI)

Execute no Postgres como administrador:

```sql
CREATE ROLE bi_leitura LOGIN PASSWORD 'troque-por-uma-senha-forte';
GRANT SELECT ON vw_uso_diario, vw_funil_lancamento, vw_erros TO bi_leitura;
```

Esse usuário não enxerga nenhuma outra tabela (nem as financeiras).

## Conectar no Power BI

1. Obter dados → Banco de dados PostgreSQL.
2. Servidor e banco: os do app (use um host acessível pelo computador do BI, de preferência por VPN ou túnel; não exponha o Postgres na internet).
3. Credenciais de banco de dados: usuário `bi_leitura` e a senha definida acima.
4. Selecione as três views e carregue.
