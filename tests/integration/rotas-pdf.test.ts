import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { cancelarLancamento, criarLancamento, type DadosLancamento } from "@/lib/services/lancamentos";
import { criarCategoria, criarMembro } from "@/lib/services/cadastros";
import { despublicarPrestacao, publicarPrestacao } from "@/lib/services/prestacao";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

// A sessão vem de `sessao.atual`: as rotas chamam obterUsuarioAtual() (cookie) em produção.
const sessao = vi.hoisted(() => ({ atual: null as unknown }));
vi.mock("@/lib/auth", async (importar) => {
  const real = await importar<typeof import("@/lib/auth")>();
  return { ...real, obterUsuarioAtual: async () => sessao.atual };
});

import { GET as pdfRecibo } from "@/app/api/pdf/recibo/[lancamentoId]/route";
import { GET as pdfRelatorio } from "@/app/api/pdf/relatorio/[tipo]/route";
import { GET as csvRelatorio } from "@/app/api/csv/relatorio/[tipo]/route";
import { GET as pdfPrestacao } from "@/app/api/pdf/prestacao/[token]/route";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let pastor: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let dizimo: Categoria;
let luz: Categoria;
let joao: Membro;

const lanc = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "150,00",
  categoriaId: dizimo.id,
  contaId: caixa.id,
  membroId: joao.id,
  dataVencimento: "10/09/2026",
  realizado: true,
  dataRealizacao: "10/09/2026",
  ...o,
});

beforeEach(async () => {
  sessao.atual = null;
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja Aliança",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "100,00",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  const mk = (nome: string, papeis: ("PASTOR" | "TESOUREIRO" | "EVENTOS")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  tesoureiro = await mk("Tesoureiro", ["TESOUREIRO"]);
  pastor = await mk("Pastor", ["PASTOR"]);
  eventos = await mk("Eventos", ["EVENTOS"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  luz = await prisma.categoria.findFirstOrThrow({ where: { nome: "Luz", tipo: "SAIDA" } });
  joao = await criarMembro(admin, { nome: "João da Conceição" });
});

const req = (caminho: string) => new Request(`http://localhost${caminho}`);
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const bytes = async (r: Response) => Buffer.from(await r.arrayBuffer());
const ehPdf = async (r: Response) => (await bytes(r)).subarray(0, 4).toString("latin1") === "%PDF";
const periodo = "de=2026-09-01&ate=2026-09-30";

describe("GET /api/pdf/recibo/:id", () => {
  it("200 com PDF, nome recibo-AAAA-NNNNNN.pdf e sem cache", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    sessao.atual = tesoureiro;
    const r = await pdfRecibo(req(`/api/pdf/recibo/${l.id}`), ctx({ lancamentoId: l.id }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toBe(
      `attachment; filename="recibo-2026-000001.pdf"; filename*=UTF-8''recibo-2026-000001.pdf`,
    );
    expect(await ehPdf(r)).toBe(true);
  });

  it("repetir devolve o mesmo número (idempotente) e cancelado ainda gera (com marca)", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    sessao.atual = tesoureiro;
    await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }));
    const r2 = await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }));
    expect(r2.headers.get("content-disposition")).toContain("recibo-2026-000001.pdf");
    await cancelarLancamento(tesoureiro, l.id, "lançado em duplicidade");
    const r3 = await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }));
    expect(r3.status).toBe(200);
    expect(await ehPdf(r3)).toBe(true);
  });

  it("sem sessão 401; sem permissão 403; inexistente 404; categoria não nominal 400", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    const saida = await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: luz.id, membroId: null }));
    expect((await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }))).status).toBe(401);

    sessao.atual = pastor; // não lança
    const proibido = await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }));
    expect(proibido.status).toBe(403);
    expect(proibido.headers.get("content-type")).toContain("text/plain");
    sessao.atual = eventos;
    expect((await pdfRecibo(req("/x"), ctx({ lancamentoId: l.id }))).status).toBe(403);

    sessao.atual = tesoureiro;
    expect((await pdfRecibo(req("/x"), ctx({ lancamentoId: "nao-existe" }))).status).toBe(404);
    const naoNominal = await pdfRecibo(req("/x"), ctx({ lancamentoId: saida.id }));
    expect(naoNominal.status).toBe(400);
    expect(await naoNominal.text()).toBe("Recibo disponível apenas para contribuições nominais realizadas");
  });
});

describe("GET /api/pdf/relatorio/:tipo", () => {
  beforeEach(async () => {
    const acentos = await criarCategoria(admin, { nome: "Ação Missões Água Ofertório", tipo: "SAIDA", nominal: false });
    await criarLancamento(tesoureiro, lanc());
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: luz.id, membroId: null, valor: "40,00", descricao: "Conta de luz" }));
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: acentos.id, membroId: null, valor: "10,00", descricao: "Ação de graças — água" }));
  });

  it.each(["geral", "arrecadacao", "despesas", "contribuicoes"] as const)("%s: 200, PDF e nome com o período", async (tipo) => {
    sessao.atual = tesoureiro;
    const r = await pdfRelatorio(req(`/api/pdf/relatorio/${tipo}?${periodo}`), ctx({ tipo }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toContain(`filename="relatorio-${tipo}-2026-09-01_2026-09-30.pdf"`);
    expect(await ehPdf(r)).toBe(true);
  });

  it("contribuições de um membro e geral com previstos renderizam", async () => {
    sessao.atual = tesoureiro;
    const m = await pdfRelatorio(req(`/api/pdf/relatorio/contribuicoes?${periodo}&membroId=${joao.id}`), ctx({ tipo: "contribuicoes" }));
    expect(m.status).toBe(200);
    expect(await ehPdf(m)).toBe(true);
    const g = await pdfRelatorio(req(`/api/pdf/relatorio/geral?${periodo}&incluirPrevistos=1&contaId=${caixa.id}`), ctx({ tipo: "geral" }));
    expect(g.status).toBe(200);
    expect(await ehPdf(g)).toBe(true);
  });

  it("sem sessão 401; sem permissão 403 (inclusive contribuições para quem só vê financeiro); tipo inválido 404; data inválida 400", async () => {
    expect((await pdfRelatorio(req(`/api/pdf/relatorio/geral?${periodo}`), ctx({ tipo: "geral" }))).status).toBe(401);
    sessao.atual = eventos;
    expect((await pdfRelatorio(req(`/api/pdf/relatorio/geral?${periodo}`), ctx({ tipo: "geral" }))).status).toBe(403);
    sessao.atual = tesoureiro;
    expect((await pdfRelatorio(req(`/api/pdf/relatorio/xyz?${periodo}`), ctx({ tipo: "xyz" }))).status).toBe(404);
    expect((await pdfRelatorio(req("/api/pdf/relatorio/geral?de=10/09/2026&ate=2026-09-30"), ctx({ tipo: "geral" }))).status).toBe(400);
    const invertido = await pdfRelatorio(req("/api/pdf/relatorio/geral?de=2026-09-30&ate=2026-09-01"), ctx({ tipo: "geral" }));
    expect(invertido.status).toBe(400);
    expect(invertido.headers.get("content-type")).toContain("text/plain");
  });

  it("registra a métrica relatorio_gerado {relatorio, formato} no servidor", async () => {
    sessao.atual = tesoureiro;
    await pdfRelatorio(req(`/api/pdf/relatorio/despesas?${periodo}`), ctx({ tipo: "despesas" }));
    await csvRelatorio(req(`/api/csv/relatorio/despesas?${periodo}`), ctx({ tipo: "despesas" }));
    const ev = await prisma.eventoUso.findMany({ where: { evento: "relatorio_gerado" }, orderBy: { dataHora: "asc" } });
    expect(ev.map((e) => e.propriedades)).toEqual([
      { relatorio: "despesas", formato: "pdf" },
      { relatorio: "despesas", formato: "csv" },
    ]);
  });
});

describe("GET /api/csv/relatorio/:tipo", () => {
  beforeEach(async () => {
    await criarLancamento(tesoureiro, lanc());
    await criarLancamento(tesoureiro, lanc({ tipo: "SAIDA", categoriaId: luz.id, membroId: null, valor: "40,00", descricao: "Conta de luz", realizado: false, dataRealizacao: undefined }));
  });

  it("200 com BOM, UTF-8, separador ';' e nome .csv", async () => {
    sessao.atual = tesoureiro;
    const r = await csvRelatorio(req(`/api/csv/relatorio/geral?${periodo}`), ctx({ tipo: "geral" }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toContain('filename="relatorio-geral-2026-09-01_2026-09-30.csv"');
    const b = await bytes(r);
    expect([...b.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const texto = b.toString("utf8");
    expect(texto).toContain("Data;Tipo;Categoria;Conta;Descrição;Valor;Situação");
    expect(texto).toContain("150,00");
    expect(texto).not.toContain("Conta de luz"); // previsto fora
    expect(texto).not.toContain("Inclui lançamentos previstos");
  });

  it("geral com incluirPrevistos=1: primeira linha avisa e o previsto entra", async () => {
    sessao.atual = tesoureiro;
    const r = await csvRelatorio(req(`/api/csv/relatorio/geral?${periodo}&incluirPrevistos=1`), ctx({ tipo: "geral" }));
    const texto = (await bytes(r)).toString("utf8");
    expect(texto.startsWith("﻿Inclui lançamentos previstos\r\n")).toBe(true);
    expect(texto.match(/﻿/g)).toHaveLength(1);
    expect(texto).toContain("Conta de luz");
    expect(texto).toContain("Previsto");
  });

  it("401, 403 e 404", async () => {
    expect((await csvRelatorio(req(`/api/csv/relatorio/geral?${periodo}`), ctx({ tipo: "geral" }))).status).toBe(401);
    sessao.atual = eventos;
    expect((await csvRelatorio(req(`/api/csv/relatorio/geral?${periodo}`), ctx({ tipo: "geral" }))).status).toBe(403);
    sessao.atual = tesoureiro;
    expect((await csvRelatorio(req(`/api/csv/relatorio/nada?${periodo}`), ctx({ tipo: "nada" }))).status).toBe(404);
  });
});

describe("GET /api/pdf/prestacao/:token", () => {
  it("público por token: 200, PDF, nome prestacao-AAAA-MM-vN.pdf e NÃO conta visualização", async () => {
    await criarLancamento(tesoureiro, lanc());
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    sessao.atual = null; // sem login
    const r = await pdfPrestacao(req(`/api/pdf/prestacao/${p.token}`), ctx({ token: p.token }));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("content-disposition")).toContain('filename="prestacao-2026-09-v1.pdf"');
    expect(await ehPdf(r)).toBe(true);
    await pdfPrestacao(req("/x"), ctx({ token: p.token }));
    expect((await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: p.id } })).visualizacoes).toBe(0);
  });

  it("despublicada, inexistente e token inválido → 404", async () => {
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    await despublicarPrestacao(tesoureiro, p.id, "engano");
    expect((await pdfPrestacao(req("/x"), ctx({ token: p.token }))).status).toBe(404);
    expect((await pdfPrestacao(req("/x"), ctx({ token: "A".repeat(43) }))).status).toBe(404);
    expect((await pdfPrestacao(req("/x"), ctx({ token: "curto" }))).status).toBe(404);
  });
});
