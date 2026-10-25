// Datas usadas na semente E2E: sempre o dia civil de São Paulo (o app usa hojeSP), nunca o UTC —
// entre 21h e 0h em SP o UTC já está no dia seguinte.
import { hojeSP } from "@/lib/datas";

/** Hoje em São Paulo, aaaa-mm-dd. */
export function hojeSemente(): string {
  return hojeSP().toISOString().slice(0, 10);
}
