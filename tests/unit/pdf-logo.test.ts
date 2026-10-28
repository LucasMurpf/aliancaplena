import { describe, expect, it, vi } from "vitest";
import { carregarLogo, enderecoBloqueado, TAMANHO_MAX_LOGO } from "@/lib/pdf/logo";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const publico = async () => ["8.8.8.8"];
const resp = (corpo: BodyInit | null, init?: ResponseInit) => new Response(corpo, { status: 200, ...init });

describe("enderecoBloqueado", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.1.1", "100.127.255.255",
    "224.0.0.1", "239.255.255.255", "::", "::1", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:10.0.0.1", "::127.0.0.1", "64:ff9b::7f00:1", "2002:7f00:1::", "não é ip",
  ])("bloqueia %s", (ip) => expect(enderecoBloqueado(ip)).toBe(true));

  it.each(["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "100.63.255.255", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "::ffff:808:808"])(
    "permite %s",
    (ip) => expect(enderecoBloqueado(ip)).toBe(false),
  );
});

describe("carregarLogo", () => {
  it("sem URL ou fora de http(s): null, sem buscar nada", async () => {
    const buscar = vi.fn();
    for (const u of [null, "/logo.png", "file:///etc/passwd"]) expect(await carregarLogo(u, { resolver: publico, buscar })).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("hosts internos, literais mapeados, com ponto final e que resolvem para IP interno nunca são buscados", async () => {
    const buscar = vi.fn();
    const urls = [
      "http://localhost/a.png", "http://localhost./a.png", "http://x.local./a.png", "http://x.internal./a.png",
      "http://127.0.0.1/a.png", "http://10.0.0.5/a.png", "http://169.254.169.254/x", "http://192.168.1.1/a.png",
      "http://[::1]/a.png", "http://[::]/a.png", "http://[::ffff:127.0.0.1]/a.png", "http://[::ffff:169.254.169.254]/a.png",
      "http://100.64.1.1/a.png", "http://2130706433/a.png",
    ];
    for (const u of urls) expect(await carregarLogo(u, { resolver: publico, buscar }), u).toBeNull();
    expect(await carregarLogo("https://exemplo.org/a.png", { resolver: async () => ["10.0.0.9"], buscar })).toBeNull();
    // Basta UM endereço interno entre os resolvidos.
    expect(await carregarLogo("https://exemplo.org/a.png", { resolver: async () => ["8.8.8.8", "::ffff:7f00:1"], buscar })).toBeNull();
    expect(await carregarLogo("https://exemplo.org/a.png", { resolver: async () => [], buscar })).toBeNull();
    expect(await carregarLogo("https://exemplo.org/a.png", { resolver: async () => { throw new Error("nxdomain"); }, buscar })).toBeNull();
    expect(buscar).not.toHaveBeenCalled();
  });

  it("PNG público é devolvido; não imagem, erro, redirecionamento e falha viram null", async () => {
    const ok = (r: Response) => carregarLogo("https://exemplo.org/logo.png", { resolver: publico, buscar: vi.fn().mockResolvedValue(r) });
    expect(await ok(resp(new Uint8Array(PNG)))).toEqual({ data: PNG, format: "png" });
    expect(await ok(resp("<html>"))).toBeNull();
    expect(await ok(new Response(null, { status: 302, headers: { location: "http://10.0.0.1/" } }))).toBeNull();
    expect(await carregarLogo("https://exemplo.org/logo.png", { resolver: publico, buscar: vi.fn().mockRejectedValue(new Error("timeout")) })).toBeNull();
  });

  it("corpo acima de 1 MB é cortado durante a leitura (sem content-length) e o fluxo é cancelado", async () => {
    let cancelado = false;
    let enviados = 0;
    const fluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        enviados++;
        c.enqueue(new Uint8Array(256 * 1024).fill(1));
      },
      cancel() {
        cancelado = true;
      },
    });
    const r = await carregarLogo("https://exemplo.org/logo.png", { resolver: publico, buscar: vi.fn().mockResolvedValue(resp(fluxo)) });
    expect(r).toBeNull();
    expect(cancelado).toBe(true);
    expect(enviados * 256 * 1024).toBeLessThan(TAMANHO_MAX_LOGO * 3);
  });
});
