// Configuração da igreja (linha única criada na instalação). Leitura sem autenticação:
// usada no cabeçalho e no login. A Task 18 estende com a atualização.
import { prisma } from "@/lib/db";

export type ConfiguracaoPublica = { nomeIgreja: string; logoUrl: string | null };

export async function obterConfiguracao(): Promise<ConfiguracaoPublica | null> {
  const c = await prisma.configuracao.findFirst({
    orderBy: { criadoEm: "asc" },
    select: { nomeIgreja: true, logoUrl: true },
  });
  return c;
}
