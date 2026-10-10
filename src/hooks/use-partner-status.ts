"use client";

import { useEffect, useState } from "react";

export type PartnerStatus = {
  gemini: boolean;
  geminiModel: string;
  gradium: boolean;
  voice: string;
};

export function usePartnerStatus() {
  const [status, setStatus] = useState<PartnerStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: PartnerStatus | null) => alive && setStatus(s ?? { gemini: false, geminiModel: "auto", gradium: false, voice: "" }))
      .catch(() => alive && setStatus({ gemini: false, geminiModel: "auto", gradium: false, voice: "" }));
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
