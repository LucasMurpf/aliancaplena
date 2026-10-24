import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { PainelPublico } from "@/components/PainelPublico";
import { sistemaInstalado } from "@/lib/services/instalacao";
import { FormularioInstalacao } from "./FormularioInstalacao";

export default function PaginaInstalacao() {
  return (
    <Suspense fallback={null}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await connection();
  if (await sistemaInstalado()) redirect("/login");
  return (
    <PainelPublico titulo="Primeiros passos" subtitulo="Configure a igreja e crie o administrador" larga>
      <FormularioInstalacao />
    </PainelPublico>
  );
}
