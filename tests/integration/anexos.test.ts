import { beforeEach, describe, expect, it } from "vitest";
import type { Lancamento } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { confirmarAnexo, prepararAnexo, urlDoAnexo } from "@/lib/services/anexos";
import { storageMemoria } from "@/lib/storage";
import { cancelarLancamento, criarLancamento } from "@/lib/services/lancamentos";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";
import { enviarAnexoTeste as anexar } from "../helpers/anexos";

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let lanc: Lancamento;

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "0",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  pastor = await criarUsuario(admin, {
    nome: "pastor",
    email: "pastor@igreja.org",
    senha: "senha-forte-123",
    papeis: ["PASTOR"],
  });
  const caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  const oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  lanc = await criarLancamento(admin, {
    tipo: "ENTRADA",
    valor: "10,00",
    categoriaId: oferta.id,
    contaId: caixa.id,
    dataVencimento: "10/03/2026",
    realizado: false,
  });
});

const pdf = (extra = 1024) => Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(extra)]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP")]);
const heic = Buffer.concat([Buffer.alloc(4), Buffer.from("ftypheic")]);

const LIMITE = 10 * 1024 * 1024;

describe("prepararAnexo", () => {
  it("devolve chave na pasta do lançamento e URL de envio", async () => {
    const st = storageMemoria();
    const r = await prepararAnexo(admin, lanc.id, { nome: "nota.pdf", mime: "application/pdf", tamanho: 1000 }, st);
    expect(r.chave).toMatch(new RegExp(`^anexos/${lanc.id}/[0-9a-f-]{36}-nota\\.pdf$`));
    expect(r.url).toBe(`memoria-put://${r.chave}`);
    expect(st.arquivos.size).toBe(0);
    expect(await prisma.anexo.count()).toBe(0);
  });

  it("recusa tipos fora da lista, inclusive nomes de propriedades herdadas", async () => {
    const st = storageMemoria();
    for (const mime of ["application/x-msdownload", "text/html", "toString", "constructor", "__proto__", "hasOwnProperty"]) {
      await expect(prepararAnexo(admin, lanc.id, { nome: "a", mime, tamanho: 10 }, st)).rejects.toThrow("Tipo de arquivo não permitido");
    }
  });

  it("recusa tamanho acima de 10 MB, zero, negativo ou não inteiro; aceita 10 MB exatos", async () => {
    const st = storageMemoria();
    for (const tamanho of [LIMITE + 1, 0, -1, 1.5, Number.NaN, Infinity]) {
      await expect(prepararAnexo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", tamanho }, st)).rejects.toThrow("Arquivo maior que 10 MB");
    }
    await prepararAnexo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", tamanho: LIMITE }, st);
  });

  it("recusa dados malformados", async () => {
    const st = storageMemoria();
    await expect(
      prepararAnexo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", tamanho: "10" as never }, st),
    ).rejects.toBeInstanceOf(Validacao);
  });

  it("Pastor e sem sessão não preparam", async () => {
    const st = storageMemoria();
    const a = { nome: "a.pdf", mime: "application/pdf", tamanho: 10 };
    await expect(prepararAnexo(pastor, lanc.id, a, st)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(prepararAnexo(null, lanc.id, a, st)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("recusa lançamento inexistente e cancelado", async () => {
    const st = storageMemoria();
    const a = { nome: "a.pdf", mime: "application/pdf", tamanho: 10 };
    await expect(prepararAnexo(admin, "nao-existe", a, st)).rejects.toThrow(new NaoEncontrado("Lançamento não encontrado"));
    await cancelarLancamento(admin, lanc.id, "erro");
    await expect(prepararAnexo(admin, lanc.id, a, st)).rejects.toThrow(
      new RegraDeNegocio("Lançamento cancelado não pode ser alterado"),
    );
  });

  it("sanitiza o nome na chave", async () => {
    const st = storageMemoria();
    const p = (nome: string) => prepararAnexo(admin, lanc.id, { nome, mime: "application/pdf", tamanho: 10 }, st);
    const a = await p("../../x.pdf");
    expect(a.chave).not.toContain("..");
    expect(a.chave.startsWith(`anexos/${lanc.id}/`)).toBe(true);
    expect(a.chave.endsWith("-x.pdf")).toBe(true);
    const b = await p("Recibo  do mês çã!.pdf");
    expect(b.chave).toMatch(/^anexos\/[^/]+\/[a-zA-Z0-9._-]+$/);
    expect((await p("///")).chave.endsWith("-arquivo")).toBe(true);
  });
});

describe("confirmarAnexo", () => {
  it("caminho feliz: grava anexo, log ANEXOU e métrica com o tamanho e tipo do storage", async () => {
    const st = storageMemoria();
    const a = await anexar(admin, lanc.id, { nome: "nota.pdf", mime: "application/pdf", dados: pdf() }, st);
    expect(a).toMatchObject({ nomeArquivo: "nota.pdf", tamanho: pdf().length, mimeType: "application/pdf", enviadoPorId: admin.id });
    expect(a.url).toMatch(new RegExp(`^anexos/${lanc.id}/.+-nota\\.pdf$`));
    expect(st.arquivos.get(a.url)?.dados.length).toBe(pdf().length);
    const log = await prisma.log.findFirstOrThrow({ where: { entidadeId: lanc.id, acao: "ANEXOU" } });
    expect(log).toMatchObject({ entidade: "Lancamento", valorNovo: "nota.pdf", usuarioId: admin.id });
    expect(await prisma.eventoUso.findFirstOrThrow({ where: { evento: "anexo_enviado" } })).toMatchObject({
      propriedades: { tipo: "pdf" },
    });
  });

  it("aceita PNG, JPEG, WEBP e HEIC com cabeçalhos válidos; mantém o nome original", async () => {
    const st = storageMemoria();
    for (const [mime, dados] of [
      ["image/png", png],
      ["image/jpeg", jpeg],
      ["image/webp", webp],
      ["image/heic", heic],
    ] as const) {
      await anexar(admin, lanc.id, { nome: "../f", mime, dados }, st);
    }
    expect(await prisma.anexo.count()).toBe(4);
    expect((await prisma.anexo.findFirstOrThrow()).nomeArquivo).toBe("../f");
  });

  it("assinatura errada: apaga o objeto e recusa", async () => {
    const st = storageMemoria();
    for (const [mime, dados] of [
      ["application/pdf", Buffer.from("<html><script>")],
      ["image/png", jpeg],
      ["image/heic", png],
    ] as const) {
      const { chave } = await prepararAnexo(admin, lanc.id, { nome: "x", mime, tamanho: dados.length }, st);
      st.receberEnvio(chave, dados, mime);
      await expect(confirmarAnexo(admin, lanc.id, chave, "x", st)).rejects.toThrow("Tipo de arquivo não permitido");
      expect(st.arquivos.has(chave)).toBe(false);
    }
    expect(await prisma.anexo.count()).toBe(0);
    expect(await prisma.log.count({ where: { acao: "ANEXOU" } })).toBe(0);
  });

  it("tamanho real acima de 10 MB (pelo HEAD): apaga e recusa", async () => {
    const st = storageMemoria();
    const chave = `anexos/${lanc.id}/abc-g.pdf`;
    st.arquivos.set(chave, { dados: Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(LIMITE - 3)]), mime: "application/pdf" });
    await expect(confirmarAnexo(admin, lanc.id, chave, "g.pdf", st)).rejects.toThrow("Arquivo maior que 10 MB");
    expect(st.arquivos.has(chave)).toBe(false);
    expect(await prisma.anexo.count()).toBe(0);
  });

  it("tipo gravado fora da lista: apaga e recusa", async () => {
    const st = storageMemoria();
    const chave = `anexos/${lanc.id}/abc-x.html`;
    st.arquivos.set(chave, { dados: pdf(), mime: "text/html" });
    await expect(confirmarAnexo(admin, lanc.id, chave, "x", st)).rejects.toBeInstanceOf(Validacao);
    expect(st.arquivos.has(chave)).toBe(false);
  });

  it("arquivo que não chegou ao storage: recusa sem gravar", async () => {
    const st = storageMemoria();
    const { chave } = await prepararAnexo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", tamanho: 10 }, st);
    await expect(confirmarAnexo(admin, lanc.id, chave, "a.pdf", st)).rejects.toThrow("Arquivo não recebido. Envie de novo.");
    expect(await prisma.anexo.count()).toBe(0);
  });

  it("chave de outro lançamento ou forjada: recusa sem apagar o objeto alheio", async () => {
    const st = storageMemoria();
    const outro = await anexar(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st);
    const caixa = await prisma.conta.findFirstOrThrow();
    const oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta" } });
    const lanc2 = await criarLancamento(admin, {
      tipo: "ENTRADA", valor: "5,00", categoriaId: oferta.id, contaId: caixa.id, dataVencimento: "10/03/2026", realizado: false,
    });
    for (const chave of [outro.url, `anexos/${lanc2.id}/../${lanc.id}/x`, `anexos/${lanc2.id}`, "x"]) {
      await expect(confirmarAnexo(admin, lanc2.id, chave, "a.pdf", st)).rejects.toThrow("Envio de arquivo inválido");
    }
    expect(st.arquivos.has(outro.url)).toBe(true);
    expect(await prisma.anexo.count()).toBe(1);
  });

  it("confirmação repetida não duplica nem apaga o arquivo já anexado", async () => {
    const st = storageMemoria();
    const a = await anexar(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st);
    await expect(confirmarAnexo(admin, lanc.id, a.url, "a.pdf", st)).rejects.toThrow("Este arquivo já foi anexado");
    expect(st.arquivos.has(a.url)).toBe(true);
    expect(await prisma.anexo.count()).toBe(1);
  });

  it("lançamento cancelado entre preparar e confirmar: apaga e recusa", async () => {
    const st = storageMemoria();
    const { chave } = await prepararAnexo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", tamanho: pdf().length }, st);
    st.receberEnvio(chave, pdf(), "application/pdf");
    await cancelarLancamento(admin, lanc.id, "erro");
    await expect(confirmarAnexo(admin, lanc.id, chave, "a.pdf", st)).rejects.toBeInstanceOf(RegraDeNegocio);
    expect(st.arquivos.has(chave)).toBe(false);
  });

  it("Pastor e sem sessão não confirmam", async () => {
    const st = storageMemoria();
    const chave = `anexos/${lanc.id}/abc-a.pdf`;
    await expect(confirmarAnexo(pastor, lanc.id, chave, "a", st)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(confirmarAnexo(null, lanc.id, chave, "a", st)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("storage em memória (simula a URL assinada)", () => {
  it("só aceita o PUT autorizado, com o mesmo tipo e tamanho", async () => {
    const st = storageMemoria();
    expect(() => st.receberEnvio("anexos/x/y", pdf(), "application/pdf")).toThrow();
    await st.urlEnvio("anexos/x/y", "application/pdf", 10, 300);
    expect(() => st.receberEnvio("anexos/x/y", pdf(), "application/pdf")).toThrow();
    expect(() => st.receberEnvio("anexos/x/y", Buffer.alloc(10), "image/png")).toThrow();
    st.receberEnvio("anexos/x/y", Buffer.alloc(10), "application/pdf");
    expect(await st.inspecionar("anexos/x/y")).toEqual({ tamanho: 10, mime: "application/pdf" });
    expect((await st.lerInicio("anexos/x/y", 4)).length).toBe(4);
    await st.remover("anexos/x/y");
    expect(await st.inspecionar("anexos/x/y")).toBeNull();
  });
});

describe("urlDoAnexo", () => {
  it("Pastor obtém URL válida por 300 s", async () => {
    const st = storageMemoria();
    const a = await anexar(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st);
    const url = await urlDoAnexo(pastor, a.id, st);
    expect(url).toBe(`memoria://${a.url}?expira=300`);
  });

  it("exige sessão e anexo existente", async () => {
    const st = storageMemoria();
    await expect(urlDoAnexo(null, "x", st)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(urlDoAnexo(pastor, "x", st)).rejects.toThrow(new NaoEncontrado("Anexo não encontrado"));
  });
});
