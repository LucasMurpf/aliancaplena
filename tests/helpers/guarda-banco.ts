// Proteção contra apagar o banco errado: os helpers de teste fazem DROP SCHEMA public CASCADE.

/** Nome do banco na URL de conexão (sem a barra inicial), ou "" se não houver. */
export function nomeDoBanco(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

/**
 * Lança se a URL de testes não existir, for igual à do app ou se o nome do banco não contiver
 * "test" (ex.: uma URL "pooled" do banco de produção copiada por engano).
 */
export function exigirBancoDeTeste(urlTeste: string | undefined, urlApp: string | undefined): string {
  if (!urlTeste) throw new Error("DATABASE_URL_TEST não definida. Os testes não rodam sem banco de testes.");
  if (urlTeste === urlApp) {
    throw new Error("DATABASE_URL_TEST é igual a DATABASE_URL. Use um banco separado para testes.");
  }
  const nome = nomeDoBanco(urlTeste);
  if (!nome.toLowerCase().includes("test")) {
    throw new Error(
      `O banco de DATABASE_URL_TEST ("${nome}") não tem "test" no nome. Os testes apagam o banco inteiro; use um banco só para testes (ex.: igreja_test).`,
    );
  }
  return urlTeste;
}
