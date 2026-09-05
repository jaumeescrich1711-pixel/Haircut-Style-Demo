import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Haircut Style | Centro de estética para hombres",
  description:
    "Haircut Style, centro de estética y cuidado personal para hombres.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
