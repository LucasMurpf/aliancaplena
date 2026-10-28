import { describe, expect, it } from "vitest";
import { secaoRecibo } from "@/lib/recibo-visibilidade";

const base = { temPermissoes: true, elegivel: true, numero: null, cancelado: false };

describe("secaoRecibo", () => {
  it("elegível sem recibo oferece emitir; com recibo, baixar", () => {
    expect(secaoRecibo(base)).toBe("emitir");
    expect(secaoRecibo({ ...base, numero: "2026/000001" })).toBe("baixar");
  });
  it("cancelado com recibo existente permite só baixar (cancelado), mesmo inelegível", () => {
    expect(secaoRecibo({ ...base, elegivel: false, cancelado: true, numero: "2026/000001" })).toBe("baixar-cancelado");
  });
  it("cancelado sem recibo não oferece emissão", () => {
    expect(secaoRecibo({ ...base, elegivel: false, cancelado: true })).toBe("oculta");
    expect(secaoRecibo({ ...base, cancelado: true })).toBe("oculta");
  });
  it("sem permissões ou inelegível fica oculta", () => {
    expect(secaoRecibo({ ...base, temPermissoes: false, numero: "2026/000001" })).toBe("oculta");
    expect(secaoRecibo({ ...base, temPermissoes: false, cancelado: true, numero: "2026/000001" })).toBe("oculta");
    expect(secaoRecibo({ ...base, elegivel: false })).toBe("oculta");
  });
});
