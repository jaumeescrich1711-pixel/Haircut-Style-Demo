import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
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
    </main>
  );
}
