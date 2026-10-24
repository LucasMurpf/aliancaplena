import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

type CategoriaInicial = { nome: string; tipo: "ENTRADA" | "SAIDA"; nominal: boolean };

// Spec §3 "Dados iniciais": 5 entradas e 7 saídas. Nenhuma conta é criada aqui.
const CATEGORIAS: CategoriaInicial[] = [
  { nome: "Dízimo", tipo: "ENTRADA", nominal: true },
  { nome: "Oferta", tipo: "ENTRADA", nominal: false },
  { nome: "Missões", tipo: "ENTRADA", nominal: false },
  { nome: "Doação", tipo: "ENTRADA", nominal: false },
  { nome: "Rendimentos", tipo: "ENTRADA", nominal: false },
  { nome: "Água", tipo: "SAIDA", nominal: false },
  { nome: "Luz", tipo: "SAIDA", nominal: false },
  { nome: "Aluguel", tipo: "SAIDA", nominal: false },
  { nome: "Combustível", tipo: "SAIDA", nominal: false },
  { nome: "Materiais", tipo: "SAIDA", nominal: false },
  { nome: "Manutenção", tipo: "SAIDA", nominal: false },
  { nome: "Missões (repasse)", tipo: "SAIDA", nominal: false },
];

// Idempotente por (nome, tipo): rodar de novo não duplica nem altera categorias existentes.
export async function semearCategorias(prisma: PrismaClient): Promise<void> {
  for (const c of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome_tipo: { nome: c.nome, tipo: c.tipo } },
      update: {},
      create: { ...c, ativa: true },
    });
  }
}

// Execução direta (npm run db:seed). Importar este arquivo não tem efeitos colaterais.
async function principal(): Promise<void> {
  try {
    process.loadEnvFile(".env");
  } catch {
    // Sem .env: usa as variáveis já definidas no ambiente.
  }
  const { prisma } = await import("../src/lib/db");
  try {
    await semearCategorias(prisma);
    console.log("Categorias iniciais semeadas.");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
