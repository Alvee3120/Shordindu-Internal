"use client";

import { useEffect } from "react";
import { initBrowserAlerts } from "@/lib/browser-alerts";

/** Mounts the favicon/title/browser-notification behaviour once per session. */
export function BrowserAlerts() {
  useEffect(() => {
    initBrowserAlerts();
  }, []);

  return null;
}
