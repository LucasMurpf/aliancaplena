"use client";

import { useEffect, useRef, useState } from "react";

/** Largura em px do contêiner (0 até medir). Recharts recebe largura explícita, como no painel inicial. */
export function useLargura<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setLargura(el.clientWidth);
    const obs = new ResizeObserver(() => setLargura(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, largura };
}
