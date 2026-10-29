// Peças compartilhadas dos documentos PDF: cabeçalho da igreja e rodapé com paginação.
import { Image, Text, View } from "@react-pdf/renderer";
import { estilos } from "./estilos";
import type { LogoPdf } from "./logo";

export type IgrejaPdf = { nome: string; cnpj?: string | null; logo: LogoPdf | null };

export function CabecalhoIgreja({ igreja }: { igreja: IgrejaPdf }) {
  return (
    <View style={estilos.cabecalho}>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image do react-pdf não tem alt */}
      {igreja.logo ? <Image src={igreja.logo} style={estilos.logo} /> : null}
      <View>
        <Text style={estilos.igreja}>{igreja.nome}</Text>
        {igreja.cnpj ? <Text style={estilos.igrejaDetalhe}>CNPJ {igreja.cnpj}</Text> : null}
      </View>
    </View>
  );
}

export function RodapePagina({ esquerda }: { esquerda: string }) {
  return (
    <View style={estilos.rodapePagina} fixed>
      <Text>{esquerda}</Text>
      <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
    </View>
  );
}
