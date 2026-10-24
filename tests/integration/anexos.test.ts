import { beforeEach, describe, expect, it } from "vitest";
import type { Lancamento } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { anexarArquivo, urlDoAnexo } from "@/lib/services/anexos";
import { storageMemoria } from "@/lib/storage";
import { cancelarLancamento, criarLancamento } from "@/lib/services/lancamentos";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

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

describe("anexarArquivo", () => {
  it("aceita PDF de 1 KB, grava no storage, no banco e no log", async () => {
    const st = storageMemoria();
    const a = await anexarArquivo(admin, lanc.id, { nome: "nota.pdf", mime: "application/pdf", dados: pdf() }, st);
    expect(a.nomeArquivo).toBe("nota.pdf");
    expect(a.tamanho).toBe(pdf().length);
    expect(a.url).toMatch(new RegExp(`^anexos/${lanc.id}/.+-nota\\.pdf$`));
    expect(st.arquivos.get(a.url)?.length).toBe(pdf().length);
    const log = await prisma.log.findFirstOrThrow({ where: { entidadeId: lanc.id, acao: "ANEXOU" } });
    expect(log.entidade).toBe("Lancamento");
    expect(log.valorNovo).toBe("nota.pdf");
  });

  it("aceita PNG, JPEG, WEBP e HEIC com cabeçalhos válidos", async () => {
    const st = storageMemoria();
    for (const [mime, dados] of [
      ["image/png", png],
      ["image/jpeg", jpeg],
      ["image/webp", webp],
      ["image/heic", heic],
    ] as const) {
      await anexarArquivo(admin, lanc.id, { nome: "f", mime, dados }, st);
    }
    expect(st.arquivos.size).toBe(4);
  });

  it("recusa tipos não permitidos", async () => {
    const st = storageMemoria();
    for (const [nome, mime] of [["a.exe", "application/x-msdownload"], ["a.html", "text/html"]]) {
      await expect(anexarArquivo(admin, lanc.id, { nome, mime, dados: pdf() }, st)).rejects.toThrow(
        new Validacao("Tipo de arquivo não permitido"),
      );
    }
    expect(st.arquivos.size).toBe(0);
  });

  it("recusa MIME com nome de propriedade herdada", async () => {
    const st = storageMemoria();
    for (const mime of ["toString", "constructor", "__proto__", "valueOf", "hasOwnProperty"]) {
      await expect(anexarArquivo(admin, lanc.id, { nome: "a.pdf", mime, dados: pdf() }, st)).rejects.toThrow(
        new Validacao("Tipo de arquivo não permitido"),
      );
    }
    expect(st.arquivos.size).toBe(0);
    expect(await prisma.anexo.count()).toBe(0);
  });

  it("recusa conteúdo que não bate com o tipo declarado", async () => {
    const st = storageMemoria();
    await expect(
      anexarArquivo(admin, lanc.id, { nome: "x.pdf", mime: "application/pdf", dados: Buffer.from("<html>") }, st),
    ).rejects.toBeInstanceOf(Validacao);
    await expect(
      anexarArquivo(admin, lanc.id, { nome: "x.png", mime: "image/png", dados: jpeg }, st),
    ).rejects.toBeInstanceOf(Validacao);
    await expect(
      anexarArquivo(admin, lanc.id, { nome: "x.heic", mime: "image/heic", dados: png }, st),
    ).rejects.toBeInstanceOf(Validacao);
    expect(await prisma.anexo.count()).toBe(0);
  });

  it("recusa arquivo com 10 MB + 1 byte, aceita 10 MB exatos", async () => {
    const st = storageMemoria();
    const limite = 10 * 1024 * 1024;
    const grande = Buffer.concat([Buffer.from("%PDF"), Buffer.alloc(limite - 3)]);
    expect(grande.length).toBe(limite + 1);
    await expect(
      anexarArquivo(admin, lanc.id, { nome: "g.pdf", mime: "application/pdf", dados: grande }, st),
    ).rejects.toThrow(new Validacao("Arquivo maior que 10 MB"));
    const ok = grande.subarray(0, limite);
    await anexarArquivo(admin, lanc.id, { nome: "g.pdf", mime: "application/pdf", dados: ok }, st);
  });

  it("sanitiza o nome na chave, mantendo o nome original no banco", async () => {
    const st = storageMemoria();
    const a = await anexarArquivo(admin, lanc.id, { nome: "../../x.pdf", mime: "application/pdf", dados: pdf() }, st);
    expect(a.url).not.toContain("..");
    expect(a.url.startsWith(`anexos/${lanc.id}/`)).toBe(true);
    expect(a.url.endsWith("-x.pdf")).toBe(true);
    expect(a.nomeArquivo).toBe("../../x.pdf");
    const b = await anexarArquivo(admin, lanc.id, { nome: "Recibo  do mês çã!.pdf", mime: "application/pdf", dados: pdf() }, st);
    expect(b.url).toMatch(/^anexos\/[^/]+\/[^/]+$/);
    expect(b.url).toMatch(/^[a-zA-Z0-9._/-]+$/);
    const c = await anexarArquivo(admin, lanc.id, { nome: "///", mime: "application/pdf", dados: pdf() }, st);
    expect(c.url.endsWith("-arquivo")).toBe(true);
  });

  it("Pastor não anexa; sem sessão não anexa", async () => {
    const st = storageMemoria();
    await expect(
      anexarArquivo(pastor, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st),
    ).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(
      anexarArquivo(null, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st),
    ).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("recusa lançamento inexistente e cancelado, sem gravar nada", async () => {
    const st = storageMemoria();
    await expect(
      anexarArquivo(admin, "nao-existe", { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st),
    ).rejects.toThrow(new NaoEncontrado("Lançamento não encontrado"));
    await cancelarLancamento(admin, lanc.id, "erro");
    await expect(
      anexarArquivo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st),
    ).rejects.toThrow(new RegraDeNegocio("Lançamento cancelado não pode ser alterado"));
    expect(st.arquivos.size).toBe(0);
    expect(await prisma.anexo.count()).toBe(0);
  });
});

describe("urlDoAnexo", () => {
  it("Pastor obtém URL válida por 300 s", async () => {
    const st = storageMemoria();
    const a = await anexarArquivo(admin, lanc.id, { nome: "a.pdf", mime: "application/pdf", dados: pdf() }, st);
    const url = await urlDoAnexo(pastor, a.id, st);
    expect(url).toBe(`memoria://${a.url}?expira=300`);
  });

  it("exige sessão e anexo existente", async () => {
    const st = storageMemoria();
    await expect(urlDoAnexo(null, "x", st)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(urlDoAnexo(pastor, "x", st)).rejects.toThrow(new NaoEncontrado("Anexo não encontrado"));
  });
});
