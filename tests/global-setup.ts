import { aplicarMigracoes } from "./helpers/migracoes";

// Roda uma vez por execução do vitest: deixa o banco de testes com o schema atual.
export default async function globalSetup(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Sem .env: usa as variáveis já definidas no ambiente.
  }
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST não definida.");
  if (url === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST é igual a DATABASE_URL. Use um banco separado para testes.");
  }
  await aplicarMigracoes(url);
}
