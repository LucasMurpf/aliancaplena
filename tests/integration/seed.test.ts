import { beforeEach, expect, test } from "vitest";
import { semearCategorias } from "../../prisma/seed";
import { prisma } from "@/lib/db";
import { resetarBanco } from "../helpers/db";

beforeEach(async () => {
  await resetarBanco();
});

test("seed cria as 12 categorias e é idempotente", async () => {
  await resetarBanco();
  await semearCategorias(prisma);
  await semearCategorias(prisma);
  const cats = await prisma.categoria.findMany();
  expect(cats).toHaveLength(12);
  expect(cats.find((c) => c.nome === "Dízimo")).toMatchObject({
    tipo: "ENTRADA",
    nominal: true,
    ativa: true,
  });
  expect(cats.filter((c) => c.detalharPublico).map((c) => c.nome).sort()).toEqual(
    ["Aluguel", "Combustível", "Manutenção", "Materiais", "Missões (repasse)", "Luz", "Água"].sort(),
  );
  expect(cats.filter((c) => c.nome.startsWith("Missões")).map((c) => c.tipo).sort()).toEqual([
    "ENTRADA",
    "SAIDA",
  ]);
});
