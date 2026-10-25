import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Alerta } from "@/components/ui/Alerta";
import { PainelPublico } from "@/components/PainelPublico";
import { sistemaInstalado } from "@/lib/services/instalacao";
import { FormularioLogin } from "./FormularioLogin";

export default function PaginaLogin({ searchParams }: PageProps<"/login">) {
  return (
    <Suspense fallback={null}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  await connection();
  if (!(await sistemaInstalado())) redirect("/instalacao");
  const { expirou } = await searchParams;
  return (
    <PainelPublico titulo="Gestão da Igreja" subtitulo="Entre com seu e-mail e senha">
      {expirou === "1" ? (
        <div className="mb-4">
          <Alerta tipo="info">Sua sessão expirou por inatividade. Entre novamente.</Alerta>
        </div>
      ) : null}
      <FormularioLogin />
    </PainelPublico>
  );
}
