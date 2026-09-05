"use client";

import { useCallback, useEffect, useState } from "react";

import styles from "./results-carousel.module.css";

const TOTAL_SLOTS = 20;
const AUTO_ADVANCE_MS = 6000;
const resultSlots = Array.from({ length: TOTAL_SLOTS }, (_, index) => index);

export default function ResultsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const showPrevious = useCallback(() => {
    setActiveIndex((current) => (current - 1 + TOTAL_SLOTS) % TOTAL_SLOTS);
  }, []);

  const showNext = useCallback(() => {
    setActiveIndex((current) => (current + 1) % TOTAL_SLOTS);
  }, []);

  useEffect(() => {
    if (isPaused) return;

    const timer = window.setInterval(showNext, AUTO_ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [isPaused, showNext]);

  return (
    <div className={styles.carousel} aria-roledescription="carrusel">
      <div className={styles.viewport} aria-live="polite">
        {resultSlots.map((slot) => (
          <div
            className={`${styles.slide} ${
              slot === activeIndex ? styles.active : ""
            }`}
            key={slot}
            role="group"
            aria-roledescription="diapositiva"
            aria-label={`Espacio ${slot + 1} de ${TOTAL_SLOTS}`}
            aria-hidden={slot !== activeIndex}
          >
            {/* Sustituir este placeholder por next/image cuando lleguen las fotos. */}
            <div
              className={`${styles.placeholder} ${
                styles[`variant${(slot % 4) + 1}`]
              }`}
            >
              <span className={styles.slotNumber}>
                {String(slot + 1).padStart(2, "0")}
              </span>
              <div className={styles.placeholderMark} aria-hidden="true">
                <span />
                <span />
              </div>
              <p>Espacio para resultado</p>
              <small>Fotografía pendiente</small>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.controls}>
        <div className={styles.arrows}>
          <button type="button" onClick={showPrevious} aria-label="Resultado anterior">
            ←
          </button>
          <button type="button" onClick={showNext} aria-label="Resultado siguiente">
            →
          </button>
        </div>

        <div className={styles.progress} aria-hidden="true">
          <span style={{ width: `${((activeIndex + 1) / TOTAL_SLOTS) * 100}%` }} />
        </div>

        <div className={styles.counter}>
          <span>{String(activeIndex + 1).padStart(2, "0")}</span>
          <span>/</span>
          <span>{TOTAL_SLOTS}</span>
        </div>

        <button
          className={styles.pauseButton}
          type="button"
          aria-pressed={isPaused}
          onClick={() => setIsPaused((current) => !current)}
        >
          {isPaused ? "Reanudar" : "Pausar"}
        </button>
      </div>
    </div>
  );
}
