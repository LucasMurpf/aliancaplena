import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { instalar } from "@/lib/services/instalacao";
import { criarLancamento, darBaixa, cancelarLancamento } from "@/lib/services/lancamentos";
import { criarTransferencia } from "@/lib/services/transferencias";
import { criarMembro } from "@/lib/services/cadastros";
import { storageMemoria } from "@/lib/storage";
import { limparEventosAntigos, registrarEventos } from "@/lib/services/metricas";
import { resetarBanco } from "../helpers/db";
import { enviarAnexoTeste } from "../helpers/anexos";

let admin: UsuarioAtual;
let caixaId: string;
let ofertaId: string;

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja", nomeConta: "Caixa", tipoConta: "CAIXA", saldoInicial: "0",
    adminNome: "Admin", adminEmail: "admin@igreja.org", adminSenha: "senha-forte-123",
  });
  caixaId = (await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } })).id;
  ofertaId = (await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } })).id;
});

const ev = (nome = "login") => ({ nome, tela: "/", dispositivo: "PC" as const });
const novoLanc = () =>
  criarLancamento(admin, { tipo: "ENTRADA", valor: "1234,56", categoriaId: ofertaId, contaId: caixaId, dataVencimento: "10/03/2026", realizado: false });

describe("registrarEventos", () => {
  it("grava com usuário e papéis do ator, sanitizando", async () => {
    const n = await registrarEventos(admin, [
      { nome: "lancamento_salvo", tela: "/lancamentos/clx9a8b7c6d5e4f3g2h1?x=1", dispositivo: "CELULAR", duracaoMs: 2000, props: { tipo: "ENTRADA", valor: "1234,56" }, sessaoId: "123e4567-e89b-12d3-a456-426614174000" },
    ]);
    expect(n).toBe(1);
    const r = await prisma.eventoUso.findFirstOrThrow();
    expect(r).toMatchObject({ usuarioId: admin.id, papeis: admin.papeis, tela: "/lancamentos/[id]", duracaoMs: 2000, dispositivo: "CELULAR", sessaoId: "123e4567-e89b-12d3-a456-426614174000", propriedades: { tipo: "ENTRADA" } });
  });
  it("sessaoId que não é UUID vira null", async () => {
    await registrarEventos(admin, [{ ...ev(), sessaoId: "João da Silva" }]);
    expect((await prisma.eventoUso.findFirstOrThrow()).sessaoId).toBeNull();
  });
  it("sem ator não grava", async () => {
    expect(await registrarEventos(null, [ev()])).toBe(0);
    expect(await prisma.eventoUso.count()).toBe(0);
  });
  it("metricasAtivas=false -> 0", async () => {
    await prisma.configuracao.updateMany({ data: { metricasAtivas: false } });
    expect(await registrarEventos(admin, [ev()])).toBe(0);
    expect(await prisma.eventoUso.count()).toBe(0);
  });
  it("60 eventos -> grava 50", async () => {
    expect(await registrarEventos(admin, Array.from({ length: 60 }, () => ev()))).toBe(50);
    expect(await prisma.eventoUso.count()).toBe(50);
  });
  it("descarta desconhecidos, duração inválida vira null", async () => {
    const n = await registrarEventos(admin, [ev("inventado"), { ...ev(), duracaoMs: -5 }, { ...ev(), duracaoMs: 3_600_001 }, { ...ev(), duracaoMs: 1.5 }]);
    expect(n).toBe(3);
    const rs = await prisma.eventoUso.findMany();
    expect(rs.every((r) => r.duracaoMs === null)).toBe(true);
  });
  it("dispositivo inválido descarta o evento", async () => {
    expect(await registrarEventos(admin, [{ ...ev(), dispositivo: "TV" as never }])).toBe(0);
  });
  it("não grava valores nem nomes de membros", async () => {
    const m = await criarMembro(admin, { nome: "Fulano Secretissimo" });
    await registrarEventos(admin, [{ nome: "lancamento_salvo", tela: "/lancamentos/novo", dispositivo: "PC", props: { valor: "1234,56", descricao: "Fulano Secretissimo", tipo: "1234,56 Fulano Secretissimo e mais texto longo" } }]);
    await novoLanc();
    const json = JSON.stringify(await prisma.eventoUso.findMany());
    expect(json).not.toContain("1234");
    expect(json).not.toContain(m.nome);
  });
  it("erro de banco -> 0 sem lançar", async () => {
    vi.spyOn(prisma.eventoUso, "createMany").mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(registrarEventos(admin, [ev()])).resolves.toBe(0);
  });
});

describe("limparEventosAntigos", () => {
  it("apaga 13 meses, mantém 11", async () => {
    const mesesAtras = (n: number) => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - n); return d; };
    const base = { dispositivo: "PC" as const, evento: "login", tela: "/" };
    await prisma.eventoUso.createMany({ data: [{ ...base, dataHora: mesesAtras(13) }, { ...base, dataHora: mesesAtras(11) }] });
    expect(await limparEventosAntigos()).toBe(1);
    expect(await prisma.eventoUso.count()).toBe(1);
  });
});

describe("eventos de negócio nos serviços", () => {
  const nomes = async () => (await prisma.eventoUso.findMany({ orderBy: { dataHora: "asc" } })).map((e) => e.evento);
  it("darBaixa grava exatamente 1 baixa_dada", async () => {
    const l = await novoLanc();
    await darBaixa(admin, l.id, "11/03/2026");
    expect(await nomes()).toEqual(["baixa_dada"]);
    expect((await prisma.eventoUso.findFirstOrThrow()).usuarioId).toBe(admin.id);
  });
  it("cancelarLancamento grava lancamento_cancelado", async () => {
    const l = await novoLanc();
    await cancelarLancamento(admin, l.id, "motivo qualquer");
    expect(await nomes()).toEqual(["lancamento_cancelado"]);
  });
  it("transferência grava transferencia_criada", async () => {
    const c2 = await prisma.conta.create({ data: { nome: "Banco", tipo: "BANCO", saldoInicial: 0 } });
    await criarTransferencia(admin, { contaOrigemId: caixaId, contaDestinoId: c2.id, valor: "10,00", data: "10/03/2026" });
    expect(await nomes()).toEqual(["transferencia_criada"]);
  });
  it("anexo grava anexo_enviado com tipo", async () => {
    const l = await novoLanc();
    await enviarAnexoTeste(admin, l.id, { nome: "a.pdf", mime: "application/pdf", dados: Buffer.from("%PDF-1.4\n") }, storageMemoria());
    const e = await prisma.eventoUso.findFirstOrThrow();
    expect(e.evento).toBe("anexo_enviado");
    expect(e.propriedades).toEqual({ tipo: "pdf" });
  });
  it("criarMembro só grava com origem rapido", async () => {
    await criarMembro(admin, { nome: "Sem origem" });
    expect(await prisma.eventoUso.count()).toBe(0);
    await criarMembro(admin, { nome: "Rapido" }, { origem: "rapido" });
    expect(await nomes()).toEqual(["membro_cadastrado_rapido"]);
  });
  it("com métricas desligadas os serviços não gravam", async () => {
    await prisma.configuracao.updateMany({ data: { metricasAtivas: false } });
    const l = await novoLanc();
    await darBaixa(admin, l.id, "11/03/2026");
    expect(await prisma.eventoUso.count()).toBe(0);
  });
});

describe("views", () => {
  it("existem e consultam sem erro", async () => {
    await prisma.$queryRaw`SELECT * FROM vw_funil_lancamento`;
    await prisma.$queryRaw`SELECT * FROM vw_uso_diario`;
    await prisma.$queryRaw`SELECT * FROM vw_erros`;
  });
  it("calculam funil, uso e erros", async () => {
    const dataHora = new Date("2026-03-10T12:00:00Z");
    const base = { dispositivo: "PC" as const, tela: "/", dataHora, papeis: ["TESOUREIRO", "ADMIN"] as never };
    await prisma.eventoUso.createMany({
      data: [
        { ...base, evento: "lancamento_iniciado" }, { ...base, evento: "lancamento_iniciado" },
        { ...base, evento: "lancamento_salvo", duracaoMs: 1000 }, { ...base, evento: "lancamento_salvo", duracaoMs: 3000 },
        { ...base, evento: "lancamento_abandonado" },
        { ...base, evento: "erro_validacao", propriedades: { campo: "valor", regra: "obrigatorio" } },
      ],
    });
    const f = await prisma.$queryRaw<Record<string, unknown>[]>`SELECT to_char(dia, 'YYYY-MM-DD') AS dia, iniciados, salvos, abandonados, mediana_duracao_ms FROM vw_funil_lancamento`;
    expect(f).toHaveLength(1);
    expect(f[0].dia).toBe("2026-03-10");
    expect(Number(f[0].iniciados)).toBe(2);
    expect(Number(f[0].salvos)).toBe(2);
    expect(Number(f[0].abandonados)).toBe(1);
    expect(Number(f[0].mediana_duracao_ms)).toBe(2000);
    const u = await prisma.$queryRaw<{ papeis: string; total: bigint }[]>`SELECT * FROM vw_uso_diario WHERE evento = 'lancamento_salvo'`;
    expect(u[0].papeis).toBe("ADMIN, TESOUREIRO");
    expect(Number(u[0].total)).toBe(2);
    const e = await prisma.$queryRaw<{ campo: string; regra: string; total: bigint }[]>`SELECT * FROM vw_erros`;
    expect(e[0]).toMatchObject({ campo: "valor", regra: "obrigatorio" });
  });
});
