import { describe, expect, it, vi } from "vitest";
import { entregarLink, lerMesEscolhido, rotuloMesExtenso, textoConfirmarPublicacao, urlPublicaPrestacao } from "@/lib/prestacao/ui";

const hoje = new Date(Date.UTC(2026, 9, 28)); // 28/10/2026
const erro = (nome: string) => Object.assign(new Error(nome), { name: nome });

describe("lerMesEscolhido", () => {
  it("aceita aaaa-mm do mês atual e de meses passados", () => {
    expect(lerMesEscolhido("2026-10", hoje)).toEqual({ ano: 2026, mes: 10 });
    expect(lerMesEscolhido("2026-01", hoje)).toEqual({ ano: 2026, mes: 1 });
    expect(lerMesEscolhido(" 2025-12 ", hoje)).toEqual({ ano: 2025, mes: 12 });
  });
  it("recusa futuro, formato errado e mês inexistente", () => {
    expect(lerMesEscolhido("2026-11", hoje)).toBeNull();
    expect(lerMesEscolhido("2027-01", hoje)).toBeNull();
    expect(lerMesEscolhido("2026-13", hoje)).toBeNull();
    expect(lerMesEscolhido("2026-00", hoje)).toBeNull();
    expect(lerMesEscolhido("10/2026", hoje)).toBeNull();
    expect(lerMesEscolhido("", hoje)).toBeNull();
    expect(lerMesEscolhido("1999-12", hoje)).toBeNull();
  });
});

describe("textos", () => {
  it("mês por extenso em minúsculas", () => {
    expect(rotuloMesExtenso(2026, 10)).toBe("outubro de 2026");
    expect(rotuloMesExtenso(2026, 3)).toBe("março de 2026");
  });
  it("confirmação de publicação", () => {
    expect(textoConfirmarPublicacao(2026, 10)).toBe(
      "Publicar a prestação de contas de outubro de 2026? Os membros que receberem o link verão exatamente esta versão. Revise as descrições dos gastos detalhados antes de publicar.",
    );
  });
  it("URL pública usa a origem e o token", () => {
    expect(urlPublicaPrestacao("https://app.igreja.org", "abc_-123")).toBe("https://app.igreja.org/p/abc_-123");
    expect(urlPublicaPrestacao("https://app.igreja.org/", "abc")).toBe("https://app.igreja.org/p/abc");
  });
});

describe("entregarLink", () => {
  const url = "https://x.org/p/abc";
  it("sem Web Share → copia", async () => {
    const copiar = vi.fn(async () => {});
    expect(await entregarLink(url, "Prestação", { copiar })).toBe("copiado");
    expect(copiar).toHaveBeenCalledWith(url);
  });
  it("compartilha com url e título", async () => {
    const share = vi.fn(async () => {});
    const copiar = vi.fn(async () => {});
    expect(await entregarLink(url, "Prestação", { share, copiar })).toBe("compartilhado");
    expect(share).toHaveBeenCalledWith({ url, title: "Prestação" });
    expect(copiar).not.toHaveBeenCalled();
  });
  it("AbortError → cancelado, sem copiar", async () => {
    const copiar = vi.fn(async () => {});
    expect(await entregarLink(url, "P", { share: async () => { throw erro("AbortError"); }, copiar })).toBe("cancelado");
    expect(copiar).not.toHaveBeenCalled();
  });
  it("outra falha do share → copia", async () => {
    const copiar = vi.fn(async () => {});
    expect(await entregarLink(url, "P", { share: async () => { throw erro("NotAllowedError"); }, copiar })).toBe("copiado");
    expect(copiar).toHaveBeenCalledWith(url);
  });
});
