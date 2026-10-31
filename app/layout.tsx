import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fila — Central de chamados",
  description:
    "Atendimento com histórico, notas internas e acesso separado entre cliente e responsável.",
  icons: { icon: "/favicon.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
