"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const ACTIVITY_EVENTS = ["click", "keydown", "pointerdown", "touchstart"];
const AUTH_ERROR_PATHS = new Set([
  "/api/auth/user-login",
  "/api/verify-otp",
  "/api/send-otp",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
]);

function isSameOriginApi(input) {
  const rawUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const url = new URL(rawUrl, window.location.origin);
  return (
    url.origin === window.location.origin &&
    url.pathname.startsWith("/api/") &&
    !AUTH_ERROR_PATHS.has(url.pathname)
  );
}

export default function SessionLifecycle() {
  const router = useRouter();
  const lastTouchAt = useRef(0);
  const inFlight = useRef(false);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        response.status === 401 &&
        window.location.pathname !== "/login" &&
        isSameOriginApi(input)
      ) {
        router.replace("/login");
        router.refresh();
      }
      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  useEffect(() => {
    function touch() {
      const now = Date.now();
      if (document.visibilityState !== "visible") return;
      if (inFlight.current || now - lastTouchAt.current < TOUCH_INTERVAL_MS) return;

      inFlight.current = true;
      lastTouchAt.current = now;
      fetch("/api/auth/touch", { method: "POST", credentials: "same-origin" })
        .catch(() => undefined)
        .finally(() => {
          inFlight.current = false;
        });
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, touch, { passive: true });
    }
    window.addEventListener("focus", touch);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, touch);
      }
      window.removeEventListener("focus", touch);
    };
  }, []);

  return null;
}
