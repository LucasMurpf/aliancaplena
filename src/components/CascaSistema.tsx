"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { ItemMenu } from "@/lib/menu";
import { rastrear } from "@/lib/metricas/cliente";
import { BotaoNovoLancamento } from "./BotaoNovoLancamento";
import { MenuLateral } from "./MenuLateral";
import { MonitorInatividade } from "./MonitorInatividade";
import { RastreioTelas } from "./RastreioTelas";

type Props = {
  itens: ItemMenu[];
  nomeIgreja: string;
  logoUrl: string | null;
  nomeUsuario: string;
  podeLancar: boolean;
  children: ReactNode;
};

/** Menu fixo em telas grandes; gaveta com overlay (☰) nas pequenas. */
export function CascaSistema({ itens, nomeIgreja, logoUrl, nomeUsuario, podeLancar, children }: Props) {
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();
  // O atalho ➕ ficaria sobre os botões de Salvar nas telas de formulário (lançamentos, membros e configurações).
  const emFormulario =
    pathname.startsWith("/lancamentos/novo") ||
    pathname.startsWith("/calculadora/nova") ||
    /^\/lancamentos\/[^/]+\/editar/.test(pathname) ||
    /^\/membros\/(novo|[^/]+)$/.test(pathname) ||
    pathname.startsWith("/configuracoes/");

  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  const menu = (aoEscolher?: () => void) => (
    <MenuLateral itens={itens} nomeIgreja={nomeIgreja} logoUrl={logoUrl} nomeUsuario={nomeUsuario} aoEscolher={aoEscolher} />
  );

  return (
    <div className="flex min-h-screen flex-1">
      <RastreioTelas />
      <MonitorInatividade />

      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 self-start overflow-y-auto lg:block">{menu()}</aside>

      {/* Gaveta (abaixo de lg) */}
      <div className={`fixed inset-0 z-40 lg:hidden ${aberto ? "" : "pointer-events-none"}`} aria-hidden={!aberto}>
        <div
          onClick={() => setAberto(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity ${aberto ? "opacity-100" : "opacity-0"}`}
        />
        <div
          id="gaveta-menu"
          inert={!aberto}
          className={`absolute inset-y-0 left-0 w-72 max-w-[85vw] transition-transform ${aberto ? "translate-x-0" : "-translate-x-full"}`}
        >
          {menu(() => setAberto(false))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 lg:hidden">
          <button
            type="button"
            aria-label="Abrir menu"
            aria-expanded={aberto}
            aria-controls="gaveta-menu"
            onClick={() => {
              setAberto(true);
              rastrear("menu_aberto");
            }}
            className="flex size-11 items-center justify-center rounded-lg text-2xl text-marca-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-marca-600"
          >
            <span aria-hidden="true">☰</span>
          </button>
          <span className="truncate text-base font-semibold text-marca-900">{nomeIgreja}</span>
        </header>
        <main className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8">{children}</main>
      </div>

      {podeLancar && !emFormulario ? <BotaoNovoLancamento /> : null}
    </div>
  );
}
