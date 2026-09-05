import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Haircut Style",
  description: "Demo web y de reservas para Haircut Style.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
