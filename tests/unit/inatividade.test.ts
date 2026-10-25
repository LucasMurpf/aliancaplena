import { describe, expect, it } from "vitest";
import { deveEncerrar, estadoInatividade, msDesdeUltimaRenovacao } from "@/lib/inatividade";

const MIN = 60 * 1000;
const SEG = 1000;

describe("estadoInatividade", () => {
  it("13 min: ativo", () => expect(estadoInatividade(13 * MIN)).toBe("ativo"));
  it("14 min: aviso", () => expect(estadoInatividade(14 * MIN)).toBe("aviso"));
  it("14min44s: ainda aviso", () => expect(estadoInatividade(14 * MIN + 44 * SEG)).toBe("aviso"));
  it("14min45s: expirar (antes do cookie, que vale 15 min)", () => expect(estadoInatividade(14 * MIN + 45 * SEG)).toBe("expirar"));
  it("15 min: expirar", () => expect(estadoInatividade(15 * MIN)).toBe("expirar"));
  it("0: ativo", () => expect(estadoInatividade(0)).toBe("ativo"));
});

describe("msDesdeUltimaRenovacao", () => {
  it("usa a marca mais recente", () => expect(msDesdeUltimaRenovacao(1000, 100, 900)).toBe(100));
  it("ignora null, NaN e marcas no futuro", () => expect(msDesdeUltimaRenovacao(1000, 200, null, Number.NaN, 5000)).toBe(800));
  it("sem marcas: 0", () => expect(msDesdeUltimaRenovacao(1000, null)).toBe(0));
});

describe("deveEncerrar (várias abas)", () => {
  const agora = 100 * MIN;
  it("aba parada, sem outra aba: encerra", () => expect(deveEncerrar(agora, agora - 15 * MIN, null)).toBe(true));
  it("aba parada, outra aba renovou há 1 min: não encerra", () => expect(deveEncerrar(agora, agora - 15 * MIN, agora - MIN)).toBe(false));
  it("renovação compartilhada antiga também encerra", () => expect(deveEncerrar(agora, agora - 20 * MIN, agora - 16 * MIN)).toBe(true));
  it("aba ativa não encerra", () => expect(deveEncerrar(agora, agora - 10 * SEG, null)).toBe(false));
});
