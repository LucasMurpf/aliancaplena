-- Log imutável também no banco (spec §1 critério 4 e §6): nenhuma linha de "Log" pode ser
-- alterada ou apagada, nem por SQL direto. Inserir continua permitido.
-- Gatilho por linha: não dispara em TRUNCATE (os testes limpam as tabelas com TRUNCATE).
-- O Prisma não modela funções nem gatilhos, então isto não gera diferença em `prisma migrate diff`.
CREATE FUNCTION "log_imutavel"() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'O histórico (Log) é imutável: % não é permitido', TG_OP
        USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "Log_imutavel"
BEFORE UPDATE OR DELETE ON "Log"
FOR EACH ROW EXECUTE FUNCTION "log_imutavel"();
