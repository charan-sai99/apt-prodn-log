"use client";
import { useEffect, useRef } from "react";

/**
 * Signs the person out after `minutes` without touches or key presses, so a
 * shared factory phone goes back to the photo screen for the next person.
 */
export function IdleSignOut({ minutes, action }: { minutes: number; action: () => Promise<void> }) {
  const last = useRef(0);
  useEffect(() => {
    last.current = Date.now();
    const bump = () => (last.current = Date.now());
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last.current > minutes * 60_000) {
        clearInterval(timer);
        void action();
      }
    }, 15_000);
    return () => {
      clearInterval(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [minutes, action]);
  return null;
}
