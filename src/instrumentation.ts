export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { warmupCoach } = await import("@/lib/coach/run");
  warmupCoach();
}
