"use client";

import { useEffect } from "react";
import { rastrear } from "@/lib/metricas/cliente";

/** Registra `indicadores_aberto` uma vez ao abrir a tela. Não renderiza nada. */
export function RastreioIndicadores() {
  useEffect(() => {
    rastrear("indicadores_aberto");
  }, []);
  return null;
}
