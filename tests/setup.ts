import { exigirBancoDeTeste } from "./helpers/guarda-banco";

// Carrega o .env local (se existir) e aponta os testes para o banco de testes.
try {
  process.loadEnvFile(".env");
} catch {
  // Sem .env: usa as variáveis já definidas no ambiente.
}

const urlTeste = exigirBancoDeTeste(process.env.DATABASE_URL_TEST, process.env.DATABASE_URL);
process.env.DATABASE_URL = urlTeste;
