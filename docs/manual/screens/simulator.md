# Simulator

/org/events/‹id›/simulate: rehearse an event — play it automatically at up to ×20, press a scenario, look at each person's screen, reset.

Last checked: 2 Oct 2026 · Product version 0.9.0

## What it is for {#si-purpose}

A rehearsal without riders on the water: virtual spotters log attempts, virtual judges score, the virtual head judge publishes, through exactly the same paths as phones. A simulation is never public and never in an export. Open it from the Event step → **Rehearsal** → **Simulate**.

![Simulator panel](../img/simulator-1280.png)
*simulator-1280.png — speed, auto-play, who plays, behaviour, scenarios, View as, checklist, reset.*

## On a real event {#si-real}

“This is a real event”: **Run as simulation** (with **Name of the copy**) copies the divisions, rules, riders, officials with fresh PINs, locked draws and run order into a new simulation event, then **Open the simulator**. Nothing happens to the real event. Refused once the real event has started heats.

## Controls {#si-controls}

| Control | What it does |
|---|---|
| **Speed** ×1 / ×5 / ×10 / ×20 | A heat's length is divided when it starts (a 10-minute heat at ×10 lasts 1 minute); every phone and the public page read the shorter length. |
| **Auto-play**: **Start**, **Pause**, **Resume**, **Stop** | Plays the day in run order. Runs while this tab is open; the line under it says what is happening (“‹heat› is running, 2:10 left.”, “Stopped at a blocker: …”). |
| **Who plays** | Each judge, spotter and the head judge: **Virtual** (the simulator) or **Real** (a phone joins with the PIN; the simulator leaves the seat alone). Each seat says who holds it now: **Simulator**, **You (View as) · seen 4 s ago**, **A phone (PIN) has this seat**, or **Waiting for a phone**. **Give back to the simulator** (or **Virtual**) gives a seat you or a phone hold back to the simulator at once. **Let go** frees a seat you hold. |
| **How they behave** | Attempts per rider per heat, crashes %, repeated tricks %, judges' scores (Agree / Normal / Disagree), and “One judge…” misses attempts / is offline for a minute / is late. |
| **Scenarios** | Eleven one-tap buttons: wind hold and resume, rider no-show, duplicate attempt from two spotters, judge phone dies, tie on total, attempt past the cap, re-open and republish, switch to Plan B, out of attempts, publish hold on the final and release, re-run a heat. A scenario that needs a running heat waits (“Waiting for its moment”). |
| **View as…** | Opens the real screens in a new tab. **Public pages** (home, live heat, results, ladder, big screen) and **A rider's page** (pick the rider) — visible to your login only. Officials (head judge laptop / phone, judges, spotters): your sign-in takes that seat, one at a time, and the simulator steps aside for it. Close that tab and the simulator takes the seat back within seconds (a reload keeps it; a tab that goes quiet for 90 seconds, such as a phone that slept, gives it back too). Each seat can show its PIN (**Show PIN** / **Hide PIN**) and a single-use QR code to join from a phone. |
| **Checklist** | Each scenario ticked once exercised, and the numbers of the run (heats published, attempts, scores, blockers hit); **Open the Feedback notes**. |
| **Reset** | The same Reset as the event's: type the address (the button stays grey until you do: “Type the event's web address first.”) → **Reset to the locked draw**. A Demo with no saved draw shows **Wipe and draw again**. |
| **Delete the simulation** | Removes the copy with everything in it (not the event it was copied from). |

## What it depends on {#si-depends}

A simulation event (a copy made with Run as simulation, or the Demo); every division's draw **locked** (“The simulator plays locked draws only”); a run order; the server's PIN key for fresh PINs; the tab kept open while playing ([dependency map](../dependencies.md#dep-simulator)). The Practice heat on the head console is a simpler feed for simulation events ([dependency map](../dependencies.md#dep-practice)).
