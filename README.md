# Rival Run

**Race the runner you used to be.** You type what you are running. Rival Run looks up the published route, then a Garmin history becomes a short report and a simulation where Marmo speaks the calls that would have changed the result.

Built for an agentic AI hackathon with Google DeepMind Gemini (agent brain), Gradium (voice) and Entire (agent session checkpoints).

## What it does

1. **Sign in with Garmin.** The button sends you to Garmin Connect. You sign in to your account there, allow RaceIQ to read your activities, and come back. Rival Run never sees your password. From the runs Garmin delivers, it fits a personal pace model (flat pace, climbing speed, descent skill, fatigue curve) and detects recurring mistakes: fast starts, attacking long climbs then stalling, late fades, under-fuelling, lingering at aid stations, braking on descents and heart-rate drift. It also notes if you have never run this long or in the dark.
2. **Meet your Shadow.** Each mistake becomes one of the Shadow's moves ("Fast Start", "Reckless Climb", "Empty Tank", ...), with the evidence from your runs and Marmo's counter.
3. **Plan the route that was looked up.** Distance, climb, aid stations and cut-offs come from the published page. You get an even-effort plan for a Safe, "Your data" or Stretch goal, the cut-off margins, and the Shadow's projected race.
4. **Race it live.** The clock starts at the published start time. The simulated runner carries your habits unless Marmo talks you out of them. Climbs are gyms with badges, energy is an HP bar, aid stations restore energy, and cramps, storms and the night low are status effects.
5. **Marmo, the agent.** Race events (climb ahead, summit, aid station, low energy, Shadow passing, pace drift, cut-off risk, 02:30 low, sunrise, cramp, storm, or your own question) trigger the agent. It calls tools to read your live status, the course ahead and your personal patterns, can `replan` with exact projections, and then decides to `speak` or `stay_silent`. Its actions (eat, salt, caffeine, jacket, quick aid stop, pace the climb, easy start, effort change for N minutes) are applied to the runner when **Follow Marmo** is on. Switch it off and watch the runner turn into the Shadow.
6. **Voice.** Marmo speaks with Gradium text-to-speech. Tap the mic to ask a question with Gradium speech-to-text.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:4590. Click **Try the sample runner** for a demo profile, or **Sign in with Garmin** to approve access on Garmin Connect.

### API keys (optional)

Copy the template and fill in the keys you have (or add them as secrets in your hosting or Cursor Cloud Agents dashboard). `.env.local` is gitignored, and `npm run dev` picks up changes to it without a restart.

```bash
cp .env.example .env.local
```

```bash
GEMINI_API_KEY=...            # or GOOGLE_API_KEY; enables the Gemini agent
GEMINI_MODEL=gemini-2.5-flash # optional; by default the newest Gemini Flash model is picked
GRADIUM_API_KEY=...           # enables Gradium TTS and STT
GRADIUM_VOICE_ID=...          # optional; defaults to the flagship voice "Russell" (_6Aslh2DxfmnRLmP)
GARMIN_CLIENT_ID=...          # Garmin Connect developer app; enables Connect sign-in
GARMIN_CLIENT_SECRET=...
GARMIN_REDIRECT_URI=...       # optional; defaults to this site's /api/garmin/callback
```

Without Gemini or Gradium keys everything still works: Marmo runs on an offline rule engine that uses the same tools, and voice falls back to the browser's speech synthesis and recognition (Chrome works best). The header pills show which mode is active.

## Connecting Garmin

**Sign in with Garmin** sends the runner to Garmin Connect. They sign in there and allow RaceIQ to read their activities. The screen never asks for a client id or secret. Those belong to the RaceIQ server, the same way Nike Run Club keeps its own Garmin registration on Nike's servers.

To turn that button on, register RaceIQ once in the [Garmin Connect Developer Program](https://developerportal.garmin.com/) with Activity Export and Historical Data, set the redirect URI to `http://localhost:4590/api/garmin/callback`, set the activity webhook to a public `https://YOUR_HOST/api/garmin/webhook`, and put the client id and secret in `.env.local`. Restart the dev server. Until then, use the sample runner.

## Demo script (about 3 minutes)

1. Type what you are running, for example "Lavaredo 80K", press **Look up**, and click **Sample runner** (or drop a Garmin export).
2. Read the report. Pick a goal and click **Simulate**.
3. Click **Start**: Marmo briefs you out loud, and the shadow runs the mistakes from the history.
4. At the first gym Marmo tells you how to pace the climb; at the summit you earn a badge.
5. Click **Inject > Cramp**. The Agent tab shows the tool calls (`get_race_status`, `replan`, `speak`) and the actions applied: salt and fluids, effort down 8% for 30 minutes.
6. Tap the mic and ask "Will I make the Cimabanche cut-off?"
7. **Jump to > Gym 4: Tre Cime** to watch the sunrise over the Tre Cime in 3D.
8. Turn **Follow Marmo** off and see the old habits come back, then jump to the finish for the finisher card.

Keyboard: **Space** pauses and resumes. Click or drag on the elevation profile to jump.

## How it works

| Path | What it does |
| --- | --- |
| `src/lib/garmin.ts` | FIT (Garmin FIT SDK), GPX and TCX parsing for runs Garmin delivers |
| `src/lib/garmin-connect/` | Garmin Connect OAuth redirect, token exchange and activity ingest |
| `src/app/api/garmin/` | Sign-in redirect, callback, session and the activity webhook |
| `src/lib/profile.ts` | Pace model, trainer stats and mistake detection |
| `src/lib/plan.ts` | Plan and Shadow timelines, goals, splits and cut-off margins |
| `src/lib/sim.ts` | Race simulation: habits, energy, status effects, badges and coach events |
| `src/lib/engine.ts` | Live loop, coach trigger queue (one agent call in flight) and battle text |
| `src/lib/coach/tools.ts` | Agent tools and their Gemini function declarations |
| `src/lib/coach/gemini.ts` | Gemini function-calling loop (falls back to offline on errors) |
| `src/lib/coach/offline.ts` | Rule-based coach using the same tools |
| `src/app/api/coach` | Coach endpoint |
| `src/app/api/tts`, `src/app/api/stt` | Gradium voice proxies |
| `src/components/race/*` | MapLibre 3D map, HUD, elevation profile, controls and coach panel |
| `scripts/build-course.mjs` | Rebuilds `src/data/lavaredo.json` from the official GPX (`npm run build:course`) |
| `scripts/simulate.ts` | A full headless race with the offline coach (`npm run simulate`) |

The map uses OpenFreeMap vector tiles and AWS Terrain Tiles for elevation, and falls back to a flat SVG map without WebGL.

### Partner technology

- **Google DeepMind Gemini:** Marmo's brain. Multi-round function calling over the course, your patterns and the live race state, ending with an explicit `speak` or `stay_silent` decision.
- **Gradium:** Marmo's voice (TTS) and push-to-talk questions (STT).
- **Entire:** the repository is Entire-enabled (`.entire/settings.json` and the Cursor hooks in `.cursor/hooks.json`). With the [Entire CLI](https://docs.entire.io/cli/installation) installed, the AI agent sessions that build Rival Run are saved as checkpoints next to the commits. Without the CLI the hooks do nothing.

## Scripts

```bash
npm run dev          # dev server on port 4590
npm run lint         # ESLint
npm run typecheck    # TypeScript
npm run simulate     # headless race with the offline coach
npm run calibrate    # sample profile and plan sensitivity
npm run build:course # rebuild the course data from the official GPX
```

## Notes

- The route is fetched from the published race page when you type a name. A saved answer does not skip that prompt.
- The race is simulated from your history. It is not medical advice.
- Marmo and the Shadow are original characters. The game styling is inspired by retro creature-battle RPGs and uses no third-party characters, names, art or sounds. Pixel headings use Press Start 2P (SIL Open Font License).
