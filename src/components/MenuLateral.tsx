"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ItemMenu } from "@/lib/menu";
import { rastrear } from "@/lib/metricas/cliente";
import { sairEIrParaLogin } from "@/app/(sistema)/actions";

type Props = {
  itens: ItemMenu[];
  nomeIgreja: string;
  logoUrl: string | null;
  nomeUsuario: string;
  aoEscolher?: () => void;
};

function logoSegura(url: string | null): string | null {
  return url && /^https?:\/\//i.test(url) ? url : null;
}

function ativo(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function MenuLateral({ itens, nomeIgreja, logoUrl, nomeUsuario, aoEscolher }: Props) {
  const pathname = usePathname();
  const logo = logoSegura(logoUrl);
  const grupos: { titulo?: string; itens: ItemMenu[] }[] = [];
  for (const item of itens) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.titulo === item.grupo) ultimo.itens.push(item);
    else grupos.push({ titulo: item.grupo, itens: [item] });
  }

  return (
    <div className="flex h-full flex-col bg-marca-900 text-white">
      <div className="flex items-center gap-3 px-5 py-5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo externa de domínio desconhecido
          <img src={logo} alt="" className="size-10 rounded-lg bg-white object-contain" />
        ) : (
          <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-lg bg-white/15 text-xl">
            ⛪
          </span>
        )}
        <span className="text-base font-semibold leading-tight">{nomeIgreja}</span>
      </div>

      <nav aria-label="Menu principal" className="flex-1 overflow-y-auto px-3 pb-4">
        {grupos.map((g, i) => (
          <div key={g.titulo ?? `g${i}`} className="mt-2">
            {g.titulo ? (
              <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-white/60">{g.titulo}</p>
            ) : null}
            <ul className="flex flex-col gap-1">
              {g.itens.map((item) => {
                const atual = ativo(item.href, pathname);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={atual ? "page" : undefined}
                      onClick={() => {
                        rastrear("menu_aberto", { item: item.href.replace(/^\//, "").replaceAll("/", ".") || "inicio" });
                        aoEscolher?.();
                      }}
                      className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
                        atual ? "bg-white text-marca-900" : "text-white/90 hover:bg-white/10"
                      }`}
                    >
                      <span aria-hidden="true" className="w-6 text-center text-lg">
                        {item.icone}
                      </span>
                      {item.rotulo}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/15 px-5 py-4">
        <p className="truncate text-sm text-white/80">{nomeUsuario}</p>
        <form action={sairEIrParaLogin} className="mt-2">
          <button
            type="submit"
            className="min-h-11 w-full rounded-lg px-3 text-left text-sm font-semibold text-white/90 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Sair
          </button>
        </form>
      </div>
    </div>
  );
}
