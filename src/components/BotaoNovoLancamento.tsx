import Link from "next/link";

/** Atalho flutuante (canto inferior direito) para quem pode lançar. */
export function BotaoNovoLancamento() {
  return (
    <Link
      href="/lancamentos/novo"
      aria-label="Novo lançamento"
      className="fixed bottom-5 right-5 z-30 flex size-14 items-center justify-center rounded-full bg-marca-600 text-3xl leading-none text-white shadow-lg hover:bg-marca-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
    >
      <span aria-hidden="true">+</span>
    </Link>
  );
}
