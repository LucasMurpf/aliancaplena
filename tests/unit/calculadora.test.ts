import { describe, expect, it } from "vitest";
import {
  calcularTotalCentavos,
  contaPadraoId,
  DENOMINACOES_CLIENTE,
  descreverDiferenca,
  destinoErroContagem,
  formatarCentavos,
  MSG_ESPERADO_MUDOU,
  observacaoParaEnvio,
} from "@/lib/calculadora";
import { DENOMINACOES } from "@/lib/services/contagens";

describe("DENOMINACOES_CLIENTE", () => {
  it("espelha a lista do serviço (centavos, rótulo e tipo)", () => {
    expect(DENOMINACOES_CLIENTE.map((d) => d.centavos)).toEqual(DENOMINACOES.map((d) => d.centavos));
    expect(DENOMINACOES_CLIENTE.map((d) => d.rotulo)).toEqual(DENOMINACOES.map((d) => d.rotulo));
    expect(DENOMINACOES_CLIENTE.map((d) => d.tipo)).toEqual(DENOMINACOES.map((d) => d.tipo));
  });
});

describe("calcularTotalCentavos", () => {
  it("soma denominação × quantidade em centavos inteiros", () => {
    expect(
      calcularTotalCentavos([
        { denominacaoCentavos: 20000, quantidade: 2 },
        { denominacaoCentavos: 5, quantidade: 3 },
        { denominacaoCentavos: 1, quantidade: 7 },
      ]),
    ).toBe(40022);
  });
  it("lista vazia e quantidades zero dão 0", () => {
    expect(calcularTotalCentavos([])).toBe(0);
    expect(calcularTotalCentavos([{ denominacaoCentavos: 100, quantidade: 0 }])).toBe(0);
  });
  it("sem erro de ponto flutuante com muitas moedas de 10 centavos", () => {
    expect(calcularTotalCentavos([{ denominacaoCentavos: 10, quantidade: 3 }])).toBe(30);
  });
  it("aguenta o máximo de 100000 em todas as denominações", () => {
    const itens = DENOMINACOES_CLIENTE.map((d) => ({ denominacaoCentavos: d.centavos, quantidade: 100000 }));
    expect(Number.isSafeInteger(calcularTotalCentavos(itens))).toBe(true);
  });
});

describe("formatarCentavos", () => {
  it("formata em reais", () => {
    expect(formatarCentavos(0)).toBe("R$ 0,00");
    expect(formatarCentavos(5)).toBe("R$ 0,05");
    expect(formatarCentavos(123456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(100000000)).toBe("R$ 1.000.000,00");
  });
  it("negativo vem com sinal na frente", () => {
    expect(formatarCentavos(-3000)).toBe("-R$ 30,00");
  });
});

describe("descreverDiferenca", () => {
  it("zero confere", () => {
    expect(descreverDiferenca(0)).toEqual({ texto: "Confere", estado: "ok" });
  });
  it("negativo falta", () => {
    expect(descreverDiferenca(-3050)).toEqual({ texto: "Faltam R$ 30,50", estado: "falta" });
  });
  it("positivo sobra", () => {
    expect(descreverDiferenca(150000)).toEqual({ texto: "Sobram R$ 1.500,00", estado: "sobra" });
  });
});

describe("contaPadraoId (spec §2)", () => {
  it("escolhe a primeira CAIXA mesmo que um banco venha antes", () => {
    const contas = [
      { id: "bb", tipo: "BANCO" },
      { id: "cx1", tipo: "CAIXA" },
      { id: "cx2", tipo: "CAIXA" },
    ];
    expect(contaPadraoId(contas)).toBe("cx1");
  });
  it("sem CAIXA usa a primeira conta; sem contas devolve vazio", () => {
    expect(contaPadraoId([{ id: "bb", tipo: "BANCO" }, { id: "pp", tipo: "BANCO" }])).toBe("bb");
    expect(contaPadraoId([])).toBe("");
  });
});

describe("observacaoParaEnvio", () => {
  it("só envia com diferença e texto", () => {
    expect(observacaoParaEnvio("faltou troco", -500)).toBe("faltou troco");
    expect(observacaoParaEnvio("sobrou", 100)).toBe("sobrou");
    expect(observacaoParaEnvio("antiga", 0)).toBeUndefined();
    expect(observacaoParaEnvio("   ", -500)).toBeUndefined();
  });
});

describe("destinoErroContagem", () => {
  const mapa = { contaId: "conta" };
  it("campo visível recebe o erro", () => {
    expect(destinoErroContagem({ campo: "observacao", regra: "obrigatorio_divergencia", erro: "x" }, ["conta", "observacao"], mapa)).toEqual({ campo: "observacao", mensagem: "x" });
    expect(destinoErroContagem({ campo: "contaId", erro: "conta ruim" }, ["conta"], mapa)).toEqual({ campo: "conta", mensagem: "conta ruim" });
  });
  it("observação invisível (esperado mudou) vira erro geral com a mensagem própria", () => {
    expect(destinoErroContagem({ campo: "observacao", regra: "obrigatorio_divergencia", erro: "Explique" }, ["conta", "data"], mapa)).toEqual({
      campo: null,
      mensagem: MSG_ESPERADO_MUDOU,
    });
    expect(MSG_ESPERADO_MUDOU).toBe("O valor esperado mudou (alguém lançou algo agora). Confira a diferença e informe a observação.");
  });
  it("outro campo invisível mantém a mensagem do servidor como geral", () => {
    expect(destinoErroContagem({ campo: "data", erro: "Data inválida" }, ["conta"], mapa)).toEqual({ campo: null, mensagem: "Data inválida" });
    expect(destinoErroContagem({ erro: "Falhou" }, ["conta"], mapa)).toEqual({ campo: null, mensagem: "Falhou" });
  });
});
