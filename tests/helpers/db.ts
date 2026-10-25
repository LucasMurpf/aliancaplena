import { prisma } from "@/lib/db";

// Apaga os dados de todas as tabelas do banco de testes e zera as sequências.
// Não mexe na tabela de controle de migrações do Prisma.
export async function resetarBanco(): Promise<void> {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;

  if (tabelas.length === 0) return;

  const lista = tabelas.map((t) => `"public"."${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}
