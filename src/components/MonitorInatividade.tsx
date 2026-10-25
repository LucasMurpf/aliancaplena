"use client";

// Contador de inatividade. Os prazos contam da última RENOVAÇÃO BEM-SUCEDIDA do cookie:
// aviso aos 14 min e logout aos 14:45 (o cookie vale 15 min, então ainda está válido para
// enviar `sessao_expirou` e chamar `sair`). Atividade renova no máx. a cada 30 s.
// A marca da última renovação é compartilhada entre abas via localStorage: uma aba parada
// nunca derruba a sessão de outra aba em uso.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  INTERVALO_RENOVACAO_MS,
  deveEncerrar,
  estadoInatividade,
  msDesdeUltimaRenovacao,
  type EstadoInatividade,
} from "@/lib/inatividade";
import { descarregarMetricas, rastrear } from "@/lib/metricas/cliente";
import { renovarSessao, sair } from "@/app/(sistema)/actions";
import { Botao } from "@/components/ui/Botao";

const EVENTOS = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
const CHECAGEM_MS = 1000;
const LIMITE_FLUSH_MS = 3000;
const CHAVE_RENOVACAO = "sessao.ultimaRenovacao";

function lerCompartilhado(): number | null {
  try {
    const v = Number(window.localStorage.getItem(CHAVE_RENOVACAO));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function gravarCompartilhado(t: number): void {
  try {
    window.localStorage.setItem(CHAVE_RENOVACAO, String(t));
  } catch {
    // ignora
  }
}

export function MonitorInatividade() {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoInatividade>("ativo");
  const estadoRef = useRef<EstadoInatividade>("ativo");
  const ultimaRenovacao = useRef(0);
  const renovando = useRef(false);
  const encerrando = useRef(false);

  const irParaLogin = useCallback(() => {
    encerrando.current = true;
    router.replace("/login?expirou=1");
  }, [router]);

  /** Renova o cookie; devolve true se deu certo. Falha ou rejeição = sessão morta, vai ao login. */
  const renovar = useCallback(async (): Promise<boolean> => {
    if (renovando.current || encerrando.current) return false;
    renovando.current = true;
    try {
      const r = await renovarSessao();
      if (r.erro) {
        irParaLogin();
        return false;
      }
      const agora = Date.now();
      ultimaRenovacao.current = agora;
      gravarCompartilhado(agora);
      return true;
    } catch {
      irParaLogin();
      return false;
    } finally {
      renovando.current = false;
    }
  }, [irParaLogin]);

  const continuar = useCallback(async () => {
    if (await renovar()) {
      estadoRef.current = "ativo";
      setEstado("ativo");
    }
  }, [renovar]);

  useEffect(() => {
    // O carregamento da página passou pelo proxy, que reemitiu o cookie: conta como renovação.
    const inicio = Date.now();
    ultimaRenovacao.current = inicio;
    gravarCompartilhado(inicio);

    const msParado = () => msDesdeUltimaRenovacao(Date.now(), ultimaRenovacao.current, lerCompartilhado());

    async function encerrar() {
      encerrando.current = true;
      rastrear("sessao_expirou");
      // Cookie ainda válido aqui: o envio precisa terminar antes de apagar a sessão.
      await Promise.race([descarregarMetricas(), new Promise((r) => window.setTimeout(r, LIMITE_FLUSH_MS))]);
      // Outra aba pode ter renovado enquanto isso: nesse caso, não derruba a sessão.
      if (!deveEncerrar(Date.now(), ultimaRenovacao.current, lerCompartilhado())) {
        encerrando.current = false;
        return;
      }
      try {
        await sair();
      } catch {
        // o login limpa o resto
      }
      router.replace("/login?expirou=1");
    }

    function checar() {
      if (encerrando.current) return;
      const novo = estadoInatividade(msParado());
      if (novo === "expirar") {
        void encerrar();
        return;
      }
      if (novo !== estadoRef.current) {
        estadoRef.current = novo;
        setEstado(novo);
      }
    }

    function aoInteragir() {
      // Com o aviso aberto, só o botão Continuar renova.
      if (estadoRef.current !== "ativo" || encerrando.current) return;
      if (msParado() >= INTERVALO_RENOVACAO_MS) void renovar();
    }

    function aoMudarStorage(e: StorageEvent) {
      if (e.key === CHAVE_RENOVACAO) checar();
    }

    for (const e of EVENTOS) window.addEventListener(e, aoInteragir, { passive: true, capture: true });
    window.addEventListener("storage", aoMudarStorage);
    const id = window.setInterval(checar, CHECAGEM_MS);

    return () => {
      for (const e of EVENTOS) window.removeEventListener(e, aoInteragir, { capture: true });
      window.removeEventListener("storage", aoMudarStorage);
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
        <Botao className="mt-5 w-full" onClick={() => void continuar()} autoFocus>
          Continuar
        </Botao>
      </div>
    </div>
  );
}
