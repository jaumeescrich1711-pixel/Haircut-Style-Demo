"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";

import styles from "../panel-auth.module.css";

const LOGIN_ERROR =
  "No hemos podido iniciar sesión. Revisa el email y la contraseña.";

export function LoginForm({ initialReason }: { initialReason: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState(
    initialReason === "unauthorized"
      ? "Tu usuario no tiene acceso activo a Haircut Style."
      : initialReason === "recovery"
        ? "El enlace de recuperación no es válido o ha caducado."
        : "",
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setPending(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        code?: string;
        message?: string;
      };

      if (!response.ok || !result.ok) {
        setMessage(
          result.code === "unauthorized"
            ? "Tu usuario no tiene acceso activo a Haircut Style."
            : LOGIN_ERROR,
        );
        setPending(false);
        return;
      }

      // La navegación completa espera a que el navegador haya guardado las
      // cookies de la respuesta antes de pedir la página protegida al servidor.
      window.location.replace("/panel");
    } catch {
      setMessage(LOGIN_ERROR);
      setPending(false);
    }
  }

  return (
    <main className={styles.authPage}>
      <div className={styles.authGlow} aria-hidden="true" />
      <section className={styles.authCard} aria-labelledby="login-title">
        <Link className={styles.brand} href="/" aria-label="Haircut Style, inicio">
          <span>HAIRCUT</span>
          <strong>STYLE</strong>
        </Link>

        <div className={styles.eyebrow}>ÁREA PRIVADA</div>
        <h1 id="login-title">Bienvenido de nuevo</h1>
        <p className={styles.intro}>
          Accede al espacio de gestión de Haircut Style.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email</span>
            <input
              autoComplete="email"
              inputMode="email"
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="tu@email.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className={styles.field}>
            <span>Contraseña</span>
            <span className={styles.passwordField}>
              <input
                autoComplete="current-password"
                minLength={6}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Tu contraseña"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className={styles.passwordToggle}
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? "OCULTAR" : "MOSTRAR"}
              </button>
            </span>
          </label>

          {message ? (
            <p className={styles.error} role="alert">
              {message}
            </p>
          ) : null}

          <button className={styles.primaryButton} disabled={pending} type="submit">
            {pending ? "COMPROBANDO…" : "INICIAR SESIÓN"}
          </button>
        </form>

        <Link className={styles.textLink} href="/recuperar">
          ¿Has olvidado tu contraseña?
        </Link>
      </section>
    </main>
  );
}
