import { describe, expect, it, vi } from "vitest";
import { entregarArquivo } from "@/lib/entregar-arquivo";

const arq = new File(["x"], "r.pdf", { type: "application/pdf" });
const erro = (nome: string) => Object.assign(new Error(nome), { name: nome });

describe("entregarArquivo", () => {
  it("sem suporte a compartilhar arquivos → baixa", async () => {
    const baixar = vi.fn();
    const share = vi.fn();
    expect(await entregarArquivo(arq, { canShare: () => false, share, baixar })).toBe("baixado");
    expect(await entregarArquivo(arq, { share, baixar })).toBe("baixado");
    expect(share).not.toHaveBeenCalled();
    expect(baixar).toHaveBeenCalledTimes(2);
  });
  it("compartilhou → compartilhado, sem baixar", async () => {
    const baixar = vi.fn();
    expect(await entregarArquivo(arq, { canShare: () => true, share: async () => {}, baixar })).toBe("compartilhado");
    expect(baixar).not.toHaveBeenCalled();
  });
  it("AbortError → cancelado, sem baixar", async () => {
    const baixar = vi.fn();
    expect(await entregarArquivo(arq, { canShare: () => true, share: async () => { throw erro("AbortError"); }, baixar })).toBe("cancelado");
    expect(baixar).not.toHaveBeenCalled();
  });
  it("NotAllowedError → baixa", async () => {
    const baixar = vi.fn();
    expect(await entregarArquivo(arq, { canShare: () => true, share: async () => { throw erro("NotAllowedError"); }, baixar })).toBe("baixado");
    expect(baixar).toHaveBeenCalledWith(arq);
  });
});
