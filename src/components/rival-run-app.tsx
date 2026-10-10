"use client";

import { useMemo, useState } from "react";
import { buildPlan } from "@/lib/plan";
import { clearProfile, clearRace, saveGoal, saveProfile, saveRace, useStoredGoal, useStoredProfile, useStoredRace } from "@/lib/profile-store";
import { bindRace } from "@/lib/races";
import { useSearchFlag } from "@/lib/search-flag";
import { usePartnerStatus } from "@/hooks/use-partner-status";
import { finishGarminReturn, ImportScreen } from "@/components/setup/import-screen";
import { ProfileScreen } from "@/components/setup/profile-screen";
import { LiveRace } from "@/components/race/live-race";

export function PassoApp() {
  const profile = useStoredProfile();
  const race = useStoredRace();
  const goal = useStoredGoal();
  const status = usePartnerStatus();
  const garminFlag = useSearchFlag("garmin");
  const garminReason = useSearchFlag("reason");
  const [racing, setRacing] = useState(false);
  // The prompt stays until both pieces exist. A stored route alone must not skip typing,
  // and a stored history alone must not sit on "runs loaded" once the route is saved too.
  const active = profile && race ? bindRace(race) : null;
  const plan = useMemo(() => (profile && active ? buildPlan(profile, goal) : null), [profile, goal, active]);

  if (garminFlag || !profile || !race || !plan) {
    return (
      <ImportScreen
        status={status}
        garminFlag={garminFlag}
        garminReason={garminReason}
        runs={profile?.activityCount ?? null}
        raceLabel={race?.label ?? null}
        onProfile={saveProfile}
        onClearRuns={clearProfile}
        onGarminDone={finishGarminReturn}
        onRace={(choice, label) => {
          saveRace({ ...choice, label });
        }}
      />
    );
  }

  if (racing) return <LiveRace profile={profile} plan={plan} goal={goal} status={status} onExit={() => setRacing(false)} />;

  return (
    <ProfileScreen
      profile={profile}
      plan={plan}
      goal={goal}
      status={status}
      onGoal={saveGoal}
      onStart={() => setRacing(true)}
      onChangeRace={() => {
        clearRace();
        setRacing(false);
      }}
      onNewData={() => {
        void fetch("/api/garmin/session", { method: "DELETE" }).catch(() => undefined);
        clearProfile();
        clearRace();
        setRacing(false);
      }}
    />
  );
}

export const RivalRunApp = PassoApp;
