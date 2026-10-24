-- Views de métricas de uso para Power BI. Somente leitura; veja docs/metricas.md.
-- "dataHora" é TIMESTAMP(3) sem fuso gravado em UTC; o dia é calculado em America/Sao_Paulo.

CREATE VIEW vw_uso_diario AS
SELECT
  ("dataHora" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  evento,
  dispositivo::text AS dispositivo,
  array_to_string(ARRAY(SELECT unnest(papeis)::text ORDER BY 1), ', ') AS papeis,
  count(*) AS total
FROM "EventoUso"
GROUP BY 1, 2, 3, 4;

CREATE VIEW vw_funil_lancamento AS
SELECT
  ("dataHora" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  count(*) FILTER (WHERE evento = 'lancamento_iniciado') AS iniciados,
  count(*) FILTER (WHERE evento = 'lancamento_salvo') AS salvos,
  count(*) FILTER (WHERE evento = 'lancamento_abandonado') AS abandonados,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY "duracaoMs") FILTER (WHERE evento = 'lancamento_salvo') AS mediana_duracao_ms
FROM "EventoUso"
WHERE evento IN ('lancamento_iniciado', 'lancamento_salvo', 'lancamento_abandonado')
GROUP BY 1;

CREATE VIEW vw_erros AS
SELECT
  ("dataHora" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
  evento,
  propriedades->>'campo' AS campo,
  propriedades->>'regra' AS regra,
  count(*) AS total
FROM "EventoUso"
WHERE evento IN ('erro_validacao', 'erro_inesperado')
GROUP BY 1, 2, 3, 4;
