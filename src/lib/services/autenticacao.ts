// Login com limite de tentativas por e-mail (spec: 5 falhas em 15 min bloqueiam).
import { prisma } from "@/lib/db";
import { carregarUsuario, conferirSenha, type UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado } from "@/lib/erros";
import { registrarLog } from "@/lib/log";

const MAX_FALHAS = 5;
const JANELA_MS = 15 * 60 * 1000;
const MENSAGEM_INVALIDO = "E-mail ou senha inválidos";
const MENSAGEM_BLOQUEIO = "Muitas tentativas. Aguarde 15 minutos.";

// Hash bcrypt (custo 12) de uma senha descartável. Comparar contra ele quando o
// e-mail não existe mantém o tempo de resposta parecido, sem revelar quais e-mails existem.
const HASH_FICTICIO = "$2b$12$SN3trqabNjuzBqlUbob70uv5tc0BX4T9JFX/cD98Eu5TpV9PTRUy.";

export async function entrar(email: string, senha: string): Promise<UsuarioAtual> {
  const emailNormalizado = String(email ?? "").trim().toLowerCase();
  const senhaTexto = String(senha ?? "");

  const falhasRecentes = await prisma.log.count({
    where: {
      entidade: "Login",
      entidadeId: emailNormalizado,
      acao: "LOGIN_FALHOU",
      dataHora: { gte: new Date(Date.now() - JANELA_MS) },
    },
  });
  // Bloqueado: não confere a senha nem registra nova falha.
  if (falhasRecentes >= MAX_FALHAS) throw new NaoAutorizado(MENSAGEM_BLOQUEIO);

  const usuario = await prisma.usuario.findUnique({
    where: { email: emailNormalizado },
    select: { id: true, ativo: true, senhaHash: true },
  });
  const senhaOk = await conferirSenha(senhaTexto, usuario?.senhaHash ?? HASH_FICTICIO);

  if (!usuario || !usuario.ativo || !senhaOk) {
    await prisma.$transaction((tx) =>
      registrarLog(tx, { entidade: "Login", entidadeId: emailNormalizado, acao: "LOGIN_FALHOU" }),
    );
    throw new NaoAutorizado(MENSAGEM_INVALIDO);
  }

  await prisma.$transaction((tx) =>
    registrarLog(tx, { usuarioId: usuario.id, entidade: "Usuario", entidadeId: usuario.id, acao: "LOGIN" }),
  );
  const atual = await carregarUsuario(usuario.id);
  if (!atual) throw new NaoAutorizado(MENSAGEM_INVALIDO);
  return atual;
}
