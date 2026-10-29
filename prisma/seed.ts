import { pathToFileURL } from "node:url";
import type { Prisma } from "@prisma/client";

type CategoriaInicial = { nome: string; tipo: "ENTRADA" | "SAIDA"; nominal: boolean; detalharPublico?: boolean };

// Spec §3 "Dados iniciais": 5 entradas e 7 saídas. Nenhuma conta é criada aqui.
const CATEGORIAS: CategoriaInicial[] = [
  { nome: "Dízimo", tipo: "ENTRADA", nominal: true },
  { nome: "Oferta", tipo: "ENTRADA", nominal: false },
  { nome: "Missões", tipo: "ENTRADA", nominal: false },
  { nome: "Doação", tipo: "ENTRADA", nominal: false },
  { nome: "Rendimentos", tipo: "ENTRADA", nominal: false },
  { nome: "Água", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Luz", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Aluguel", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Combustível", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Materiais", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Manutenção", tipo: "SAIDA", nominal: false, detalharPublico: true },
  { nome: "Missões (repasse)", tipo: "SAIDA", nominal: false, detalharPublico: true },
];

// Idempotente por (nome, tipo): rodar de novo não duplica nem altera categorias existentes.
// Aceita o cliente normal ou o de uma transação (usado pela Instalação).
export async function semearCategorias(prisma: Prisma.TransactionClient): Promise<void> {
  for (const c of CATEGORIAS) {
    await prisma.categoria.upsert({
      where: { nome_tipo: { nome: c.nome, tipo: c.tipo } },
      update: {},
      create: { ...c, detalharPublico: c.detalharPublico ?? false, ativa: true },
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
