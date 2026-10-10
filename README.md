# Rival Run

**Race the runner you used to be.** Rival Run reads your Garmin history, finds the mistakes you keep making, and turns them into your **Shadow**: a rival that runs Lavaredo Ultra Trail 120K (June 2027) exactly like the old you. **Marmo**, a live AI trail coach, rides along on a 3D map of the Dolomites and calls the race kilometre by kilometre.

Built for an agentic AI hackathon with Google DeepMind Gemini (agent brain), Gradium (voice) and Entire (agent session checkpoints).

## What it does

1. **Import your runs.** Drop Garmin FIT, GPX, TCX or a Garmin Connect ZIP export. Files are parsed in the browser. Rival Run fits a personal pace model (flat pace, climbing speed, descent skill, fatigue curve) and detects recurring mistakes: fast starts, attacking long climbs then stalling, late fades, under-fuelling, lingering at aid stations, braking on descents and heart-rate drift. It also notes if you have never run this long or in the dark.
2. **Meet your Shadow.** Each mistake becomes one of the Shadow's moves ("Fast Start", "Reckless Climb", "Empty Tank", ...), with the evidence from your runs and Marmo's counter.
3. **Plan Lavaredo.** The official 120K GPX with race-book aid stations and cut-offs gives you an even-effort plan for a Safe, "Your data" or Stretch goal, the cut-off margins, and the Shadow's projected race.
4. **Race it live.** The race clock starts on Friday at 23:00 in Cortina. The simulated runner carries your habits unless Marmo talks you out of them. Climbs are gyms with badges, energy is an HP bar, aid stations restore energy, and cramps, storms and the night low are status effects.
5. **Marmo, the agent.** Race events (climb ahead, summit, aid station, low energy, Shadow passing, pace drift, cut-off risk, 02:30 low, sunrise, cramp, storm, or your own question) trigger the agent. It calls tools to read your live status, the course ahead and your personal patterns, can `replan` with exact projections, and then decides to `speak` or `stay_silent`. Its actions (eat, salt, caffeine, jacket, quick aid stop, pace the climb, easy start, effort change for N minutes) are applied to the runner when **Follow Marmo** is on. Switch it off and watch the runner turn into the Shadow.
6. **Voice.** Marmo speaks with Gradium text-to-speech. Tap the mic to ask a question with Gradium speech-to-text.

## Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:4590. Click **Try the sample runner** for a demo profile, or drop your own Garmin files.

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
```

Without keys everything still works: Marmo runs on an offline rule engine that uses the same tools, and voice falls back to the browser's speech synthesis and recognition (Chrome works best). The header pills show which mode is active.

## Getting your Garmin data

- **One run:** open it on connect.garmin.com, click the gear icon, then **Export Original** (ZIP with the FIT file) or **Export to GPX/TCX**.
- **Everything:** Account settings, Data Management, **Export Your Data**. Drop the ZIP as is.
- The best signal comes from your 5 to 15 longest runs and races, ideally trail runs with real climbs.

## Demo script (about 3 minutes)

1. Drop a Garmin export. The trainer card shows your stats; **Your Shadow's moves** lists the mistakes found in your runs.
2. Pick a goal, compare your plan with your Shadow's finish, and click **Start live race**.
3. Click **Start the race**: Marmo briefs you (voice) and your Shadow sprints off with Fast Start.
4. At the first gym Marmo tells you how to pace the climb; at the summit you earn a badge.
5. Click **Inject > Cramp**. The Agent tab shows the tool calls (`get_race_status`, `replan`, `speak`) and the actions applied: salt and fluids, effort down 8% for 30 minutes.
6. Tap the mic and ask "Will I make the Cimabanche cut-off?"
7. **Jump to > Gym 4: Tre Cime** to watch the sunrise over the Tre Cime in 3D.
8. Turn **Follow Marmo** off and see the old habits come back, then jump to the finish for the finisher card.

Keyboard: **Space** pauses and resumes. Click or drag on the elevation profile to jump.

## How it works

| Path | What it does |
| --- | --- |
| `src/lib/garmin.ts` | FIT (Garmin FIT SDK), GPX, TCX and ZIP parsing in the browser |
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

- Course: official Lavaredo Ultra Trail 120K GPX and race-book aid stations and cut-offs for 2026. The 2027 route may change slightly.
- The race is simulated from your history. It is not medical advice.
- Marmo and the Shadow are original characters. The game styling is inspired by retro creature-battle RPGs and uses no third-party characters, names, art or sounds. Pixel headings use Press Start 2P (SIL Open Font License).
