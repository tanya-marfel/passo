"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Sparkles, Watch } from "lucide-react";
import { buildProfile, type RunnerProfile } from "@/lib/profile";
import { sampleActivities } from "@/lib/sample";
import { course } from "@/lib/course";
import type { Activity } from "@/lib/garmin";
import { clearSearchFlags } from "@/lib/search-flag";
import type { PartnerStatus } from "@/hooks/use-partner-status";
import { AppHeader } from "@/components/app-header";
import { MarmoSprite, RunnerSprite, ShadowSprite } from "@/components/sprites";
import { ElevationProfile } from "@/components/race/elevation-profile";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const STEPS = [
  { title: "Sign in with Garmin", body: "You leave this page, sign in on Garmin Connect, and come back. Rival Run never sees your password." },
  { title: "Meet your Shadow", body: "A rival built from your habits: same legs, same mistakes. It runs Lavaredo the way the old you would." },
  { title: "Race with Marmo", body: "A live AI coach on a 3D course. It watches every km, calls the climbs and replans when things go wrong." },
];

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
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );
  const returnedError =
    garminFlag && garminFlag !== "connected"
      ? garminReason || (garminFlag === "denied" ? "You cancelled sign-in on Garmin." : "Garmin sign-in didn't finish.")
      : null;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/garmin/session")
      .then((r) => r.json())
      .then((body: { configured?: boolean }) => {
        if (!cancelled) setConfigured(Boolean(body.configured));
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
            setBusy(`Marmo is studying ${activities.length} run${activities.length > 1 ? "s" : ""}…`);
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

  const loadSample = async () => {
    setError(null);
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
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-12">
        <section>
          <div className="font-pixel text-[9px] leading-relaxed text-primary">{course.name.toUpperCase()} · JUNE 2027</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Race the runner you used to be.</h1>
          <p className="mt-4 max-w-xl text-base text-pretty text-muted-foreground sm:text-lg">
            Rival Run reads your Garmin history, finds the mistakes you keep making and turns them into your <span className="text-shadow">Shadow</span>: a rival that runs
            Lavaredo exactly like the old you. <span className="text-primary">Marmo</span>, your AI trail coach, calls the race live, kilometre by kilometre.
          </p>

          <Card className="mt-7 border-2 border-dashed border-white/15">
            <CardContent className="flex flex-col items-center gap-3 py-7 text-center">
              {busy ? (
                <>
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <p className="font-medium">{busy}</p>
                </>
              ) : (
                <>
                  <div className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
                    <Watch className="size-6" />
                  </div>
                  <div>
                    <p className="font-medium">Connect your Garmin account</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {configured
                        ? "This opens Garmin Connect. Sign in with your Garmin account and allow RaceIQ to read your activities."
                        : "This opens Garmin Connect once the app's client id and secret are in .env.local. You sign in there and allow RaceIQ to read your activities."}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button size="lg" asChild>
                      <a href="/api/garmin/connect">
                        <Watch /> Sign in with Garmin
                      </a>
                    </Button>
                    <Button size="lg" variant="secondary" onClick={() => void loadSample()}>
                      <Sparkles /> Try the sample runner
                    </Button>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="size-3" /> You sign in on Garmin. Rival Run never sees your password.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {(error || returnedError) && (
            <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-red-200">{error || returnedError}</p>
          )}

          <details className="mt-4 text-sm text-muted-foreground">
            <summary className="cursor-pointer text-foreground/80">Garmin shows the allow screen for a registered app</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>In the Garmin Connect developer program, create an app and paste its client id and secret into .env.local.</li>
              <li>Redirect URI: {origin ? `${origin}/api/garmin/callback` : "/api/garmin/callback"}</li>
              <li>Activity webhook: {origin ? `${origin}/api/garmin/webhook` : "/api/garmin/webhook"}</li>
              <li>Enable Activity Export and Historical Data. Restart the dev server, then use Sign in with Garmin.</li>
            </ol>
          </details>
        </section>

        <section className="relative">
          <div className="rpg-box overflow-hidden p-5">
            <div className="font-pixel text-center text-[9px] text-muted-foreground">A WILD SHADOW APPEARED!</div>
            <div className="mt-5 flex items-end justify-around">
              <div className="flex flex-col items-center gap-2">
                <RunnerSprite height={92} className="animate-bob" />
                <span className="font-pixel text-[9px] text-you">YOU</span>
              </div>
              <span className="font-pixel mb-10 text-2xl text-primary">VS</span>
              <div className="flex flex-col items-center gap-2">
                <ShadowSprite height={92} />
                <span className="font-pixel text-[9px] text-shadow">SHADOW</span>
              </div>
            </div>
            <ElevationProfile height={110} className="mt-4 opacity-90" />
            <div className="mt-2 flex items-start gap-3">
              <MarmoSprite height={64} />
              <div className="rpg-box flex-1 px-3 py-2 text-sm">
                119.5 km, 5,000 m of climbing and 8 gyms between Cortina and the Tre Cime. Connect Garmin and I&apos;ll show you exactly where your Shadow will beat you.
              </div>
            </div>
          </div>
        </section>
      </main>

      <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 pb-10 sm:grid-cols-3 sm:px-6">
        {STEPS.map((s, i) => (
          <div key={s.title} className="rounded-xl border border-white/8 bg-card/60 p-4">
            <div className="font-pixel text-[9px] text-primary">STEP {i + 1}</div>
            <div className="mt-2 font-medium">{s.title}</div>
            <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-white/8 px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
        Coach brain by Google DeepMind Gemini · Voice by Gradium · Built with Entire checkpoints · Course: official Lavaredo 120K GPX · Original creatures and art
      </footer>
    </div>
  );
}

export function finishGarminReturn() {
  clearSearchFlags(["garmin", "reason"]);
}
