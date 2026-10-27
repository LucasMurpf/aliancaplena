import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT } from "jose";
import { prisma } from "@/lib/db";
import {
  TEMPO_SESSAO_SEGUNDOS,
  carregarUsuario,
  conferirSenha,
  criarTokenSessao,
  exigir,
  hashSenha,
  lerTokenSessao,
  type UsuarioAtual,
} from "@/lib/auth";
import { NaoAutorizado } from "@/lib/erros";
import { resetarBanco } from "../helpers/db";

const SEGREDO = "segredo-de-teste-com-mais-de-32-caracteres!!";

beforeAll(() => {
  process.env.SESSION_SECRET = SEGREDO;
});

describe("senha", () => {
  it("hash é diferente da senha e confere", async () => {
    const hash = await hashSenha("minha-senha");
    expect(hash).not.toBe("minha-senha");
    expect(hash.startsWith("$2")).toBe(true);
    expect(hash).toContain("$12$");
    expect(await conferirSenha("minha-senha", hash)).toBe(true);
    expect(await conferirSenha("outra-senha", hash)).toBe(false);
  });
});

describe("token de sessão", () => {
  afterEach(() => {
    vi.useRealTimers();
    process.env.SESSION_SECRET = SEGREDO;
  });

  it("TEMPO_SESSAO_SEGUNDOS é 15 minutos", () => {
    expect(TEMPO_SESSAO_SEGUNDOS).toBe(15 * 60);
  });

  it("token válido devolve o id do usuário", async () => {
    const token = await criarTokenSessao("usuario-1", 0);
    expect(await lerTokenSessao(token)).toEqual({ usuarioId: "usuario-1", versao: 0 });
  });

  it("o token carrega a versão e a mantém ao ser reemitido (como faz o proxy)", async () => {
    const token = await criarTokenSessao("usuario-1", 7);
    const lido = await lerTokenSessao(token);
    expect(lido).toEqual({ usuarioId: "usuario-1", versao: 7 });
    const reemitido = await criarTokenSessao(lido!.usuarioId, lido!.versao);
    expect(await lerTokenSessao(reemitido)).toEqual({ usuarioId: "usuario-1", versao: 7 });
  });

  it("token antigo sem v → versão 0", async () => {
    const antigo = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("usuario-1")
      .setExpirationTime(Math.floor(Date.now() / 1000) + 60)
      .sign(new TextEncoder().encode(SEGREDO));
    expect(await lerTokenSessao(antigo)).toEqual({ usuarioId: "usuario-1", versao: 0 });
  });

  it("token adulterado → null", async () => {
    const token = await criarTokenSessao("usuario-1", 0);
    const [cab, corpo, ass] = token.split(".");
    const corpoFalso = Buffer.from(JSON.stringify({ sub: "admin", exp: 9999999999 })).toString("base64url");
    expect(await lerTokenSessao(`${cab}.${corpoFalso}.${ass}`)).toBeNull();
    // Assinatura trocada.
    const assTrocada = (ass[0] === "A" ? "B" : "A") + ass.slice(1);
    expect(await lerTokenSessao(`${cab}.${corpo}.${assTrocada}`)).toBeNull();
  });

  it("entrada malformada → null (não lança)", async () => {
    expect(await lerTokenSessao("")).toBeNull();
    expect(await lerTokenSessao("lixo")).toBeNull();
    expect(await lerTokenSessao("a.b.c")).toBeNull();
  });

  it("token assinado com outro segredo → null", async () => {
    const token = await criarTokenSessao("usuario-1", 0);
    process.env.SESSION_SECRET = "outro-segredo-tambem-com-mais-de-32-caracteres";
    expect(await lerTokenSessao(token)).toBeNull();
  });

  it("só aceita HS256", async () => {
    const chave = new TextEncoder().encode(SEGREDO);
    const agora = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("usuario-1")
      .setIssuedAt(agora)
      .setExpirationTime(agora + TEMPO_SESSAO_SEGUNDOS)
      .sign(chave);
    expect(await lerTokenSessao(token)).toBeNull();
  });

  it("token criado há 14 min é válido; há 16 min → null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
    const token = await criarTokenSessao("usuario-1", 0);

    vi.setSystemTime(new Date("2026-10-24T12:14:00Z"));
    expect(await lerTokenSessao(token)).toEqual({ usuarioId: "usuario-1", versao: 0 });

    vi.setSystemTime(new Date("2026-10-24T12:16:00Z"));
    expect(await lerTokenSessao(token)).toBeNull();
  });

  it("SESSION_SECRET ausente ou curto → erro claro ao criar o token", async () => {
    delete process.env.SESSION_SECRET;
    await expect(criarTokenSessao("usuario-1", 0)).rejects.toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = "curto";
    await expect(criarTokenSessao("usuario-1", 0)).rejects.toThrow(/SESSION_SECRET/);
  });
});

describe("carregarUsuario", () => {
  beforeEach(async () => {
    await resetarBanco();
  });

  it("devolve id, nome, email e papéis do usuário ativo", async () => {
    const u = await prisma.usuario.create({
      data: {
        nome: "Tesoureira",
        email: "tes@igreja.org",
        senhaHash: "x",
        papeis: { create: [{ papel: "TESOUREIRO" }, { papel: "PASTOR" }] },
      },
    });
    const atual = await carregarUsuario(u.id);
    expect(atual).toMatchObject({ id: u.id, nome: "Tesoureira", email: "tes@igreja.org" });
    expect([...(atual?.papeis ?? [])].sort()).toEqual(["PASTOR", "TESOUREIRO"]);
  });

  it("usuário inativo → null", async () => {
    const u = await prisma.usuario.create({
      data: { nome: "Antigo", email: "antigo@igreja.org", senhaHash: "x", ativo: false },
    });
    expect(await carregarUsuario(u.id)).toBeNull();
  });

  it("usuário inexistente → null", async () => {
    expect(await carregarUsuario("nao-existe")).toBeNull();
  });

  it("versão diferente da do banco → null; igual ou omitida → usuário", async () => {
    const u = await prisma.usuario.create({
      data: { nome: "V", email: "v@igreja.org", senhaHash: "x", versaoSessao: 2 },
    });
    expect(await carregarUsuario(u.id, 1)).toBeNull();
    expect(await carregarUsuario(u.id, 2)).not.toBeNull();
    expect(await carregarUsuario(u.id)).not.toBeNull();
  });
});

describe("exigir", () => {
  const pastor: UsuarioAtual = { id: "p1", nome: "Pastor", email: "p@igreja.org", papeis: ["PASTOR"] };
  const tesoureiro: UsuarioAtual = { id: "t1", nome: "Tes", email: "t@igreja.org", papeis: ["TESOUREIRO"] };

  it("exigir(null, …) lança NaoAutorizado", () => {
    expect(() => exigir(null, "financeiro.ver")).toThrow(NaoAutorizado);
  });

  it("exigir(pastor, 'financeiro.lancar') lança NaoAutorizado", () => {
    expect(() => exigir(pastor, "financeiro.lancar")).toThrow(NaoAutorizado);
  });

  it("com permissão devolve o mesmo usuário", () => {
    expect(exigir(tesoureiro, "financeiro.lancar")).toBe(tesoureiro);
    expect(exigir(pastor, "financeiro.ver")).toBe(pastor);
  });
});
