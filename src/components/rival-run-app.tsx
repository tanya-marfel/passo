"use client";

import { useMemo, useState } from "react";
import { buildPlan } from "@/lib/plan";
import { clearProfile, saveGoal, saveProfile, useStoredGoal, useStoredProfile } from "@/lib/profile-store";
import { usePartnerStatus } from "@/hooks/use-partner-status";
import { ImportScreen } from "@/components/setup/import-screen";
import { ProfileScreen } from "@/components/setup/profile-screen";
import { LiveRace } from "@/components/race/live-race";

export function RivalRunApp() {
  const profile = useStoredProfile();
  const goal = useStoredGoal();
  const status = usePartnerStatus();
  const [racing, setRacing] = useState(false);
  const plan = useMemo(() => (profile ? buildPlan(profile, goal) : null), [profile, goal]);

  if (!profile || !plan) return <ImportScreen status={status} onProfile={saveProfile} />;

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
        clearProfile();
        setRacing(false);
      }}
    />
  );
}
