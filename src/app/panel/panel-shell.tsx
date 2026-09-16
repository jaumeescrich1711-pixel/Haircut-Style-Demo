"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { TodayReservation } from "@/lib/auth/today-reservations";
import { createClient } from "@/lib/supabase/client";

import styles from "./panel.module.css";

const navigation = [
  { label: "Inicio", marker: "01" },
  { label: "Calendario", marker: "02" },
  { label: "Profesionales", marker: "03" },
  { label: "Servicios", marker: "04" },
  { label: "Configuración", marker: "05" },
];

export function PanelShell({
  businessName,
  role,
  reservations,
  reservationsAvailable,
  timeZone,
}: {
  businessName: string;
  role: string;
  reservations: TodayReservation[];
  reservationsAvailable: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const timeFormatter = new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className={styles.panel}>
      <aside className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.brand}>
          <span>HAIRCUT</span>
          <strong>STYLE</strong>
        </div>

        <nav aria-label="Navegación del panel" className={styles.nav}>
          {navigation.map((item, index) => (
            <button
              aria-current={index === 0 ? "page" : undefined}
              className={index === 0 ? styles.activeNavItem : styles.navItem}
              disabled={index !== 0}
              key={item.label}
              type="button"
            >
              <span>{item.marker}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className={styles.account}>
          <span>{role}</span>
          <button disabled={loggingOut} onClick={handleLogout} type="button">
            {loggingOut ? "CERRANDO…" : "CERRAR SESIÓN"}
          </button>
        </div>
      </aside>

      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
            className={styles.menuButton}
            onClick={() => setMenuOpen((current) => !current)}
            type="button"
          >
            <span />
            <span />
          </button>
          <p>PANEL DE GESTIÓN</p>
          <span className={styles.status}>Privado</span>
        </header>

        <div className={styles.content}>
          <div className={styles.heading}>
            <p>INICIO</p>
            <h1>Hola, {businessName}</h1>
            <span>Tu espacio de trabajo está preparado.</span>
          </div>

          <section className={styles.todayCard} aria-labelledby="today-title">
            <div>
              <span className={styles.cardNumber}>01</span>
              <div>
                <p>VISTA GENERAL</p>
                <h2 id="today-title">Reservas de hoy</h2>
              </div>
            </div>
            {!reservationsAvailable ? (
              <div className={styles.placeholder} role="status">
                <span aria-hidden="true">!</span>
                <p>No se han podido cargar las reservas. Vuelve a intentarlo.</p>
              </div>
            ) : reservations.length === 0 ? (
              <div className={styles.placeholder}>
                <span aria-hidden="true">—</span>
                <p>No hay reservas para hoy.</p>
              </div>
            ) : (
              <ol className={styles.reservationList}>
                {reservations.map((reservation) => (
                  <li className={styles.reservationItem} key={reservation.id}>
                    <time dateTime={reservation.startDatetime}>
                      {timeFormatter.format(new Date(reservation.startDatetime))}
                    </time>
                    <div className={styles.reservationDetails}>
                      <strong>{reservation.clientName}</strong>
                      <span>{reservation.serviceName}</span>
                    </div>
                    <div className={styles.reservationProfessional}>
                      <span>PROFESIONAL</span>
                      <strong>{reservation.professionalName}</strong>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className={styles.futureGrid} aria-label="Próximas funciones">
            <div>
              <span>Próximamente</span>
              <p>Resumen de la jornada</p>
            </div>
            <div>
              <span>Próximamente</span>
              <p>Actividad del negocio</p>
            </div>
          </div>
        </div>
      </section>

      {menuOpen ? (
        <button
          aria-label="Cerrar menú"
          className={styles.backdrop}
          onClick={() => setMenuOpen(false)}
          type="button"
        />
      ) : null}
    </main>
  );
}
