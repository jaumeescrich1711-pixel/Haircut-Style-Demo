import BusinessStatus from "./business-status";
import styles from "./page.module.css";
import sections from "./public-sections.module.css";
import ResultsCarousel from "./results-carousel";

const services = [
  { id: "corte", name: "Corte", duration: "30 min", price: "13 €" },
  { id: "barba", name: "Barba", duration: "15 min", price: "8 €" },
  {
    id: "corte-barba",
    name: "Corte + barba",
    duration: "45 min",
    price: "19 €",
  },
] as const;

// Contenido de demostración: sustituir estos datos antes de publicar la versión final.
const demoContact = {
  phoneLabel: "+34 000 000 000",
  phoneHref: "tel:+34000000000",
  email: "hola@haircutstyle.example",
  address: "Calle Demostración, 24 · 28000 Madrid",
  whatsappHref: "https://wa.me/34000000000",
} as const;

const quickLinks = [
  { label: "Inicio", href: "#inicio" },
  { label: "Sobre nosotros", href: "#sobre-nosotros" },
  { label: "Servicios", href: "#servicios" },
  { label: "Resultados", href: "#resultados" },
  { label: "Reservar cita", href: "#reservar" },
  { label: "Ubicación", href: "#ubicacion" },
  { label: "Contacto", href: "#contacto" },
] as const;

export default function Home() {
  return (
    <main className={styles.page}>
      <section id="inicio" className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.frame} aria-hidden="true" />
        <div className={styles.accentLine} aria-hidden="true" />
        <div className={styles.emblem} aria-hidden="true">
          <span />
        </div>

        <div className={styles.content}>
          <h1 id="hero-title" className={styles.title}>
            <span>Haircut</span>
            <span>Style</span>
          </h1>

          <p className={styles.subtitle}>Centro de estética para hombres</p>

          <button className={styles.cta} type="button">
            <span>Reservar cita</span>
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          </button>
        </div>
      </section>

      <section
        id="sobre-nosotros"
        className={styles.about}
        aria-labelledby="about-title"
      >
        <div className={styles.aboutInner}>
          <div className={styles.aboutHeading}>
            <h2 id="about-title" className={styles.aboutTitle}>
              <span>Sobre</span>
              <span>nosotros</span>
            </h2>
          </div>

          <div className={styles.aboutCopy}>
            <p className={styles.aboutText}>
              En Haircut Style creemos que un buen corte es mucho más que un
              cambio de look. Somos una barbería dedicada al cuidado y estilo
              masculino, donde combinamos profesionalidad, atención
              personalizada y las últimas tendencias para que salgas siempre
              con tu mejor versión.
            </p>
          </div>
        </div>
      </section>

      <section
        id="servicios"
        className={sections.services}
        aria-labelledby="services-title"
      >
        <div className={sections.sectionInner}>
          <header className={sections.sectionHeader}>
            <p className={sections.eyebrow}>01 — Cuidado masculino</p>
            <div className={sections.headingRow}>
              <h2 id="services-title" className={sections.sectionTitle}>
                Nuestros <span>servicios</span>
              </h2>
              <p className={sections.sectionIntro}>
                Precisión, detalle y el tiempo que necesita cada estilo.
              </p>
            </div>
          </header>

          <div className={sections.serviceGrid}>
            {services.map((service, index) => (
              <article className={sections.serviceCard} key={service.id}>
                <span className={sections.cardNumber}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{service.name}</h3>
                  <p>{service.duration}</p>
                </div>
                <strong>{service.price}</strong>
                <a
                  className={sections.serviceButton}
                  href="#reservar"
                  data-service-id={service.id}
                  aria-label={`Reservar cita para ${service.name}`}
                >
                  <span>Reservar cita</span>
                  <span aria-hidden="true">→</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        id="resultados"
        className={sections.results}
        aria-labelledby="results-title"
      >
        <div className={sections.sectionInner}>
          <header className={`${sections.sectionHeader} ${sections.darkText}`}>
            <p className={sections.eyebrow}>02 — Nuestro trabajo</p>
            <div className={sections.headingRow}>
              <h2 id="results-title" className={sections.sectionTitle}>
                Resultados <span>con carácter</span>
              </h2>
              <p className={sections.sectionIntro}>
                Una galería preparada para mostrar hasta veinte trabajos.
              </p>
            </div>
          </header>

          <ResultsCarousel />
        </div>
      </section>

      <section
        id="reservar"
        className={sections.booking}
        aria-labelledby="booking-title"
      >
        <div className={sections.bookingInner}>
          <div className={sections.bookingCopy}>
            <p className={sections.eyebrow}>03 — Próxima fase</p>
            <h2 id="booking-title" className={sections.bookingTitle}>
              Reserva tu <span>próxima visita</span>
            </h2>
            <p>
              Aquí integraremos el sistema de reservas online de Haircut Style.
            </p>
          </div>

          <div
            id="sistema-reservas"
            className={sections.bookingMount}
            data-reservation-root
            aria-label="Zona preparada para el futuro sistema de reservas"
          >
            <div className={sections.bookingMark} aria-hidden="true">
              <span />
              <span />
            </div>
            <p>Espacio preparado para reservas</p>
            <span>Sin calendario ni datos personales en esta fase</span>
          </div>
        </div>
      </section>

      <section
        id="ubicacion"
        className={sections.location}
        aria-labelledby="location-title"
      >
        <div className={sections.sectionInner}>
          <header className={`${sections.sectionHeader} ${sections.darkText}`}>
            <p className={sections.eyebrow}>04 — Visítanos</p>
            <div className={sections.headingRow}>
              <h2 id="location-title" className={sections.sectionTitle}>
                Ubicación <span>y horarios</span>
              </h2>
              <BusinessStatus />
            </div>
          </header>

          <div className={sections.locationGrid}>
            <div className={sections.schedulePanel}>
              <div className={sections.demoBadge}>Datos de demostración</div>
              <address>{demoContact.address}</address>

              <dl className={sections.scheduleList}>
                <div>
                  <dt>Lunes a viernes</dt>
                  <dd>08:00–14:00 / 16:00–20:00</dd>
                </div>
                <div>
                  <dt>Sábado</dt>
                  <dd>09:00–14:00</dd>
                </div>
                <div>
                  <dt>Domingo</dt>
                  <dd>Cerrado</dd>
                </div>
              </dl>

              <a
                className={sections.outlineButton}
                href="#mapa-demo"
                data-map-address={demoContact.address}
              >
                <span>Cómo llegar</span>
                <span aria-hidden="true">→</span>
              </a>
            </div>

            <div
              id="mapa-demo"
              className={sections.mapPlaceholder}
              aria-label="Zona preparada para el futuro mapa"
            >
              <div className={sections.mapGrid} aria-hidden="true" />
              <div className={sections.mapPin} aria-hidden="true">
                <span>H</span>
              </div>
              <div className={sections.mapCaption}>
                <span>Mapa</span>
                <small>Próxima integración · Ubicación de demostración</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="contacto"
        className={sections.contact}
        aria-labelledby="contact-title"
      >
        <div className={sections.contactInner}>
          <div>
            <p className={sections.eyebrow}>05 — Contacto</p>
            <h2 id="contact-title" className={sections.contactTitle}>
              ¿Tienes alguna duda? <span>Contacta con nosotros</span>
            </h2>
          </div>

          <div className={sections.contactDetails}>
            <div className={sections.demoBadge}>Datos de demostración</div>
            <p>{demoContact.phoneLabel}</p>
            <p>{demoContact.email}</p>
            <address>{demoContact.address}</address>

            <div className={sections.contactActions}>
              <a href={demoContact.phoneHref} data-contact-type="phone">
                Teléfono <span aria-hidden="true">→</span>
              </a>
              <a href={`mailto:${demoContact.email}`} data-contact-type="email">
                Email <span aria-hidden="true">→</span>
              </a>
              <a
                href={demoContact.whatsappHref}
                data-contact-type="whatsapp"
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp <span aria-hidden="true">→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className={sections.footer}>
        <div className={sections.footerInner}>
          <a className={sections.footerBrand} href="#inicio">
            <span>Haircut</span>
            <span>Style</span>
          </a>

          <nav className={sections.footerNav} aria-label="Enlaces rápidos">
            {quickLinks.map((link) => (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </nav>

          <p className={sections.copyright}>© 2026 Haircut Style</p>
        </div>
      </footer>
    </main>
  );
}
