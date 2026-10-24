import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

const pastaMigracoes = path.resolve(process.cwd(), "prisma", "migrations");

// Recria o schema `public` do banco informado e aplica, em ordem de pasta,
// todas as migrações de prisma/migrations/*/migration.sql.
export async function aplicarMigracoes(databaseUrl: string): Promise<void> {
  const pastas = readdirSync(pastaMigracoes, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    for (const pasta of pastas) {
      const sql = readFileSync(path.join(pastaMigracoes, pasta, "migration.sql"), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}
