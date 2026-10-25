import { exigirBancoDeTeste } from "./helpers/guarda-banco";
import { aplicarMigracoes } from "./helpers/migracoes";

// Roda uma vez por execução do vitest: deixa o banco de testes com o schema atual.
export default async function globalSetup(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Sem .env: usa as variáveis já definidas no ambiente.
  }
  const url = exigirBancoDeTeste(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL);
  await aplicarMigracoes(url);
}
