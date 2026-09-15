import type { Metadata } from "next";

import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
  title: "Establecer contraseña | Haircut Style",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
