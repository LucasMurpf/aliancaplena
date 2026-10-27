import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado, NaoEncontrado, RegraDeNegocio, Validacao } from "@/lib/erros";
import {
  cancelarLancamento,
  criarLancamento,
  darBaixa,
  editarLancamento,
  listarLancamentos,
  mascararMembro,
  obterLancamento,
  type DadosLancamento,
} from "@/lib/services/lancamentos";
import {
  criarConta,
  criarMembro,
  definirCategoriaAtiva,
  definirContaAtiva,
  definirMembroAtivo,
} from "@/lib/services/cadastros";
import { formatarDataBR, hojeSP } from "@/lib/datas";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let pastor: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let pastorTes: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let dizimo: Categoria;
let oferta: Categoria;
let agua: Categoria;
let joao: Membro;

beforeEach(async () => {
  await resetarBanco();
  admin = await instalar({
    nomeIgreja: "Igreja",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "0",
    adminNome: "Admin",
    adminEmail: "admin@igreja.org",
    adminSenha: "senha-forte-123",
  });
  const mk = (nome: string, papeis: ("PASTOR" | "TESOUREIRO" | "EVENTOS")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  pastor = await mk("pastor", ["PASTOR"]);
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  pastorTes = await mk("pastortes", ["PASTOR", "TESOUREIRO"]);
  eventos = await mk("eventos", ["EVENTOS"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  dizimo = await prisma.categoria.findFirstOrThrow({ where: { nome: "Dízimo", tipo: "ENTRADA" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
  agua = await prisma.categoria.findFirstOrThrow({ where: { nome: "Água", tipo: "SAIDA" } });
  joao = await criarMembro(admin, { nome: "João" });
});

const base = (o: Partial<DadosLancamento> = {}): DadosLancamento => ({
  tipo: "ENTRADA",
  valor: "100,00",
  categoriaId: oferta.id,
  contaId: caixa.id,
  descricao: "Culto",
  dataVencimento: "10/03/2026",
  realizado: false,
  ...o,
});

const logs = (entidadeId: string) =>
  prisma.log.findMany({ where: { entidadeId }, orderBy: [{ dataHora: "asc" }, { id: "asc" }] });

const dataISO = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

describe("criarLancamento", () => {
  it("pastor não cria; pastor+tesoureiro cria; eventos não cria", async () => {
    await expect(criarLancamento(pastor, base())).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(criarLancamento(eventos, base())).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(criarLancamento(null, base())).rejects.toBeInstanceOf(NaoAutorizado);
    const l = await criarLancamento(pastorTes, base());
    expect(l.status).toBe("PREVISTO");
    expect(l.criadoPorId).toBe(pastorTes.id);
    expect(l.valor.toFixed(2)).toBe("100.00");
    expect(dataISO(l.dataRealizacao)).toBeNull();
  });

  it("loga CRIOU", async () => {
    const l = await criarLancamento(tesoureiro, base());
    const lg = await logs(l.id);
    expect(lg).toHaveLength(1);
    expect(lg[0]).toMatchObject({ acao: "CRIOU", entidade: "Lancamento", usuarioId: tesoureiro.id });
  });

  it("realizado sem dataRealizacao usa o vencimento; com data usa a informada", async () => {
    const a = await criarLancamento(tesoureiro, base({ realizado: true }));
    expect(a.status).toBe("REALIZADO");
    expect(dataISO(a.dataRealizacao)).toBe("2026-03-10");
    const b = await criarLancamento(tesoureiro, base({ realizado: true, dataRealizacao: "12/03/2026" }));
    expect(dataISO(b.dataRealizacao)).toBe("2026-03-12");
  });

  it("valida valor, data e tipo", async () => {
    await expect(criarLancamento(tesoureiro, base({ valor: "0" }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarLancamento(tesoureiro, base({ valor: "-5" }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarLancamento(tesoureiro, base({ dataVencimento: "31/02/2026" }))).rejects.toBeInstanceOf(Validacao);
    await expect(criarLancamento(tesoureiro, base({ tipo: "XX" as never }))).rejects.toBeInstanceOf(Validacao);
  });

  it("erros trazem campo e regra para o formulário", async () => {
    const falha = async (p: Promise<unknown>) => {
      const e = await p.then(
        () => null,
        (x: unknown) => x,
      );
      return { campo: (e as Validacao).campo, regra: (e as Validacao).regra };
    };
    expect(await falha(criarLancamento(tesoureiro, base({ valor: "abc" })))).toEqual({ campo: "valor", regra: "invalido" });
    expect(await falha(criarLancamento(tesoureiro, base({ valor: undefined as never })))).toEqual({ campo: "valor", regra: "obrigatorio" });
    expect(await falha(criarLancamento(tesoureiro, base({ valor: " " })))).toEqual({ campo: "valor", regra: "obrigatorio" });
    expect(await falha(criarLancamento(tesoureiro, base({ valor: "0.500" })))).toEqual({ campo: "valor", regra: "invalido" });
    expect(await falha(criarLancamento(tesoureiro, base({ valor: "10.000.000.000,00" })))).toEqual({
      campo: "valor",
      regra: "acima_limite",
    });
    expect(await falha(criarLancamento(tesoureiro, base({ categoriaId: "" })))).toEqual({ campo: "categoria", regra: "obrigatorio" });
    expect(await falha(criarLancamento(tesoureiro, base({ dataVencimento: "31/02/2026" })))).toEqual({ campo: "dataVencimento", regra: "invalido" });
    expect(await falha(criarLancamento(tesoureiro, base({ categoriaId: agua.id })))).toEqual({ campo: "categoria", regra: "tipo_incompativel" });
    expect(await falha(criarLancamento(tesoureiro, base({ categoriaId: dizimo.id })))).toEqual({ campo: "membro", regra: "obrigatorio" });
    const l = await criarLancamento(tesoureiro, base());
    expect(await falha(darBaixa(tesoureiro, l.id, "xx"))).toEqual({ campo: "dataRealizacao", regra: "invalido" });
    expect(await falha(cancelarLancamento(tesoureiro, l.id, " "))).toEqual({ campo: "motivo", regra: "obrigatorio" });
  });

  it("categoria de tipo diferente é recusada", async () => {
    await expect(criarLancamento(tesoureiro, base({ categoriaId: agua.id }))).rejects.toThrow(
      "Categoria não corresponde ao tipo do lançamento",
    );
  });

  it("categoria nominal exige membro; não nominal não aceita membro", async () => {
    await expect(criarLancamento(tesoureiro, base({ categoriaId: dizimo.id }))).rejects.toThrow(
      "Esta categoria exige um membro",
    );
    await expect(criarLancamento(tesoureiro, base({ membroId: joao.id }))).rejects.toThrow(
      "Esta categoria não aceita membro",
    );
    const l = await criarLancamento(tesoureiro, base({ categoriaId: dizimo.id, membroId: joao.id }));
    expect(l.membroId).toBe(joao.id);
  });

  it("recusa cadastros inativos ao criar", async () => {
    const conta = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0" });
    await definirContaAtiva(admin, conta.id, false);
    await expect(criarLancamento(tesoureiro, base({ contaId: conta.id }))).rejects.toThrow("Conta inativa");

    await definirMembroAtivo(admin, joao.id, false);
    await expect(
      criarLancamento(tesoureiro, base({ categoriaId: dizimo.id, membroId: joao.id })),
    ).rejects.toThrow("Membro inativo");

    await definirCategoriaAtiva(admin, oferta.id, false);
    await expect(criarLancamento(tesoureiro, base())).rejects.toThrow("Categoria inativa");
  });

  it("cadastro inexistente → NaoEncontrado", async () => {
    await expect(criarLancamento(tesoureiro, base({ contaId: "nao-existe" }))).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("editarLancamento", () => {
  it("pastor não edita", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(editarLancamento(pastor, l.id, base())).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("valor 100 → 150 loga ALTEROU valor legível; sem mudança não loga", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await editarLancamento(tesoureiro, l.id, base());
    expect((await logs(l.id)).filter((x) => x.acao === "ALTEROU")).toHaveLength(0);

    const e = await editarLancamento(tesoureiro, l.id, base({ valor: "150,00" }));
    expect(e.valor.toFixed(2)).toBe("150.00");
    expect(e.atualizadoPorId).toBe(tesoureiro.id);
    const alt = (await logs(l.id)).filter((x) => x.acao === "ALTEROU");
    expect(alt).toHaveLength(1);
    expect(alt[0]).toMatchObject({ campo: "valor", valorAnterior: "R$ 100,00", valorNovo: "R$ 150,00" });
  });

  it("formulário desatualizado (versão antiga) é recusado em vez de sobrescrever", async () => {
    const l = await criarLancamento(tesoureiro, base());
    const versaoA = l.atualizadoEm.toISOString(); // A abre o formulário
    const b = await editarLancamento(pastorTes, l.id, base({ valor: "150,00" }), versaoA); // B salva antes
    await expect(editarLancamento(tesoureiro, l.id, base({ descricao: "Só a descrição" }), versaoA)).rejects.toThrow(
      "Este lançamento foi alterado por outra pessoa. Recarregue a página.",
    );
    const agora = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    expect(agora.valor.toFixed(2)).toBe("150.00");
    expect(agora.descricao).toBe("Culto");

    // Baixa também muda a versão.
    await darBaixa(tesoureiro, l.id, "11/03/2026");
    await expect(
      editarLancamento(tesoureiro, l.id, base({ valor: "150,00", descricao: "X" }), b.atualizadoEm.toISOString()),
    ).rejects.toBeInstanceOf(RegraDeNegocio);

    // Com a versão atual, salva; sem versão, segue o comportamento anterior.
    const atual = await prisma.lancamento.findUniqueOrThrow({ where: { id: l.id } });
    const ok = await editarLancamento(
      tesoureiro,
      l.id,
      base({ valor: "150,00", descricao: "X", realizado: true }),
      atual.atualizadoEm.toISOString(),
    );
    expect(ok.descricao).toBe("X");
    await expect(editarLancamento(tesoureiro, l.id, base({ valor: "150,00", descricao: "Y", realizado: true }), "lixo")).rejects.toBeInstanceOf(
      Validacao,
    );
  });

  it("loga categoria e membro pelo nome, e datas formatadas", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await editarLancamento(
      tesoureiro,
      l.id,
      base({ categoriaId: dizimo.id, membroId: joao.id, dataVencimento: "15/03/2026" }),
    );
    const alt = (await logs(l.id)).filter((x) => x.acao === "ALTEROU");
    const porCampo = Object.fromEntries(alt.map((x) => [x.campo, x]));
    expect(porCampo.categoria).toMatchObject({ valorAnterior: "Oferta", valorNovo: "Dízimo" });
    expect(porCampo.membro).toMatchObject({ valorAnterior: null, valorNovo: "João" });
    expect(porCampo.dataVencimento).toMatchObject({ valorAnterior: "10/03/2026", valorNovo: "15/03/2026" });
  });

  it("previsto continua previsto; realizado:true realiza; realizado:false volta a previsto", async () => {
    const l = await criarLancamento(tesoureiro, base());
    const a = await editarLancamento(tesoureiro, l.id, base({ descricao: "X" }));
    expect(a.status).toBe("PREVISTO");
    const b = await editarLancamento(tesoureiro, l.id, base({ descricao: "X", realizado: true }));
    expect(b.status).toBe("REALIZADO");
    expect(dataISO(b.dataRealizacao)).toBe("2026-03-10");
    const c = await editarLancamento(tesoureiro, l.id, base({ descricao: "X", realizado: false }));
    expect(c.status).toBe("PREVISTO");
    expect(c.dataRealizacao).toBeNull();
    const st = (await logs(l.id)).filter((x) => x.campo === "status");
    expect(st.map((x) => [x.valorAnterior, x.valorNovo])).toEqual([
      ["PREVISTO", "REALIZADO"],
      ["REALIZADO", "PREVISTO"],
    ]);
  });

  it("aplica as validações de coerência", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(editarLancamento(tesoureiro, l.id, base({ categoriaId: agua.id }))).rejects.toThrow(
      "Categoria não corresponde ao tipo do lançamento",
    );
    await expect(editarLancamento(tesoureiro, l.id, base({ categoriaId: dizimo.id }))).rejects.toThrow(
      "Esta categoria exige um membro",
    );
    await expect(editarLancamento(tesoureiro, l.id, base({ membroId: joao.id }))).rejects.toThrow(
      "Esta categoria não aceita membro",
    );
  });

  it("Review Focus 4: categoria inativada depois de usada — editar descrição ok, criar novo recusa", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await definirCategoriaAtiva(admin, oferta.id, false);
    const e = await editarLancamento(tesoureiro, l.id, base({ descricao: "Nova descrição" }));
    expect(e.descricao).toBe("Nova descrição");
    await expect(criarLancamento(tesoureiro, base())).rejects.toThrow("Categoria inativa");
  });

  it("trocar para conta/membro inativo é recusado; manter o mesmo inativo é permitido", async () => {
    const banco = await criarConta(admin, { nome: "Banco", tipo: "BANCO", saldoInicial: "0" });
    await definirContaAtiva(admin, banco.id, false);
    const l = await criarLancamento(tesoureiro, base({ categoriaId: dizimo.id, membroId: joao.id }));
    await expect(
      editarLancamento(tesoureiro, l.id, base({ categoriaId: dizimo.id, membroId: joao.id, contaId: banco.id })),
    ).rejects.toThrow("Conta inativa");

    await definirMembroAtivo(admin, joao.id, false);
    await editarLancamento(tesoureiro, l.id, base({ categoriaId: dizimo.id, membroId: joao.id, valor: "200" }));
    const maria = await criarMembro(admin, { nome: "Maria" });
    await definirMembroAtivo(admin, maria.id, false);
    await expect(
      editarLancamento(tesoureiro, l.id, base({ categoriaId: dizimo.id, membroId: maria.id })),
    ).rejects.toThrow("Membro inativo");
  });

  it("lançamento inexistente → NaoEncontrado", async () => {
    await expect(editarLancamento(tesoureiro, "nao-existe", base())).rejects.toThrow("Lançamento não encontrado");
  });
});

describe("darBaixa", () => {
  it("de PREVISTO para REALIZADO com log DEU_BAIXA", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(darBaixa(pastor, l.id, "11/03/2026")).rejects.toBeInstanceOf(NaoAutorizado);
    const b = await darBaixa(tesoureiro, l.id, "11/03/2026");
    expect(b.status).toBe("REALIZADO");
    expect(dataISO(b.dataRealizacao)).toBe("2026-03-11");
    const lg = (await logs(l.id)).filter((x) => x.acao === "DEU_BAIXA");
    expect(lg).toHaveLength(1);
    expect(lg[0]).toMatchObject({ campo: "dataRealizacao", valorNovo: "11/03/2026" });
  });

  it("Review Focus 3: baixa em realizado é recusada", async () => {
    const l = await criarLancamento(tesoureiro, base({ realizado: true }));
    await expect(darBaixa(tesoureiro, l.id, "11/03/2026")).rejects.toThrow("Lançamento já realizado");
    await expect(darBaixa(tesoureiro, l.id, "11/03/2026")).rejects.toBeInstanceOf(RegraDeNegocio);
  });

  it("data inválida → Validacao", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(darBaixa(tesoureiro, l.id, "xx")).rejects.toBeInstanceOf(Validacao);
  });
});

describe("cancelarLancamento", () => {
  it("motivo em branco é recusado", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(cancelarLancamento(tesoureiro, l.id, "   ")).rejects.toBeInstanceOf(Validacao);
  });

  it("com motivo cancela, grava motivo e loga CANCELOU", async () => {
    const l = await criarLancamento(tesoureiro, base({ realizado: true }));
    await expect(cancelarLancamento(pastor, l.id, "Erro")).rejects.toBeInstanceOf(NaoAutorizado);
    const c = await cancelarLancamento(tesoureiro, l.id, "  Lançado em duplicidade ");
    expect(c.status).toBe("CANCELADO");
    expect(c.motivoCancelamento).toBe("Lançado em duplicidade");
    const lg = (await logs(l.id)).filter((x) => x.acao === "CANCELOU");
    expect(lg).toHaveLength(1);
    expect(lg[0]).toMatchObject({ campo: "status", valorAnterior: "REALIZADO", valorNovo: "Lançado em duplicidade" });
  });

  it("Review Focus 3: editar, dar baixa ou cancelar um cancelado é recusado", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await cancelarLancamento(tesoureiro, l.id, "Erro");
    const msg = "Lançamento cancelado não pode ser alterado";
    await expect(editarLancamento(tesoureiro, l.id, base({ valor: "1" }))).rejects.toThrow(msg);
    await expect(darBaixa(tesoureiro, l.id, "11/03/2026")).rejects.toThrow(msg);
    await expect(cancelarLancamento(tesoureiro, l.id, "De novo")).rejects.toThrow(msg);
    await expect(cancelarLancamento(tesoureiro, l.id, "De novo")).rejects.toBeInstanceOf(RegraDeNegocio);
  });
});

describe("leitura", () => {
  it("mascararMembro: sem membros.ver_nomes vira 'Contribuição nominal'", () => {
    const l = { id: "1", membro: { id: "m", nome: "João" } };
    expect(mascararMembro(l, []).membro?.nome).toBe("Contribuição nominal");
    expect(mascararMembro(l, ["PASTOR"]).membro?.nome).toBe("João");
    expect(l.membro.nome).toBe("João");
    const semMembro = { id: "2", membro: null };
    expect(mascararMembro(semMembro, []).membro).toBeNull();
  });

  it("obterLancamento inclui relações e exige financeiro.ver", async () => {
    const l = await criarLancamento(tesoureiro, base({ categoriaId: dizimo.id, membroId: joao.id }));
    const o = await obterLancamento(pastor, l.id);
    expect(o.categoria.nome).toBe("Dízimo");
    expect(o.conta.nome).toBe("Caixa");
    expect(o.membro?.nome).toBe("João");
    expect(o.anexos).toEqual([]);
    await expect(obterLancamento(eventos, l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(obterLancamento(pastor, "nao-existe")).rejects.toThrow("Lançamento não encontrado");
  });

  it("listar: 25 itens → página 1 com 20, total 25, somas sobre todos", async () => {
    for (let i = 1; i <= 25; i++) {
      const dia = String(i).padStart(2, "0");
      await criarLancamento(tesoureiro, base({ valor: "10,00", dataVencimento: `${dia}/01/2026` }));
    }
    await criarLancamento(tesoureiro, base({ tipo: "SAIDA", categoriaId: agua.id, valor: "7,50", dataVencimento: "01/02/2026" }));
    const r = await listarLancamentos(pastor, { tipo: "ENTRADA" });
    expect(r.itens).toHaveLength(20);
    expect(r.total).toBe(25);
    expect(r.somaEntradasPrevistas.toFixed(2)).toBe("250.00");
    expect(r.somaEntradasRealizadas.toFixed(2)).toBe("0.00");
    expect(r.somaSaidasPrevistas.toFixed(2)).toBe("0.00");
    expect(r.haPrevistos).toBe(true);
    expect(dataISO(r.itens[0].dataVencimento)).toBe("2026-01-25");
    const p2 = await listarLancamentos(pastor, { tipo: "ENTRADA", pagina: 2 });
    expect(p2.itens).toHaveLength(5);
    expect(dataISO(p2.itens[4].dataVencimento)).toBe("2026-01-01");

    await expect(listarLancamentos(pastor, { pagina: 1e21 })).rejects.toBeInstanceOf(Validacao);
    await expect(listarLancamentos(pastor, { pagina: 10_001 })).rejects.toBeInstanceOf(Validacao);

    const todos = await listarLancamentos(pastor, {});
    expect(todos.total).toBe(26);
    expect(todos.somaSaidasPrevistas.toFixed(2)).toBe("7.50");
    await expect(listarLancamentos(eventos, {})).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("listar: somas separam realizado de previsto (nunca misturam)", async () => {
    await criarLancamento(tesoureiro, base({ valor: "100,00", realizado: true, dataRealizacao: "10/03/2026" }));
    await criarLancamento(tesoureiro, base({ valor: "40,00" }));
    await criarLancamento(tesoureiro, base({ tipo: "SAIDA", categoriaId: agua.id, valor: "30,00", realizado: true, dataRealizacao: "10/03/2026" }));
    await criarLancamento(tesoureiro, base({ tipo: "SAIDA", categoriaId: agua.id, valor: "5,00" }));
    const canc = await criarLancamento(tesoureiro, base({ valor: "999,00", realizado: true, dataRealizacao: "10/03/2026" }));
    await cancelarLancamento(tesoureiro, canc.id, "Erro");

    const r = await listarLancamentos(pastor, {});
    expect(r.somaEntradasRealizadas.toFixed(2)).toBe("100.00");
    expect(r.somaSaidasRealizadas.toFixed(2)).toBe("30.00");
    expect(r.somaEntradasPrevistas.toFixed(2)).toBe("40.00");
    expect(r.somaSaidasPrevistas.toFixed(2)).toBe("5.00");
    expect(r.haPrevistos).toBe(true);

    const so = await listarLancamentos(pastor, { status: "REALIZADO" });
    expect(so.somaEntradasRealizadas.toFixed(2)).toBe("100.00");
    expect(so.somaEntradasPrevistas.toFixed(2)).toBe("0.00");
    expect(so.haPrevistos).toBe(false);
  });

  it("listar: período pela data efetiva, cancelados só quando pedidos, busca e filtros", async () => {
    // previsto vence em 05/01; realizado vence 05/01 mas realizado em 10/02
    const prev = await criarLancamento(tesoureiro, base({ dataVencimento: "05/01/2026", descricao: "Aluguel janeiro" }));
    const real = await criarLancamento(
      tesoureiro,
      base({ dataVencimento: "05/01/2026", realizado: true, dataRealizacao: "10/02/2026", descricao: "Culto de domingo" }),
    );
    const canc = await criarLancamento(tesoureiro, base({ dataVencimento: "06/01/2026" }));
    await cancelarLancamento(tesoureiro, canc.id, "Erro");

    const jan = await listarLancamentos(tesoureiro, { de: "01/01/2026", ate: "31/01/2026" });
    expect(jan.itens.map((x) => x.id)).toEqual([prev.id]);
    const fev = await listarLancamentos(tesoureiro, { de: "10/02/2026", ate: "10/02/2026" });
    expect(fev.itens.map((x) => x.id)).toEqual([real.id]);

    const cancelados = await listarLancamentos(tesoureiro, { status: "CANCELADO" });
    expect(cancelados.itens.map((x) => x.id)).toEqual([canc.id]);
    // Cancelados não entram em nenhuma soma.
    expect(cancelados.somaEntradasRealizadas.toFixed(2)).toBe("0.00");
    expect(cancelados.somaEntradasPrevistas.toFixed(2)).toBe("0.00");
    expect(cancelados.haPrevistos).toBe(false);

    const busca = await listarLancamentos(tesoureiro, { busca: "CULTO" });
    expect(busca.itens.map((x) => x.id)).toEqual([real.id]);

    const st = await listarLancamentos(tesoureiro, { status: "PREVISTO" });
    expect(st.itens.map((x) => x.id)).toEqual([prev.id]);
    expect((await listarLancamentos(tesoureiro, { contaId: caixa.id })).total).toBe(2);
    expect((await listarLancamentos(tesoureiro, { categoriaId: agua.id })).total).toBe(0);

    await expect(listarLancamentos(tesoureiro, { de: "xx" })).rejects.toBeInstanceOf(Validacao);
    await expect(listarLancamentos(tesoureiro, { pagina: 0 })).rejects.toBeInstanceOf(Validacao);
  });

  it("listar por membro inclui o membro", async () => {
    const l = await criarLancamento(tesoureiro, base({ categoriaId: dizimo.id, membroId: joao.id }));
    await criarLancamento(tesoureiro, base());
    const r = await listarLancamentos(pastor, { membroId: joao.id });
    expect(r.itens.map((x) => x.id)).toEqual([l.id]);
    expect(r.itens[0].membro?.nome).toBe("João");
    expect(r.itens[0].categoria.nome).toBe("Dízimo");
  });
});

describe("concorrência", () => {
  it("duas baixas simultâneas: só uma vence", async () => {
    const l = await criarLancamento(tesoureiro, base());
    const rs = await Promise.allSettled([
      darBaixa(tesoureiro, l.id, "11/03/2026"),
      darBaixa(tesoureiro, l.id, "12/03/2026"),
    ]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await logs(l.id)).filter((x) => x.acao === "DEU_BAIXA")).toHaveLength(1);
  });
});

describe("data de realização futura", () => {
  const MSG = "A data de realização não pode ser futura";
  const amanha = () => formatarDataBR(new Date(hojeSP().getTime() + 24 * 3600 * 1000));
  const hoje = () => formatarDataBR(hojeSP());
  const esperado = { message: MSG, campo: "dataRealizacao", regra: "futura" };

  it("criar recusa data futura e aceita hoje", async () => {
    await expect(
      criarLancamento(tesoureiro, base({ realizado: true, dataRealizacao: amanha() })),
    ).rejects.toMatchObject(esperado);
    await expect(
      criarLancamento(tesoureiro, base({ realizado: true, dataRealizacao: hoje() })),
    ).resolves.toBeDefined();
  });

  it("criar realizado sem data usa o vencimento: vencimento futuro é recusado", async () => {
    await expect(
      criarLancamento(tesoureiro, base({ dataVencimento: amanha(), realizado: true })),
    ).rejects.toMatchObject(esperado);
    await expect(criarLancamento(tesoureiro, base({ dataVencimento: amanha() }))).resolves.toBeDefined();
  });

  it("editar recusa data futura e aceita hoje", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(
      editarLancamento(tesoureiro, l.id, base({ realizado: true, dataRealizacao: amanha() })),
    ).rejects.toMatchObject(esperado);
    await expect(
      editarLancamento(tesoureiro, l.id, base({ realizado: true, dataRealizacao: hoje() })),
    ).resolves.toBeDefined();
  });

  it("darBaixa recusa data futura e aceita hoje", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(darBaixa(tesoureiro, l.id, amanha())).rejects.toMatchObject(esperado);
    await expect(darBaixa(tesoureiro, l.id, hoje())).resolves.toBeDefined();
  });
});
