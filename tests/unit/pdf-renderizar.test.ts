import { createElement } from "react";
import { expect, test } from "vitest";
import { Document, Page, Text } from "@react-pdf/renderer";
import { renderizarPdf } from "@/lib/pdf/renderizar";

test("renderizarPdf gera um PDF válido", async () => {
  const buf = await renderizarPdf(
    createElement(Document, null, createElement(Page, null, createElement(Text, null, "Olá"))),
  );
  expect(Buffer.isBuffer(buf)).toBe(true);
  expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
});
