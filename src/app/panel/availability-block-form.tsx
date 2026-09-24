"use client";

import { useState } from "react";

import type {
  CalendarAvailabilityBlock,
  CalendarProfessional,
} from "@/lib/auth/calendar-reservations";

import styles from "./panel.module.css";

type CreateBlockResponse =
  | { ok: true; blocks: CalendarAvailabilityBlock[] }
  | {
      ok: false;
      code?: string;
      affectedReservations?: number;
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
  onCreated: (blocks: CalendarAvailabilityBlock[], date: string) => Promise<void>;
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
  const [affectedReservations, setAffectedReservations] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setAffectedReservations(0);
    setSubmitting(true);

    const allProfessionals = professional === "all";
    const professionalId = allProfessionals ? null : Number(professional);
    const allDay = blockType === "all-day";

    try {
      const response = await fetch("/api/panel/availability-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          professionalId,
          allProfessionals,
          date,
          allDay,
          start: allDay ? null : start,
          end: allDay ? null : end,
          reason,
        }),
      });
      const result = (await response.json()) as CreateBlockResponse;

      if (!response.ok || !result.ok) {
        if (!result.ok && result.code === "active_reservations_affected") {
          setAffectedReservations(result.affectedReservations ?? 0);
        }

        throw new Error(result.ok ? "block_failed" : result.message);
      }

      await onCreated(result.blocks, date);
    } catch (error) {
      setFormError(
        error instanceof Error && error.message !== "block_failed"
          ? error.message
          : "No se ha podido guardar el bloqueo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const invalidInterval =
    blockType === "interval" && Boolean(start && end && start >= end);

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
              Las reservas existentes se comprueban antes de guardar.
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
                  setFormError("");
                  setAffectedReservations(0);
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
                  setFormError("");
                  setAffectedReservations(0);
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
                  setFormError("");
                  setAffectedReservations(0);
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
                      setFormError("");
                      setAffectedReservations(0);
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
                      setFormError("");
                      setAffectedReservations(0);
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
              <span>Motivo opcional</span>
              <textarea
                maxLength={300}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Vacaciones, asunto personal, formación…"
                rows={3}
                value={reason}
              />
            </label>
          </div>

          <div className={styles.blockSafetyNotice}>
            <strong>No se cancelará ninguna cita.</strong>
            <span>
              Si el intervalo afecta a reservas activas, el bloqueo se rechazará
              y podrás gestionarlas antes.
            </span>
          </div>

          {invalidInterval ? (
            <div className={styles.manualFormError} role="alert">
              La hora de fin debe ser posterior a la hora de inicio.
            </div>
          ) : null}

          {formError ? (
            <div className={styles.manualFormError} role="alert">
              {formError}
              {affectedReservations > 0 ? (
                <strong className={styles.affectedReservationCount}>
                  {affectedReservations} {affectedReservations === 1 ? "cita afectada" : "citas afectadas"}
                </strong>
              ) : null}
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
              className={styles.manualSubmitButton}
              disabled={
                submitting ||
                !professional ||
                !date ||
                invalidInterval
              }
              type="submit"
            >
              {submitting ? "BLOQUEANDO…" : "GUARDAR BLOQUEO"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

