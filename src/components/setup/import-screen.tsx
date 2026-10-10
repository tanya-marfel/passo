"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { cn } from "cn";
import { buildProfile, type RunnerProfile } from "@/lib/profile";
import { sampleActivities } from "@/lib/sample";
import { course } from "@/lib/course";
import { importFiles, type Activity } from "@/lib/garmin";
import { clearSearchFlags } from "@/lib/search-flag";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { Button } from "@/components/ui/button";

const nextTick = () => new Promise((r) => setTimeout(r, 30));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SyncBody = {
  status?: "ready" | "waiting";
  activities?: Activity[];
  skipped?: { file: string; reason: string }[];
  message?: string | null;
  error?: string;
};

export function ImportScreen({
  status,
  garminFlag,
  garminReason,
  onProfile,
  onGarminDone,
}: {
  status: PartnerStatus | null;
  garminFlag: string | null;
  garminReason: string | null;
  onProfile: (p: RunnerProfile) => void;
  onGarminDone: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{ file: string; reason: string }[]>([]);
  const [dragging, setDragging] = useState(false);
  const returnedError =
    garminFlag && garminFlag !== "connected"
      ? garminReason || (garminFlag === "denied" ? "You cancelled sign-in on Garmin." : "Garmin sign-in didn't finish.")
      : null;

  useEffect(() => {
    if (garminFlag !== "connected") return;
    let cancelled = false;
    const collect = async () => {
      setError(null);
      setBusy("Signed in on Garmin. Collecting your runs…");
      const deadline = Date.now() + 45000;
      try {
        for (;;) {
          const res = await fetch("/api/garmin/activities", { cache: "no-store" });
          const body = (await res.json().catch(() => null)) as SyncBody | null;
          if (!res.ok) throw new Error(body?.error || "Couldn't read the Garmin session.");
          const activities = body?.activities ?? [];
          if (activities.length) {
            setBusy(`Reading ${activities.length} run${activities.length > 1 ? "s" : ""}…`);
            await nextTick();
            const profile = buildProfile(activities, { source: "garmin-connect" });
            const skipped = body?.skipped?.length ?? 0;
            if (skipped) toast.info(`Analysed ${profile.activityCount} runs, skipped ${skipped}.`);
            onProfile(profile);
            onGarminDone();
            return;
          }
          if (cancelled) return;
          if (Date.now() > deadline) {
            setError(body?.message || "Garmin hasn't sent your runs yet. The webhook URL has to be reachable from the internet.");
            onGarminDone();
            return;
          }
          setBusy(body?.message || "Waiting for Garmin to send your runs…");
          await sleep(3000);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Those runs couldn't be read.");
        onGarminDone();
      } finally {
        if (!cancelled) setBusy(null);
      }
    };
    void collect();
    return () => {
      cancelled = true;
    };
  }, [garminFlag, garminReason, onGarminDone, onProfile]);

  const handleFiles = async (list: FileList | File[]) => {
    const files = Array.from(list);
    if (!files.length) return;
    setError(null);
    setSkipped([]);
    setBusy(`Reading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    await nextTick();
    try {
      const res = await importFiles(files, setBusy);
      setSkipped(res.skipped);
      if (!res.activities.length) {
        setError("No runs with GPS and timestamps were found in those files. Try a Garmin Connect ZIP, or FIT, GPX or TCX exports.");
        return;
      }
      setBusy(`Reading ${res.activities.length} run${res.activities.length > 1 ? "s" : ""}…`);
      await nextTick();
      const profile = buildProfile(res.activities, { source: "garmin" });
      if (res.skipped.length) toast.info(`Analysed ${profile.activityCount} runs, skipped ${res.skipped.length} file${res.skipped.length > 1 ? "s" : ""}.`);
      onProfile(profile);
      onGarminDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Those files couldn't be read.");
    } finally {
      setBusy(null);
    }
  };

  const loadSample = async () => {
    setError(null);
    setSkipped([]);
    setBusy("Loading the sample runner…");
    await nextTick();
    try {
      onProfile(buildProfile(sampleActivities(), { source: "sample", name: "Sample runner" }));
      onGarminDone();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader status={status} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-12 sm:px-6">
        <p className="text-sm text-muted-foreground">{course.name}</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight text-balance">Race the runner you used to be.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          A Garmin history becomes a shadow that runs this course the way you usually do. Marmo calls the climbs as you go.
        </p>

        <div
          className={cn("mt-8 rounded-lg border px-5 py-8 text-center transition-colors", dragging ? "border-foreground/30 bg-white/[0.03]" : "border-white/10")}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
        >
          {busy ? (
            <p className="flex items-center justify-center gap-2 text-sm">
              <Loader2 className="size-4 animate-spin" />
              {busy}
            </p>
          ) : (
            <>
              <p className="text-sm">Drop a Garmin export</p>
              <p className="mt-1 text-sm text-muted-foreground">ZIP, FIT, GPX, or TCX. Read in the browser.</p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                <Button onClick={() => inputRef.current?.click()}>Choose files</Button>
                <button type="button" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => void loadSample()}>
                  Sample runner
                </button>
                <a href="/api/garmin/connect" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Sign in with Garmin
                </a>
              </div>
            </>
          )}
          <input
            ref={inputRef}
            id="garmin-files"
            type="file"
            name="garmin-files"
            multiple
            accept=".fit,.gpx,.tcx,.zip,application/zip,application/gpx+xml"
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {(error || returnedError) && <p className="mt-3 text-sm text-red-300">{error || returnedError}</p>}
        {skipped.length > 0 && (
          <details className="mt-2 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {skipped.length} file{skipped.length > 1 ? "s" : ""} skipped
            </summary>
            <ul className="mt-1 space-y-0.5">
              {skipped.slice(0, 12).map((s) => (
                <li key={s.file}>
                  {s.file}: {s.reason}
                </li>
              ))}
            </ul>
          </details>
        )}

        <details className="mt-4 text-sm text-muted-foreground">
          <summary className="cursor-pointer">Export from Garmin Connect</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>Open a run, use the gear menu, and export the original ZIP or a GPX/TCX file.</li>
            <li>For a full history: account settings, data management, export your data. Drop the ZIP as is.</li>
          </ol>
        </details>

        <div className="mt-10">
          <ElevationProfile height={120} />
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            {course.totalKm} km · {course.trackGainM.toLocaleString("en-GB")} m · {course.location}
          </p>
        </div>
      </main>
    </div>
  );
}

export function finishGarminReturn() {
  clearSearchFlags(["garmin", "reason"]);
}
