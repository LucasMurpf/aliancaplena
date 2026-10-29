import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { carregarUsuario, conferirSenha, criarTokenSessao, lerTokenSessao, type UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { permissoesDe } from "@/lib/permissoes";
import { instalar } from "@/lib/services/instalacao";
import {
  atualizarUsuario,
  criarUsuario,
  definirAtivo,
  listarUsuarios,
  redefinirSenha,
} from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;

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
});

const novo = (extra = {}) => ({
  nome: "Tesoureira",
  email: "  Tes@Igreja.ORG ",
  senha: "senha-forte-123",
  papeis: ["TESOUREIRO", "PATRIMONIO"] as ("TESOUREIRO" | "PATRIMONIO" | "ADMIN" | "PASTOR")[],
  ...extra,
});

async function papeisDe(id: string) {
  return (await prisma.usuarioPapel.findMany({ where: { usuarioId: id } })).map((p) => p.papel).sort();
}

describe("autorização", () => {
  it("tesoureiro não gerencia usuários", async () => {
    const u = await criarUsuario(admin, novo());
    const tes: UsuarioAtual = { id: u.id, nome: u.nome, email: u.email, papeis: ["TESOUREIRO"] };
    await expect(criarUsuario(tes, novo({ email: "x@y.org" }))).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(listarUsuarios(tes)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(listarUsuarios(null)).rejects.toBeInstanceOf(NaoAutorizado);
  });
});

describe("criarUsuario", () => {
  it("cria com múltiplos papéis, e-mail normalizado, senha com hash e log CRIOU", async () => {
    const u = await criarUsuario(admin, novo());
    expect(u.email).toBe("tes@igreja.org");
    expect([...u.papeis].sort()).toEqual(["PATRIMONIO", "TESOUREIRO"]);
    const db = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(await conferirSenha("senha-forte-123", db.senhaHash)).toBe(true);
    expect(permissoesDe(u.papeis)).toEqual(permissoesDe(["TESOUREIRO"]));
    expect(permissoesDe(u.papeis).has("admin")).toBe(false);
    const logs = await prisma.log.findMany({ where: { entidade: "Usuario", entidadeId: u.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ acao: "CRIOU", usuarioId: admin.id, valorNovo: "PATRIMONIO, TESOUREIRO" });
  });

  it("deduplica papéis", async () => {
    const u = await criarUsuario(admin, novo({ papeis: ["PASTOR", "PASTOR"] }));
    expect(u.papeis).toEqual(["PASTOR"]);
  });

  it("recusa papéis vazios, desconhecidos, e-mail duplicado e senha curta", async () => {
    await expect(criarUsuario(admin, novo({ papeis: [] }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarUsuario(admin, novo({ papeis: ["XYZ"] }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarUsuario(admin, novo({ senha: "curta" }))).rejects.toThrow(
      "A senha deve ter entre 8 e 72 caracteres",
    );
    await expect(criarUsuario(admin, novo({ email: "ADMIN@igreja.org" }))).rejects.toThrow("E-mail já cadastrado");
    expect(await prisma.usuario.count()).toBe(1);
  });
});

describe("listarUsuarios", () => {
  it("ordena por nome, traz papéis e ativo, sem senhaHash", async () => {
    await criarUsuario(admin, novo({ nome: "Zélia", email: "z@i.org" }));
    await criarUsuario(admin, novo({ nome: "Bruno", email: "b@i.org", papeis: ["PASTOR"] }));
    const lista = await listarUsuarios(admin);
    expect(lista.map((u) => u.nome)).toEqual(["Admin", "Bruno", "Zélia"]);
    expect(lista[1]).toMatchObject({ papeis: ["PASTOR"], ativo: true });
    expect(JSON.stringify(lista)).not.toContain("senhaHash");
  });
});

describe("atualizarUsuario", () => {
  it("trocar papéis gera log com de/para como texto ordenado", async () => {
    const u = await criarUsuario(admin, novo());
    await atualizarUsuario(admin, u.id, { papeis: ["PASTOR", "TESOUREIRO"] });
    expect(await papeisDe(u.id)).toEqual(["PASTOR", "TESOUREIRO"]);
    const log = await prisma.log.findFirstOrThrow({ where: { entidadeId: u.id, acao: "ALTEROU", campo: "papeis" } });
    expect(log).toMatchObject({
      usuarioId: admin.id,
      valorAnterior: "PATRIMONIO, TESOUREIRO",
      valorNovo: "PASTOR, TESOUREIRO",
    });
  });

  it("loga um ALTEROU por campo alterado e nenhum se nada mudou", async () => {
    const u = await criarUsuario(admin, novo());
    await atualizarUsuario(admin, u.id, { nome: "Nova", email: "NOVA@i.org", papeis: ["PATRIMONIO", "TESOUREIRO"] });
    const logs = await prisma.log.findMany({ where: { entidadeId: u.id, acao: "ALTEROU" } });
    expect(logs.map((l) => l.campo).sort()).toEqual(["email", "nome"]);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } })).email).toBe("nova@i.org");
  });

  it("e-mail duplicado e id inexistente", async () => {
    const u = await criarUsuario(admin, novo());
    await expect(atualizarUsuario(admin, u.id, { email: "admin@igreja.org" })).rejects.toThrow("E-mail já cadastrado");
    await expect(atualizarUsuario(admin, "inexistente", { nome: "X" })).rejects.toThrow("Usuário não encontrado");
    await expect(atualizarUsuario(admin, "inexistente", { nome: "X" })).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(atualizarUsuario(admin, u.id, { papeis: [] })).rejects.toBeInstanceOf(Validacao);
  });

  it("remover ADMIN do único admin é recusado e nada muda", async () => {
    await expect(atualizarUsuario(admin, admin.id, { papeis: ["TESOUREIRO"] })).rejects.toThrow(
      "O sistema precisa de ao menos um administrador ativo",
    );
    expect(await papeisDe(admin.id)).toEqual(["ADMIN"]);
    expect(await prisma.log.count({ where: { campo: "papeis" } })).toBe(0);
  });
});

describe("definirAtivo", () => {
  it("inativar o único admin é recusado", async () => {
    await expect(definirAtivo(admin, admin.id, false)).rejects.toBeInstanceOf(RegraDeNegocio);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: admin.id } })).ativo).toBe(true);
  });

  it("com 2 admins, inativar um funciona; loga INATIVOU e REATIVOU", async () => {
    const outro = await criarUsuario(admin, novo({ email: "o@i.org", papeis: ["ADMIN"] }));
    await definirAtivo(admin, outro.id, false);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: outro.id } })).ativo).toBe(false);
    await expect(definirAtivo(admin, admin.id, false)).rejects.toBeInstanceOf(RegraDeNegocio);
    await definirAtivo(admin, outro.id, true);
    const acoes = (await prisma.log.findMany({ where: { entidadeId: outro.id }, orderBy: { dataHora: "asc" } })).map(
      (l) => l.acao,
    );
    expect(acoes).toEqual(["CRIOU", "INATIVOU", "REATIVOU"]);
  });

  it("dois admins se inativando ao mesmo tempo: só um consegue", async () => {
    const b = await criarUsuario(admin, novo({ email: "b@i.org", papeis: ["ADMIN"] }));
    const r = await Promise.allSettled([definirAtivo(admin, b.id, false), definirAtivo(b, admin.id, false)]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.usuario.count({ where: { ativo: true } })).toBe(1);
  });

  it("inativar não-admin é ok; id inexistente", async () => {
    const u = await criarUsuario(admin, novo());
    await definirAtivo(admin, u.id, false);
    await expect(definirAtivo(admin, "nada", false)).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("redefinirSenha", () => {
  it("troca o hash e loga campo senha sem valores", async () => {
    const u = await criarUsuario(admin, novo());
    await redefinirSenha(admin, u.id, "outra-senha-456");
    const db = await prisma.usuario.findUniqueOrThrow({ where: { id: u.id } });
    expect(await conferirSenha("outra-senha-456", db.senhaHash)).toBe(true);
    const log = await prisma.log.findFirstOrThrow({ where: { entidadeId: u.id, campo: "senha" } });
    expect(log).toMatchObject({ acao: "ALTEROU", valorAnterior: null, valorNovo: null });
    await expect(redefinirSenha(admin, u.id, "curta")).rejects.toBeInstanceOf(Validacao);
    await expect(redefinirSenha(admin, "nada", "outra-senha-456")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("invalidação de sessões", () => {
  beforeAll(() => {
    process.env.SESSION_SECRET = "segredo-de-teste-com-mais-de-32-caracteres!!";
  });

  async function tokenDe(id: string) {
    const u = await prisma.usuario.findUniqueOrThrow({ where: { id } });
    return criarTokenSessao(id, u.versaoSessao);
  }
  async function valido(token: string) {
    const s = await lerTokenSessao(token);
    return s ? carregarUsuario(s.usuarioId, s.versao) : null;
  }

  it("redefinirSenha invalida o token anterior", async () => {
    const u = await criarUsuario(admin, novo());
    const token = await tokenDe(u.id);
    expect(await valido(token)).not.toBeNull();
    await redefinirSenha(admin, u.id, "outra-senha-forte-1");
    expect(await valido(token)).toBeNull();
  });

  it("inativar invalida o token, mesmo após reativar", async () => {
    const u = await criarUsuario(admin, novo());
    const token = await tokenDe(u.id);
    await definirAtivo(admin, u.id, false);
    expect(await valido(token)).toBeNull();
    await definirAtivo(admin, u.id, true);
    expect(await valido(token)).toBeNull();
    expect(await valido(await tokenDe(u.id))).not.toBeNull();
  });

  it("mudar papéis invalida o token; editar só o nome não", async () => {
    const u = await criarUsuario(admin, novo());
    const token = await tokenDe(u.id);
    await atualizarUsuario(admin, u.id, { nome: "Outro Nome" });
    expect(await valido(token)).not.toBeNull();
    await atualizarUsuario(admin, u.id, { papeis: ["PASTOR"] });
    expect(await valido(token)).toBeNull();
  });
});
