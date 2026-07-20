"use client";

import { useEffect } from "react";

const SERVICE_WORKER_URL = "/sw.js";

export function PwaRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/" });
        if (!cancelled) await registration.update();
      } catch (error) {
        console.warn("Glimpse Chat service worker registration failed.", error);
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
