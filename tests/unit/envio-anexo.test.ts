import { describe, expect, test, vi } from "vitest";
import { destinoDoEnvio, enviarUmAnexo, type DepsEnvioAnexo } from "@/lib/envio-anexo";

const arquivo = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "nota.pdf", { type: "application/pdf" });

function deps(o: Partial<DepsEnvioAnexo> = {}, status = 200) {
  const fetch = vi.fn(async () => new Response(null, { status }));
  const d = {
    preparar: vi.fn(async () => ({ ok: true as const, chave: "anexos/l1/u-nota.pdf", url: "https://r2.exemplo/put?sig=1" })),
    confirmar: vi.fn(async () => ({ ok: true as const })),
    fetch: fetch as unknown as typeof globalThis.fetch,
    ...o,
  };
  return { d, fetch };
}

describe("destinoDoEnvio", () => {
  test("URL do R2 fica como está; modo memória vai para a rota local de dev", () => {
    expect(destinoDoEnvio("https://x.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1")).toBe(
      "https://x.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1",
    );
    expect(destinoDoEnvio("memoria-put://anexos/l1/u-a b.pdf")).toBe("/api/anexos-memoria?chave=anexos%2Fl1%2Fu-a%20b.pdf");
  });
});

describe("enviarUmAnexo", () => {
  test("prepara, envia com PUT direto ao storage (Content-Type) e confirma", async () => {
    const { d, fetch } = deps();
    const f = arquivo();
    expect(await enviarUmAnexo("l1", f, d)).toEqual({ ok: true });
    expect(d.preparar).toHaveBeenCalledWith("l1", { nome: "nota.pdf", mime: "application/pdf", tamanho: 4 });
    expect(fetch).toHaveBeenCalledWith("https://r2.exemplo/put?sig=1", {
      method: "PUT",
      body: f,
      headers: { "Content-Type": "application/pdf" },
    });
    expect(d.confirmar).toHaveBeenCalledWith("l1", "anexos/l1/u-nota.pdf", "nota.pdf");
  });

  test("falha no preparo não envia nem confirma", async () => {
    const { d, fetch } = deps({ preparar: vi.fn(async () => ({ erro: "Tipo de arquivo não permitido" })) });
    expect(await enviarUmAnexo("l1", arquivo(), d)).toEqual({ ok: false });
    expect(fetch).not.toHaveBeenCalled();
    expect(d.confirmar).not.toHaveBeenCalled();
  });

  test("PUT recusado pelo storage não confirma", async () => {
    const { d } = deps({}, 403);
    expect(await enviarUmAnexo("l1", arquivo(), d)).toEqual({ ok: false });
    expect(d.confirmar).not.toHaveBeenCalled();
  });

  test("confirmação recusada conta como falha", async () => {
    const { d } = deps({ confirmar: vi.fn(async () => ({ erro: "Tipo de arquivo não permitido" })) });
    expect(await enviarUmAnexo("l1", arquivo(), d)).toEqual({ ok: false });
  });
});
