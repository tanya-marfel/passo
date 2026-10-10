"use client";

import { useMemo, useState } from "react";
import { buildPlan } from "@/lib/plan";
import { clearProfile, saveGoal, saveProfile, useStoredGoal, useStoredProfile } from "@/lib/profile-store";
import { useSearchFlag } from "@/lib/search-flag";
import { usePartnerStatus } from "@/hooks/use-partner-status";
import { finishGarminReturn, ImportScreen } from "@/components/setup/import-screen";
import { ProfileScreen } from "@/components/setup/profile-screen";
import { LiveRace } from "@/components/race/live-race";

export function RivalRunApp() {
  const profile = useStoredProfile();
  const goal = useStoredGoal();
  const status = usePartnerStatus();
  const garminFlag = useSearchFlag("garmin");
  const garminReason = useSearchFlag("reason");
  const [racing, setRacing] = useState(false);
  const plan = useMemo(() => (profile ? buildPlan(profile, goal) : null), [profile, goal]);

  if (garminFlag || !profile || !plan) {
    return (
      <ImportScreen
        status={status}
        garminFlag={garminFlag}
        garminReason={garminReason}
        onProfile={saveProfile}
        onGarminDone={finishGarminReturn}
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
      onRename={(name) => saveProfile({ ...profile, name })}
      onStart={() => setRacing(true)}
      onNewData={() => {
        void fetch("/api/garmin/session", { method: "DELETE" }).catch(() => undefined);
        clearProfile();
        setRacing(false);
      }}
    />
  );
}
