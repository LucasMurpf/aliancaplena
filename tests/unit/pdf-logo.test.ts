import { afterEach, describe, expect, it, vi } from "vitest";
import { carregarLogo } from "@/lib/pdf/logo";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

afterEach(() => vi.unstubAllGlobals());

describe("carregarLogo", () => {
  it("sem URL ou fora de http(s): null, sem buscar nada", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await carregarLogo(null)).toBeNull();
    expect(await carregarLogo("/logo.png")).toBeNull();
    expect(await carregarLogo("file:///etc/passwd")).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it("hosts internos nunca são buscados", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const u of ["http://localhost/a.png", "http://127.0.0.1/a.png", "http://10.0.0.5/a.png", "http://169.254.169.254/x", "http://192.168.1.1/a.png", "http://[::1]/a.png"]) {
      expect(await carregarLogo(u)).toBeNull();
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("PNG válido é devolvido; conteúdo que não é imagem, erro, redirecionamento e falha de rede viram null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array(PNG), { status: 200 })));
    expect(await carregarLogo("https://exemplo.org/logo.png")).toEqual({ data: PNG, format: "png" });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 200 })));
    expect(await carregarLogo("https://exemplo.org/logo.png")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } })));
    expect(await carregarLogo("https://exemplo.org/logo.png")).toBeNull();

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    expect(await carregarLogo("https://exemplo.org/logo.png")).toBeNull();
  });
});
