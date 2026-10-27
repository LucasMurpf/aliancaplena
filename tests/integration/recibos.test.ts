import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio } from "@/lib/erros";
import { dadosRecibo, emitirRecibo } from "@/lib/services/recibos";
import {
  MSG_RECIBO_EMITIDO,
  cancelarLancamento,
  criarLancamento,
  editarLancamento,
  type DadosLancamento,
} from "@/lib/services/lancamentos";
import { criarConta } from "@/lib/services/cadastros";
import { criarMembro, definirMembroAtivo } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

// Nenhum papel tem `financeiro.lancar` sem `membros.ver_nomes`; este interruptor retira só
// `membros.ver_nomes` para provar que a segunda exigência existe.
const sem = vi.hoisted(() => ({ verNomes: false }));
vi.mock("@/lib/permissoes", async (importar) => {
  const real = await importar<typeof import("@/lib/permissoes")>();
  return {
    ...real,
    pode: (papeis: Parameters<typeof real.pode>[0], p: Parameters<typeof real.pode>[1]) =>
      sem.verNomes && p === "membros.ver_nomes" ? false : real.pode(papeis, p),
  };
});

const MSG_NAO_NOMINAL = "Recibo disponível apenas para contribuições nominais realizadas";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let dizimo: Categoria;
let oferta: Categoria;
let joao: Membro;

beforeEach(async () => {
  sem.verNomes = false;
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
  pastor = await mk("pastor", ["PASTOR"]);
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  eventos = await mk("eventos", ["EVENTOS"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  joao = await criarMembro(admin, { nome: "João da Silva" });
});

const lanc = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "150,00",
  categoriaId: dizimo.id,
  contaId: caixa.id,
  membroId: joao.id,
  dataVencimento: "10/03/2026",
  realizado: true,
  dataRealizacao: "10/03/2026",
  ...o,
});

const logsRecibo = (lancamentoId: string) =>
  prisma.log.findMany({ where: { entidade: "Lancamento", entidadeId: lancamentoId, acao: "EMITIU_RECIBO" }, orderBy: [{ dataHora: "asc" }, { id: "asc" }] });

describe("emitirRecibo", () => {
  it("primeiro recibo do ano é 2026/000001 e o segundo 2026/000002", async () => {
    const a = await criarLancamento(tesoureiro, lanc());
    const b = await criarLancamento(tesoureiro, lanc({ valor: "10,00" }));
    const ra = await emitirRecibo(tesoureiro, a.id);
    const rb = await emitirRecibo(tesoureiro, b.id);
    expect(ra.numeroFormatado).toBe("2026/000001");
    expect(rb.numeroFormatado).toBe("2026/000002");
    expect(await prisma.sequenciaRecibo.findUnique({ where: { ano: 2026 } })).toEqual({ ano: 2026, ultimo: 2 });
  });

  it("ano novo reinicia a numeração (ano da data de realização)", async () => {
    const a = await criarLancamento(tesoureiro, lanc());
    const b = await criarLancamento(tesoureiro, lanc({ dataVencimento: "31/12/2025", dataRealizacao: "31/12/2025" }));
    const c = await criarLancamento(tesoureiro, lanc({ dataVencimento: "15/12/2025", dataRealizacao: "15/12/2025" }));
    expect((await emitirRecibo(tesoureiro, a.id)).numeroFormatado).toBe("2026/000001");
    expect((await emitirRecibo(tesoureiro, b.id)).numeroFormatado).toBe("2025/000001");
    expect((await emitirRecibo(tesoureiro, c.id)).numeroFormatado).toBe("2025/000002");
  });

  it("devolve todos os dados do recibo, com valor e data por extenso", async () => {
    await prisma.configuracao.updateMany({ data: { cnpj: "12.345.678/0001-90", logoUrl: "https://ex.org/logo.png", cidade: "Colombo" } });
    const l = await criarLancamento(tesoureiro, lanc({ dataVencimento: "27/10/2026", dataRealizacao: "27/10/2026" }));
    const r = await emitirRecibo(tesoureiro, l.id);
    const hash = createHash("sha256").update(`2026/1:${l.id}`).digest("hex").slice(0, 8);
    expect(r).toEqual({
      numeroFormatado: "2026/000001",
      codigoVerificacao: hash,
      igreja: { nome: "Igreja Aliança", cnpj: "12.345.678/0001-90", logoUrl: "https://ex.org/logo.png", cidade: "Colombo" },
      membro: "João da Silva",
      valor: "R$ 150,00",
      valorExtenso: "cento e cinquenta reais",
      categoria: "Dízimo",
      dataRealizacao: "27/10/2026",
      dataPorExtenso: "27 de outubro de 2026",
      emitidoPor: "tes",
      cancelado: false,
    });
    expect(r.codigoVerificacao).toMatch(/^[0-9a-f]{8}$/);
  });

  it("logo só se for URL http/https; sem CNPJ e cidade → null", async () => {
    await prisma.configuracao.updateMany({ data: { logoUrl: "/uploads/logo.png", cnpj: null, cidade: null } });
    const l = await criarLancamento(tesoureiro, lanc());
    const r = await emitirRecibo(tesoureiro, l.id);
    expect(r.igreja).toEqual({ nome: "Igreja Aliança", cnpj: null, logoUrl: null, cidade: null });
  });

  it("mesmo lançamento duas vezes → mesmo número e dois logs (o segundo é Reemissão)", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    const r1 = await emitirRecibo(tesoureiro, l.id);
    const r2 = await emitirRecibo(admin, l.id);
    expect(r2.numeroFormatado).toBe(r1.numeroFormatado);
    expect(r2.codigoVerificacao).toBe(r1.codigoVerificacao);
    // Quem emitiu é quem fez a primeira emissão.
    expect(r2.emitidoPor).toBe("tes");
    expect(await prisma.recibo.count()).toBe(1);
    const logs = await logsRecibo(l.id);
    expect(logs.map((x) => [x.usuarioId, x.valorNovo])).toEqual([
      [tesoureiro.id, "2026/000001"],
      [admin.id, "Reemissão"],
    ]);
    expect(await prisma.sequenciaRecibo.findUnique({ where: { ano: 2026 } })).toEqual({ ano: 2026, ultimo: 1 });
  });

  it("10 emissões simultâneas em 10 lançamentos → números 1..10 sem repetição", async () => {
    const ls = [];
    for (let i = 0; i < 10; i++) ls.push(await criarLancamento(tesoureiro, lanc({ valor: `${i + 1},00` })));
    const rs = await Promise.all(ls.map((l) => emitirRecibo(tesoureiro, l.id)));
    const numeros = rs.map((r) => r.numeroFormatado).sort();
    expect(numeros).toEqual(Array.from({ length: 10 }, (_, i) => `2026/${String(i + 1).padStart(6, "0")}`));
    expect(await prisma.sequenciaRecibo.findUnique({ where: { ano: 2026 } })).toEqual({ ano: 2026, ultimo: 10 });
  });

  it("primeiras emissões simultâneas do MESMO lançamento → um só recibo", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    const rs = await Promise.all(Array.from({ length: 5 }, () => emitirRecibo(tesoureiro, l.id)));
    expect(new Set(rs.map((r) => r.numeroFormatado))).toEqual(new Set(["2026/000001"]));
    expect(await prisma.recibo.count()).toBe(1);
    const logs = await logsRecibo(l.id);
    expect(logs).toHaveLength(5);
    expect(logs.filter((x) => x.valorNovo === "2026/000001")).toHaveLength(1);
  });

  it("categoria não nominal → RegraDeNegocio", async () => {
    const l = await criarLancamento(tesoureiro, lanc({ categoriaId: oferta.id, membroId: undefined }));
    const p = emitirRecibo(tesoureiro, l.id);
    await expect(p).rejects.toBeInstanceOf(RegraDeNegocio);
    await expect(emitirRecibo(tesoureiro, l.id)).rejects.toThrow(MSG_NAO_NOMINAL);
    expect(await prisma.recibo.count()).toBe(0);
  });

  it("lançamento previsto → RegraDeNegocio", async () => {
    const l = await criarLancamento(tesoureiro, lanc({ realizado: false, dataRealizacao: undefined }));
    await expect(emitirRecibo(tesoureiro, l.id)).rejects.toThrow(MSG_NAO_NOMINAL);
    await expect(emitirRecibo(tesoureiro, l.id)).rejects.toBeInstanceOf(RegraDeNegocio);
  });

  it("lançamento cancelado → RegraDeNegocio (não emite pela primeira vez)", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await cancelarLancamento(tesoureiro, l.id, "erro de digitação");
    await expect(emitirRecibo(tesoureiro, l.id)).rejects.toThrow(MSG_NAO_NOMINAL);
  });

  it("lançamento inexistente → NaoEncontrado", async () => {
    await expect(emitirRecibo(tesoureiro, "nao-existe")).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("membro inativo ainda recebe recibo de contribuição passada", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await definirMembroAtivo(admin, joao.id, false);
    const r = await emitirRecibo(tesoureiro, l.id);
    expect(r.membro).toBe("João da Silva");
  });

  it("permissões: exige financeiro.lancar e membros.ver_nomes", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await expect(emitirRecibo(null, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(emitirRecibo(eventos, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(emitirRecibo(pastor, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    sem.verNomes = true;
    await expect(emitirRecibo(tesoureiro, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    expect(await prisma.recibo.count()).toBe(0);
  });
});

describe("dadosRecibo", () => {
  it("lê o recibo já emitido sem gerar log", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    const emitido = await emitirRecibo(tesoureiro, l.id);
    expect(await dadosRecibo(admin, l.id)).toEqual(emitido);
    expect(await logsRecibo(l.id)).toHaveLength(1);
  });

  it("sem recibo emitido → NaoEncontrado", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await expect(dadosRecibo(tesoureiro, l.id)).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("cancelar depois da emissão → cancelado: true (e reemitir continua devolvendo o mesmo número)", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await emitirRecibo(tesoureiro, l.id);
    await cancelarLancamento(tesoureiro, l.id, "devolvido");
    const r = await dadosRecibo(tesoureiro, l.id);
    expect(r.cancelado).toBe(true);
    expect(r.numeroFormatado).toBe("2026/000001");
    const re = await emitirRecibo(tesoureiro, l.id);
    expect(re.cancelado).toBe(true);
    expect(re.numeroFormatado).toBe("2026/000001");
  });

  it("permissões: exige financeiro.lancar e membros.ver_nomes", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await emitirRecibo(tesoureiro, l.id);
    await expect(dadosRecibo(pastor, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(dadosRecibo(eventos, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    sem.verNomes = true;
    await expect(dadosRecibo(tesoureiro, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("edição de lançamento com recibo emitido", () => {
  const erro = async (p: Promise<unknown>) => {
    const e = await p.then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(RegraDeNegocio);
    const r = e as RegraDeNegocio;
    expect(r.message).toBe(MSG_RECIBO_EMITIDO);
    return { campo: r.campo, regra: r.regra };
  };

  it("recusa mudar valor, tipo/categoria, membro, data de realização ou voltar a previsto", async () => {
    const maria = await criarMembro(admin, { nome: "Maria" });
    const l = await criarLancamento(tesoureiro, lanc());
    const antes = await emitirRecibo(tesoureiro, l.id);

    expect(await erro(editarLancamento(tesoureiro, l.id, lanc({ valor: "200,00" })))).toEqual({ campo: "valor", regra: "recibo_emitido" });
    expect(await erro(editarLancamento(tesoureiro, l.id, lanc({ membroId: maria.id })))).toEqual({ campo: "membro", regra: "recibo_emitido" });
    expect(await erro(editarLancamento(tesoureiro, l.id, lanc({ categoriaId: oferta.id, membroId: null })))).toEqual({
      campo: "categoria",
      regra: "recibo_emitido",
    });
    expect(await erro(editarLancamento(tesoureiro, l.id, lanc({ dataRealizacao: "11/03/2026" })))).toEqual({
      campo: "dataRealizacao",
      regra: "recibo_emitido",
    });
    expect(await erro(editarLancamento(tesoureiro, l.id, lanc({ realizado: false, dataRealizacao: undefined })))).toEqual({
      campo: "realizado",
      regra: "recibo_emitido",
    });
    expect(await dadosRecibo(tesoureiro, l.id)).toEqual(antes);
  });

  it("permite mudar descrição, conta e vencimento; o recibo não muda", async () => {
    const banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0" });
    const l = await criarLancamento(tesoureiro, lanc());
    const antes = await emitirRecibo(tesoureiro, l.id);
    const salvo = await editarLancamento(
      tesoureiro,
      l.id,
      lanc({ descricao: "Dízimo de março", contaId: banco.id, dataVencimento: "05/03/2026", dataRealizacao: undefined }),
    );
    expect(salvo.descricao).toBe("Dízimo de março");
    expect(salvo.contaId).toBe(banco.id);
    expect(await dadosRecibo(tesoureiro, l.id)).toEqual(antes);
  });

  it("sem recibo, a edição continua livre", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    const salvo = await editarLancamento(tesoureiro, l.id, lanc({ valor: "200,00" }));
    expect(salvo.valor.toFixed(2)).toBe("200.00");
  });

  it("cancelar depois da emissão continua permitido", async () => {
    const l = await criarLancamento(tesoureiro, lanc());
    await emitirRecibo(tesoureiro, l.id);
    await cancelarLancamento(tesoureiro, l.id, "lançado em duplicidade");
    expect((await dadosRecibo(tesoureiro, l.id)).cancelado).toBe(true);
  });
});
