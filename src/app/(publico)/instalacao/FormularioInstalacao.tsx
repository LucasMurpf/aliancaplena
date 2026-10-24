"use client";

import { useRouter } from "next/navigation";
import { Campo } from "@/components/ui/Campo";
import { Formulario } from "@/components/ui/Formulario";
import { novaSessaoMetricas, rastrear } from "@/lib/metricas/cliente";
import { instalarAction } from "./actions";

export function FormularioInstalacao() {
  const router = useRouter();
  return (
    <Formulario
      acao={instalarAction}
      textoBotao="Concluir instalação"
      textoEnviando="Instalando…"
      aoSucesso={() => {
        novaSessaoMetricas();
        rastrear("login");
        router.replace("/");
        router.refresh();
      }}
    >
      {(estado) => {
        const v = estado.valores ?? {};
        return (
          <>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold text-marca-900">Igreja</legend>
              <Campo rotulo="Nome da igreja" name="nomeIgreja" required defaultValue={v.nomeIgreja} />
              <Campo rotulo="Endereço da logo (opcional)" name="logoUrl" type="url" placeholder="https://…" defaultValue={v.logoUrl} />
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold text-marca-900">Primeira conta</legend>
              <Campo rotulo="Nome da conta" name="nomeConta" placeholder="Ex.: Caixa da tesouraria" required defaultValue={v.nomeConta} />
              <div className="flex flex-col gap-1">
                <label htmlFor="tipoConta" className="text-sm font-medium text-slate-800">
                  Tipo
                </label>
                <select
                  id="tipoConta"
                  name="tipoConta"
                  defaultValue={v.tipoConta ?? "CAIXA"}
                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:border-marca-600 focus-visible:outline-2 focus-visible:outline-marca-600"
                >
                  <option value="CAIXA">Caixa (dinheiro)</option>
                  <option value="BANCO">Banco</option>
                </select>
              </div>
              <Campo rotulo="Saldo inicial (R$)" name="saldoInicial" inputMode="decimal" placeholder="0,00" defaultValue={v.saldoInicial} />
            </fieldset>
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 text-sm font-semibold text-marca-900">Administrador</legend>
              <Campo rotulo="Nome" name="adminNome" autoComplete="name" required defaultValue={v.adminNome} />
              <Campo rotulo="E-mail" name="adminEmail" type="email" autoComplete="username" required defaultValue={v.adminEmail} />
              <Campo rotulo="Senha" name="adminSenha" type="password" autoComplete="new-password" minLength={8} required ajuda="Mínimo de 8 caracteres." />
            </fieldset>
          </>
        );
      }}
    </Formulario>
  );
}
