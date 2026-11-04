-- AlterTable
ALTER TABLE "ContagemCaixa" ADD COLUMN     "totalPix" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ContagemPix" (
    "contagemId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "ContagemPix_pkey" PRIMARY KEY ("contagemId","ordem")
);

-- CreateTable
CREATE TABLE "Bem" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "local" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bem_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ContagemPix" ADD CONSTRAINT "ContagemPix_contagemId_fkey" FOREIGN KEY ("contagemId") REFERENCES "ContagemCaixa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
