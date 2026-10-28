import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const pedir = (caminho: string) => proxy(new NextRequest(`http://localhost:3000${caminho}`));
const TOKEN = "A".repeat(43);

describe("proxy: rotas públicas sem sessão", () => {
  it.each([`/p/${TOKEN}`, `/api/pdf/prestacao/${TOKEN}`, "/login", "/instalacao"])("%s passa sem redirecionar", async (caminho) => {
    const r = await pedir(caminho);
    expect(r.headers.get("location")).toBeNull();
    expect(r.headers.get("x-middleware-next")).toBe("1");
    expect(r.headers.get("set-cookie")).toBeNull();
  });

  it.each(["/", "/relatorios/prestacao", "/lancamentos", "/api/pdf/recibo/abc", "/api/pdf/relatorio/geral", "/pessoas", "/prestacao"])(
    "%s sem sessão vai para o login (páginas) ou segue sem dados (API)",
    async (caminho) => {
      const r = await pedir(caminho);
      if (caminho.startsWith("/api/")) expect(r.headers.get("location")).toBeNull();
      else expect(r.headers.get("location")).toContain("/login");
    },
  );
});
