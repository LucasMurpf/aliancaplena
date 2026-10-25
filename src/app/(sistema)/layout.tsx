import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { CascaSistema } from "@/components/CascaSistema";
import { obterUsuarioAtual } from "@/lib/auth";
import { itensDoMenu } from "@/lib/menu";
import { pode } from "@/lib/permissoes";
import { obterConfiguracao } from "@/lib/services/configuracao";

export default function LayoutSistema({ children }: { children: ReactNode }) {
  // A sessão é lida em tempo de requisição: fica atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="flex-1" aria-busy="true" />}>
      <Autenticado>{children}</Autenticado>
    </Suspense>
  );
}

async function Autenticado({ children }: { children: ReactNode }) {
  const usuario = await obterUsuarioAtual();
  // Usuário inexistente/inativado: o proxy só valida o token, esta é a checagem de verdade.
  if (!usuario) redirect("/login?expirou=1");
  const config = await obterConfiguracao();
  return (
    <CascaSistema
      itens={itensDoMenu(usuario.papeis)}
      nomeIgreja={config?.nomeIgreja ?? "Gestão da Igreja"}
      logoUrl={config?.logoUrl ?? null}
      nomeUsuario={usuario.nome}
      podeLancar={pode(usuario.papeis, "financeiro.lancar")}
    >
      {children}
    </CascaSistema>
  );
}
