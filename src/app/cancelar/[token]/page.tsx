import type { Metadata } from "next";
import Link from "next/link";

import { getManagedReservation } from "@/lib/reservations";

import CancelReservation from "./cancel-reservation";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Gestionar cita | Haircut Style",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

const managementTokenPattern = /^[0-9a-f]{64}$/;

function formatDate(datetime: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(new Date(datetime));
}

function formatTime(datetime: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(new Date(datetime));
}

export default async function CancelReservationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let loadFailed = false;
  let reservation: Awaited<ReturnType<typeof getManagedReservation>> = null;

  if (managementTokenPattern.test(token)) {
    try {
      reservation = await getManagedReservation(token);
    } catch {
      loadFailed = true;
    }
  }

  if (loadFailed) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>Haircut Style</span>
          <h1>No podemos consultar tu cita</h1>
          <p>
            Ha ocurrido un problema temporal. No se ha cancelado nada; vuelve
            a intentarlo dentro de unos minutos.
          </p>
        </section>
      </main>
    );
  }

  if (!reservation) {
    return (
      <main className={styles.page}>
        <section className={styles.card}>
          <span className={styles.eyebrow}>Haircut Style</span>
          <h1>Enlace no válido</h1>
          <p>
            No hemos encontrado una cita asociada a este enlace. Comprueba que
            lo has abierto completo desde el email de confirmación.
          </p>
          <Link className={styles.backLink} href="/#reservar">
            VOLVER A RESERVAS
          </Link>
        </section>
      </main>
    );
  }

  const alreadyCancelled = reservation.status === "cancelled_by_client";
  const cancellable = reservation.status === "confirmed";

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <span className={styles.eyebrow}>Gestionar cita</span>
        <h1>{alreadyCancelled ? "Cita cancelada" : "Cancelar mi cita"}</h1>
        <p className={styles.intro}>
          {alreadyCancelled
            ? "Esta cita ya fue cancelada. No se ha realizado ninguna acción adicional."
            : "Revisa los datos antes de confirmar la cancelación."}
        </p>
        <dl className={styles.details}>
          <div>
            <dt>Servicio</dt>
            <dd>{reservation.serviceName}</dd>
          </div>
          <div>
            <dt>Profesional</dt>
            <dd>{reservation.professionalName}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>
              {formatDate(
                reservation.startDatetime,
                reservation.businessTimezone,
              )}
            </dd>
          </div>
          <div>
            <dt>Hora</dt>
            <dd>
              {formatTime(
                reservation.startDatetime,
                reservation.businessTimezone,
              )}
              –
              {formatTime(
                reservation.endDatetime,
                reservation.businessTimezone,
              )}
            </dd>
          </div>
        </dl>
        {cancellable || alreadyCancelled ? (
          <CancelReservation
            token={token}
            alreadyCancelled={alreadyCancelled}
          />
        ) : (
          <div className={styles.result} role="status">
            <strong>Esta cita no se puede cancelar</strong>
            <p>Su estado actual no permite cancelarla desde este enlace.</p>
          </div>
        )}
      </section>
    </main>
  );
}
