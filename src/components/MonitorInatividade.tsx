"use client";

// Contador de inatividade: aos 14 min mostra o aviso, aos 15 faz logout.
// Interação do usuário zera o contador e renova o cookie (no máx. 1 vez por minuto).
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { estadoInatividade, type EstadoInatividade } from "@/lib/inatividade";
import { rastrear } from "@/lib/metricas/cliente";
import { renovarSessao, sair } from "@/app/(sistema)/actions";
import { Botao } from "@/components/ui/Botao";

const EVENTOS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
const CHECAGEM_MS = 1000;
const THROTTLE_RENOVACAO_MS = 60 * 1000;

export function MonitorInatividade() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoInatividade>("ativo");
  const ultimaAtividade = useRef(0);
  const ultimaRenovacao = useRef(0);
  const encerrando = useRef(false);
  const estadoRef = useRef<EstadoInatividade>("ativo");

  const renovar = useCallback(() => {
    ultimaRenovacao.current = Date.now();
    void renovarSessao().catch(() => {});
  }, []);

  const continuar = useCallback(() => {
    ultimaAtividade.current = Date.now();
    estadoRef.current = "ativo";
    setEstado("ativo");
    renovar();
  }, [renovar]);

  useEffect(() => {
    ultimaAtividade.current = Date.now();
    ultimaRenovacao.current = Date.now();
    function aoInteragir() {
      // Com o aviso aberto, só o botão Continuar renova (evita fechar o aviso sem querer).
      if (estadoRef.current !== "ativo" || encerrando.current) return;
      const agora = Date.now();
      ultimaAtividade.current = agora;
      if (agora - ultimaRenovacao.current >= THROTTLE_RENOVACAO_MS) renovar();
    }
    for (const e of EVENTOS) window.addEventListener(e, aoInteragir, { passive: true, capture: true });

    const id = window.setInterval(() => {
      if (encerrando.current) return;
      const novo = estadoInatividade(Date.now() - ultimaAtividade.current);
      if (novo === "expirar") {
        encerrando.current = true;
        rastrear("sessao_expirou");
        void sair()
          .catch(() => {})
          .finally(() => router.replace("/login?expirou=1"));
      }
      if (novo !== estadoRef.current) {
        estadoRef.current = novo;
        setEstado(novo);
      }
    }, CHECAGEM_MS);

    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, aoInteragir, { capture: true });
      window.clearInterval(id);
    };
  }, [renovar, router]);

  if (estado === "ativo") return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="titulo-inatividade" className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="titulo-inatividade" className="text-lg font-bold text-marca-900">
          Sua sessão vai expirar em 1 minuto
        </h2>
        <p className="mt-2 text-sm text-slate-600">Por segurança, você será desconectado após um período sem uso.</p>
        <Botao className="mt-5 w-full" onClick={continuar} autoFocus>
          Continuar
        </Botao>
      </div>
    </div>
  );
}
