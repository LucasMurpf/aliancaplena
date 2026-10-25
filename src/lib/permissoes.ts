// Matriz papel -> permissões (spec §4). Sem imports de servidor: só o tipo
// Papel, para poder ser usado também no menu (Task 15).
import type { Papel } from "@prisma/client";

export const TODAS_PERMISSOES = [
  "financeiro.ver",
  "financeiro.lancar",
  "membros.ver_nomes",
  "membros.gerenciar",
  "cadastros.gerenciar",
  "admin",
  "historico.ver",
] as const;

export type Permissao = (typeof TODAS_PERMISSOES)[number];

const TESOURARIA: readonly Permissao[] = [
  "financeiro.ver",
  "financeiro.lancar",
  "membros.ver_nomes",
  "membros.gerenciar",
  "cadastros.gerenciar",
  "historico.ver",
];

const PERMISSOES_POR_PAPEL: Record<Papel, readonly Permissao[]> = {
  ADMIN: TODAS_PERMISSOES,
  PASTOR: [
    "financeiro.ver",
    "membros.ver_nomes",
    "membros.gerenciar",
    "historico.ver",
  ],
  TESOUREIRO: TESOURARIA,
  // Sem permissões na Fase 1 (só a tela "Módulo em breve").
  EVENTOS: [],
  PATRIMONIO: [],
};

/** União das permissões de todos os papéis do usuário. */
export function permissoesDe(papeis: Papel[]): Set<Permissao> {
  const resultado = new Set<Permissao>();
  for (const papel of papeis) {
    for (const p of PERMISSOES_POR_PAPEL[papel]) resultado.add(p);
  }
  return resultado;
}

export function pode(papeis: Papel[], permissao: Permissao): boolean {
  return permissoesDe(papeis).has(permissao);
}
