// Semeia o banco de testes E2E. Roda via tsx (que resolve o alias "@/") a partir de preparar.ts,
// com DATABASE_URL já apontando para o banco de testes.
import { prisma } from "@/lib/db";
import { criarMembro } from "@/lib/services/cadastros";
import { instalar } from "@/lib/services/instalacao";
import { criarLancamento } from "@/lib/services/lancamentos";
import { criarUsuario } from "@/lib/services/usuarios";
import { resetarBanco } from "../helpers/db";
import { ADMIN, DESCRICAO_PREVISTO, MEMBRO, TESOUREIRO } from "./dados";

async function semear(): Promise<void> {
  await resetarBanco();
  const admin = await instalar({
    nomeIgreja: "Igreja de Teste",
    nomeConta: "Caixa",
    tipoConta: "CAIXA",
    saldoInicial: "0",
    adminNome: ADMIN.nome,
    adminEmail: ADMIN.email,
    adminSenha: ADMIN.senha,
  });
  await criarUsuario(admin, { ...TESOUREIRO, papeis: ["TESOUREIRO"] });
  await criarMembro(admin, { nome: MEMBRO });

  // Previsto de SAÍDA: dar baixa nele não mexe nas Entradas conferidas no teste do celular.
  const conta = await prisma.conta.findFirstOrThrow();
  const categoria = await prisma.categoria.findFirstOrThrow({ where: { tipo: "SAIDA", ativa: true } });
  await criarLancamento(admin, {
    tipo: "SAIDA",
    valor: "250,00",
    categoriaId: categoria.id,
    contaId: conta.id,
    descricao: DESCRICAO_PREVISTO,
    dataVencimento: new Date().toISOString().slice(0, 10),
    realizado: false,
  });
}

semear()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
