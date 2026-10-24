// Coleta de métricas no navegador. Sem imports de servidor. Falhas são sempre silenciosas.
import type { NomeEvento } from "./catalogo";

export type DispositivoCliente = "CELULAR" | "TABLET" | "PC";

export type EventoFila = {
  nome: NomeEvento;
  tela: string;
  dispositivo: DispositivoCliente;
  sessaoId?: string;
  duracaoMs?: number;
  props?: Record<string, string | number | boolean>;
};

const TAMANHO_LOTE = 50;
const TAMANHO_MAX_FILA = 200;
const INTERVALO_MS = 10_000;
const URL_USO = "/api/uso";

export function dispositivoPorLargura(largura: number): DispositivoCliente {
  if (largura < 768) return "CELULAR";
  if (largura < 1024) return "TABLET";
  return "PC";
}

export type OpcoesColetor = {
  enviar: (lote: EventoFila[]) => void;
  dispositivo: () => DispositivoCliente;
  sessaoId: () => string | undefined;
  tela: () => string;
};

/** Fila em memória (parte pura, testável). */
export function criarColetor(o: OpcoesColetor) {
  let fila: EventoFila[] = [];
  return {
    rastrear(nome: NomeEvento, props?: EventoFila["props"], duracaoMs?: number): void {
      try {
        if (fila.length >= TAMANHO_MAX_FILA) fila.shift();
        fila.push({ nome, tela: o.tela(), dispositivo: o.dispositivo(), sessaoId: o.sessaoId(), duracaoMs, props });
      } catch {
        // ignora
      }
    },
    descarregar(): void {
      if (fila.length === 0) return;
      const todos = fila;
      fila = [];
      for (let i = 0; i < todos.length; i += TAMANHO_LOTE) {
        try {
          o.enviar(todos.slice(i, i + TAMANHO_LOTE));
        } catch {
          // ignora
        }
      }
    },
    tamanho: () => fila.length,
  };
}

type Transporte = {
  fetch?: typeof fetch;
  sendBeacon?: (url: string, dados: Blob) => boolean;
};

/** Envia um lote; com `beacon` usa sendBeacon (ao sair da página), senão fetch keepalive. */
export function enviarLote(lote: EventoFila[], t: Transporte, beacon: boolean): void {
  const corpo = JSON.stringify({ eventos: lote });
  try {
    if (beacon && t.sendBeacon) {
      t.sendBeacon(URL_USO, new Blob([corpo], { type: "application/json" }));
      return;
    }
    void t.fetch?.(URL_USO, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: corpo,
      keepalive: true,
      credentials: "same-origin",
    })?.catch(() => {});
  } catch {
    // ignora
  }
}

const CHAVE_SESSAO = "metricas.sessaoId";

function obterSessaoId(): string | undefined {
  try {
    let id = window.sessionStorage.getItem(CHAVE_SESSAO);
    if (!id) {
      id = crypto.randomUUID();
      window.sessionStorage.setItem(CHAVE_SESSAO, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

/** Gera um novo sessaoId (chamar no login). */
export function novaSessaoMetricas(): void {
  try {
    window.sessionStorage.setItem(CHAVE_SESSAO, crypto.randomUUID());
  } catch {
    // ignora
  }
}

let coletor: ReturnType<typeof criarColetor> | null = null;
let iniciado = false;

function obterColetor() {
  if (typeof window === "undefined") return null;
  coletor ??= criarColetor({
    enviar: (lote) => enviarLote(lote, { fetch: window.fetch.bind(window), sendBeacon: navigator.sendBeacon?.bind(navigator) }, document.visibilityState === "hidden"),
    dispositivo: () => dispositivoPorLargura(window.innerWidth),
    sessaoId: obterSessaoId,
    tela: () => window.location.pathname,
  });
  return coletor;
}

/** No servidor não faz nada. */
export function rastrear(nome: NomeEvento, props?: EventoFila["props"], duracaoMs?: number): void {
  obterColetor()?.rastrear(nome, props, duracaoMs);
}

/** Liga o envio a cada 10 s e ao esconder a página. Seguro chamar várias vezes. */
export function iniciarMetricas(): void {
  if (typeof window === "undefined" || iniciado) return;
  const c = obterColetor();
  if (!c) return;
  iniciado = true;
  window.setInterval(() => c.descarregar(), INTERVALO_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") c.descarregar();
  });
}
