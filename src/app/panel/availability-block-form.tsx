"use client";

import { useState } from "react";

import type {
  AffectedBlockReservation,
} from "@/lib/auth/availability-blocks";
import type {
  CalendarAvailabilityBlock,
  CalendarProfessional,
} from "@/lib/auth/calendar-reservations";

import styles from "./panel.module.css";

export type AvailabilityBlockCompletion = {
  cancelledReservations: number;
  email: {
    attempted: number;
    sent: number;
    failed: number;
    unrecorded: number;
  } | null;
};

type BlockResponse =
  | {
      ok: true;
      outcome: "created";
      blocks: CalendarAvailabilityBlock[];
    }
  | {
      ok: true;
      outcome: "confirmation_required";
      operationId: string;
      affectedReservations: AffectedBlockReservation[];
      message: string;
    }
  | {
      ok: true;
      outcome: "completed";
      blocks: CalendarAvailabilityBlock[];
      cancelledReservations: number;
      email: {
        attempted: number;
        sent: number;
        failed: number;
        unrecorded: number;
      };
    }
  | {
      ok: false;
      code?: string;
      message: string;
    };

type CancellationPreview = {
  operationId: string;
  affectedReservations: AffectedBlockReservation[];
  message: string;
};

export function AvailabilityBlockForm({
  initialDate,
  today,
  professionals,
  onClose,
  onCreated,
}: {
  initialDate: string;
  today: string;
  professionals: CalendarProfessional[];
  onClose: () => void;
  onCreated: (
    blocks: CalendarAvailabilityBlock[],
    date: string,
    completion: AvailabilityBlockCompletion,
  ) => Promise<void>;
}) {
  const [date, setDate] = useState(initialDate);
  const [professional, setProfessional] = useState("");
  const [blockType, setBlockType] = useState<"all-day" | "interval">(
    "interval",
  );
  const [start, setStart] = useState("11:00");
  const [end, setEnd] = useState("12:00");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [preview, setPreview] = useState<CancellationPreview | null>(null);

  function resetPreview() {
    setPreview(null);
    setFormError("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (preview && !reason.trim()) {
      setFormError(
        "Indica el motivo que recibirán los clientes antes de confirmar.",
      );
      return;
    }

    setSubmitting(true);
    const allProfessionals = professional === "all";
    const professionalId = allProfessionals ? null : Number(professional);
    const allDay = blockType === "all-day";

    try {
      const response = await fetch("/api/panel/availability-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          preview
            ? {
                action: "confirm",
                operationId: preview.operationId,
                cancellationReason: reason,
              }
            : {
                action: "prepare",
                professionalId,
                allProfessionals,
                date,
                allDay,
                start: allDay ? null : start,
                end: allDay ? null : end,
                reason,
              },
        ),
      });
      const result = (await response.json()) as BlockResponse;

      if (!response.ok || !result.ok) {
        if (!result.ok && result.code === "preview_expired") {
          setPreview(null);
        }

        throw new Error(result.ok ? "block_failed" : result.message);
      }

      if (result.outcome === "confirmation_required") {
        setPreview({
          operationId: result.operationId,
          affectedReservations: result.affectedReservations,
          message: result.message,
        });
        return;
      }

      if (result.outcome === "created") {
        await onCreated(result.blocks, date, {
          cancelledReservations: 0,
          email: null,
        });
        return;
      }

      await onCreated(result.blocks, date, {
        cancelledReservations: result.cancelledReservations,
        email: result.email,
      });
    } catch (error) {
      setFormError(
        error instanceof Error && error.message !== "block_failed"
          ? error.message
          : "No se ha podido completar la operación.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const invalidInterval =
    blockType === "interval" && Boolean(start && end && start >= end);
  const affectedCount = preview?.affectedReservations.length ?? 0;

  return (
    <div className={styles.modalLayer} role="presentation">
      <button
        aria-label="Cerrar formulario"
        className={styles.modalBackdrop}
        disabled={submitting}
        onClick={onClose}
        type="button"
      />
      <section
        aria-labelledby="availability-block-title"
        aria-modal="true"
        className={`${styles.manualReservationModal} ${styles.availabilityBlockModal}`}
        role="dialog"
      >
        <div className={styles.manualReservationHeader}>
          <div>
            <p>NUEVO BLOQUEO</p>
            <h2 id="availability-block-title">Bloquear horario / día</h2>
            <span>
              Las citas se comprueban de nuevo justo antes de confirmar.
            </span>
          </div>
          <button
            aria-label="Cerrar formulario"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <form className={styles.manualReservationForm} onSubmit={handleSubmit}>
          <div className={styles.manualFormGrid}>
            <label>
              <span>Fecha</span>
              <input
                min={today}
                onChange={(event) => {
                  setDate(event.target.value);
                  resetPreview();
                }}
                required
                type="date"
                value={date}
              />
            </label>

            <label>
              <span>Profesional</span>
              <select
                onChange={(event) => {
                  setProfessional(event.target.value);
                  resetPreview();
                }}
                required
                value={professional}
              >
                <option disabled value="">
                  Selecciona un profesional
                </option>
                <option value="all">Todos los profesionales</option>
                {professionals.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.manualFullField}>
              <span>Tipo de bloqueo</span>
              <select
                onChange={(event) => {
                  setBlockType(event.target.value as "all-day" | "interval");
                  resetPreview();
                }}
                value={blockType}
              >
                <option value="interval">Intervalo horario</option>
                <option value="all-day">Día completo</option>
              </select>
            </label>

            {blockType === "interval" ? (
              <>
                <label>
                  <span>Hora de inicio</span>
                  <input
                    onChange={(event) => {
                      setStart(event.target.value);
                      resetPreview();
                    }}
                    required
                    step={60}
                    type="time"
                    value={start}
                  />
                </label>
                <label>
                  <span>Hora de fin</span>
                  <input
                    onChange={(event) => {
                      setEnd(event.target.value);
                      resetPreview();
                    }}
                    required
                    step={60}
                    type="time"
                    value={end}
                  />
                </label>
              </>
            ) : null}

            <label className={styles.manualFullField}>
              <span>
                {preview
                  ? "Motivo de cancelación (obligatorio)"
                  : "Motivo del bloqueo (opcional)"}
              </span>
              <textarea
                maxLength={500}
                onChange={(event) => {
                  setReason(event.target.value);
                  setFormError("");
                }}
                placeholder={
                  preview
                    ? "Explica brevemente por qué debe cancelarse la cita…"
                    : "Vacaciones, asunto personal, formación…"
                }
                required={Boolean(preview)}
                rows={3}
                value={reason}
              />
            </label>
          </div>

          {preview ? (
            <div className={styles.blockCancellationWarning} role="alert">
              <strong>{preview.message}</strong>
              <p>
                La fecha y la hora originales no cambiarán. Cada cliente podrá
                elegir una nueva cita desde el enlace incluido en su email.
              </p>
              <ol>
                {preview.affectedReservations.map((reservation) => (
                  <li key={reservation.id}>
                    <div>
                      <strong>{reservation.clientName}</strong>
                      <span>
                        {reservation.serviceName} · {reservation.professionalName}
                      </span>
                    </div>
                    <time dateTime={reservation.startDatetime}>
                      {reservation.localDate} · {reservation.localStart}–
                      {reservation.localEnd}
                    </time>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className={styles.blockSafetyNotice}>
              <strong>Primero se comprobarán las citas afectadas.</strong>
              <span>
                Si hay reservas activas, nada se cancelará hasta que revises la
                advertencia y confirmes expresamente.
              </span>
            </div>
          )}

          {invalidInterval ? (
            <div className={styles.manualFormError} role="alert">
              La hora de fin debe ser posterior a la hora de inicio.
            </div>
          ) : null}

          {formError ? (
            <div className={styles.manualFormError} role="alert">
              {formError}
            </div>
          ) : null}

          <div className={styles.manualFormActions}>
            <button
              className={styles.manualCancelButton}
              disabled={submitting}
              onClick={onClose}
              type="button"
            >
              CANCELAR
            </button>
            <button
              className={
                preview
                  ? styles.destructiveSubmitButton
                  : styles.manualSubmitButton
              }
              disabled={
                submitting ||
                !professional ||
                !date ||
                invalidInterval ||
                Boolean(preview && !reason.trim())
              }
              type="submit"
            >
              {submitting
                ? preview
                  ? "CANCELANDO Y BLOQUEANDO…"
                  : "COMPROBANDO…"
                : preview
                  ? `CANCELAR ${affectedCount} ${affectedCount === 1 ? "CITA" : "CITAS"} Y BLOQUEAR`
                  : "COMPROBAR Y BLOQUEAR"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
