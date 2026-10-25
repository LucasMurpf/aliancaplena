import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gestão da Igreja",
  description: "Controle financeiro e administrativo da igreja",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
