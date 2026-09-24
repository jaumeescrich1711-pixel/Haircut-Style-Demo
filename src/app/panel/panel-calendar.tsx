"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

import type {
  CalendarAvailabilityBlock,
  BusinessCalendarMonth,
  CalendarMonthResult,
} from "@/lib/auth/calendar-reservations";

import { AvailabilityBlockForm } from "./availability-block-form";
import { ManualReservationForm } from "./manual-reservation-form";
import styles from "./panel.module.css";

const weekDays = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

function shiftMonth(month: string, amount: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const next = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));

  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthCells(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const offset = (firstDay.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cells: Array<number | null> = Array.from({ length: offset }, () => null);

  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0 || cells.length < 35) cells.push(null);

  return cells;
}

function isoDate(month: string, day: number) {
  return `${month}-${String(day).padStart(2, "0")}`;
}

function defaultSelectedDate(calendar: BusinessCalendarMonth) {
  return calendar.today.startsWith(`${calendar.month}-`)
    ? calendar.today
    : `${calendar.month}-01`;
}

export function PanelCalendar({
  initialResult,
}: {
  initialResult: CalendarMonthResult;
}) {
  const router = useRouter();
  const [calendar, setCalendar] = useState(initialResult.calendar);
  const [selectedDate, setSelectedDate] = useState(() =>
    defaultSelectedDate(initialResult.calendar),
  );
  const [professionalFilter, setProfessionalFilter] = useState<number | "all">(
    "all",
  );
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(initialResult.ok);
  const [manualReservationOpen, setManualReservationOpen] = useState(false);
  const [manualReservationNotice, setManualReservationNotice] = useState("");
  const [availabilityBlockOpen, setAvailabilityBlockOpen] = useState(false);
  const [availabilityBlockNotice, setAvailabilityBlockNotice] = useState("");
  const requestNumber = useRef(0);

  const cells = useMemo(() => monthCells(calendar.month), [calendar.month]);
  const monthLabel = useMemo(() => {
    const [year, monthNumber] = calendar.month.split("-").map(Number);

    return new Intl.DateTimeFormat("es-ES", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
  }, [calendar.month]);
  const selectedDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(new Date(`${selectedDate}T12:00:00Z`)),
    [selectedDate],
  );
  const appointmentCounts = useMemo(() => {
    const counts = new Map<string, number>();

    calendar.reservations.forEach((reservation) => {
      counts.set(reservation.localDate, (counts.get(reservation.localDate) ?? 0) + 1);
    });

    return counts;
  }, [calendar.reservations]);
  const visibleProfessionals = calendar.professionals.filter(
    (professional) =>
      professionalFilter === "all" || professional.id === professionalFilter,
  );

  async function loadMonth(nextMonth: string, preferredDate?: string) {
    const currentRequest = requestNumber.current + 1;
    requestNumber.current = currentRequest;
    setLoading(true);

    try {
      const response = await fetch(
        `/api/panel/calendar?month=${encodeURIComponent(nextMonth)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as CalendarMonthResult;

      if (!response.ok || !result.ok || currentRequest !== requestNumber.current) {
        throw new Error("calendar_unavailable");
      }

      setCalendar(result.calendar);
      setSelectedDate(
        preferredDate?.startsWith(`${result.calendar.month}-`)
          ? preferredDate
          : defaultSelectedDate(result.calendar),
      );
      setProfessionalFilter("all");
      setAvailable(true);
    } catch {
      if (currentRequest === requestNumber.current) setAvailable(false);
    } finally {
      if (currentRequest === requestNumber.current) setLoading(false);
    }
  }

  async function handleManualReservationCreated(
    booking: { professional: { name: string }; service: { name: string } },
    emailStatus: "sent" | "error",
    reservationDate: string,
  ) {
    await loadMonth(reservationDate.slice(0, 7), reservationDate);
    router.refresh();
    setManualReservationNotice(
      emailStatus === "sent"
        ? `${booking.service.name} con ${booking.professional.name} guardado. Email enviado.`
        : `${booking.service.name} con ${booking.professional.name} guardado. La cita está confirmada, aunque el email no se ha podido enviar.`,
    );
    setManualReservationOpen(false);
  }

  async function handleAvailabilityBlockCreated(
    blocks: CalendarAvailabilityBlock[],
    blockDate: string,
  ) {
    await loadMonth(blockDate.slice(0, 7), blockDate);
    router.refresh();
    setAvailabilityBlockNotice(
      blocks.length === 1
        ? `Bloqueo guardado para ${blocks[0].professionalName}.`
        : `Bloqueo guardado para ${blocks.length} profesionales.`,
    );
    setAvailabilityBlockOpen(false);
  }

  return (
    <section className={styles.calendarWorkspace} aria-label="Calendario del negocio">
      <div className={styles.calendarPanel}>
        <div className={styles.calendarToolbar}>
          <button
            aria-label="Mes anterior"
            disabled={loading}
            onClick={() => loadMonth(shiftMonth(calendar.month, -1))}
            type="button"
          >
            ←
          </button>
          <h2 aria-live="polite">{monthLabel}</h2>
          <button
            aria-label="Mes siguiente"
            disabled={loading}
            onClick={() => loadMonth(shiftMonth(calendar.month, 1))}
            type="button"
          >
            →
          </button>
        </div>

        <div className={styles.professionalFilters} aria-label="Filtrar profesional">
          <button
            aria-pressed={professionalFilter === "all"}
            onClick={() => setProfessionalFilter("all")}
            type="button"
          >
            Todos
          </button>
          {calendar.professionals.map((professional) => (
            <button
              aria-pressed={professionalFilter === professional.id}
              key={professional.id}
              onClick={() => setProfessionalFilter(professional.id)}
              type="button"
            >
              {professional.name}
            </button>
          ))}
        </div>

        {!available ? (
          <div className={styles.calendarError} role="status">
            <p>No se ha podido cargar este mes.</p>
            <button onClick={() => loadMonth(calendar.month)} type="button">
              REINTENTAR
            </button>
          </div>
        ) : null}

        <div className={`${styles.monthGrid} ${loading ? styles.monthGridLoading : ""}`}>
          {weekDays.map((day) => (
            <span className={styles.weekDay} key={day}>
              {day}
            </span>
          ))}
          {cells.map((day, index) => {
            if (day === null) {
              return <span className={styles.emptyDay} key={`empty-${index}`} />;
            }

            const date = isoDate(calendar.month, day);
            const count = appointmentCounts.get(date) ?? 0;

            return (
              <button
                aria-label={`${day} de ${monthLabel}${count ? `, ${count} ${count === 1 ? "cita" : "citas"}` : ""}`}
                aria-pressed={selectedDate === date}
                className={styles.calendarDay}
                key={date}
                onClick={() => setSelectedDate(date)}
                type="button"
              >
                <span>{day}</span>
                {count ? <small>{count}</small> : null}
              </button>
            );
          })}
        </div>
      </div>

      <section className={styles.dayAgenda} aria-labelledby="agenda-title">
        <div className={styles.agendaHeader}>
          <div>
            <p>AGENDA DIARIA</p>
            <h2 id="agenda-title">{selectedDateLabel}</h2>
          </div>
          <div className={styles.agendaActions}>
            <button
              className={styles.blockScheduleButton}
              onClick={() => {
                setAvailabilityBlockNotice("");
                setAvailabilityBlockOpen(true);
              }}
              type="button"
            >
              <span aria-hidden="true">×</span>
              Bloquear horario / día
            </button>
            <button
              className={styles.addReservationButton}
              onClick={() => {
                setManualReservationNotice("");
                setManualReservationOpen(true);
              }}
              type="button"
            >
              <span aria-hidden="true">+</span>
              Añadir reserva
            </button>
          </div>
        </div>
        {manualReservationNotice ? (
          <div className={styles.manualReservationNotice} role="status">
            {manualReservationNotice}
          </div>
        ) : null}
        {availabilityBlockNotice ? (
          <div className={styles.availabilityBlockNotice} role="status">
            {availabilityBlockNotice}
          </div>
        ) : null}
        <div
          className={`${styles.professionalColumns} ${professionalFilter !== "all" ? styles.singleProfessionalColumn : ""}`}
        >
          {visibleProfessionals.map((professional) => {
            const appointments = calendar.reservations.filter(
              (reservation) =>
                reservation.localDate === selectedDate &&
                reservation.professionalId === professional.id,
            );
            const blocks = calendar.blocks.filter(
              (block) =>
                block.localDate === selectedDate &&
                block.professionalId === professional.id,
            );
            const agendaItems = [
              ...appointments.map((appointment) => ({
                kind: "reservation" as const,
                sortTime: appointment.localStart,
                appointment,
              })),
              ...blocks.map((block) => ({
                kind: "block" as const,
                sortTime: block.allDay ? "00:00" : block.localStart,
                block,
              })),
            ].sort((left, right) => left.sortTime.localeCompare(right.sortTime));

            return (
              <section className={styles.professionalAgenda} key={professional.id}>
                <div className={styles.professionalHeading}>
                  <span aria-hidden="true" />
                  <h3>{professional.name}</h3>
                  <small>
                    {appointments.length} {appointments.length === 1 ? "cita" : "citas"}
                    {blocks.length > 0
                      ? ` · ${blocks.length} ${blocks.length === 1 ? "bloqueo" : "bloqueos"}`
                      : ""}
                  </small>
                </div>
                {agendaItems.length === 0 ? (
                  <p className={styles.emptyAgenda}>Sin citas para este día.</p>
                ) : (
                  <ol>
                    {agendaItems.map((item) =>
                      item.kind === "reservation" ? (
                        <li key={`reservation-${item.appointment.id}`}>
                          <time dateTime={item.appointment.startDatetime}>
                            {item.appointment.localStart}
                          </time>
                          <div>
                            <strong>{item.appointment.clientName}</strong>
                            <span>{item.appointment.serviceName}</span>
                          </div>
                          <small>
                            {item.appointment.localStart}–{item.appointment.localEnd}
                          </small>
                        </li>
                      ) : (
                        <li
                          className={styles.availabilityBlockItem}
                          key={`block-${item.block.id}`}
                        >
                          <time dateTime={item.block.startDatetime}>
                            {item.block.allDay ? "DÍA" : item.block.localStart}
                          </time>
                          <div>
                            <strong>Horario bloqueado</strong>
                            <span>{item.block.reason ?? "Sin motivo indicado"}</span>
                          </div>
                          <small>
                            {item.block.allDay
                              ? "Día completo"
                              : `${item.block.localStart}–${item.block.localEnd}`}
                          </small>
                        </li>
                      ),
                    )}
                  </ol>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {manualReservationOpen ? (
        <ManualReservationForm
          initialDate={selectedDate}
          onClose={() => setManualReservationOpen(false)}
          onCreated={handleManualReservationCreated}
        />
      ) : null}

      {availabilityBlockOpen ? (
        <AvailabilityBlockForm
          initialDate={selectedDate}
          onClose={() => setAvailabilityBlockOpen(false)}
          onCreated={handleAvailabilityBlockCreated}
          professionals={calendar.professionals}
          today={calendar.today}
        />
      ) : null}
    </section>
  );
}
