// Prestação de contas pública (única página sem login). Acessada pelo token do link.
// Privacidade: só lê o snapshot publicado (textos), sem sessão, sem menu, sem métricas, sem
// monitor de inatividade; `noindex`. Cada abertura soma uma visualização, então a página nunca
// é pré-renderizada nem cacheada: `connection()` a mantém dinâmica, dentro de Suspense.
import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { VisaoPrestacao } from "@/components/prestacao/VisaoPrestacao";
import { abrirPrestacaoPublica, lerPrestacaoPublica } from "@/lib/services/prestacao";

const ROBOTS = { index: false, follow: false } as const;
const TITULO = "Prestação de contas";

export async function generateMetadata({ params }: PageProps<"/p/[token]">): Promise<Metadata> {
  const { token } = await params;
  // Somente leitura: o título não conta visualização.
  const p = await lerPrestacaoPublica(token);
  if (p.estado === "ok" && p.snapshot) {
    return { title: `${TITULO} — ${String(p.snapshot.mes).padStart(2, "0")}/${p.snapshot.ano}`, robots: ROBOTS };
  }
  return { title: TITULO, robots: ROBOTS };
}

export default function PaginaPrestacaoPublica({ params }: PageProps<"/p/[token]">) {
  return (
    <Suspense fallback={<Moldura><p className="text-base text-slate-700">Carregando…</p></Moldura>}>
      <Conteudo params={params} />
    </Suspense>
  );
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex-1 bg-background px-4 py-6">
      <div className="mx-auto w-full max-w-2xl space-y-5">
        {children}
        <footer className="pt-2 text-center text-sm text-slate-600">Gerado pelo sistema de gestão da igreja</footer>
      </div>
    </main>
  );
}

const classeFaixa = "rounded-xl border px-4 py-3 text-base";

async function Conteudo({ params }: { params: PageProps<"/p/[token]">["params"] }) {
  await connection();
  const { token } = await params;
  const p = await abrirPrestacaoPublica(token);

  if (p.estado === "inexistente") notFound();

  if (p.estado === "despublicada") {
    return (
      <Moldura>
        <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200">
          <h1 className="text-2xl font-bold text-marca-900">Esta prestação foi retirada pela igreja</h1>
          <p className="mt-2 text-base text-slate-700">Se tiver dúvidas, fale com a tesouraria da igreja.</p>
        </section>
      </Moldura>
    );
  }

  const snapshot = p.snapshot;
  if (!snapshot) notFound();
  return (
    <Moldura>
      {p.versaoMaisRecente ? (
        <div role="status" className={`${classeFaixa} border-amber-300 bg-amber-50 text-amber-950`}>
          Existe uma versão mais recente desta prestação →{" "}
          {/* <a> comum: o link não deve ser pré-carregado (cada abertura conta visualização). */}
          <a href={`/p/${p.versaoMaisRecente.token}`} className="font-semibold underline underline-offset-2">
            ver versão {p.versaoMaisRecente.versao}
          </a>
        </div>
      ) : null}
      {snapshot.parcial ? (
        <div role="status" className={`${classeFaixa} border-sky-300 bg-sky-50 text-sky-950`}>
          Prestação parcial — valores até {snapshot.dataCorte}
        </div>
      ) : null}
      <VisaoPrestacao snapshot={snapshot} versao={p.versao} publicadaEm={p.publicadaEm} />
      <a
        href={`/api/pdf/prestacao/${token}`}
        className="flex min-h-12 w-full items-center justify-center rounded-xl bg-marca-600 px-4 text-base font-semibold text-white hover:bg-marca-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca-600"
      >
        Baixar PDF
      </a>
    </Moldura>
  );
}
