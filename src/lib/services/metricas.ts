// Métricas de uso: gravação de eventos (cliente e serviços), retenção. Veja docs/metricas.md.
import { Dispositivo, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { ehNomeEvento, normalizarTela, sanitizarEvento, type NomeEvento } from "@/lib/metricas/catalogo";

export const MAX_EVENTOS_POR_CHAMADA = 50;
export const MAX_DURACAO_MS = 3_600_000;
export const MESES_RETENCAO = 12;

export type EventoRecebido = {
  nome: string;
  tela: string;
  duracaoMs?: number;
  props?: unknown;
  dispositivo: Dispositivo;
  sessaoId?: string;
};

const DISPOSITIVOS: readonly string[] = Object.values(Dispositivo);

function duracaoValida(d: unknown): number | null {
  return typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= MAX_DURACAO_MS ? d : null;
}

async function metricasLigadas(c: Pick<Prisma.TransactionClient, "configuracao">): Promise<boolean> {
  const cfg = await c.configuracao.findFirst({ select: { metricasAtivas: true } });
  return cfg?.metricasAtivas ?? true;
}

let ultimaLimpeza = "";

export async function registrarEventos(ator: UsuarioAtual | null, eventos: EventoRecebido[]): Promise<number> {
  try {
    if (!ator || !Array.isArray(eventos) || eventos.length === 0) return 0;
    if (!(await metricasLigadas(prisma))) return 0;
    const linhas: Prisma.EventoUsoCreateManyInput[] = [];
    for (const e of eventos.slice(0, MAX_EVENTOS_POR_CHAMADA)) {
      if (!e || typeof e !== "object" || typeof e.nome !== "string") continue;
      const s = sanitizarEvento(e.nome, e.props);
      if (!s || !DISPOSITIVOS.includes(e.dispositivo)) continue;
      linhas.push({
        usuarioId: ator.id,
        papeis: ator.papeis,
        sessaoId: typeof e.sessaoId === "string" && e.sessaoId ? e.sessaoId.slice(0, 64) : null,
        dispositivo: e.dispositivo,
        evento: s.nome,
        tela: normalizarTela(e.tela),
        duracaoMs: duracaoValida(e.duracaoMs),
        propriedades: s.props,
      });
    }
    if (linhas.length === 0) return 0;
    const r = await prisma.eventoUso.createMany({ data: linhas });
    await limparSeNecessario();
    return r.count;
  } catch (erro) {
    console.warn("[metricas] falha ao registrar eventos", erro instanceof Error ? erro.message : "erro");
    return 0;
  }
}

/**
 * Evento de negócio dentro da transação do serviço. Valida tudo antes de inserir (nada de
 * catch-and-continue: um erro SQL abortaria a transação de negócio). Sem ator ou com métricas
 * desligadas, não faz nada.
 */
export async function rastrearServidor(
  tx: Prisma.TransactionClient,
  ator: UsuarioAtual | null,
  nome: NomeEvento,
  props?: Record<string, unknown>,
): Promise<void> {
  if (!ator || !ehNomeEvento(nome)) return;
  const s = sanitizarEvento(nome, props);
  if (!s) return;
  if (!(await metricasLigadas(tx))) return;
  await tx.eventoUso.create({
    data: {
      usuarioId: ator.id,
      papeis: ator.papeis,
      dispositivo: Dispositivo.PC, // o servidor não sabe o aparelho
      evento: s.nome,
      tela: "servidor",
      propriedades: s.props,
    },
  });
}

/** Apaga eventos com mais de 12 meses (meses de calendário). Devolve quantos apagou. */
export async function limparEventosAntigos(agora: Date = new Date()): Promise<number> {
  const limite = new Date(agora);
  limite.setUTCMonth(limite.getUTCMonth() - MESES_RETENCAO);
  const r = await prisma.eventoUso.deleteMany({ where: { dataHora: { lt: limite } } });
  return r.count;
}

async function limparSeNecessario(): Promise<void> {
  const hoje = new Date().toISOString().slice(0, 10);
  if (ultimaLimpeza === hoje) return;
  ultimaLimpeza = hoje;
  await limparEventosAntigos();
}
