// Carrega o .env local (se existir) e aponta os testes para o banco de testes.
try {
  process.loadEnvFile(".env");
} catch {
  // Sem .env: usa as variáveis já definidas no ambiente.
}

const urlTeste = process.env.DATABASE_URL_TEST;
if (!urlTeste) {
  throw new Error("DATABASE_URL_TEST não definida. Os testes não rodam sem banco de testes.");
}
if (urlTeste === process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL_TEST é igual a DATABASE_URL. Use um banco separado para testes.");
}
process.env.DATABASE_URL = urlTeste;
