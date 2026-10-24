"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { iniciarMetricas, rastrear } from "@/lib/metricas/cliente";

/** Liga a coleta de métricas e registra `tela_aberta` a cada mudança de rota. Não renderiza nada. */
export function RastreioTelas() {
  const pathname = usePathname();
  useEffect(() => {
    iniciarMetricas();
  }, []);
  useEffect(() => {
    rastrear("tela_aberta");
  }, [pathname]);
  return null;
}
