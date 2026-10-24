import { describe, expect, it } from "vitest";
import { estadoInatividade } from "@/lib/inatividade";

const MIN = 60 * 1000;

describe("estadoInatividade", () => {
  it("13 min: ativo", () => expect(estadoInatividade(13 * MIN)).toBe("ativo"));
  it("14 min: aviso", () => expect(estadoInatividade(14 * MIN)).toBe("aviso"));
  it("14min59s: ainda aviso", () => expect(estadoInatividade(15 * MIN - 1)).toBe("aviso"));
  it("15 min: expirar", () => expect(estadoInatividade(15 * MIN)).toBe("expirar"));
  it("0: ativo", () => expect(estadoInatividade(0)).toBe("ativo"));
});
