import type { ReactElement } from "react";
import { renderToBuffer } from "@react-pdf/renderer";

/** Renderiza um documento do @react-pdf/renderer (elemento <Document>) em um Buffer PDF. */
export async function renderizarPdf(elemento: ReactElement): Promise<Buffer> {
  // O tipo da biblioteca exige ReactElement<DocumentProps>; o elemento é validado em tempo de execução.
  return renderToBuffer(elemento as Parameters<typeof renderToBuffer>[0]);
}
