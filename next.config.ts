import type { NextConfig } from "next";

/** Cabeçalhos de segurança em todas as respostas: sem iframe de outros sites (clickjacking). */
const CABECALHOS_SEGURANCA = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
];

const SEM_INDEXAR = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      { source: "/:path*", headers: CABECALHOS_SEGURANCA },
      // Prestação pública e seu PDF: nunca indexar, mesmo que alguém publique o link.
      { source: "/p/:path*", headers: SEM_INDEXAR },
      { source: "/api/pdf/prestacao/:path*", headers: SEM_INDEXAR },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
