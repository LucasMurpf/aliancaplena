// Estilos compartilhados dos PDFs. Fonte Helvetica embutida (Latin-1: acentos do pt-BR),
// sem baixar nada da rede.
import { StyleSheet } from "@react-pdf/renderer";

export const COR = {
  texto: "#1f2937",
  suave: "#6b7280",
  linha: "#d1d5db",
  zebra: "#f3f4f6",
  destaque: "#1e3a5f",
  cancelado: "#b91c1c",
} as const;

export const estilos = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 9, color: COR.texto, paddingTop: 36, paddingBottom: 48, paddingHorizontal: 36 },
  cabecalho: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COR.destaque, paddingBottom: 8, marginBottom: 10 },
  logo: { width: 40, height: 40, objectFit: "contain", marginRight: 10 },
  igreja: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COR.destaque },
  igrejaDetalhe: { fontSize: 8, color: COR.suave, marginTop: 1 },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  subtitulo: { fontSize: 9, color: COR.suave, marginBottom: 1 },
  aviso: { fontSize: 9, fontFamily: "Helvetica-Bold", color: COR.destaque, marginTop: 2 },
  resumo: { flexDirection: "row", marginTop: 8, marginBottom: 8 },
  resumoCaixa: { flexGrow: 1, borderWidth: 1, borderColor: COR.linha, padding: 6, marginRight: 6 },
  resumoRotulo: { fontSize: 8, color: COR.suave },
  resumoValor: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 2 },
  tabelaTitulo: { fontSize: 10.5, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  linhaCab: { flexDirection: "row", backgroundColor: COR.destaque, paddingVertical: 3, paddingHorizontal: 4 },
  celulaCab: { color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8.5 },
  linha: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4 },
  linhaZebra: { backgroundColor: COR.zebra },
  linhaRodape: { flexDirection: "row", paddingVertical: 3, paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: COR.destaque },
  celulaNegrito: { fontFamily: "Helvetica-Bold" },
  dir: { textAlign: "right" },
  vazio: { color: COR.suave, paddingVertical: 6, paddingHorizontal: 4 },
  rodapePagina: { position: "absolute", bottom: 20, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: COR.suave },
});
