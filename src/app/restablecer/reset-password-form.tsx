"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "../panel-auth.module.css";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [complete, setComplete] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (password.length < 8) {
      setMessage("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    if (password !== confirmation) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { data: claimsData } = await supabase.auth.getClaims();

    if (!claimsData?.claims?.sub) {
      setMessage("El enlace no es válido o ha caducado. Solicita uno nuevo.");
      setPending(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setMessage("No hemos podido actualizar la contraseña. Solicita otro enlace.");
      setPending(false);
      return;
    }

    await supabase.auth.signOut();
    setComplete(true);
    setPending(false);
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard} aria-labelledby="reset-title">
        <Link className={styles.brand} href="/">
          <span>HAIRCUT</span>
          <strong>STYLE</strong>
        </Link>
        <div className={styles.eyebrow}>ACCESO SEGURO</div>
        <h1 id="reset-title">Establece tu contraseña</h1>

        {complete ? (
          <div className={styles.completedState}>
            <p>Tu contraseña se ha actualizado correctamente.</p>
            <Link className={styles.primaryLink} href="/login">
              IR AL LOGIN
            </Link>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Nueva contraseña</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            <label className={styles.field}>
              <span>Repite la contraseña</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmation(event.target.value)}
                required
                type="password"
                value={confirmation}
              />
            </label>
            {message ? (
              <p className={styles.error} role="alert">
                {message}
              </p>
            ) : null}
            <button className={styles.primaryButton} disabled={pending} type="submit">
              {pending ? "ACTUALIZANDO…" : "GUARDAR CONTRASEÑA"}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
