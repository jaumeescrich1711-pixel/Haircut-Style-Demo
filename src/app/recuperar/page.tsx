import type { Metadata } from "next";

import { RecoveryForm } from "./recovery-form";

export const metadata: Metadata = {
  title: "Recuperar contraseña | Haircut Style",
};

export default function RecoveryPage() {
  return <RecoveryForm />;
}
