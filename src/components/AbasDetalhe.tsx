import Link from "next/link";

/** Abas "Dados" e "Histórico" de um cadastro (`?aba=historico`). Só mostra a aba se houver permissão. */
export function AbasDetalhe({ base, historico, podeHistorico }: { base: string; historico: boolean; podeHistorico: boolean }) {
  if (!podeHistorico) return null;
  const aba = (ativa: boolean) =>
    `flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-semibold ${ativa ? "bg-marca-600 text-white" : "text-marca-900 hover:bg-marca-50"}`;
  return (
    <nav aria-label="Seções" className="flex gap-1 rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200">
      <Link replace scroll={false} href={base} aria-current={historico ? undefined : "page"} className={aba(!historico)}>
        Dados
      </Link>
      <Link replace scroll={false} href={`${base}?aba=historico`} aria-current={historico ? "page" : undefined} className={aba(historico)}>
        Histórico
      </Link>
    </nav>
  );
}
