// Roda uma vez antes dos testes E2E: recria o schema do banco de testes (migrações) e semeia os dados.
import { execFileSync } from "node:child_process";
import { aplicarMigracoes } from "../helpers/migracoes";

export default async function preparar(): Promise<void> {
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
  execFileSync("npx", ["tsx", "tests/e2e/semear.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
