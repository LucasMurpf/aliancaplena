// Histórico legível: lê o log de auditoria de uma entidade com ações e campos traduzidos.
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import type { Acao, Entidade } from "@/lib/log";

export const ROTULO_ACAO: Record<Acao, string> = {
  CRIOU: "Criou",
  ALTEROU: "Alterou",
  DEU_BAIXA: "Deu baixa",
  CANCELOU: "Cancelou",
  INATIVOU: "Inativou",
  REATIVOU: "Reativou",
  ANEXOU: "Anexou arquivo",
  LOGIN: "Entrou no sistema",
  LOGIN_FALHOU: "Falha de login",
  INSTALOU: "Instalou o sistema",
  EMITIU_RECIBO: "Emitiu recibo",
  PUBLICOU: "Publicou",
  DESPUBLICOU: "Despublicou",
  REGISTROU_CONTAGEM: "Registrou contagem",
};

export const ROTULO_CAMPO: Record<string, string> = {
  valor: "Valor",
  categoria: "Categoria",
  conta: "Conta",
  membro: "Membro",
  descricao: "Descrição",
  dataVencimento: "Vencimento",
  dataRealizacao: "Data de realização",
  status: "Status",
  tipo: "Tipo",
  nome: "Nome",
  email: "E-mail",
  papeis: "Papéis",
  senha: "Senha",
  saldoInicial: "Saldo inicial",
  nominal: "Nominal",
  telefone: "Telefone",
  dataNascimento: "Nascimento",
  ativo: "Ativo",
  nomeIgreja: "Nome da igreja",
  logoUrl: "Logo",
  cnpj: "CNPJ",
  metricasAtivas: "Coleta de métricas de uso",
};

const LIMITE_HISTORICO = 200;

export type EntradaHistorico = {
  dataHora: Date;
  usuario: string;
  acao: string;
  campo: string | null;
  de: string | null;
  para: string | null;
};

/** Histórico de uma entidade, mais recente primeiro. Exige `historico.ver`. */
export async function historicoDe(
  ator: UsuarioAtual | null,
  entidade: Entidade,
  entidadeId: string,
): Promise<EntradaHistorico[]> {
  exigir(ator, "historico.ver");
  const linhas = await prisma.log.findMany({
    where: { entidade, entidadeId },
    orderBy: [{ dataHora: "desc" }, { id: "desc" }],
    take: LIMITE_HISTORICO,
    include: { usuario: { select: { nome: true } } },
  });
  return linhas.map((l) => ({
    dataHora: l.dataHora,
    usuario: l.usuario?.nome ?? "Sistema",
    acao: Object.hasOwn(ROTULO_ACAO, l.acao) ? ROTULO_ACAO[l.acao as Acao] : l.acao,
    campo: l.campo === null ? null : Object.hasOwn(ROTULO_CAMPO, l.campo) ? ROTULO_CAMPO[l.campo] : l.campo,
    de: l.valorAnterior ?? null,
    para: l.valorNovo ?? null,
  }));
}
