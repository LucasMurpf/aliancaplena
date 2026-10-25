// Itens do menu lateral (spec §5). Função pura: só decide o que cada usuário vê.
import type { Papel } from "@prisma/client";
import { pode, type Permissao } from "@/lib/permissoes";

export type ItemMenu = { rotulo: string; href: string; icone: string; grupo?: string };

const ITENS: readonly (ItemMenu & { permissao: Permissao })[] = [
  { rotulo: "Início", href: "/", icone: "🏠", permissao: "financeiro.ver" },
  { rotulo: "Lançamentos", href: "/lancamentos", icone: "💰", permissao: "financeiro.ver" },
  { rotulo: "Membros", href: "/membros", icone: "👥", permissao: "membros.ver_nomes" },
  { rotulo: "Contas", href: "/configuracoes/contas", icone: "🏦", grupo: "Configurações", permissao: "cadastros.gerenciar" },
  { rotulo: "Categorias", href: "/configuracoes/categorias", icone: "🏷️", grupo: "Configurações", permissao: "cadastros.gerenciar" },
  { rotulo: "Usuários", href: "/configuracoes/usuarios", icone: "🔑", grupo: "Configurações", permissao: "admin" },
  { rotulo: "Dados da igreja", href: "/configuracoes/igreja", icone: "⛪", grupo: "Configurações", permissao: "admin" },
];

export function itensDoMenu(papeis: Papel[]): ItemMenu[] {
  if (!pode(papeis, "financeiro.ver")) {
    return [{ rotulo: "Início", href: "/em-breve", icone: "🏠" }];
  }
  return ITENS.filter((i) => pode(papeis, i.permissao)).map(({ rotulo, href, icone, grupo }) => ({
    rotulo,
    href,
    icone,
    ...(grupo ? { grupo } : {}),
  }));
}
