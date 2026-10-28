// Recibo A5 (retrato) com marca "CANCELADO" diagonal quando o lançamento foi cancelado.
import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { DadosRecibo } from "@/lib/services/recibos";
import { COR, estilos } from "./estilos";
import type { LogoPdf } from "./logo";

const e = StyleSheet.create({
  pagina: { fontFamily: "Helvetica", fontSize: 11, color: COR.texto, padding: 32 },
  moldura: { borderWidth: 1, borderColor: COR.destaque, padding: 18, flexGrow: 1 },
  topo: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COR.linha, paddingBottom: 10, marginBottom: 14 },
  numero: { marginTop: 10, marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  numeroTexto: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 20, fontFamily: "Helvetica-Bold", color: COR.destaque, letterSpacing: 2 },
  corpo: { fontSize: 12, lineHeight: 1.6, textAlign: "justify" },
  forte: { fontFamily: "Helvetica-Bold" },
  data: { marginTop: 26, fontSize: 11 },
  assinatura: { marginTop: 46, alignItems: "center" },
  linhaAssinatura: { borderTopWidth: 1, borderTopColor: COR.texto, width: "70%", paddingTop: 3, alignItems: "center" },
  codigo: { position: "absolute", bottom: 14, left: 18, right: 18, fontSize: 8, color: COR.suave, flexDirection: "row", justifyContent: "space-between" },
  marca: { position: "absolute", top: 250, left: 0, right: 0, textAlign: "center", fontSize: 52, fontFamily: "Helvetica-Bold", color: COR.cancelado, opacity: 0.3, transform: "rotate(-30deg)" },
});

export function Recibo({ dados, logo }: { dados: DadosRecibo; logo: LogoPdf | null }) {
  const cidade = dados.igreja.cidade ?? "Colombo";
  return (
    <Document title={`Recibo ${dados.numeroFormatado}`} author={dados.igreja.nome}>
      <Page size="A5" style={e.pagina}>
        <View style={e.moldura}>
          <View style={e.topo}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
            {logo ? <Image src={logo} style={estilos.logo} /> : null}
            <View>
              <Text style={estilos.igreja}>{dados.igreja.nome}</Text>
              {dados.igreja.cnpj ? <Text style={estilos.igrejaDetalhe}>CNPJ {dados.igreja.cnpj}</Text> : null}
            </View>
          </View>
          <View style={e.numero}>
            <Text style={e.titulo}>RECIBO</Text>
            <Text style={e.numeroTexto}>Nº {dados.numeroFormatado}</Text>
          </View>
          <Text style={e.corpo}>
            Recebemos de <Text style={e.forte}>{dados.membro}</Text> a importância de <Text style={e.forte}>{dados.valor}</Text> ({dados.valorExtenso}), referente a{" "}
            <Text style={e.forte}>{dados.categoria}</Text>, realizada em {dados.dataRealizacao}.
          </Text>
          <Text style={e.data}>
            {cidade}, {dados.dataPorExtenso}.
          </Text>
          <View style={e.assinatura}>
            <View style={e.linhaAssinatura}>
              <Text>{dados.igreja.nome}</Text>
              <Text style={{ fontSize: 8, color: COR.suave, marginTop: 2 }}>Emitido por {dados.emitidoPor}</Text>
            </View>
          </View>
          <View style={e.codigo}>
            <Text>Código de verificação: {dados.codigoVerificacao}</Text>
            <Text>Recibo {dados.numeroFormatado}</Text>
          </View>
        </View>
        {dados.cancelado ? <Text style={e.marca}>CANCELADO</Text> : null}
      </Page>
    </Document>
  );
}
