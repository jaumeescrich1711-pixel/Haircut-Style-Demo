"use client";

import { useState } from "react";
import Link from "next/link";

import styles from "./page.module.css";

type CancelReservationProps = {
  token: string;
  alreadyCancelled: boolean;
};

export default function CancelReservation({
  token,
  alreadyCancelled,
}: CancelReservationProps) {
  const [status, setStatus] = useState<
    "ready" | "submitting" | "cancelled" | "error"
  >(alreadyCancelled ? "cancelled" : "ready");
  const [message, setMessage] = useState(
    alreadyCancelled ? "Esta cita ya está cancelada." : "",
  );

  async function cancelReservation() {
    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch(`/api/reservations/cancel/${token}`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        result?: string;
        message?: string;
      };

      if (!response.ok || !payload.ok) {
        setStatus("error");
        setMessage(
          payload.message ??
            "No se ha podido cancelar la cita. Inténtalo de nuevo.",
        );
        return;
      }

      setStatus("cancelled");
      setMessage(
        payload.result === "already_cancelled"
          ? "Esta cita ya estaba cancelada."
          : "Tu cita ha sido cancelada correctamente. El horario vuelve a estar disponible.",
      );
    } catch {
      setStatus("error");
      setMessage(
        "No se ha podido contactar con el servidor. Puedes volver a intentarlo.",
      );
    }
  }

  if (status === "cancelled") {
    return (
      <div className={styles.result} role="status">
        <strong>Cita cancelada</strong>
        <p>{message}</p>
        <Link href="/#reservar">RESERVAR OTRA CITA</Link>
      </div>
    );
  }

  return (
    <div className={styles.actions}>
      <p>
        La cancelación libera el horario inmediatamente. Esta acción no borra
        la reserva: quedará registrada como cancelada por el cliente.
      </p>
      {message ? (
        <p className={styles.error} role="alert">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={status === "submitting"}
        onClick={cancelReservation}
      >
        {status === "submitting" ? "CANCELANDO…" : "CONFIRMAR CANCELACIÓN"}
      </button>
    </div>
  );
}
