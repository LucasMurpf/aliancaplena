// Relatório A4: cabeçalho, filtros, resumo, tabelas com linhas alternadas, "Página X de Y".
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { RelatorioPdf, TabelaPdf } from "./dados";
import { CabecalhoIgreja, RodapePagina, type IgrejaPdf } from "./Comum";
import { estilos } from "./estilos";

const peso = (t: TabelaPdf) => t.colunas.reduce((a, c) => a + c.largura, 0);

function Tabela({ tabela }: { tabela: TabelaPdf }) {
  const total = peso(tabela);
  const largura = (i: number) => `${(tabela.colunas[i].largura / total) * 100}%`;
  const alinhar = (i: number) => (tabela.colunas[i].alinhar === "dir" ? estilos.dir : {});
  return (
    <View>
      {tabela.titulo ? <Text style={estilos.tabelaTitulo} minPresenceAhead={60}>{tabela.titulo}</Text> : null}
      <View style={estilos.linhaCab} fixed>
        {tabela.colunas.map((c, i) => (
          <Text key={c.titulo} style={[estilos.celulaCab, alinhar(i), { width: largura(i) }]}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {tabela.linhas.length === 0 ? <Text style={estilos.vazio}>Nenhum lançamento no período.</Text> : null}
      {tabela.linhas.map((l, n) => (
        <View key={n} style={n % 2 === 1 ? [estilos.linha, estilos.linhaZebra] : estilos.linha} wrap={false}>
          {l.map((v, i) => (
            <Text key={i} style={[alinhar(i), { width: largura(i), paddingRight: 4 }]}>
              {v}
            </Text>
          ))}
        </View>
      ))}
      {tabela.rodape ? (
        <View style={estilos.linhaRodape} wrap={false}>
          {tabela.rodape.map((v, i) => (
            <Text key={i} style={[estilos.celulaNegrito, alinhar(i), { width: largura(i), paddingRight: 4 }]}>
              {v}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Relatorio({ igreja, relatorio, geradoPor, geradoEm }: { igreja: IgrejaPdf; relatorio: RelatorioPdf; geradoPor: string; geradoEm: string }) {
  return (
    <Document title={relatorio.titulo} author={igreja.nome}>
      <Page size="A4" style={estilos.pagina}>
        <CabecalhoIgreja igreja={igreja} />
        <Text style={estilos.titulo}>{relatorio.titulo}</Text>
        <Text style={estilos.subtitulo}>Período: {relatorio.periodo}</Text>
        {relatorio.filtros.map((f) => (
          <Text key={f} style={f === "Inclui lançamentos previstos" ? estilos.aviso : estilos.subtitulo}>
            {f}
          </Text>
        ))}
        <Text style={estilos.subtitulo}>
          Gerado por {geradoPor} em {geradoEm}
        </Text>
        <View style={estilos.resumo}>
          {relatorio.resumo.map((r) => (
            <View key={r.rotulo} style={estilos.resumoCaixa}>
              <Text style={estilos.resumoRotulo}>{r.rotulo}</Text>
              <Text style={estilos.resumoValor}>{r.valor}</Text>
            </View>
          ))}
        </View>
        {relatorio.tabelas.map((t, i) => (
          <Tabela key={i} tabela={t} />
        ))}
        <RodapePagina esquerda={`${igreja.nome} · ${relatorio.titulo}`} />
      </Page>
    </Document>
  );
}
