import { Suspense } from "react";
import { PaginaRelatorio } from "@/components/relatorios/PaginaRelatorio";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function Pagina(props: Props) {
  // Sessão e dados são lidos em requisição: ficam atrás de Suspense (Cache Components).
  return (
    <Suspense fallback={<div className="mx-auto max-w-5xl" aria-busy="true" />}>
      <PaginaRelatorio tipo="arrecadacao" searchParams={props.searchParams} />
    </Suspense>
  );
}
