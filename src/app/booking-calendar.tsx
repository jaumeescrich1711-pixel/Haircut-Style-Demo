"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import styles from "./booking-calendar.module.css";

type ServiceOption = {
  id: number;
  name: string;
  durationMinutes: number;
  price: number;
};

type ProfessionalOption = {
  id: number;
  name: string;
  serviceIds: number[];
};

type ProfessionalSelection = number | "any";

type CalendarSlot = {
  start: string;
  end: string;
  professionalIds: number[];
};

type CalendarDay = {
  date: string;
  day: number;
  status:
    | "available"
    | "unavailable"
    | "past"
    | "sunday"
    | "outside-range"
    | "booking-disabled";
  slots: CalendarSlot[];
};

type CalendarResponse = {
  month: string;
  today: string;
  maxDate: string;
  days: CalendarDay[];
};

type CustomerField = "name" | "phone" | "email";

type CustomerForm = Record<CustomerField, string>;

type CustomerFormErrors = Partial<Record<CustomerField, string>>;

type ConfirmedBooking = {
  id: number;
  professional: {
    id: number;
    name: string;
  };
  service: {
    id: number;
    name: string;
    price: number;
    durationMinutes: number;
  };
  startDatetime: string;
  endDatetime: string;
  selectedAnyProfessional: boolean;
  date: string;
  start: string;
  end: string;
};

type BookingCalendarProps = {
  services: ServiceOption[];
  professionals: ProfessionalOption[];
  settings: {
    bookingEnabled: boolean;
    timeZone: string;
    maxBookingDaysAhead: number;
  };
  today: string;
};

const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

const monthFormatter = new Intl.DateTimeFormat("es-ES", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const longDateFormatter = new Intl.DateTimeFormat("es-ES", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

const euroFormatter = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[0-9\s().-]+$/;

function monthToDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function moveMonth(month: string, amount: number) {
  const date = monthToDate(month);
  date.setUTCMonth(date.getUTCMonth() + amount);

  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatLongDate(date: string) {
  return longDateFormatter.format(new Date(`${date}T12:00:00Z`));
}

function getDayTitle(day: CalendarDay) {
  const date = formatLongDate(day.date);

  switch (day.status) {
    case "available":
      return `${date}: hay horas disponibles`;
    case "past":
      return `${date}: fecha pasada`;
    case "sunday":
      return `${date}: cerrado los domingos`;
    case "outside-range":
      return `${date}: fuera del plazo de reserva`;
    case "booking-disabled":
      return `${date}: reservas no disponibles`;
    default:
      return `${date}: sin horas disponibles`;
  }
}

function validateCustomerForm(values: CustomerForm) {
  const errors: CustomerFormErrors = {};
  const phoneDigits = values.phone.replace(/\D/g, "");

  if (!values.name.trim()) {
    errors.name = "Introduce tu nombre.";
  }

  if (
    !values.phone.trim() ||
    !phonePattern.test(values.phone.trim()) ||
    phoneDigits.length < 7 ||
    phoneDigits.length > 15
  ) {
    errors.phone = "Introduce un teléfono válido.";
  }

  if (!emailPattern.test(values.email.trim())) {
    errors.email = "Introduce un email válido.";
  }

  return errors;
}

export default function BookingCalendar({
  services,
  professionals,
  settings,
  today,
}: BookingCalendarProps) {
  const currentMonth = today.slice(0, 7);
  const maxDate = useMemo(() => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + settings.maxBookingDaysAhead);
    return date.toISOString().slice(0, 10);
  }, [settings.maxBookingDaysAhead, today]);
  const lastMonth = maxDate.slice(0, 7);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(
    null,
  );
  const [selectedProfessional, setSelectedProfessional] =
    useState<ProfessionalSelection | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<CalendarSlot | null>(null);
  const [calendar, setCalendar] = useState<CalendarResponse | null>(null);
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] =
    useState<ConfirmedBooking | null>(null);
  const [customer, setCustomer] = useState<CustomerForm>({
    name: "",
    phone: "",
    email: "",
  });
  const [customerErrors, setCustomerErrors] =
    useState<CustomerFormErrors>({});

  const selectedService = services.find(
    (service) => service.id === selectedServiceId,
  );
  const eligibleProfessionals = professionals.filter((professional) =>
    selectedServiceId
      ? professional.serviceIds.includes(selectedServiceId)
      : false,
  );
  const selectedProfessionalName =
    selectedProfessional === "any"
      ? "Cualquiera"
      : professionals.find(
          (professional) => professional.id === selectedProfessional,
        )?.name;
  const firstWeekday = calendar
    ? (() => {
        const day = monthToDate(calendar.month).getUTCDay();
        return day === 0 ? 7 : day;
      })()
    : 1;
  const selectedDay = calendar?.days.find(
    (day) => day.date === selectedDate,
  );

  const chooseService = useCallback((serviceId: number) => {
    setSelectedServiceId(serviceId);
    setSelectedProfessional(null);
    setVisibleMonth(currentMonth);
    setSelectedDate(null);
    setSelectedSlot(null);
    setCalendar(null);
    setError(null);
    setBookingError(null);
    setLoading(false);
    setCustomerErrors({});
    setConfirmedBooking(null);
  }, [currentMonth]);

  function chooseProfessional(selection: ProfessionalSelection) {
    setSelectedProfessional(selection);
    setVisibleMonth(currentMonth);
    setSelectedDate(null);
    setSelectedSlot(null);
    setCalendar(null);
    setError(null);
    setBookingError(null);
    setLoading(true);
    setCustomerErrors({});
  }

  function navigateMonth(amount: number) {
    setVisibleMonth(moveMonth(visibleMonth, amount));
    setSelectedDate(null);
    setSelectedSlot(null);
    setCalendar(null);
    setError(null);
    setBookingError(null);
    setLoading(true);
    setCustomerErrors({});
  }

  function updateCustomer(field: CustomerField, value: string) {
    setCustomer((current) => ({ ...current, [field]: value }));
    setCustomerErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
    setBookingError(null);
  }

  async function submitReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateCustomerForm(customer);
    setCustomerErrors(nextErrors);

    if (
      Object.keys(nextErrors).length > 0 ||
      !selectedServiceId ||
      selectedProfessional === null ||
      !selectedDate ||
      !selectedSlot
    ) {
      return;
    }

    setSubmitting(true);
    setBookingError(null);

    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          serviceId: selectedServiceId,
          professional: selectedProfessional,
          date: selectedDate,
          start: selectedSlot.start,
          client: customer,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        code?: string;
        message?: string;
        booking?: Omit<ConfirmedBooking, "date" | "start" | "end">;
      };

      if (!response.ok || !payload.booking) {
        const message =
          payload.message ??
          "No se ha podido guardar la reserva. Inténtalo de nuevo.";
        setBookingError(message);

        if (response.status === 409 || payload.code === "slot_unavailable") {
          setSelectedSlot(null);
          setCalendar(null);
          setLoading(true);
          setCalendarRefreshKey((current) => current + 1);
        }

        return;
      }

      setConfirmedBooking({
        ...payload.booking,
        date: selectedDate,
        start: selectedSlot.start,
        end: selectedSlot.end,
      });
    } catch {
      setBookingError(
        "No se ha podido contactar con la base de datos. Puedes volver a intentarlo.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    function handleServiceLink(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const link = target.closest<HTMLElement>("[data-service-id]");
      const serviceId = Number(link?.dataset.serviceId);

      if (Number.isInteger(serviceId) && serviceId > 0) {
        chooseService(serviceId);
      }
    }

    document.addEventListener("click", handleServiceLink);
    return () => document.removeEventListener("click", handleServiceLink);
  }, [chooseService]);

  useEffect(() => {
    if (!selectedServiceId || selectedProfessional === null) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      professionalId: String(selectedProfessional),
      serviceId: String(selectedServiceId),
      month: visibleMonth,
    });

    fetch(`/api/booking-calendar?${params}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) => {
        const payload = (await response.json()) as {
          ok: boolean;
          calendar?: CalendarResponse;
          message?: string;
        };

        if (!response.ok || !payload.calendar) {
          throw new Error(payload.message ?? "No se ha podido cargar el mes.");
        }

        setCalendar(payload.calendar);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          return;
        }

        setCalendar(null);
        setError(
          requestError instanceof Error
            ? requestError.message
            : "No se ha podido cargar el mes.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [calendarRefreshKey, selectedProfessional, selectedServiceId, visibleMonth]);

  if (confirmedBooking) {
    return (
      <div className={styles.confirmedState} aria-live="polite">
        <span className={styles.confirmedEyebrow}>Reserva confirmada</span>
        <h3>Tu cita está reservada</h3>
        <p>
          Supabase ha guardado la reserva y el horario ya no está disponible
          para otros clientes.
        </p>
        <dl className={styles.confirmedDetails}>
          <div>
            <dt>Servicio</dt>
            <dd>{confirmedBooking.service.name}</dd>
          </div>
          <div>
            <dt>Profesional</dt>
            <dd>{confirmedBooking.professional.name}</dd>
          </div>
          <div>
            <dt>Fecha</dt>
            <dd>{formatLongDate(confirmedBooking.date)}</dd>
          </div>
          <div>
            <dt>Hora</dt>
            <dd>
              {confirmedBooking.start}–{confirmedBooking.end}
            </dd>
          </div>
        </dl>
        {confirmedBooking.selectedAnyProfessional ? (
          <small>
            Elegiste Cualquiera y el sistema te ha asignado a{" "}
            {confirmedBooking.professional.name}.
          </small>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.bookingFlow}>
      <div className={styles.step}>
        <div className={styles.stepHeading}>
          <span>01</span>
          <div>
            <p>Servicio</p>
            <small>Elige qué necesitas</small>
          </div>
        </div>
        <div className={styles.optionGrid}>
          {services.map((service) => (
            <button
              className={styles.optionButton}
              data-selected={selectedServiceId === service.id}
              type="button"
              aria-pressed={selectedServiceId === service.id}
              onClick={() => chooseService(service.id)}
              key={service.id}
            >
              <strong>{service.name}</strong>
              <span>{service.durationMinutes} min</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.step} data-muted={!selectedService}>
        <div className={styles.stepHeading}>
          <span>02</span>
          <div>
            <p>Profesional</p>
            <small>Elige quién te atiende</small>
          </div>
        </div>
        {selectedService ? (
          <div className={styles.optionGrid}>
            {eligibleProfessionals.map((professional) => (
              <button
                className={styles.optionButton}
                data-selected={selectedProfessional === professional.id}
                type="button"
                aria-pressed={selectedProfessional === professional.id}
                onClick={() => chooseProfessional(professional.id)}
                key={professional.id}
              >
                <strong>{professional.name}</strong>
                <span>Ver sus horas</span>
              </button>
            ))}
            <button
              className={styles.optionButton}
              data-selected={selectedProfessional === "any"}
              type="button"
              aria-pressed={selectedProfessional === "any"}
              onClick={() => chooseProfessional("any")}
            >
              <strong>Cualquiera</strong>
              <span>Primera opción libre</span>
            </button>
          </div>
        ) : (
          <p className={styles.stepPrompt}>Selecciona primero un servicio.</p>
        )}
      </div>

      <div
        className={`${styles.step} ${styles.calendarStep}`}
        data-muted={selectedProfessional === null}
      >
        <div className={styles.stepHeading}>
          <span>03</span>
          <div>
            <p>Fecha y hora</p>
            <small>Solo mostramos huecos reales</small>
          </div>
        </div>

        {!settings.bookingEnabled ? (
          <p className={styles.notice}>Las reservas online no están activas.</p>
        ) : selectedProfessional === null ? (
          <p className={styles.stepPrompt}>Selecciona un profesional.</p>
        ) : (
          <div className={styles.calendarLayout}>
            <div className={styles.calendarPanel} aria-busy={loading}>
              <div className={styles.monthNavigation}>
                <button
                  type="button"
                  aria-label="Mes anterior"
                  disabled={visibleMonth <= currentMonth || loading}
                  onClick={() => navigateMonth(-1)}
                >
                  ←
                </button>
                <h3>{monthFormatter.format(monthToDate(visibleMonth))}</h3>
                <button
                  type="button"
                  aria-label="Mes siguiente"
                  disabled={visibleMonth >= lastMonth || loading}
                  onClick={() => navigateMonth(1)}
                >
                  →
                </button>
              </div>

              <div className={styles.calendarGrid}>
                {weekDays.map((weekDay) => (
                  <span className={styles.weekDay} key={weekDay}>
                    {weekDay}
                  </span>
                ))}
                {Array.from({ length: firstWeekday - 1 }, (_, index) => (
                  <span aria-hidden="true" key={`empty-${index}`} />
                ))}
                {calendar?.days.map((day) => {
                  const available = day.status === "available";

                  return (
                    <button
                      className={styles.dayButton}
                      data-status={day.status}
                      data-today={day.date === today}
                      data-selected={day.date === selectedDate}
                      type="button"
                      disabled={!available}
                      aria-label={getDayTitle(day)}
                      aria-pressed={day.date === selectedDate}
                      title={getDayTitle(day)}
                      onClick={() => {
                        setSelectedDate(day.date);
                        setSelectedSlot(null);
                        setCustomerErrors({});
                        setBookingError(null);
                      }}
                      key={day.date}
                    >
                      {day.day}
                    </button>
                  );
                })}
              </div>

              {loading ? (
                <p className={styles.loading} role="status">
                  Consultando disponibilidad…
                </p>
              ) : null}
              {error ? (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              ) : null}
              {!loading && !error ? (
                <div className={styles.legend} aria-label="Leyenda del calendario">
                  <span><i data-kind="available" /> Disponible</span>
                  <span><i data-kind="selected" /> Seleccionado</span>
                  <span><i data-kind="disabled" /> No disponible</span>
                </div>
              ) : null}
            </div>

            <div className={styles.timePanel}>
              {selectedDay ? (
                <>
                  <div className={styles.timeHeading}>
                    <p>{formatLongDate(selectedDay.date)}</p>
                    <span>{selectedDay.slots.length} horas</span>
                  </div>
                  <div className={styles.slotGrid}>
                    {selectedDay.slots.map((slot) => (
                      <button
                        type="button"
                        data-selected={selectedSlot?.start === slot.start}
                        aria-pressed={selectedSlot?.start === slot.start}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setCustomerErrors({});
                          setBookingError(null);
                        }}
                        key={slot.start}
                      >
                        {slot.start}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div className={styles.emptyTime}>
                  <span aria-hidden="true">↗</span>
                  <p>Selecciona un día disponible para ver sus horas.</p>
                </div>
              )}
            </div>
            {bookingError && !selectedSlot ? (
              <p className={styles.bookingError} role="alert">
                {bookingError}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {selectedSlot && selectedService && selectedProfessionalName ? (
        <div className={styles.confirmationArea}>
          <div className={styles.selectionSummary} aria-live="polite">
            <span>Selección preparada</span>
            <dl className={styles.summaryGrid}>
              <div>
                <dt>Servicio</dt>
                <dd>{selectedService.name}</dd>
              </div>
              <div>
                <dt>Precio</dt>
                <dd>{euroFormatter.format(selectedService.price)}</dd>
              </div>
              <div>
                <dt>Duración</dt>
                <dd>{selectedService.durationMinutes} min</dd>
              </div>
              <div>
                <dt>Profesional</dt>
                <dd>{selectedProfessionalName}</dd>
              </div>
              <div>
                <dt>Fecha</dt>
                <dd>{selectedDate ? formatLongDate(selectedDate) : ""}</dd>
              </div>
              <div>
                <dt>Inicio</dt>
                <dd>{selectedSlot.start}</dd>
              </div>
              <div>
                <dt>Finalización</dt>
                <dd>{selectedSlot.end}</dd>
              </div>
            </dl>
            <small>
              Al confirmar, el servidor comprobará de nuevo que el horario
              sigue libre antes de guardarlo.
            </small>
          </div>

          <form
            className={styles.customerForm}
            onSubmit={submitReservation}
            noValidate
          >
            <div className={styles.formHeading}>
              <span>Datos del cliente</span>
              <p>Completa los tres campos para validar la solicitud.</p>
            </div>

            <div className={styles.fieldGrid}>
              <div className={styles.formField}>
                <label htmlFor="booking-name">Nombre</label>
                <input
                  id="booking-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={customer.name}
                  required
                  aria-invalid={Boolean(customerErrors.name)}
                  aria-describedby={customerErrors.name ? "booking-name-error" : undefined}
                  onChange={(event) => updateCustomer("name", event.target.value)}
                />
                {customerErrors.name ? (
                  <span id="booking-name-error" className={styles.fieldError}>
                    {customerErrors.name}
                  </span>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label htmlFor="booking-phone">Teléfono</label>
                <input
                  id="booking-phone"
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={customer.phone}
                  required
                  maxLength={20}
                  aria-invalid={Boolean(customerErrors.phone)}
                  aria-describedby={customerErrors.phone ? "booking-phone-error" : undefined}
                  onChange={(event) => updateCustomer("phone", event.target.value)}
                />
                {customerErrors.phone ? (
                  <span id="booking-phone-error" className={styles.fieldError}>
                    {customerErrors.phone}
                  </span>
                ) : null}
              </div>

              <div className={styles.formField}>
                <label htmlFor="booking-email">Email</label>
                <input
                  id="booking-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={customer.email}
                  required
                  aria-invalid={Boolean(customerErrors.email)}
                  aria-describedby={customerErrors.email ? "booking-email-error" : undefined}
                  onChange={(event) => updateCustomer("email", event.target.value)}
                />
                {customerErrors.email ? (
                  <span id="booking-email-error" className={styles.fieldError}>
                    {customerErrors.email}
                  </span>
                ) : null}
              </div>
            </div>

            <button
              className={styles.confirmButton}
              type="submit"
              disabled={submitting}
            >
              <span>{submitting ? "CONFIRMANDO…" : "CONFIRMAR RESERVA"}</span>
              <span aria-hidden="true">→</span>
            </button>

            {bookingError ? (
              <p className={styles.bookingError} role="alert">
                {bookingError}
              </p>
            ) : null}
          </form>
        </div>
      ) : null}
    </div>
  );
}
