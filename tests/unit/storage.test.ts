import { afterEach, describe, expect, test, vi } from "vitest";
import { MSG_STORAGE_NAO_CONFIGURADO, memoriaCompartilhada, obterStorage, storageR2 } from "@/lib/storage";

const R2 = {
  R2_ACCOUNT_ID: "conta123",
  R2_ACCESS_KEY_ID: "AKIDEXEMPLO",
  R2_SECRET_ACCESS_KEY: "segredo-de-exemplo",
  R2_BUCKET: "comprovantes",
};

function semR2() {
  for (const k of Object.keys(R2)) vi.stubEnv(k, "");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("obterStorage", () => {
  test("em produção sem R2 lança erro claro em vez de usar memória", () => {
    vi.stubEnv("NODE_ENV", "production");
    semR2();
    expect(() => obterStorage()).toThrow(MSG_STORAGE_NAO_CONFIGURADO);
    expect(MSG_STORAGE_NAO_CONFIGURADO).toBe(
      "Armazenamento de anexos não configurado: defina R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY e R2_BUCKET",
    );
  });

  test("em produção com R2 parcial também lança", () => {
    vi.stubEnv("NODE_ENV", "production");
    semR2();
    vi.stubEnv("R2_ACCOUNT_ID", R2.R2_ACCOUNT_ID);
    vi.stubEnv("R2_BUCKET", R2.R2_BUCKET);
    expect(() => obterStorage()).toThrow(MSG_STORAGE_NAO_CONFIGURADO);
  });

  test("fora de produção sem R2 usa a memória compartilhada", () => {
    for (const env of ["test", "development"]) {
      vi.stubEnv("NODE_ENV", env);
      semR2();
      expect(obterStorage()).toBe(memoriaCompartilhada());
    }
  });

  test("com R2 completo usa o R2 (também em produção)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    const st = obterStorage();
    expect(st).not.toBe(memoriaCompartilhada());
    expect(await st.urlEnvio("anexos/l/x.pdf", "application/pdf", 10, 300)).toMatch(/^https:\/\/comprovantes\.conta123\.r2\.cloudflarestorage\.com\//);
  });
});

describe("storageR2.urlEnvio (assinatura local, sem rede)", () => {
  test("PUT assinado com Content-Type e Content-Length, sem checksum automático", async () => {
    for (const [k, v] of Object.entries(R2)) vi.stubEnv(k, v);
    const url = new URL(await storageR2().urlEnvio("anexos/l/abc-nota.pdf", "application/pdf", 12345, 300));
    expect(url.hostname).toBe("comprovantes.conta123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/anexos/l/abc-nota.pdf");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")?.split(";")).toEqual(["content-length", "content-type", "host"]);
    expect([...url.searchParams.keys()].some((k) => k.toLowerCase().includes("checksum"))).toBe(false);
  });
});
