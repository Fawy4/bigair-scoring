# Changelog

One entry per product version: the date, what changed for users, and which manual pages were updated. Each entry links to its **release entry** (what to test on the live address, known issues), which the platform owner ticks off on Admin → [Releases](screens/admin-releases.md).

Last checked: 3 Oct 2026 · Product version 0.11.0

## 0.11.0 — 3 Oct 2026 {#cl-0-11-0}

Release entry: [0.11.0](/admin/releases#release-0-11-0) (platform owner only)

**What changed for users**
- **Observer** (observer-role): a read-only official seat, made on the Officials step with its own PIN and card (several allowed). After joining it sees **Whose screen** — head judge console (laptop, phone), each judge, each spotter, the announcer, the big screen, the public page — each the real screen, live, with every control disabled and the strip “Observing — read only”. The database refuses every change from it; it never counts towards a panel, never appears among the judges, is never played by the simulator and never shows on the public pages.
- Head judge console: “‹n› observers watching” under **Judges**.
- Simulator: **View as… → Observer**.
- Join page: an **Observer** card.

**Manual pages updated**
- New: [Observer view](screens/observer.md). Updated: [Roles](roles.md), [Officials](screens/organiser-officials.md), [Join and register](screens/public-join.md), [Head console on a laptop](screens/console-laptop.md), [Simulator](screens/simulator.md), the README's list of screens; [Errors and refusals](errors.md) regenerated (OBSERVER_NOT_ON_PANEL); screenshots retaken.

## 0.10.1 — 3 Oct 2026 {#cl-0-10-1}

Release entry: [0.10.1](/admin/releases#release-0-10-1) (platform owner only)

**What changed for users**
- Nothing on screen: a self-audit of the engines for the Gouna event settings added tests and docs/AUDIT.md (findings and what to do before the event).

**Manual pages updated**
- This changelog only.

## 0.10.0 — 3 Oct 2026 {#cl-0-10-0}

Release entry: [0.10.0](/admin/releases#release-0-10-0) (platform owner only)

**What changed for users**
- **Releases** (release-tracker): Admin → **Releases** lists every version newest first with what changed, what to test and known issues. The checks are tick boxes saved with who and when; **Confirm version tested** signs a version off once every check is ticked.
- The **Health** page and the admin home show the current version and its testing, for example “0.10.0 — 2 of 8 checks done”.
- Every changelog entry links to its release entry.

**Manual pages updated**
- New: [Admin: releases](screens/admin-releases.md). Updated: [Admin: health](screens/admin-health.md), [Admin: organisations](screens/admin-organisations.md) (the version line), this changelog, the README's [product version](README.md#readme-version) section, [Errors and refusals](errors.md) (generated).

## 0.9.2 — 3 Oct 2026 {#cl-0-9-2}

Release entry: [0.9.2](/admin/releases#release-0-9-2) (platform owner only)

Polish 2 – simulator, console and organiser fixes.

**What changed for users**
- **Publish** (head judge): a blocked Publish names the judge and the exact thing (“Fawy: score for Red, attempt 2 missing”, “Fawy: Impression / Variety score for Red missing”), each with **Fix**, which opens that score. When the head judge sets every missing score of a judge to **Absent**, that judge's sheet counts as submitted and Publish needs no reason.
- **Console, after the heat**: each judge's Impression / Variety scores per rider (done, missing, Absent). The head judge can type a judge's whole sheet: one **Save** for every rider, the next rider is picked by itself, **Save and submit** submits the sheet.
- **Simulator**: **View as** gives the seat back when you leave (or after 90 s without a sign of life) and the panel shows who holds each seat, with **Give back**; **Pause** pauses the heat clock too (the console says “Paused by the simulator”), **Resume** resumes both, **Stop** leaves the heat paused; behaviour settings no longer reset each other; auto-play keeps its full speed; new **Skip to end of heat** and **Run the whole event**.
- **Divisions → Scoring**: the main dials first; the settings of a choice show only with that choice; “21 more settings” (it said 53).
- **Divisions → Format**: one **Timing per round** table (warm-up, heat length, break after each heat), the duplicate settings removed.
- Every “?” ends with where the setting shows and what it changes.
- **Run order**: a day without a plan offers **Create a plan for ‹day›** and **Copy ‹other day›'s plan to ‹day›**; the Day list says which plan is active or “no plan”; every grey button says why; **Clear actual times** names the pins that stay; the Go live **Fix** opens on today.
- The Next / Previous bar stays at the bottom and the **Note** button floats above it; the up / down arrows are back on number boxes; a button that asks once (Archive, Delete, Reset…) stays grey until the page is ready, so an early tap is not lost.

**Manual pages updated**
- [Head judge console (laptop)](screens/console-laptop.md), [Simulator](screens/simulator.md), [Divisions](screens/organiser-divisions.md), [Run order](screens/organiser-run-order.md), [Event](screens/organiser-event.md), [Quick start](quick-start.md), [Event day](event-day.md), [Dependency map](dependencies.md); [Settings](settings.md), [Errors and refusals](errors.md) and [Troubleshooting](troubleshooting.md) regenerated; screenshots retaken.

## 0.9.1 — 3 Oct 2026 {#cl-0-9-1}

Release entry: [0.9.1](/admin/releases#release-0-9-1) (platform owner only)

**What changed for users**
- **Master trick base editor** (trick-base-editor): Admin → Master presets → **Trick base** edits the master trick base as a form (families, blocks, aliases (type one, Enter), categories, takes a multiplier, rotation, on for new events; rename, move, reorder, retire, restore, add; families renamed, reordered and added; category precedence; naming template with a live example) with the JSON under “Advanced: edit as JSON”. Every save is a draft version; **Publish to all customers** shows the changes in words first; the version history says who published what and when, with **View**. Proposals from events are accepted into a family (name and aliases edited first) or dismissed with a reason the organiser sees. Each event keeps its version until **Update to latest** on its Trick base tab. Trick names follow the naming template (`{direction} {blocks}`, the same names as before).

**Manual pages updated**
- After the trick base editor: [Admin: trick base](screens/admin-trick-base.md) rewritten with its screenshots, [Admin: master presets](screens/admin-presets.md), [Divisions](screens/organiser-divisions.md) (Trick base tab), [Errors and refusals](errors.md) and [Troubleshooting](troubleshooting.md) (generated), the README's “Being built” note.

## 0.9.0 — 2 Oct 2026 {#cl-0-9-0}

Release entry: [0.9.0](/admin/releases#release-0-9-0) (platform owner only)

The version for the Arrow launch event (El Gouna, 8–9 October 2026). 1.0.0 follows after it.

**What changed for users**
- **Organiser access** (Polish 1): the owner invites an organiser by e-mail; the link works once for 24 hours and lands them in their organisation; they set their own password; the owner can remove an organiser (signed out at once) and invite them again.
- **Help** at /help: the whole product manual, with contents, search and **Download as PDF**.
- **Learn more** after every refusal sentence and in every “?” on the organiser, admin and head judge screens, opening the matching part of the manual.
- The product version is shown on the Health page and in the home page's footer (with a **Help** link).
- Fixes: the Trick base tab and the Scoring / Format panels now point to **More settings** (they said “Show all settings”); a division's Scoring or Format tab no longer says “Unsaved changes” before anything was touched; the empty notification area no longer hides the bottom right of laptop pages (“Opens in a new tab.” on Go live) or the top of phone pages.
- Everything built up to this date: the organiser setup and Go live, the judge, spotter, head judge and announcer screens, the public pages and big screen, the simulator, resets per event, division and heat, the platform owner's admin.

**Manual pages updated**
- All pages written (first version): README, Quick start, Dependency map, Event day, Troubleshooting, every screen page, Settings, Resets and undo, Roles, Glossary, Errors and refusals, Changelog.
- After Polish 1 (PR #22): [Organiser access](screens/organiser-access.md) (invite, link, own password, remove), [Admin: organisations](screens/admin-organisations.md), [Roles](roles.md), the invite and simulator rows of the [dependency map](dependencies.md), [Troubleshooting](troubleshooting.md) (e-mail limit, links), the [Simulator](screens/simulator.md) screenshots. Still being built: [Admin: trick base](screens/admin-trick-base.md) (its own pull request updates it).

## How to add an entry {#cl-how}

Newest first. Use the version that the release puts in `package.json`, the date, a line “Release entry: [‹version›](/admin/releases#release-‹version with dashes›)”, two short lists (“What changed for users”, “Manual pages updated”), and link the pages. The release entry itself is in `docs/RELEASES.md` (see [Admin: releases](screens/admin-releases.md#releases-rule)). See [the update rule](README.md#readme-update-rule).
