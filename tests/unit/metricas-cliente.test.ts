import { describe, expect, it, vi } from "vitest";
import { criarColetor, enviarLoteAguardando } from "@/lib/metricas/cliente";

function coletor() {
  return criarColetor({ enviar: () => {}, dispositivo: () => "PC", sessaoId: () => "s1", tela: () => "/x" });
}

describe("descarga aguardável", () => {
  it("retirarLotes esvazia a fila e entrega o evento", () => {
    const c = coletor();
    c.rastrear("sessao_expirou");
    const lotes = c.retirarLotes();
    expect(lotes).toHaveLength(1);
    expect(lotes[0][0].nome).toBe("sessao_expirou");
    expect(c.tamanho()).toBe(0);
  });

  it("enviarLoteAguardando espera o fetch (keepalive) receber o evento", async () => {
    const c = coletor();
    c.rastrear("sessao_expirou");
    let terminou = false;
    const fetchFalso = vi.fn(async () => {
      await Promise.resolve();
      terminou = true;
      return new Response(null, { status: 204 });
    });
    await enviarLoteAguardando(c.retirarLotes()[0], { fetch: fetchFalso as unknown as typeof fetch });
    expect(terminou).toBe(true);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/uso");
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(String(init.body)).eventos[0].nome).toBe("sessao_expirou");
  });

  it("se o fetch falha, usa sendBeacon e não lança", async () => {
    const beacon = vi.fn(() => true);
    await enviarLoteAguardando([], { fetch: (() => Promise.reject(new Error("x"))) as unknown as typeof fetch, sendBeacon: beacon });
    expect(beacon).toHaveBeenCalledOnce();
  });
});
