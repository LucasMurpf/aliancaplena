import { defineConfig, devices } from "@playwright/test";
import { PORTA, SEGREDO_SESSAO } from "./tests/e2e/dados";

try {
  process.loadEnvFile(".env");
} catch {
  // Sem .env: usa as variáveis já definidas no ambiente (ex.: CI).
}

const urlBase = `http://localhost:${PORTA}`;
// Em ambientes sem download de navegadores, aponte para um Chrome já instalado.
const executablePath = process.env.PW_CHROME_PATH;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/e2e/preparar.ts",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  // No CI, o repórter "github" transforma falhas em anotações visíveis pela API do GitHub.
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: urlBase,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    ...(executablePath ? { launchOptions: { executablePath } } : {}),
  },
  webServer: {
    command: `npm run build && npm run start -- -p ${PORTA}`,
    url: `${urlBase}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
      SESSION_SECRET: SEGREDO_SESSAO,
      TZ: "America/Sao_Paulo",
    },
  },
});
