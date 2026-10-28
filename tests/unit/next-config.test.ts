import { describe, expect, test } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  test("cabeçalhos de segurança em todas as rotas", async () => {
    const regras = await nextConfig.headers!();
    const todas = regras.find((r) => r.source === "/:path*");
    expect(Object.fromEntries((todas?.headers ?? []).map((h) => [h.key, h.value]))).toEqual({
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "frame-ancestors 'none'",
      "Referrer-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    });
  });

  test("prestação pública e PDF não são indexados (X-Robots-Tag)", async () => {
    const regras = await nextConfig.headers!();
    for (const source of ["/p/:path*", "/api/pdf/prestacao/:path*"]) {
      const r = regras.find((x) => x.source === source);
      expect(r?.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    }
  });

  test("sem bodySizeLimit de Server Actions (comprovantes vão direto ao R2)", () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBeUndefined();
  });
});
