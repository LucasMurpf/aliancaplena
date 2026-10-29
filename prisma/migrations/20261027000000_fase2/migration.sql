-- CreateEnum
CREATE TYPE "ModoContagem" AS ENUM ('CULTO', 'CAIXA');

-- AlterTable
ALTER TABLE "Categoria" ADD COLUMN     "detalharPublico" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Configuracao" ADD COLUMN     "cidade" TEXT;

-- AlterTable
ALTER TABLE "Usuario" ADD COLUMN     "versaoSessao" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ContagemCaixa" (
    "id" TEXT NOT NULL,
    "modo" "ModoContagem" NOT NULL,
    "contaId" TEXT NOT NULL,
    "data" DATE NOT NULL,
    "totalContado" DECIMAL(12,2) NOT NULL,
    "esperado" DECIMAL(12,2) NOT NULL,
    "diferenca" DECIMAL(12,2) NOT NULL,
    "observacao" TEXT,
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContagemCaixa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContagemItem" (
    "contagemId" TEXT NOT NULL,
    "denominacaoCentavos" INTEGER NOT NULL,
    "quantidade" INTEGER NOT NULL,

    CONSTRAINT "ContagemItem_pkey" PRIMARY KEY ("contagemId","denominacaoCentavos")
);

-- CreateTable
CREATE TABLE "Recibo" (
    "id" TEXT NOT NULL,
    "lancamentoId" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "codigoVerificacao" TEXT NOT NULL,
    "emitidoPorId" TEXT NOT NULL,
    "emitidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recibo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenciaRecibo" (
    "ano" INTEGER NOT NULL,
    "ultimo" INTEGER NOT NULL,

    CONSTRAINT "SequenciaRecibo_pkey" PRIMARY KEY ("ano")
);

-- CreateTable
CREATE TABLE "PrestacaoContas" (
    "id" TEXT NOT NULL,
    "ano" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "versao" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "dados" JSONB NOT NULL,
    "publicadaPorId" TEXT NOT NULL,
    "publicadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "despublicada" BOOLEAN NOT NULL DEFAULT false,
    "despublicadaEm" TIMESTAMP(3),
    "visualizacoes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PrestacaoContas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_lancamentoId_key" ON "Recibo"("lancamentoId");

-- CreateIndex
CREATE UNIQUE INDEX "Recibo_ano_numero_key" ON "Recibo"("ano", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "PrestacaoContas_token_key" ON "PrestacaoContas"("token");

-- CreateIndex
CREATE UNIQUE INDEX "PrestacaoContas_ano_mes_versao_key" ON "PrestacaoContas"("ano", "mes", "versao");

-- CreateIndex
CREATE UNIQUE INDEX "Anexo_url_key" ON "Anexo"("url");

-- AddForeignKey
ALTER TABLE "ContagemCaixa" ADD CONSTRAINT "ContagemCaixa_contaId_fkey" FOREIGN KEY ("contaId") REFERENCES "Conta"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemCaixa" ADD CONSTRAINT "ContagemCaixa_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContagemItem" ADD CONSTRAINT "ContagemItem_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "ContagemCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_lancamentoId_fkey" FOREIGN KEY ("lancamentoId") REFERENCES "Lancamento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recibo" ADD CONSTRAINT "Recibo_emitidoPorId_fkey" FOREIGN KEY ("emitidoPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrestacaoContas" ADD CONSTRAINT "PrestacaoContas_publicadaPorId_fkey" FOREIGN KEY ("publicadaPorId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dados: as saídas padrão da instalação passam a detalhar na prestação pública.
UPDATE "Categoria" SET "detalharPublico" = true
WHERE "tipo" = 'SAIDA'
  AND "nome" IN ('Água', 'Luz', 'Aluguel', 'Combustível', 'Materiais', 'Manutenção', 'Missões (repasse)');
