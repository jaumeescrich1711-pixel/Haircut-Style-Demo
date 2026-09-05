"use client";

import { useSyncExternalStore } from "react";

import styles from "./business-status.module.css";

type BusinessState = "open" | "closed";

function getMadridBusinessState(): BusinessState {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(now);
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(timeParts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(
    timeParts.find((part) => part.type === "minute")?.value ?? 0,
  );
  const minutesNow = hour * 60 + minute;

  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday)) {
    const morning = minutesNow >= 8 * 60 && minutesNow < 14 * 60;
    const afternoon = minutesNow >= 16 * 60 && minutesNow < 20 * 60;
    return morning || afternoon ? "open" : "closed";
  }

  if (weekday === "Sat") {
    return minutesNow >= 9 * 60 && minutesNow < 14 * 60 ? "open" : "closed";
  }

  return "closed";
}

function subscribe(callback: () => void) {
  const timer = window.setInterval(callback, 60_000);
  return () => window.clearInterval(timer);
}

function getServerSnapshot(): BusinessState {
  return "closed";
}

export default function BusinessStatus() {
  const status = useSyncExternalStore(
    subscribe,
    getMadridBusinessState,
    getServerSnapshot,
  );
  const isOpen = status === "open";

  return (
    <div className={styles.status} data-status={status}>
      <span className={styles.dot} aria-hidden="true" />
      <span>{isOpen ? "Abierto ahora" : "Cerrado ahora"}</span>
      <small>Horario de Madrid</small>
    </div>
  );
}
