import { beforeEach, describe, expect, it } from "vitest";
import type { Categoria, Conta, Membro } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { UsuarioAtual } from "@/lib/auth";
import { NaoAutorizado } from "@/lib/erros";
import { historicoDe, ROTULO_ACAO, ROTULO_CAMPO } from "@/lib/services/historico";
import { criarLancamento, editarLancamento, type DadosLancamento } from "@/lib/services/lancamentos";
import { criarMembro } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";

let admin: UsuarioAtual;
let tesoureiro: UsuarioAtual;
let eventos: UsuarioAtual;
let caixa: Conta;
let oferta: Categoria;
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
  const mk = (nome: string, papeis: ("TESOUREIRO" | "EVENTOS")[]) =>
    criarUsuario(admin, { nome, email: `${nome}@igreja.org`, senha: "senha-forte-123", papeis });
  tesoureiro = await mk("tes", ["TESOUREIRO"]);
  eventos = await mk("eventos", ["EVENTOS"]);
  caixa = await prisma.conta.findFirstOrThrow({ where: { nome: "Caixa" } });
  oferta = await prisma.categoria.findFirstOrThrow({ where: { nome: "Oferta", tipo: "ENTRADA" } });
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

describe("historicoDe", () => {
  it("retorna criação e edição em ordem decrescente, com ação traduzida", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await editarLancamento(tesoureiro, l.id, base({ valor: "150,00", descricao: "Culto noturno" }));

    const h = await historicoDe(tesoureiro, "Lancamento", l.id);

    expect(h.length).toBeGreaterThanOrEqual(2);
    expect(h[0].acao).toBe("Alterou");
    expect(h[h.length - 1].acao).toBe("Criou");
    for (let i = 1; i < h.length; i++) {
      expect(h[i - 1].dataHora.getTime()).toBeGreaterThanOrEqual(h[i].dataHora.getTime());
    }
    expect(h[h.length - 1]).toMatchObject({ usuario: "tes", campo: null });

    const campos = h.filter((e) => e.acao === "Alterou").map((e) => e.campo);
    expect(campos.sort()).toEqual(["Descrição", "Valor"]);
    const valor = h.find((e) => e.campo === "Valor");
    expect(valor).toMatchObject({ de: "R$ 100,00", para: "R$ 150,00" });
  });

  it("usuario é 'Sistema' quando o log não tem usuário", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await prisma.log.create({
      data: { entidade: "Lancamento", entidadeId: l.id, acao: "LOGIN" },
    });
    const h = await historicoDe(tesoureiro, "Lancamento", l.id);
    expect(h.find((e) => e.acao === "Entrou no sistema")?.usuario).toBe("Sistema");
  });

  it("usuário só com EVENTOS recebe NaoAutorizado", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await expect(historicoDe(eventos, "Lancamento", l.id)).rejects.toBeInstanceOf(NaoAutorizado);
    await expect(historicoDe(null, "Lancamento", l.id)).rejects.toBeInstanceOf(NaoAutorizado);
  });

  it("devolve no máximo 200 linhas", async () => {
    const l = await criarLancamento(tesoureiro, base());
    await prisma.log.createMany({
      data: Array.from({ length: 210 }, () => ({
        entidade: "Lancamento",
        entidadeId: l.id,
        acao: "ALTEROU",
        campo: "descricao",
        valorAnterior: "a",
        valorNovo: "b",
      })),
    });
    expect(await historicoDe(tesoureiro, "Lancamento", l.id)).toHaveLength(200);
  });
});

describe("rótulos", () => {
  it("traduz todas as ações e campos conhecidos", () => {
    expect(ROTULO_ACAO).toMatchObject({
      CRIOU: "Criou",
      ALTEROU: "Alterou",
      DEU_BAIXA: "Deu baixa",
      CANCELOU: "Cancelou",
      INATIVOU: "Inativou",
      REATIVOU: "Reativou",
      ANEXOU: "Anexou arquivo",
      LOGIN: "Entrou no sistema",
      LOGIN_FALHOU: "Falha de login",
      INSTALOU: "Instalou o sistema",
    });
    expect(ROTULO_CAMPO.dataVencimento).toBe("Vencimento");
    expect(ROTULO_CAMPO.dataRealizacao).toBe("Data de realização");
    expect(ROTULO_CAMPO.dataNascimento).toBe("Nascimento");
    expect(ROTULO_CAMPO.papeis).toBe("Papéis");
  });
});
