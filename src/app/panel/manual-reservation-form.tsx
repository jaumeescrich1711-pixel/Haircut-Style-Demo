"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./panel.module.css";

type ManualOptions = {
  bookingEnabled: boolean;
  timeZone: string;
  today: string;
  maxDate: string;
  services: Array<{
    id: number;
    name: string;
    durationMinutes: number;
    price: number;
  }>;
  professionals: Array<{
    id: number;
    name: string;
    serviceIds: number[];
  }>;
};

type Slot = { start: string; end: string };

type CreatedBooking = {
  id: number;
  professional: { id: number; name: string };
  service: { id: number; name: string; price: number; durationMinutes: number };
  startDatetime: string;
  endDatetime: string;
};

type OptionsResponse =
  | { ok: true; options: ManualOptions }
  | { ok: false; message: string };

type SlotsResponse =
  | {
      ok: true;
      availability: {
        date: string;
        status: string;
        slots: Slot[];
      };
    }
  | { ok: false; message: string };

type CreateResponse =
  | {
      ok: true;
      booking: CreatedBooking;
      emailStatus: "sent" | "error";
    }
  | { ok: false; code?: string; message: string };

function availabilityMessage(status: string, hasSelection: boolean) {
  if (!hasSelection) return "Selecciona servicio, profesional y fecha.";

  const messages: Record<string, string> = {
    past: "La fecha seleccionada ya ha pasado.",
    sunday: "El negocio está cerrado los domingos.",
    "outside-range": "La fecha está fuera del periodo permitido.",
    "booking-disabled": "Las reservas están desactivadas temporalmente.",
    unavailable: "No quedan horas disponibles para esta combinación.",
  };

  return messages[status] ?? "No quedan horas disponibles.";
}

export function ManualReservationForm({
  initialDate,
  onClose,
  onCreated,
}: {
  initialDate: string;
  onClose: () => void;
  onCreated: (
    booking: CreatedBooking,
    emailStatus: "sent" | "error",
    date: string,
  ) => Promise<void>;
}) {
  const [options, setOptions] = useState<ManualOptions | null>(null);
  const [optionsError, setOptionsError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [professionalId, setProfessionalId] = useState("");
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotStatus, setSlotStatus] = useState("");
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [availabilityVersion, setAvailabilityVersion] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadOptions() {
      setOptionsError("");

      try {
        const response = await fetch("/api/panel/manual-reservations", {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as OptionsResponse;

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? "options_unavailable" : result.message);
        }

        setOptions(result.options);
      } catch (error) {
        if (controller.signal.aborted) return;
        setOptionsError(
          error instanceof Error && error.message !== "options_unavailable"
            ? error.message
            : "No se han podido cargar servicios y profesionales.",
        );
      }
    }

    loadOptions();
    return () => controller.abort();
  }, []);

  const eligibleProfessionals = useMemo(() => {
    if (!options || !serviceId) return options?.professionals ?? [];
    const parsedServiceId = Number(serviceId);

    return options.professionals.filter((professional) =>
      professional.serviceIds.includes(parsedServiceId),
    );
  }, [options, serviceId]);

  useEffect(() => {
    const hasSelection = Boolean(serviceId && professionalId && date);

    if (!hasSelection) {
      return;
    }

    const controller = new AbortController();

    async function loadSlots() {
      setLoadingSlots(true);

      try {
        const params = new URLSearchParams({
          serviceId,
          professionalId,
          date,
        });
        const response = await fetch(
          `/api/panel/manual-reservations?${params.toString()}`,
          { cache: "no-store", signal: controller.signal },
        );
        const result = (await response.json()) as SlotsResponse;

        if (!response.ok || !result.ok) {
          throw new Error(result.ok ? "slots_unavailable" : result.message);
        }

        setSlots(result.availability.slots);
        setSlotStatus(result.availability.status);
      } catch (error) {
        if (controller.signal.aborted) return;
        setSlots([]);
        setSlotStatus("error");
        setFormError(
          error instanceof Error && error.message !== "slots_unavailable"
            ? error.message
            : "No se han podido cargar las horas disponibles.",
        );
      } finally {
        if (!controller.signal.aborted) setLoadingSlots(false);
      }
    }

    loadSlots();
    return () => controller.abort();
  }, [availabilityVersion, date, professionalId, serviceId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/panel/manual-reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: Number(serviceId),
          professionalId: Number(professionalId),
          date,
          start,
          client: { name, phone, email },
        }),
      });
      const result = (await response.json()) as CreateResponse;

      if (!response.ok || !result.ok) {
        if (!result.ok && result.code === "slot_unavailable") {
          setStart("");
          setAvailabilityVersion((current) => current + 1);
        }

        throw new Error(result.ok ? "reservation_failed" : result.message);
      }

      await onCreated(result.booking, result.emailStatus, date);
    } catch (error) {
      setFormError(
        error instanceof Error && error.message !== "reservation_failed"
          ? error.message
          : "No se ha podido guardar la reserva.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const hasSlotSelection = Boolean(serviceId && professionalId && date);
  const selectedService = options?.services.find(
    (service) => service.id === Number(serviceId),
  );

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
        aria-labelledby="manual-reservation-title"
        aria-modal="true"
        className={styles.manualReservationModal}
        role="dialog"
      >
        <div className={styles.manualReservationHeader}>
          <div>
            <p>NUEVA CITA</p>
            <h2 id="manual-reservation-title">Añadir reserva</h2>
            <span>La disponibilidad se comprueba de nuevo al guardar.</span>
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

        {optionsError ? (
          <div className={styles.manualFormError} role="alert">
            {optionsError}
          </div>
        ) : null}

        <form className={styles.manualReservationForm} onSubmit={handleSubmit}>
          <div className={styles.manualFormGrid}>
            <label>
              <span>Nombre del cliente</span>
              <input
                autoComplete="name"
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder="Nombre y apellidos"
                required
                value={name}
              />
            </label>
            <label>
              <span>Teléfono</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                maxLength={20}
                minLength={7}
                onChange={(event) => setPhone(event.target.value)}
                pattern="\+?[0-9\s().-]{7,20}"
                placeholder="+34 600 000 000"
                required
                value={phone}
              />
            </label>
            <label className={styles.manualFullField}>
              <span>Email</span>
              <input
                autoComplete="email"
                maxLength={254}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="cliente@ejemplo.com"
                required
                type="email"
                value={email}
              />
            </label>
            <label>
              <span>Servicio</span>
              <select
                disabled={!options}
                onChange={(event) => {
                  setServiceId(event.target.value);
                  setProfessionalId("");
                  setStart("");
                  setSlots([]);
                  setSlotStatus("");
                  setFormError("");
                }}
                required
                value={serviceId}
              >
                <option disabled value="">
                  Selecciona un servicio
                </option>
                {options?.services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name} · {service.durationMinutes} min · {service.price} €
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Profesional</span>
              <select
                disabled={!serviceId || eligibleProfessionals.length === 0}
                onChange={(event) => {
                  setProfessionalId(event.target.value);
                  setStart("");
                  setSlots([]);
                  setSlotStatus("");
                  setFormError("");
                }}
                required
                value={professionalId}
              >
                <option disabled value="">
                  Selecciona un profesional
                </option>
                {eligibleProfessionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>
                    {professional.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Fecha</span>
              <input
                max={options?.maxDate}
                min={options?.today}
                onChange={(event) => {
                  setDate(event.target.value);
                  setStart("");
                  setSlots([]);
                  setSlotStatus("");
                  setFormError("");
                }}
                required
                type="date"
                value={date}
              />
            </label>
            <label>
              <span>Hora disponible</span>
              <select
                disabled={loadingSlots || slots.length === 0}
                onChange={(event) => {
                  setStart(event.target.value);
                  setFormError("");
                }}
                required
                value={start}
              >
                <option disabled value="">
                  {loadingSlots ? "Consultando horas…" : "Selecciona una hora"}
                </option>
                {slots.map((slot) => (
                  <option key={slot.start} value={slot.start}>
                    {slot.start}–{slot.end}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.manualAvailabilityStatus} aria-live="polite">
            {loadingSlots ? (
              <span>Comprobando agenda real…</span>
            ) : slots.length > 0 ? (
              <span>
                {slots.length} {slots.length === 1 ? "hora disponible" : "horas disponibles"}
                {selectedService ? ` para ${selectedService.name}` : ""}.
              </span>
            ) : (
              <span>{availabilityMessage(slotStatus, hasSlotSelection)}</span>
            )}
          </div>

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
              className={styles.manualSubmitButton}
              disabled={
                submitting ||
                loadingSlots ||
                !options?.bookingEnabled ||
                slots.length === 0
              }
              type="submit"
            >
              {submitting ? "GUARDANDO…" : "GUARDAR RESERVA"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
