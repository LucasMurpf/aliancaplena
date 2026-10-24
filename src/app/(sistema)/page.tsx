import { redirect } from "next/navigation";
import { obterUsuarioAtual } from "@/lib/auth";
import { pode } from "@/lib/permissoes";

// Provisório: a Task 16 substitui por o painel (dashboard).
export default async function PaginaInicio() {
  const usuario = await obterUsuarioAtual();
  if (usuario && !pode(usuario.papeis, "financeiro.ver")) redirect("/em-breve");
  return (
    <div>
      <h1 className="text-2xl font-bold text-marca-900">Início</h1>
    </div>
  );
}
