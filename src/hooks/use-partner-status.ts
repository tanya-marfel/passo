"use client";

import { useEffect, useState } from "react";

export type PartnerStatus = {
  gemini: boolean;
  geminiModel: string;
  gemma: boolean;
  gemmaReady: boolean;
  coach: "gemini" | "gemma" | "offline";
  gradium: boolean;
  voice: string;
};

const OFFLINE_STATUS: PartnerStatus = {
  gemini: false,
  geminiModel: "auto",
  gemma: true,
  gemmaReady: false,
  coach: "gemma",
  gradium: false,
  voice: "",
};

export function usePartnerStatus() {
  const [status, setStatus] = useState<PartnerStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: PartnerStatus | null) => alive && setStatus(s ?? OFFLINE_STATUS))
      .catch(() => alive && setStatus(OFFLINE_STATUS));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
