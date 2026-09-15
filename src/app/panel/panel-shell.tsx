"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

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
}: {
  businessName: string;
  role: string;
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
            <div className={styles.placeholder}>
              <span aria-hidden="true">—</span>
              <p>La agenda diaria aparecerá aquí en la siguiente fase.</p>
            </div>
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
