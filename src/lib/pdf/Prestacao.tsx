// Prestação de contas A4: mesmo conteúdo da página pública (snapshot imutável).
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { SnapshotPrestacao } from "@/lib/services/prestacao";
import { CabecalhoIgreja, RodapePagina } from "./Comum";
import { estilos } from "./estilos";
import type { LogoPdf } from "./logo";

function Linha({ esquerda, direita, n, negrito }: { esquerda: string; direita: string; n: number; negrito?: boolean }) {
  const f = negrito ? estilos.celulaNegrito : {};
  return (
    <View style={n % 2 === 1 ? [estilos.linha, estilos.linhaZebra] : estilos.linha} wrap={false}>
      <Text style={[f, { width: "70%", paddingRight: 4 }]}>{esquerda}</Text>
      <Text style={[f, estilos.dir, { width: "30%" }]}>{direita}</Text>
    </View>
  );
}

export function Prestacao({ snapshot, versao, publicadaEm, logo }: { snapshot: SnapshotPrestacao; versao: number; publicadaEm: string; logo: LogoPdf | null }) {
  const s = snapshot;
  return (
    <Document title={`Prestação de contas - ${s.rotulo}`} author={s.igreja.nome}>
      <Page size="A4" style={estilos.pagina}>
        <CabecalhoIgreja igreja={{ nome: s.igreja.nome, logo }} />
        <Text style={estilos.titulo}>Prestação de contas</Text>
        <Text style={estilos.subtitulo}>{s.rotulo}</Text>
        <Text style={estilos.subtitulo}>
          Versão {versao} publicada em {publicadaEm}
        </Text>

        <View style={estilos.resumo}>
          {[
            ["Entradas", s.resumo.entradas],
            ["Saídas", s.resumo.saidas],
            ["Resultado do mês", s.resumo.resultado],
            [`Saldo da igreja em ${s.dataCorte}`, s.resumo.saldoFimMes],
          ].map(([rotulo, valor]) => (
            <View key={rotulo} style={estilos.resumoCaixa}>
              <Text style={estilos.resumoRotulo}>{rotulo}</Text>
              <Text style={estilos.resumoValor}>{valor}</Text>
            </View>
          ))}
        </View>

        <Text style={estilos.tabelaTitulo}>Entradas por categoria</Text>
        {s.entradas.length === 0 ? <Text style={estilos.vazio}>Nenhuma entrada no período.</Text> : null}
        {s.entradas.map((c, n) => (
          <Linha key={c.categoria} esquerda={c.categoria} direita={c.total} n={n} />
        ))}

        <Text style={estilos.tabelaTitulo}>Saídas por categoria</Text>
        {s.saidas.length === 0 ? <Text style={estilos.vazio}>Nenhuma saída no período.</Text> : null}
        {s.saidas.map((c, n) => (
          <View key={c.categoria}>
            <Linha esquerda={c.categoria} direita={c.total} n={n} negrito />
            {(c.itens ?? []).map((i, k) => (
              <View key={k} style={[estilos.linha, { paddingLeft: 14 }]} wrap={false}>
                <Text style={{ width: "16%" }}>{i.data}</Text>
                <Text style={{ width: "54%", paddingRight: 4, color: "#4b5563" }}>{i.descricao}</Text>
                <Text style={[estilos.dir, { width: "30%", color: "#4b5563" }]}>{i.valor}</Text>
              </View>
            ))}
          </View>
        ))}

        <Text style={[estilos.subtitulo, { marginTop: 16 }]}>Gerado pelo sistema de gestão da igreja.</Text>
        <RodapePagina esquerda={`${s.igreja.nome} · Prestação de contas ${s.rotulo}`} />
      </Page>
    </Document>
  );
}
