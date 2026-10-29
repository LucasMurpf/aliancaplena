// Logo da igreja para os PDFs: baixado antes da renderização, com limite de tempo e tamanho.
// Qualquer falha devolve null: o PDF sai sem logo, nunca falha por causa dele.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type LogoPdf = { data: Buffer; format: "png" | "jpg" };

export const TEMPO_MAX_LOGO_MS = 3000;
export const TAMANHO_MAX_LOGO = 1024 * 1024;

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPG = [0xff, 0xd8, 0xff];
const comeca = (b: Buffer, m: number[]) => m.every((x, i) => b[i] === x);

const BLOQUEADOS_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Bloqueado(ip: string): boolean {
  const n = ip.split(".").reduce((a, o) => a * 256 + Number(o), 0);
  return BLOQUEADOS_V4.some(([base, bits]) => {
    const b = base.split(".").reduce((a, o) => a * 256 + Number(o), 0);
    const tam = 2 ** (32 - bits);
    return Math.floor(n / tam) === Math.floor(b / tam);
  });
}

/** Expande um IPv6 válido em 8 grupos de 16 bits. */
function grupos6(ip: string): number[] {
  let t = ip.toLowerCase().split("%")[0];
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(t);
  if (v4) {
    const o = v4[1].split(".").map(Number);
    t = t.slice(0, -v4[1].length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [esq, dir] = t.split("::");
  const l = esq ? esq.split(":") : [];
  const r = dir === undefined ? [] : dir ? dir.split(":") : [];
  const meio = dir === undefined ? [] : Array<string>(8 - l.length - r.length).fill("0");
  return [...l, ...meio, ...r].map((g) => parseInt(g, 16));
}

/** Loopback, privado, link-local, não especificado, CGNAT, multicast, único-local e IPv6 que embute IPv4 bloqueado. Inválido => bloqueado. */
export function enderecoBloqueado(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Bloqueado(ip);
  if (v !== 6) return true;
  const g = grupos6(ip);
  if (g.length !== 8 || g.some((x) => Number.isNaN(x))) return true;
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true; // :: e ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // ff00::/8
  const embute = (a: number, b: number) => v4Bloqueado(`${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`);
  const zeros5 = g.slice(0, 5).every((x) => x === 0);
  if (zeros5 && (g[5] === 0xffff || g[5] === 0)) return embute(g[6], g[7]); // mapeado e compatível
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embute(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embute(g[1], g[2]); // 6to4
  return false;
}

export type ResolvedorDns = (host: string) => Promise<string[]>;
const resolverPadrao: ResolvedorDns = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

export type OpcoesLogo = { resolver?: ResolvedorDns; buscar?: typeof fetch };

/** Lê o corpo contando bytes; passou do limite, cancela e devolve null. */
async function lerLimitado(r: Response, max: number): Promise<Buffer | null> {
  if (!r.body) return null;
  const leitor = r.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await leitor.cancel().catch(() => {});
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

export async function carregarLogo(url: string | null | undefined, opcoes: OpcoesLogo = {}): Promise<LogoPdf | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
    const enderecos = isIP(host) ? [host] : await (opcoes.resolver ?? resolverPadrao)(host);
    if (enderecos.length === 0 || enderecos.some(enderecoBloqueado)) return null;
    // Sem seguir redirecionamentos: evita desvio para hosts internos.
    const r = await (opcoes.buscar ?? fetch)(u, { redirect: "manual", signal: AbortSignal.timeout(TEMPO_MAX_LOGO_MS) });
    if (!r.ok) return null;
    const declarado = Number(r.headers.get("content-length"));
    if (Number.isFinite(declarado) && declarado > TAMANHO_MAX_LOGO) return null;
    const dados = await lerLimitado(r, TAMANHO_MAX_LOGO);
    if (!dados || dados.length === 0) return null;
    if (comeca(dados, PNG)) return { data: dados, format: "png" };
    if (comeca(dados, JPG)) return { data: dados, format: "jpg" };
    return null; // só PNG e JPEG
  } catch {
    return null;
  }
}
