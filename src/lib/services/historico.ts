// Histórico legível: lê o log de auditoria de uma entidade com ações e campos traduzidos.
import { prisma } from "@/lib/db";
import { exigir, type UsuarioAtual } from "@/lib/auth";
import type { Acao, Entidade } from "@/lib/log";
import { ROTULO_PAPEL, ROTULO_TIPO_CONTA, ROTULO_TIPO_MOVIMENTO } from "@/lib/rotulos";

const ROTULO_STATUS: Record<string, string> = {
  PREVISTO: "Previsto",
  REALIZADO: "Realizado",
  CANCELADO: "Cancelado",
  ATIVA: "Ativa",
  CANCELADA: "Cancelada",
};

const ROTULO_TIPO: Record<string, string> = { ...ROTULO_TIPO_MOVIMENTO, ...ROTULO_TIPO_CONTA };

const traduzir = (mapa: Record<string, string>, v: string) => (Object.hasOwn(mapa, v) ? mapa[v] : v);

/** Traduz enums gravados crus no log (o log é imutável: a tradução é só na leitura). */
function valorLegivel(campo: string | null, valor: string | null): string | null {
  if (valor === null) return null;
  if (campo === "status") return traduzir(ROTULO_STATUS, valor);
  if (campo === "tipo") return traduzir(ROTULO_TIPO, valor);
  if (campo === "papeis") return valor.split(", ").map((p) => traduzir(ROTULO_PAPEL, p)).join(", ");
  return valor;
}

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
  detalharPublico: "Detalhar na prestação pública",
  cidade: "Cidade",
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
  return linhas.map((l) => {
    const acao = Object.hasOwn(ROTULO_ACAO, l.acao) ? ROTULO_ACAO[l.acao as Acao] : l.acao;
    const base = { dataHora: l.dataHora, usuario: l.usuario?.nome ?? "Sistema", acao };
    // Cancelamentos antigos guardam o motivo em valorNovo de um campo "status".
    if (l.acao === "CANCELOU" && l.campo === "status") {
      return { ...base, campo: "Motivo", de: null, para: l.valorNovo ?? null };
    }
    return {
      ...base,
      campo: l.campo === null ? null : Object.hasOwn(ROTULO_CAMPO, l.campo) ? ROTULO_CAMPO[l.campo] : l.campo,
      de: valorLegivel(l.campo, l.valorAnterior ?? null),
      para: valorLegivel(l.campo, l.valorNovo ?? null),
    };
  });
}
