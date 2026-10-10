# Passo

**Race the runner you used to be.** An AI-powered ultra-trail race pacer and tactical companion in the Dolomites.

Built for an agentic AI hackathon with Google DeepMind Gemini (agent brain), Gradium (voice) and Entire (agent session checkpoints).

---

## The Vision & The Hackathon Reality

- **The Vision:** An on-wrist **Garmin Connect IQ app** that serves as your live tactical race strategist. Wearing it during an ultramarathon, it monitors grade-adjusted pace, heart-rate drift, climb pacing, and aid-station dwell times directly from your Garmin watch, delivering proactive audio coaching through your Bluetooth headphones.
- **The Hackathon Reality:** You can't run a 48 km mountain ultra with 2,600 m of vertical climb through the Dolomites during a hackathon to evaluate live agent interventions. So we built **Passo**: a high-fidelity digital twin and race simulation harness. It reproduces real course topography (Cortina Trail / Lavaredo), fits your historical Garmin pacing curves, models fatigue and nutrition depletion, and lets the Gemini agent call tactical decisions in real time.

---

## Quick Start & Evaluation

### 1. Run it locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Open [http://localhost:4590](http://localhost:4590).

### 2. Testing Without a Garmin Developer Account

> **Note on Garmin Connect Sign-In:** Direct OAuth sign-in requires an approved [Garmin Connect Developer Program](https://developerportal.garmin.com/) enterprise registration (which pairs with the on-wrist Garmin companion app).
> 
> **To test and evaluate immediately:**
> - Click **"Try the sample runner"** on the welcome screen to load a complete ultra-runner profile fitted from real Garmin history.
> - Or drop your own Garmin exported `.fit`, `.gpx`, `.tcx`, or Garmin Connect `.zip` file into the upload zone. Passo parses your files entirely in the browser using the official `@garmin/fitsdk`.

---

## What Passo Does

1. **Fits Your Personal Running Model:** From historical Garmin runs, Passo calculates your flat pace, climb speed, descent technique, and fatigue degradation curve. It identifies recurring tendencies: fast starts, overcooking initial climbs, late-race bonking, under-fuelling, and lingering at aid stations.
2. **Meets Your Shadow Rival:** Your historical pacing flaws are embodied by the **Shadow Rival**—a spectral runner pacing according to your past mistakes ("Fast Start", "Reckless Climb", "Empty Tank").
3. **Generates an Altitude-Aware Race Plan:** Using the official course GPX, Passo calculates cut-off safety margins for every aid station and creates pacing plans for **Safe**, **Target**, or **Stretch** goals.
4. **Simulates the Live Mountain Race:** Race in 3D terrain over the Dolomites. Climbs are mountain gym passes with collectible badges, energy is monitored via an HP battery gauge, and weather, cramps, and nutrition are dynamic status effects.
5. **Autonomous AI Coach (Marmo):** When race conditions change (approaching a climb, summiting, passing an aid station, low energy, shadow overtaking, cramp, storm, or user voice query), the **Gemini agent** wakes up. It calls tools (`get_race_status`, `get_course_ahead`, `replan`, `speak`), decides whether to intervene or remain silent, and adjusts runner effort when **Follow Marmo** is enabled.
6. **Voice Interaction:** Marmo speaks tactical instructions via **Gradium text-to-speech**. Runners can press the mic to ask questions via **Gradium speech-to-text** (e.g., *"Will I make the Cimabanche cut-off if I slow down 5%?"*).

---

## Demo Script (3-Minute Judge Walkthrough)

1. On the launch screen, type `"Lavaredo 80K"` or `"Cortina Trail"`, click **Look up**, and select **Try the sample runner**.
2. Review the athlete report and historical habit breakdown. Pick a goal (e.g. **Safe** or **Stretch**) and click **Simulate**.
3. In the pre-race briefing card, review the Trainer vs Shadow Rival matchup and click **Start Race Simulation**.
4. Marmo briefs you through your headphones. Watch the Shadow sprint ahead if you have a "Fast Start" habit.
5. As you hit the first climb, Marmo calls out pacing targets; cresting the summit awards a gym badge.
6. In the **Simulation Controls Drawer**, click **Scenarios > Cramp**:
   - The Agent reasoning card highlights the Gemini tool call chain (`get_race_status`, `replan`, `speak`).
   - Marmo calls for sodium and reduces effort by 8% for 20 minutes to recover.
7. Tap the mic and ask: *"Will I beat the cut-off at Cimabanche?"*
8. Use **Jump to > Gym 4: Tre Cime** to experience the 3D sunrise over Tre Cime di Lavaredo.
9. Toggle **Follow Marmo** off to watch the runner succumb to past pacing mistakes, or scrub to the finish for the victory celebration.

---

## API Keys & Configuration (Optional)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

```bash
GEMINI_API_KEY=...            # Enables the live Google DeepMind Gemini agent
GEMINI_MODEL=gemini-2.5-flash # Optional (defaults to gemini-2.5-flash)
GRADIUM_API_KEY=...           # Enables Gradium low-latency TTS & STT
GRADIUM_VOICE_ID=...          # Optional (defaults to "Russell")
GARMIN_CLIENT_ID=...          # Optional: Garmin Connect developer app credentials
GARMIN_CLIENT_SECRET=...
```

*Passo includes offline fallbacks for everything: if Gemini or Gradium keys are omitted, Marmo runs on a deterministic rule-based coach using the same tool definitions, and voice falls back to the browser's Web Speech API.*

---

## Architecture & Codebase Map

| Path | Purpose |
| --- | --- |
| `src/lib/garmin.ts` | Client-side FIT, GPX, and TCX parsing with `@garmin/fitsdk` |
| `src/lib/profile.ts` | Pacing curves, climbing factors, and habit/mistake detection |
| `src/lib/plan.ts` | Altitude-aware timeline planning, aid station cut-offs, and Shadow paths |
| `src/lib/sim.ts` | Digital twin physics: grade resistance, fatigue, HP, and status effects |
| `src/lib/engine.ts` | Real-time simulation loop and asynchronous coach trigger queue |
| `src/lib/coach/tools.ts` | Gemini tool declarations (`get_race_status`, `replan`, `speak`, etc.) |
| `src/lib/coach/gemini.ts` | Multi-turn Gemini function-calling agent loop |
| `src/components/race/race-map.tsx` | MapLibre 3D terrain viewer with OpenFreeMap and AWS elevation tiles |
| `src/components/race/battle-hud.tsx` | Retro Pokémon-inspired duel telemetry card, HP bar, and station pins |
| `src/components/race/coach-panel.tsx` | Conversational decision cards and agent reasoning inspection |
| `src/components/race/sim-controls.tsx` | Playback speed, effort adjustments, scenarios, and audio settings |
| `src/components/sprites.tsx` | Handcrafted 24x24 / 28x28 pixel art sprites for Trainer, Shadow, and Marmo |

---

## Partner Technology

- **Google DeepMind Gemini:** Marmo's autonomous brain. Multi-round function calling over course geometry, runner habits, and live race status.
- **Gradium:** Ultra-low latency voice output (TTS) and hands-free runner queries (STT).
- **Entire:** Checkpoint tracking and workflow automation for autonomous AI pair-programming sessions.

---

## Local Scripts

```bash
npm run dev          # Start Next.js development server (port 4590)
npm run lint         # Run ESLint
npm run typecheck    # Validate TypeScript types
npm run simulate     # Run a headless race simulation with the offline coach
npm run calibrate    # Test sample profile and plan sensitivity curves
npm run build:course # Rebuild race geometry from official course GPX
```
