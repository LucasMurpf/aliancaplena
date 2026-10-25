// Roda uma vez antes dos testes E2E: recria o schema do banco de testes (migrações) e semeia os dados.
import { execFileSync } from "node:child_process";
import { exigirBancoDeTeste } from "../helpers/guarda-banco";
import { aplicarMigracoes } from "../helpers/migracoes";

export default async function preparar(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Sem .env: usa as variáveis já definidas no ambiente.
  }
  const url = exigirBancoDeTeste(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL);

  await aplicarMigracoes(url);
  execFileSync("npx", ["tsx", "tests/e2e/semear.ts"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
