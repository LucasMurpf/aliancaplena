-- AlterTable
ALTER TABLE "Membro" ADD COLUMN "nomeBusca" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Membro_nomeBusca_idx" ON "Membro"("nomeBusca");
