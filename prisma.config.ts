import { defineConfig } from "prisma/config";

// Prisma 7 não lê a URL do banco no schema; ela fica aqui.
// Carrega o .env local (se existir) para o CLI do Prisma.
try {
  process.loadEnvFile(".env");
} catch {
  // Sem .env: usa as variáveis já definidas no ambiente.
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
