import { beforeEach, expect, test } from "vitest";
import { prisma } from "@/lib/db";
import { resetarBanco } from "../helpers/db";

beforeEach(async () => {
  await resetarBanco();
});

async function base() {
  const usuario = await prisma.usuario.create({
    data: { nome: "Ana", email: "ana@igreja.org", senhaHash: "hash" },
  });
  const conta = await prisma.conta.create({ data: { nome: "Caixa", tipo: "CAIXA" } });
  const categoria = await prisma.categoria.create({ data: { nome: "Dízimo", tipo: "ENTRADA", nominal: true } });
  const novoLancamento = (n: number) =>
    prisma.lancamento.create({
      data: {
        tipo: "ENTRADA",
        valor: "100",
        categoriaId: categoria.id,
        contaId: conta.id,
        status: "REALIZADO",
        dataVencimento: new Date("2026-10-01"),
        dataRealizacao: new Date("2026-10-01"),
        descricao: `l${n}`,
        criadoPorId: usuario.id,
      },
    });
  return { usuario, conta, categoria, novoLancamento };
}

test("cria uma linha em cada tabela nova e os campos novos têm os padrões", async () => {
  const { usuario, conta, categoria, novoLancamento } = await base();
  expect(usuario.versaoSessao).toBe(0);
  expect(categoria.detalharPublico).toBe(false);
  const config = await prisma.configuracao.create({ data: { nomeIgreja: "Aliança Plena", cidade: "Colombo" } });
  expect(config.cidade).toBe("Colombo");

  const contagem = await prisma.contagemCaixa.create({
    data: {
      modo: "CULTO",
      contaId: conta.id,
      data: new Date("2026-10-25"),
      totalContado: "350.50",
      esperado: "350.00",
      diferenca: "0.50",
      observacao: "sobra",
      criadoPorId: usuario.id,
      itens: {
        create: [
          { denominacaoCentavos: 10000, quantidade: 3 },
          { denominacaoCentavos: 5000, quantidade: 1 },
        ],
      },
    },
    include: { itens: true },
  });
  expect(contagem.itens).toHaveLength(2);
  expect(contagem.diferenca.toString()).toBe("0.5");
  await expect(
    prisma.contagemItem.create({ data: { contagemId: contagem.id, denominacaoCentavos: 10000, quantidade: 1 } }),
  ).rejects.toThrow();

  const l1 = await novoLancamento(1);
  const recibo = await prisma.recibo.create({
    data: { lancamentoId: l1.id, ano: 2026, numero: 1, codigoVerificacao: "ABC123", emitidoPorId: usuario.id },
  });
  expect(recibo.emitidoEm).toBeInstanceOf(Date);
  await prisma.sequenciaRecibo.create({ data: { ano: 2026, ultimo: 1 } });

  const prestacao = await prisma.prestacaoContas.create({
    data: { ano: 2026, mes: 9, versao: 1, token: "tok1", dados: { total: 1 }, publicadaPorId: usuario.id },
  });
  expect(prestacao.despublicada).toBe(false);
  expect(prestacao.visualizacoes).toBe(0);
});

test("recibo: um por lançamento e (ano, número) único", async () => {
  const { usuario, novoLancamento } = await base();
  const l1 = await novoLancamento(1);
  const l2 = await novoLancamento(2);
  const dados = { ano: 2026, numero: 1, codigoVerificacao: "X", emitidoPorId: usuario.id };
  await prisma.recibo.create({ data: { ...dados, lancamentoId: l1.id } });
  await expect(prisma.recibo.create({ data: { ...dados, numero: 2, lancamentoId: l1.id } })).rejects.toThrow();
  await expect(prisma.recibo.create({ data: { ...dados, lancamentoId: l2.id } })).rejects.toThrow();
  await prisma.recibo.create({ data: { ...dados, ano: 2027, lancamentoId: l2.id } });
});

test("prestação: (ano, mês, versão) e token únicos", async () => {
  const { usuario } = await base();
  const d = { ano: 2026, mes: 9, versao: 1, token: "t1", dados: {}, publicadaPorId: usuario.id };
  await prisma.prestacaoContas.create({ data: d });
  await expect(prisma.prestacaoContas.create({ data: { ...d, token: "t2" } })).rejects.toThrow();
  await expect(prisma.prestacaoContas.create({ data: { ...d, versao: 2 } })).rejects.toThrow();
  await prisma.prestacaoContas.create({ data: { ...d, versao: 2, token: "t3" } });
});

test("Anexo.url é único", async () => {
  const { usuario, novoLancamento } = await base();
  const l = await novoLancamento(1);
  const a = { lancamentoId: l.id, url: "anexos/x.pdf", nomeArquivo: "x.pdf", mimeType: "application/pdf", tamanho: 1, enviadoPorId: usuario.id };
  await prisma.anexo.create({ data: a });
  await expect(prisma.anexo.create({ data: a })).rejects.toThrow();
});
