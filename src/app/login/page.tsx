import type { Metadata } from "next";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Acceso privado | Haircut Style",
  description: "Acceso privado al panel de Haircut Style.",
};

type LoginPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;

  return <LoginForm initialReason={error ?? null} />;
}
