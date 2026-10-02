# Changelog

One entry per product version: the date, what changed for users, and which manual pages were updated.

Last checked: 2 Oct 2026 · Product version 0.9.0

## 0.9.0 — 2 Oct 2026 {#cl-0-9-0}

The version for the Arrow launch event (El Gouna, 8–9 October 2026). 1.0.0 follows after it.

**What changed for users**
- **Organiser access** (Polish 1): the owner invites an organiser by e-mail; the link works once for 24 hours and lands them in their organisation; they set their own password; the owner can remove an organiser (signed out at once) and invite them again.
- **Help** at /help: the whole product manual, with contents, search and **Download as PDF**.
- **Learn more** after every refusal sentence and in every “?” on the organiser, admin and head judge screens, opening the matching part of the manual.
- The product version is shown on the Health page and in the home page's footer (with a **Help** link).
- Fixes: the Trick base tab and the Scoring / Format panels now point to **More settings** (they said “Show all settings”); a division's Scoring or Format tab no longer says “Unsaved changes” before anything was touched; the empty notification area no longer hides the bottom right of laptop pages (“Opens in a new tab.” on Go live) or the top of phone pages.
- **Master trick base editor** (trick-base-editor): Admin → Master presets → **Trick base** edits the master trick base as a form (families, blocks, aliases (type one, Enter), categories, takes a multiplier, rotation, on for new events; rename, move, reorder, retire, restore, add; families renamed, reordered and added; category precedence; naming template with a live example) with the JSON under “Advanced: edit as JSON”. Every save is a draft version; **Publish to all customers** shows the changes in words first; the version history says who published what and when, with **View**. Proposals from events are accepted into a family (name and aliases edited first) or dismissed with a reason the organiser sees. Each event keeps its version until **Update to latest** on its Trick base tab. Trick names follow the naming template (`{direction} {blocks}`, the same names as before).
- Everything built up to this date: the organiser setup and Go live, the judge, spotter, head judge and announcer screens, the public pages and big screen, the simulator, resets per event, division and heat, the platform owner's admin.

**Manual pages updated**
- All pages written (first version): README, Quick start, Dependency map, Event day, Troubleshooting, every screen page, Settings, Resets and undo, Roles, Glossary, Errors and refusals, Changelog.
- After Polish 1 (PR #22): [Organiser access](screens/organiser-access.md) (invite, link, own password, remove), [Admin: organisations](screens/admin-organisations.md), [Roles](roles.md), the invite and simulator rows of the [dependency map](dependencies.md), [Troubleshooting](troubleshooting.md) (e-mail limit, links), the [Simulator](screens/simulator.md) screenshots. Still being built: [Admin: trick base](screens/admin-trick-base.md) (its own pull request updates it).
- After the trick base editor: [Admin: trick base](screens/admin-trick-base.md) rewritten with its screenshots, [Admin: master presets](screens/admin-presets.md), [Divisions](screens/organiser-divisions.md) (Trick base tab), [Errors and refusals](errors.md) and [Troubleshooting](troubleshooting.md) (generated), the README's “Being built” note.

## How to add an entry {#cl-how}

Newest first. Use the version that the release puts in `package.json`, the date, two short lists (“What changed for users”, “Manual pages updated”), and link the pages. See [the update rule](README.md#readme-update-rule).
