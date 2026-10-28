// Logo da igreja para os PDFs: baixado antes da renderização, com limite de tempo e tamanho.
// Qualquer falha devolve null: o PDF sai sem logo, nunca falha por causa dele.
export type LogoPdf = { data: Buffer; format: "png" | "jpg" };

export const TEMPO_MAX_LOGO_MS = 3000;
export const TAMANHO_MAX_LOGO = 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPG = [0xff, 0xd8, 0xff];
const comeca = (b: Buffer, m: number[]) => m.every((x, i) => b[i] === x);

/** Hosts que nunca devem ser buscados pelo servidor (loopback, redes privadas, metadados). */
function hostPermitido(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (h.includes(":")) return !(h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80"));
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (!m) return true;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

export async function carregarLogo(url: string | null | undefined): Promise<LogoPdf | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    if (!hostPermitido(u.hostname)) return null;
    // Sem seguir redirecionamentos: evita desvio para hosts internos.
    const r = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(TEMPO_MAX_LOGO_MS) });
    if (!r.ok) return null;
    const declarado = Number(r.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > TAMANHO_MAX_LOGO) return null;
    const dados = Buffer.from(await r.arrayBuffer());
    if (dados.length === 0 || dados.length > TAMANHO_MAX_LOGO) return null;
    if (comeca(dados, PNG)) return { data: dados, format: "png" };
    if (comeca(dados, JPG)) return { data: dados, format: "jpg" };
    return null; // só PNG e JPEG
  } catch {
    return null;
  }
}
