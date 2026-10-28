import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Conta } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import {
  abrirPrestacaoPublica,
  despublicarPrestacao,
  lerPrestacaoPublica,
  listarPrestacoes,
  previaPrestacao,
  publicarPrestacao,
} from "@/lib/services/prestacao";
import { VisaoPrestacao } from "@/components/prestacao/VisaoPrestacao";
import { saldoDaContaAte } from "@/lib/services/resumo";
import { cancelarLancamento, criarLancamento, editarLancamento, type DadosLancamento } from "@/lib/services/lancamentos";
import { criarCategoria, criarConta, criarMembro, definirContaAtiva } from "@/lib/services/cadastros";
import { criarTransferencia } from "@/lib/services/transferencias";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

const tzOriginal = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "UTC";
});
afterAll(() => {
  if (tzOriginal === undefined) delete process.env.TZ;
  else process.env.TZ = tzOriginal;
});

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let pastor: UsuarioAtual;
let caixa: Conta;
let banco: Conta;
let dizimo: Categoria;
let oferta: Categoria;
let luz: Categoria;
let social: Categoria;

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja Aliança",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "100,00",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  tesoureiro = await criarUsuario(admin, { nome: "Tesoureiro Teste", email: "tes@igreja.org", senha: "senha-forte-123", papeis: ["TESOUREIRO"] });
  pastor = await criarUsuario(admin, { nome: "Pastor Teste", email: "pastor@igreja.org", senha: "senha-forte-123", papeis: ["PASTOR"] });
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  banco = await criarConta(admin, { nome: "Banco Secreto", tipo: "BANCO", saldoInicial: "0,00" });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  luz = await prisma.categoria.findFirstOrThrow({ where: { nome: "Luz", tipo: "SAIDA" } });
  social = await criarCategoria(admin, { nome: "Ajuda social", tipo: "SAIDA", nominal: false });
});

const lanc = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "100,00",
  categoriaId: oferta.id,
  contaId: caixa.id,
  dataVencimento: "10/09/2026",
  realizado: true,
  dataRealizacao: "10/09/2026",
  ...o,
});
const saida = (o: Partial<DadosLancamento> = {}) => lanc({ tipo: "SAIDA", categoriaId: luz.id, ...o });

const TOKEN_FORMATO = /^[A-Za-z0-9_-]{43}$/;

describe("previa e conteúdo do snapshot", () => {
  it("monta resumo, entradas só em total e saídas detalhadas conforme a categoria", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "300,00", descricao: "Oferta do culto de domingo" }));
    await criarLancamento(tesoureiro, saida({ valor: "80,00", descricao: "Conta de agosto", dataRealizacao: "20/09/2026" }));
    await criarLancamento(tesoureiro, saida({ valor: "20,00", descricao: "" }));
    await criarLancamento(tesoureiro, saida({ valor: "45,00", categoriaId: social.id, descricao: "Cesta família X" }));
    // Fora: previsto, outro mês.
    await criarLancamento(tesoureiro, saida({ valor: "999,00", realizado: false, dataRealizacao: undefined }));
    await criarLancamento(tesoureiro, lanc({ valor: "777,00", dataVencimento: "01/10/2026", dataRealizacao: "01/10/2026" }));

    const s = await previaPrestacao(tesoureiro, 2026, 9);
    expect(s.igreja).toEqual({ nome: "Igreja Aliança", logoUrl: null });
    expect(s.rotulo).toBe("Setembro de 2026");
    expect(s.parcial).toBe(false);
    expect(s.dataCorte).toBe("30/09/2026");
    expect(s.resumo).toEqual({
      entradas: "R$ 300,00",
      saidas: "R$ 145,00",
      resultado: "R$ 155,00",
      // 100 inicial + 300 − 145
      saldoFimMes: "R$ 255,00",
    });
    expect(s.entradas).toEqual([{ categoria: "Oferta", total: "R$ 300,00" }]);
    expect(s.saidas).toEqual([
      {
        categoria: "Luz",
        total: "R$ 100,00",
        itens: [
          { data: "10/09/2026", descricao: "—", valor: "R$ 20,00" },
          { data: "20/09/2026", descricao: "Conta de agosto", valor: "R$ 80,00" },
        ],
      },
      { categoria: "Ajuda social", total: "R$ 45,00" },
    ]);
    const json = JSON.stringify(s);
    expect(json).not.toContain("família X");
    expect(json).not.toContain("Oferta do culto");
    expect(json).not.toContain("Caixa");
    expect(json).not.toContain("Banco Secreto");
    // Prévia não grava.
    expect(await prisma.prestacaoContas.count()).toBe(0);
  });

  it("saldo do fim do mês soma todas as contas (inclusive inativas) e ignora o que veio depois", async () => {
    const reserva = await criarConta(admin, { nome: "Reserva", tipo: "BANCO", saldoInicial: "50,00" });
    await definirContaAtiva(admin, reserva.id, false);
    await criarLancamento(tesoureiro, lanc({ valor: "300,00" }));
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "70,00", data: "15/09/2026" });
    // Depois do mês: não entra no saldo de setembro.
    await criarLancamento(tesoureiro, saida({ valor: "40,00", dataVencimento: "01/10/2026", dataRealizacao: "01/10/2026" }));
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "30,00", data: "01/10/2026" });

    const s = await previaPrestacao(tesoureiro, 2026, 9);
    // 100 + 300 (caixa e banco somados, transferência neutra) + 50 (reserva inativa)
    expect(s.resumo.saldoFimMes).toBe("R$ 450,00");

    const fimSet = new Date(Date.UTC(2026, 8, 30));
    expect((await saldoDaContaAte(prisma, caixa.id, fimSet)).toString()).toBe("330");
    expect((await saldoDaContaAte(prisma, banco.id, fimSet)).toString()).toBe("70");
    const dia15 = new Date(Date.UTC(2026, 8, 15));
    expect((await saldoDaContaAte(prisma, banco.id, dia15)).toString()).toBe("70");
    const dia14 = new Date(Date.UTC(2026, 8, 14));
    expect((await saldoDaContaAte(prisma, banco.id, dia14)).toString()).toBe("0");
    expect((await saldoDaContaAte(prisma, caixa.id, new Date(Date.UTC(2026, 9, 1)))).toString()).toBe("260");
  });

  it("mês corrente vira parcial até hoje; mês futuro é recusado", async () => {
    const hoje = hojeSP();
    const ano = hoje.getUTCFullYear();
    const mes = hoje.getUTCMonth() + 1;
    const txt = formatarDataBR(hoje);
    await criarLancamento(tesoureiro, lanc({ valor: "10,00", dataVencimento: txt, dataRealizacao: txt }));
    const s = await previaPrestacao(tesoureiro, ano, mes);
    expect(s.parcial).toBe(true);
    expect(s.dataCorte).toBe(txt);
    expect(s.rotulo).toContain(`(parcial, até ${txt})`);
    expect(s.resumo.entradas).toBe("R$ 10,00");

    const prox = mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 };
    await expect(previaPrestacao(tesoureiro, prox.ano, prox.mes)).rejects.toMatchObject({
      codigo: "REGRA_DE_NEGOCIO",
      message: "Não é possível publicar um mês futuro",
    });
    await expect(publicarPrestacao(tesoureiro, prox.ano, prox.mes)).rejects.toBeInstanceOf(RegraDeNegocio);
    expect(await prisma.prestacaoContas.count()).toBe(0);
  });

  it("valida mês e permissões", async () => {
    await expect(previaPrestacao(tesoureiro, 2026, 13)).rejects.toBeInstanceOf(Validacao);
    await expect(previaPrestacao(tesoureiro, 1999, 1)).rejects.toBeInstanceOf(Validacao);
    await expect(previaPrestacao(null, 2026, 9)).rejects.toBeInstanceOf(NaoAutorizado);
    // Pastor vê a prévia, mas não publica.
    await expect(previaPrestacao(pastor, 2026, 9)).resolves.toMatchObject({ mes: 9 });
    await expect(publicarPrestacao(pastor, 2026, 9)).rejects.toBeInstanceOf(NaoAutorizado);
    expect(await prisma.prestacaoContas.count()).toBe(0);
  });
});

describe("publicarPrestacao", () => {
  it("Review Focus 1: nome de membro e descrição de entrada nunca vão para o snapshot", async () => {
    const zelia = await criarMembro(admin, { nome: "Zélia Nominal" });
    await criarLancamento(
      tesoureiro,
      lanc({ categoriaId: dizimo.id, membroId: zelia.id, valor: "250,00", descricao: "Dízimo da irmã Zélia" }),
    );
    await criarLancamento(tesoureiro, saida({ valor: "30,00", descricao: "Conta paga" }));

    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    const gravada = await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: p.id } });
    const aberta = await abrirPrestacaoPublica(p.token);
    for (const json of [JSON.stringify(p.snapshot), JSON.stringify(gravada.dados), JSON.stringify(aberta)]) {
      expect(json).not.toContain("Zélia");
      expect(json).not.toContain("irmã");
      expect(json).not.toContain(zelia.id);
      expect(json).not.toContain("Caixa");
      expect(json).not.toContain("Tesoureiro Teste");
    }
    expect(p.snapshot.entradas).toEqual([{ categoria: "Dízimo", total: "R$ 250,00" }]);
  });

  it("Review Focus 1: o HTML da visão pública só traz textos do snapshot (sem membro, conta, usuário)", async () => {
    const zelia = await criarMembro(admin, { nome: "Zélia Nominal" });
    await criarLancamento(tesoureiro, lanc({ categoriaId: dizimo.id, membroId: zelia.id, valor: "250,00", descricao: "Dízimo da irmã Zélia" }));
    await criarLancamento(tesoureiro, lanc({ valor: "10,00", contaId: banco.id, descricao: "Oferta no Banco Secreto" }));
    await criarLancamento(tesoureiro, saida({ valor: "30,00", descricao: "Conta paga" }));

    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    const aberta = await lerPrestacaoPublica(p.token);
    const html = renderToStaticMarkup(createElement(VisaoPrestacao, { snapshot: aberta.snapshot!, versao: aberta.versao, publicadaEm: aberta.publicadaEm }));
    for (const proibido of ["Zélia", "irmã", zelia.id, "Caixa", "Banco Secreto", "Tesoureiro Teste", "tes@igreja.org", "Oferta no Banco"]) {
      expect(html).not.toContain(proibido);
    }
    // Mostra o que o snapshot tem.
    for (const esperado of ["Prestação de contas", "Setembro de 2026", "Dízimo", "R$ 250,00", "Luz", "Conta paga", "Versão 1 publicada em"]) {
      expect(html).toContain(esperado);
    }
  });

  it("grava v1 com token aleatório, log e métrica; republicar gera v2", async () => {
    await criarLancamento(tesoureiro, lanc());
    const v1 = await publicarPrestacao(tesoureiro, 2026, 9);
    expect(v1.versao).toBe(1);
    expect(v1.token).toMatch(TOKEN_FORMATO);

    const v2 = await publicarPrestacao(tesoureiro, 2026, 9);
    expect(v2.versao).toBe(2);
    expect(v2.token).not.toBe(v1.token);
    // Outro mês começa em 1.
    expect((await publicarPrestacao(tesoureiro, 2026, 8)).versao).toBe(1);

    const logs = await prisma.log.findMany({ where: { acao: "PUBLICOU" }, orderBy: { dataHora: "asc" } });
    expect(logs.map((l) => [l.entidade, l.valorNovo, l.usuarioId])).toEqual([
      ["PrestacaoContas", "09/2026 v1", tesoureiro.id],
      ["PrestacaoContas", "09/2026 v2", tesoureiro.id],
      ["PrestacaoContas", "08/2026 v1", tesoureiro.id],
    ]);
    expect(logs[0].entidadeId).toBe(v1.id);
    const eventos = await prisma.eventoUso.findMany({ where: { evento: "prestacao_publicada" } });
    expect(eventos.map((e) => e.propriedades).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))).toEqual([
      { versao: 1 },
      { versao: 1 },
      { versao: 2 },
    ]);
  });

  it("publicações simultâneas do mesmo mês recebem versões distintas", async () => {
    const r = await Promise.all(Array.from({ length: 5 }, () => publicarPrestacao(tesoureiro, 2026, 9)));
    expect(r.map((p) => p.versao).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("snapshot não muda depois de editar o lançamento", async () => {
    const l = await criarLancamento(tesoureiro, saida({ valor: "80,00", descricao: "Conta original" }));
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    await editarLancamento(tesoureiro, l.id, saida({ valor: "95,00", descricao: "Conta corrigida" }));
    const aberta = await abrirPrestacaoPublica(p.token);
    expect(aberta.snapshot).toEqual(p.snapshot);
    expect(JSON.stringify(aberta.snapshot)).toContain("Conta original");
    expect(JSON.stringify(aberta.snapshot)).not.toContain("Conta corrigida");
    expect((await previaPrestacao(tesoureiro, 2026, 9)).resumo.saidas).toBe("R$ 95,00");
  });
});

describe("lerPrestacaoPublica (somente leitura)", () => {
  it("devolve o mesmo formato de abrirPrestacaoPublica sem contar visualização", async () => {
    await criarLancamento(tesoureiro, lanc());
    const v1 = await publicarPrestacao(tesoureiro, 2026, 9);
    const v2 = await publicarPrestacao(tesoureiro, 2026, 9);
    const lida = await lerPrestacaoPublica(v1.token);
    expect(lida).toEqual({
      estado: "ok",
      snapshot: v1.snapshot,
      versao: 1,
      publicadaEm: formatarDataBR(hojeSP()),
      versaoMaisRecente: { versao: 2, token: v2.token },
    });
    await lerPrestacaoPublica(v1.token);
    expect((await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: v1.id } })).visualizacoes).toBe(0);
    expect((await abrirPrestacaoPublica(v1.token)).versao).toBe(1);
    expect((await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: v1.id } })).visualizacoes).toBe(1);
  });

  it("despublicada e token inválido não expõem nada", async () => {
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    await despublicarPrestacao(tesoureiro, p.id, "engano");
    expect(await lerPrestacaoPublica(p.token)).toEqual({ estado: "despublicada" });
    expect(await lerPrestacaoPublica("curto")).toEqual({ estado: "inexistente" });
    expect(await lerPrestacaoPublica("A".repeat(43))).toEqual({ estado: "inexistente" });
  });
});

describe("abrirPrestacaoPublica (Review Focus 5)", () => {
  it("ok: devolve snapshot, versão, data e incrementa visualizações", async () => {
    await criarLancamento(tesoureiro, lanc());
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    const r = await abrirPrestacaoPublica(p.token);
    expect(r.estado).toBe("ok");
    expect(r.versao).toBe(1);
    expect(r.publicadaEm).toBe(formatarDataBR(hojeSP()));
    expect(r.snapshot).toEqual(p.snapshot);
    expect(r.versaoMaisRecente).toBeUndefined();
    await abrirPrestacaoPublica(p.token);
    await Promise.all([abrirPrestacaoPublica(p.token), abrirPrestacaoPublica(p.token)]);
    expect((await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: p.id } })).visualizacoes).toBe(4);
  });

  it("versão antiga aponta a mais recente não despublicada", async () => {
    const v1 = await publicarPrestacao(tesoureiro, 2026, 9);
    const v2 = await publicarPrestacao(tesoureiro, 2026, 9);
    expect((await abrirPrestacaoPublica(v1.token)).versaoMaisRecente).toEqual({ versao: 2, token: v2.token });
    expect((await abrirPrestacaoPublica(v2.token)).versaoMaisRecente).toBeUndefined();

    const v3 = await publicarPrestacao(tesoureiro, 2026, 9);
    await despublicarPrestacao(tesoureiro, v3.id, "valor errado");
    expect((await abrirPrestacaoPublica(v1.token)).versaoMaisRecente).toEqual({ versao: 2, token: v2.token });
    await despublicarPrestacao(tesoureiro, v2.id, "valor errado");
    expect((await abrirPrestacaoPublica(v1.token)).versaoMaisRecente).toBeUndefined();
  });

  it("despublicada: estado 'despublicada', sem snapshot e sem contar visualização", async () => {
    await criarLancamento(tesoureiro, lanc());
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    await despublicarPrestacao(tesoureiro, p.id, "publicada por engano");
    const r = await abrirPrestacaoPublica(p.token);
    expect(r).toEqual({ estado: "despublicada" });
    const linha = await prisma.prestacaoContas.findUniqueOrThrow({ where: { id: p.id } });
    expect(linha.visualizacoes).toBe(0);
    expect(linha.despublicada).toBe(true);
    expect(linha.despublicadaEm).toBeInstanceOf(Date);
    // Nada é apagado.
    expect(linha.dados).toEqual(p.snapshot);
  });

  it("token inexistente ou fora do formato → 'inexistente', sem nada mais", async () => {
    await publicarPrestacao(tesoureiro, 2026, 9);
    const aleatorio = "A".repeat(43);
    for (const t of [aleatorio, "", "curto", "x".repeat(44), "A".repeat(42) + "=", "../../etc/passwd", null, 123]) {
      expect(await abrirPrestacaoPublica(t as string)).toEqual({ estado: "inexistente" });
    }
  });
});

describe("snapshot: bordas", () => {
  it("lançamento realizado e depois cancelado fica fora", async () => {
    const l = await criarLancamento(tesoureiro, lanc({ valor: "500,00" }));
    await criarLancamento(tesoureiro, lanc({ valor: "10,00" }));
    await cancelarLancamento(tesoureiro, l.id, "duplicado");
    const s = await previaPrestacao(tesoureiro, 2026, 9);
    expect(s.resumo.entradas).toBe("R$ 10,00");
    expect(s.entradas).toEqual([{ categoria: "Oferta", total: "R$ 10,00" }]);
  });

  it("transferência não muda entradas, saídas nem resultado", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "300,00" }));
    const antes = await previaPrestacao(tesoureiro, 2026, 9);
    await criarTransferencia(tesoureiro, { contaOrigemId: caixa.id, contaDestinoId: banco.id, valor: "70,00", data: "15/09/2026" });
    const depois = await previaPrestacao(tesoureiro, 2026, 9);
    expect(depois.resumo).toEqual(antes.resumo);
    expect(depois.entradas).toEqual(antes.entradas);
    expect(depois.saidas).toEqual(antes.saidas);
  });

  it("lançamento no último dia do mês entra; no primeiro do seguinte não", async () => {
    await criarLancamento(tesoureiro, lanc({ valor: "40,00", dataVencimento: "30/09/2026", dataRealizacao: "30/09/2026" }));
    await criarLancamento(tesoureiro, lanc({ valor: "900,00", dataVencimento: "01/10/2026", dataRealizacao: "01/10/2026" }));
    const s = await previaPrestacao(tesoureiro, 2026, 9);
    expect(s.resumo.entradas).toBe("R$ 40,00");
  });
});

describe("despublicarPrestacao", () => {
  it("exige permissão, motivo; registra log; não despublica duas vezes", async () => {
    const p = await publicarPrestacao(tesoureiro, 2026, 9);
    await expect(despublicarPrestacao(pastor, p.id, "x")).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(despublicarPrestacao(tesoureiro, p.id, "   ")).rejects.toBeInstanceOf(Validacao);
    await expect(despublicarPrestacao(tesoureiro, p.id, "   ")).rejects.toThrow("Informe o motivo da retirada");
    await expect(despublicarPrestacao(tesoureiro, "nao-existe", "x")).rejects.toBeInstanceOf(NaoEncontrado);
    await despublicarPrestacao(tesoureiro, p.id, "valor errado");
    await expect(despublicarPrestacao(tesoureiro, p.id, "de novo")).rejects.toBeInstanceOf(RegraDeNegocio);
    const logs = await prisma.log.findMany({ where: { acao: "DESPUBLICOU" } });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entidade: "PrestacaoContas",
      entidadeId: p.id,
      usuarioId: tesoureiro.id,
      valorNovo: "valor errado",
    });
  });
});

describe("listarPrestacoes", () => {
  it("ordena por ano, mês e versão desc; traz quem publicou e visualizações; filtra por ano", async () => {
    const a = await publicarPrestacao(tesoureiro, 2026, 8);
    const b = await publicarPrestacao(admin, 2026, 9);
    const c = await publicarPrestacao(tesoureiro, 2026, 9);
    const d = await publicarPrestacao(tesoureiro, 2025, 12);
    await abrirPrestacaoPublica(b.token);
    await despublicarPrestacao(tesoureiro, a.id, "erro");

    const todas = await listarPrestacoes(pastor, {});
    expect(todas.map((p) => p.id)).toEqual([c.id, b.id, a.id, d.id]);
    expect(todas[1]).toMatchObject({
      ano: 2026,
      mes: 9,
      versao: 1,
      token: b.token,
      publicadaPor: "Admin",
      visualizacoes: 1,
      despublicada: false,
    });
    expect(todas[1].publicadaEm).toBeInstanceOf(Date);
    expect(todas[2]).toMatchObject({ despublicada: true, publicadaPor: "Tesoureiro Teste" });
    expect(todas[2].despublicadaEm).toBeInstanceOf(Date);
    expect(todas[1]).not.toHaveProperty("dados");

    expect((await listarPrestacoes(tesoureiro, { ano: 2025 })).map((p) => p.id)).toEqual([d.id]);
    const semPermissao = await criarUsuario(admin, { nome: "ev", email: "ev@igreja.org", senha: "senha-forte-123", papeis: ["EVENTOS"] });
    await expect(listarPrestacoes(semPermissao, {})).rejects.toBeInstanceOf(NaoAutorizado);
  });
});
