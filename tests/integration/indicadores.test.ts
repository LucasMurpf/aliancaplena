import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado } from "@/lib/erros";
import { indicadores } from "@/lib/services/indicadores";
import { saldoTotalEm } from "@/lib/services/prestacao";
import { criarLancamento, type DadosLancamento } from "@/lib/services/lancamentos";
import { criarConta, criarMembro, criarCategoria } from "@/lib/services/cadastros";
import { criarTransferencia } from "@/lib/services/transferencias";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

const HOJE = new Date(Date.UTC(2026, 9, 27)); // 27/10/2026

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let caixa: Conta;
let banco: Conta;
let dizimo: Categoria;
let oferta: Categoria;
let saidaA: Categoria;
let joao: Membro;
let maria: Membro;

afterEach(() => {
  vi.useRealTimers();
});

beforeEach(async () => {
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
  tesoureiro = await criarUsuario(admin, { nome: "tes", email: "tes@igreja.org", senha: "senha-forte-123", papeis: ["TESOUREIRO"] });
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "50,00" });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  saidaA = (await prisma.categoria.findMany({ where: { tipo: "SAIDA" }, orderBy: { nome: "asc" }, take: 1 }))[0];
  joao = await criarMembro(admin, { nome: "João da Silva" });
  maria = await criarMembro(admin, { nome: "Maria Souza" });
});

const lanc = (data: string, o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "100,00",
  categoriaId: oferta.id,
  contaId: caixa.id,
  dataVencimento: data,
  realizado: true,
  dataRealizacao: data,
  ...o,
});
const saida = (data: string, o: Partial<DadosLancamento> = {}) => lanc(data, { tipo: "SAIDA", categoriaId: saidaA.id, ...o });

describe("indicadores", () => {
  it("devolve 13 meses mesmo sem dados, do mais antigo ao atual", async () => {
    const r = await indicadores(tesoureiro, HOJE);
    expect(r.meses).toHaveLength(13);
    expect(r.meses[0]).toMatchObject({ ano: 2025, mes: 10, rotulo: "out/25" });
    expect(r.meses[12]).toMatchObject({ ano: 2026, mes: 10, rotulo: "out/26" });
    expect(r.meses[10].rotulo).toBe("ago/26");
    for (const m of r.meses) {
      expect(m.entradas.toString()).toBe("0");
      expect(m.saidas.toString()).toBe("0");
      expect(m.resultado.toString()).toBe("0");
      expect(m.saldoFim.toString()).toBe("150");
      expect(m.contribuintes).toBe(0);
    }
    expect(r.porCategoria).toEqual([]);
  });

  it("fronteira: 31/10 entra em outubro (TZ=UTC) e 01/11 não; saldoFim do último mês = saldoTotalEm(hoje)", async () => {
    // O dia de hoje real (27/10/2026) vem antes de 31/10: recusaria a data futura.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T15:00:00Z"));
    await criarLancamento(tesoureiro, lanc("30/09/2026", { valor: "10,00" }));
    await criarLancamento(tesoureiro, lanc("01/10/2026", { valor: "20,00" }));
    await criarLancamento(tesoureiro, lanc("27/10/2026", { valor: "30,00" }));
    await criarLancamento(tesoureiro, saida("27/10/2026", { valor: "5,50" }));
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "40,00", data: "15/10/2026" });
    const r = await indicadores(tesoureiro, HOJE);
    const set = r.meses[11];
    const out = r.meses[12];
    expect(set.entradas.toString()).toBe("10");
    expect(out.entradas.toString()).toBe("50");
    expect(out.saidas.toString()).toBe("5.5");
    expect(out.resultado.toString()).toBe("44.5");
    expect(set.saldoFim.toString()).toBe("160");
    expect(out.saldoFim.toString()).toBe("204.5");
    expect((await saldoTotalEm(prisma, HOJE)).toString()).toBe(out.saldoFim.toString());

    // com "hoje" em 31/10, o lançamento de 31/10 pertence a outubro
    await criarLancamento(tesoureiro, lanc("31/10/2026", { valor: "7,00" }));
    const r2 = await indicadores(tesoureiro, new Date(Date.UTC(2026, 9, 31)));
    expect(r2.meses[12]).toMatchObject({ ano: 2026, mes: 10 });
    expect(r2.meses[12].entradas.toString()).toBe("57");
  });

  it("limites do mês não dependem do fuso da sessão do banco (::date)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-15T15:00:00Z"));
    await criarLancamento(tesoureiro, lanc("30/09/2026", { valor: "10,00" }));
    await criarLancamento(tesoureiro, lanc("01/10/2026", { valor: "20,00" }));
    await criarLancamento(tesoureiro, lanc("31/10/2026", { valor: "30,00" }));
    await criarLancamento(tesoureiro, lanc("01/11/2026", { valor: "40,00" }));
    const banco = (await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`)[0].db;
    const fusoAntes = (await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`)[0].tz;
    try {
      for (const fuso of ["Pacific/Kiritimati", "America/Sao_Paulo", "Pacific/Pago_Pago"]) {
        // Conexões novas herdam o fuso configurado no banco.
        await prisma.$executeRawUnsafe(`ALTER DATABASE "${banco}" SET timezone TO '${fuso}'`);
        await prisma.$disconnect();
        expect((await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`)[0].tz).toBe(fuso);
        const r = await indicadores(tesoureiro, new Date(Date.UTC(2026, 9, 31)));
        expect(r.meses[11].entradas.toString(), fuso).toBe("10");
        expect(r.meses[12].entradas.toString(), fuso).toBe("50");
        expect(r.meses[12].contribuintes, fuso).toBe(0);
      }
    } finally {
      await prisma.$executeRawUnsafe(`ALTER DATABASE "${banco}" RESET timezone`);
      await prisma.$disconnect();
      expect((await prisma.$queryRaw<{ tz: string }[]>`SELECT current_setting('TimeZone') AS tz`)[0].tz).toBe(fusoAntes);
    }
  });

  it("contribuintes conta membros distintos (2 dízimos do mesmo membro = 1)", async () => {
    await criarLancamento(tesoureiro, lanc("05/10/2026", { categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, lanc("12/10/2026", { categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, lanc("13/10/2026", { categoriaId: dizimo.id, membroId: maria.id }));
    await criarLancamento(tesoureiro, lanc("14/10/2026")); // oferta anônima não conta
    const r = await indicadores(tesoureiro, HOJE);
    expect(r.meses[12].contribuintes).toBe(2);
    expect(r.meses[11].contribuintes).toBe(0);
  });

  it("variação null quando a base é zero; calculada e arredondada quando há base", async () => {
    let r = await indicadores(tesoureiro, HOJE);
    expect(r.comparativos.entradas.varAnoAnterior).toBeNull();
    expect(r.comparativos.entradas.varMedia).toBeNull();
    expect(r.comparativos.saidas.varMedia).toBeNull();

    await criarLancamento(tesoureiro, lanc("10/10/2025", { valor: "300,00" }));
    await criarLancamento(tesoureiro, lanc("10/10/2026", { valor: "400,00" }));
    for (let m = 11; m <= 12; m++) await criarLancamento(tesoureiro, lanc(`10/${m}/2025`, { valor: "100,00" }));
    r = await indicadores(tesoureiro, HOJE);
    const e = r.comparativos.entradas;
    expect(e.atual.toString()).toBe("400");
    expect(e.mesmoMesAnoAnterior.toString()).toBe("300");
    expect(e.varAnoAnterior!.toString()).toBe("33.3");
    // 12 fechados: out/25..set/26 = 300+100+100 = 500 → média 41.67 (o mês atual fica de fora)
    expect(e.media12.toString()).toBe("41.67");
    expect(e.varMedia!.toString()).toBe("860");
    expect(r.comparativos.saidas.atual.toString()).toBe("0");
  });

  it("top 5 categorias de entrada + Outras, alinhadas aos 13 meses", async () => {
    const cats: Categoria[] = [oferta, dizimo];
    for (let i = 1; i <= 5; i++) cats.push(await criarCategoria(admin, { nome: `Cat ${i}`, tipo: "ENTRADA", nominal: false }));
    // 7 categorias; valores crescentes: as duas menores viram "Outras"
    for (let i = 0; i < cats.length; i++) {
      await criarLancamento(tesoureiro, lanc("10/10/2026", { categoriaId: cats[i].id, valor: `${(i + 1) * 10},00`, ...(cats[i].nominal ? { membroId: joao.id } : {}) }));
    }
    await criarLancamento(tesoureiro, lanc("10/09/2026", { categoriaId: cats[6].id, valor: "1,00" }));
    const r = await indicadores(tesoureiro, HOJE);
    expect(r.porCategoria).toHaveLength(6);
    expect(r.porCategoria.map((c) => c.categoria).slice(0, 5)).toEqual([cats[6].nome, cats[5].nome, cats[4].nome, cats[3].nome, cats[2].nome]);
    const outras = r.porCategoria[5];
    expect(outras.categoria).toBe("Outras");
    for (const c of r.porCategoria) expect(c.valores).toHaveLength(13);
    expect(outras.valores[12].toString()).toBe("30"); // 10 + 20
    expect(r.porCategoria[0].valores[11].toString()).toBe("1");
    expect(r.porCategoria[0].valores[12].toString()).toBe("70");
  });

  it("sem 'Outras' quando há até 5 categorias", async () => {
    await criarLancamento(tesoureiro, lanc("10/10/2026"));
    const r = await indicadores(tesoureiro, HOJE);
    expect(r.porCategoria.map((c) => c.categoria)).toEqual(["Oferta"]);
  });

  it("não expõe nomes de membros e exige permissão", async () => {
    await criarLancamento(tesoureiro, lanc("10/10/2026", { categoriaId: dizimo.id, membroId: joao.id }));
    const r = await indicadores(tesoureiro, HOJE);
    const json = JSON.stringify(r);
    expect(json).not.toContain("João");
    expect(json).not.toContain("Silva");
    await expect(indicadores(null, HOJE)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});
