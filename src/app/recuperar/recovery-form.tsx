"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

import styles from "../panel-auth.module.css";

export function RecoveryForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage("");

    const supabase = createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/restablecer`,
    });

    setMessage(
      "Si existe una cuenta con ese email, recibirás un enlace para crear una nueva contraseña.",
    );
    setPending(false);
  }

  return (
    <main className={styles.authPage}>
      <section className={styles.authCard} aria-labelledby="recovery-title">
        <Link className={styles.brand} href="/">
          <span>HAIRCUT</span>
          <strong>STYLE</strong>
        </Link>
        <div className={styles.eyebrow}>RECUPERAR ACCESO</div>
        <h1 id="recovery-title">Nueva contraseña</h1>
        <p className={styles.intro}>
          Indica el email de tu cuenta y te enviaremos un enlace seguro.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              required
              type="email"
              value={email}
            />
          </label>
          {message ? (
            <p className={styles.success} role="status">
              {message}
            </p>
          ) : null}
          <button className={styles.primaryButton} disabled={pending} type="submit">
            {pending ? "ENVIANDO…" : "ENVIAR ENLACE"}
          </button>
        </form>

        <Link className={styles.textLink} href="/login">
          Volver al inicio de sesión
        </Link>
      </section>
    </main>
  );
}
