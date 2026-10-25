import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import {
  atualizarCategoria,
  atualizarConta,
  atualizarMembro,
  buscarMembros,
  criarCategoria,
  criarConta,
  criarMembro,
  definirCategoriaAtiva,
  definirContaAtiva,
  definirMembroAtivo,
  listarCategorias,
  listarContas,
  listarMembros,
  obterMembro,
} from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;

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
  const mk = (nome: string, papel: "PASTOR" | "TESOUREIRO" | "EVENTOS") =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis: [papel] });
  pastor = await mk("pastor", "PASTOR");
  tesoureiro = await mk("tes", "TESOUREIRO");
  eventos = await mk("eventos", "EVENTOS");
});

const logs = (entidadeId: string) => prisma.log.findMany({ where: { entidadeId }, orderBy: [{ dataHora: "asc" }, { id: "asc" }] });

describe("contas", () => {
  it("tesoureiro cria conta com saldo zero e loga", async () => {
    const c = await criarConta(tesoureiro, { nome: "Banco X", tipo: "BANCO", saldoInicial: "0" });
    expect(c.saldoInicial.toFixed(2)).toBe("0.00");
    const l = await logs(c.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ acao: "CRIOU", entidade: "Conta", usuarioId: tesoureiro.id });
  });

  it("pastor não cria conta", async () => {
    await expect(criarConta(pastor, { nome: "X", tipo: "CAIXA", saldoInicial: "1" })).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("valida nome e saldo", async () => {
    await expect(criarConta(admin, { nome: " ", tipo: "CAIXA", saldoInicial: "1" })).rejects.toBeInstanceOf(Validacao);
    await expect(criarConta(admin, { nome: "A", tipo: "CAIXA", saldoInicial: "-1" })).rejects.toBeInstanceOf(Validacao);
    await expect(criarConta(admin, { nome: "A", tipo: "XX" as never, saldoInicial: "1" })).rejects.toBeInstanceOf(Validacao);
  });

  it("lista exige financeiro.ver e esconde inativas por padrão", async () => {
    const c = await criarConta(admin, { nome: "Velha", tipo: "BANCO", saldoInicial: "10" });
    await definirContaAtiva(admin, c.id, false);
    expect((await listarContas(pastor)).map((x) => x.nome)).toEqual(["Caixa"]);
    expect((await listarContas(pastor, { incluirInativas: true })).map((x) => x.nome).sort()).toEqual(["Caixa", "Velha"]);
    await expect(listarContas(eventos)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("atualiza com log legível por campo e ignora o que não mudou", async () => {
    const c = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "1.000,00" });
    await atualizarConta(admin, c.id, { nome: "Banco", saldoInicial: "1.234,50" });
    const l = (await logs(c.id)).filter((x) => x.acao === "ALTEROU");
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ campo: "saldoInicial", valorAnterior: "R$ 1.000,00", valorNovo: "R$ 1.234,50" });
    await atualizarConta(admin, c.id, { tipo: "CAIXA" });
    const l2 = (await logs(c.id)).filter((x) => x.campo === "tipo");
    expect(l2[0]).toMatchObject({ valorAnterior: "BANCO", valorNovo: "CAIXA" });
  });

  it("inativar/reativar loga; repetir é no-op", async () => {
    const c = await criarConta(admin, { nome: "B", tipo: "BANCO", saldoInicial: "1" });
    await definirContaAtiva(admin, c.id, true);
    await definirContaAtiva(admin, c.id, false);
    await definirContaAtiva(admin, c.id, false);
    await definirContaAtiva(admin, c.id, true);
    expect((await logs(c.id)).map((x) => x.acao)).toEqual(["CRIOU", "INATIVOU", "REATIVOU"]);
  });

  it("não encontrado", async () => {
    await expect(atualizarConta(admin, "x", { nome: "A" })).rejects.toThrow("Conta não encontrada");
    await expect(definirContaAtiva(admin, "x", false)).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("categorias", () => {
  it("cria e loga; duplicada (nome+tipo) é Validacao; mesmo nome em outro tipo ok", async () => {
    const c = await criarCategoria(admin, { nome: "Outros X", tipo: "ENTRADA", nominal: true });
    expect((await logs(c.id))[0].acao).toBe("CRIOU");
    await expect(criarCategoria(admin, { nome: "Outros X", tipo: "ENTRADA", nominal: false })).rejects.toThrow("Categoria já existe");
    await expect(criarCategoria(admin, { nome: "Outros X", tipo: "SAIDA", nominal: false })).resolves.toBeTruthy();
  });

  it("pastor não cria", async () => {
    await expect(criarCategoria(pastor, { nome: "Z", tipo: "SAIDA", nominal: false })).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("tipo não pode mudar", async () => {
    const c = await criarCategoria(admin, { nome: "Z", tipo: "SAIDA", nominal: false });
    await expect(atualizarCategoria(admin, c.id, { tipo: "ENTRADA" } as never)).rejects.toBeInstanceOf(RegraDeNegocio);
    // mesmo tipo informado não é mudança
    await expect(atualizarCategoria(admin, c.id, { tipo: "SAIDA" } as never)).resolves.toBeUndefined();
  });

  it("renomear para duplicada é Validacao; nominal logado como Sim/Não", async () => {
    await criarCategoria(admin, { nome: "A", tipo: "SAIDA", nominal: false });
    const b = await criarCategoria(admin, { nome: "B", tipo: "SAIDA", nominal: false });
    await expect(atualizarCategoria(admin, b.id, { nome: "A" })).rejects.toThrow("Categoria já existe");
    await atualizarCategoria(admin, b.id, { nominal: true });
    const l = (await logs(b.id)).find((x) => x.campo === "nominal");
    expect(l).toMatchObject({ valorAnterior: "Não", valorNovo: "Sim" });
  });

  it("lista filtra por tipo e ativas; ativa/inativa", async () => {
    const c = await criarCategoria(admin, { nome: "Zed", tipo: "SAIDA", nominal: false });
    await definirCategoriaAtiva(admin, c.id, false);
    await definirCategoriaAtiva(admin, c.id, false);
    expect((await listarCategorias(tesoureiro, { tipo: "SAIDA" })).map((x) => x.nome)).not.toContain("Zed");
    const todas = await listarCategorias(tesoureiro, { tipo: "SAIDA", incluirInativas: true });
    expect(todas.map((x) => x.nome)).toContain("Zed");
    expect(todas.every((x) => x.tipo === "SAIDA")).toBe(true);
    expect((await logs(c.id)).map((x) => x.acao)).toEqual(["CRIOU", "INATIVOU"]);
    await expect(listarCategorias(eventos)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(definirCategoriaAtiva(admin, "x", true)).rejects.toThrow("Categoria não encontrada");
  });
});

describe("obterMembro", () => {
  it("devolve o membro a quem vê nomes", async () => {
    const m = await criarMembro(tesoureiro, { nome: "Maria" });
    expect(await obterMembro(tesoureiro, m.id)).toMatchObject({ id: m.id, nome: "Maria" });
  });
  it("recusa quem não tem membros.ver_nomes", async () => {
    const m = await criarMembro(tesoureiro, { nome: "Maria" });
    await expect(obterMembro(eventos, m.id)).rejects.toBeInstanceOf(NaoAutorizado);
  });
  it("id desconhecido → NaoEncontrado", async () => {
    await expect(obterMembro(tesoureiro, "nao-existe")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("membros", () => {
  it("pastor cria membro; log com data legível", async () => {
    const m = await criarMembro(pastor, { nome: "  João Silva ", telefone: "4199", dataNascimento: "05/03/1980" });
    expect(m.nome).toBe("João Silva");
    expect(m.dataNascimento?.toISOString()).toBe("1980-03-05T00:00:00.000Z");
    expect((await logs(m.id))[0]).toMatchObject({ acao: "CRIOU", entidade: "Membro" });
  });

  it("eventos não cria nem busca", async () => {
    await expect(criarMembro(eventos, { nome: "A" })).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(buscarMembros(eventos, "a")).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("valida nome e data", async () => {
    await expect(criarMembro(pastor, { nome: "" })).rejects.toBeInstanceOf(Validacao);
    await expect(criarMembro(pastor, { nome: "A", dataNascimento: "31/02/2000" })).rejects.toBeInstanceOf(Validacao);
  });

  it("busca é insensível a caixa e acento (nos dois sentidos)", async () => {
    await criarMembro(pastor, { nome: "João Silva" });
    await criarMembro(pastor, { nome: "Maria Conceição" });
    expect((await buscarMembros(pastor, "joão")).map((m) => m.nome)).toEqual(["João Silva"]);
    expect((await buscarMembros(pastor, "JOAO")).map((m) => m.nome)).toEqual(["João Silva"]);
    expect((await buscarMembros(pastor, "conceicao")).map((m) => m.nome)).toEqual(["Maria Conceição"]);
    expect((await buscarMembros(pastor, "ÇÃO")).map((m) => m.nome)).toEqual(["Maria Conceição"]);
  });

  it("renomear atualiza a busca", async () => {
    const m = await criarMembro(pastor, { nome: "João Silva" });
    await atualizarMembro(pastor, m.id, { nome: "José Souza" });
    expect(await buscarMembros(pastor, "joao")).toHaveLength(0);
    expect((await buscarMembros(pastor, "jose")).map((x) => x.nome)).toEqual(["José Souza"]);
    const l = (await logs(m.id)).find((x) => x.campo === "nome");
    expect(l).toMatchObject({ valorAnterior: "João Silva", valorNovo: "José Souza" });
  });

  it("limita a 20 ordenados por nome", async () => {
    for (let i = 0; i < 25; i++) await criarMembro(pastor, { nome: `Ana ${String(i).padStart(2, "0")}` });
    const r = await buscarMembros(pastor, "ana");
    expect(r).toHaveLength(20);
    expect(r[0].nome).toBe("Ana 00");
    expect(r[19].nome).toBe("Ana 19");
  });

  it("inativo some da busca padrão, aparece com incluirInativos; log e no-op", async () => {
    const m = await criarMembro(pastor, { nome: "João Silva" });
    await definirMembroAtivo(pastor, m.id, false);
    await definirMembroAtivo(pastor, m.id, false);
    expect(await buscarMembros(pastor, "joao")).toHaveLength(0);
    expect(await buscarMembros(pastor, "joao", { incluirInativos: true })).toHaveLength(1);
    await definirMembroAtivo(pastor, m.id, true);
    expect(await buscarMembros(pastor, "joao")).toHaveLength(1);
    expect((await logs(m.id)).map((x) => x.acao)).toEqual(["CRIOU", "INATIVOU", "REATIVOU"]);
  });

  it("atualiza telefone e data, limpando com null/vazio; logs legíveis", async () => {
    const m = await criarMembro(pastor, { nome: "A", telefone: "1", dataNascimento: "2000-01-02" });
    await atualizarMembro(pastor, m.id, { telefone: "2", dataNascimento: "03/04/2001" });
    await atualizarMembro(pastor, m.id, { telefone: null, dataNascimento: null });
    const depois = await prisma.membro.findUniqueOrThrow({ where: { id: m.id } });
    expect(depois.telefone).toBeNull();
    expect(depois.dataNascimento).toBeNull();
    const l = (await logs(m.id)).filter((x) => x.campo === "dataNascimento");
    expect(l[0]).toMatchObject({ valorAnterior: "02/01/2000", valorNovo: "03/04/2001" });
    await expect(atualizarMembro(pastor, "x", { nome: "B" })).rejects.toThrow("Membro não encontrado");
  });
});

describe("listarMembros", () => {
  it("exige membros.ver_nomes", async () => {
    await expect(listarMembros(eventos)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(listarMembros(null)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(listarMembros(pastor)).resolves.toEqual({ itens: [], total: 0 });
  });

  it("ordena por nome, pagina de 30 em 30 e esconde inativos por padrão", async () => {
    for (let i = 1; i <= 35; i++) {
      await criarMembro(tesoureiro, { nome: `Membro ${String(i).padStart(2, "0")}` });
    }
    const inativo = await criarMembro(tesoureiro, { nome: "Zeca Inativo" });
    await definirMembroAtivo(tesoureiro, inativo.id, false);

    const p1 = await listarMembros(pastor);
    expect(p1.total).toBe(35);
    expect(p1.itens).toHaveLength(30);
    expect(p1.itens[0].nome).toBe("Membro 01");

    const p2 = await listarMembros(pastor, { pagina: 2 });
    expect(p2.itens.map((m) => m.nome)).toEqual(["Membro 31", "Membro 32", "Membro 33", "Membro 34", "Membro 35"]);

    const comInativos = await listarMembros(pastor, { pagina: 2, incluirInativos: true });
    expect(comInativos.total).toBe(36);
    expect(comInativos.itens.map((m) => m.nome)).toContain("Zeca Inativo");
  });

  it("página absurda (1e21, Infinity, acima do máximo) não derruba a lista: vira a página 1", async () => {
    await criarMembro(tesoureiro, { nome: "Ana" });
    for (const pagina of [1e21, Infinity, Number.NaN, 10_001, -3]) {
      expect((await listarMembros(pastor, { pagina })).itens.map((m) => m.nome)).toEqual(["Ana"]);
    }
  });

  it("busca parte do nome sem diferenciar acento nem caixa", async () => {
    await criarMembro(tesoureiro, { nome: "João da Silva" });
    await criarMembro(tesoureiro, { nome: "Maria Joana" });
    const r = await listarMembros(pastor, { busca: "JOAO" });
    expect(r.itens.map((m) => m.nome)).toEqual(["João da Silva"]);
  });
});
