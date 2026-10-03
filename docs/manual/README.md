# How to use this manual

The product manual of the Big Air scoring system: how to set up and run an event alone, how every screen works, and what to do when something goes wrong.

Last checked: 3 Oct 2026 · Product version 0.10.0

## Who it is for {#readme-who}

- **An organiser** setting up and running an event without help: start with [Quick start](quick-start.md), then keep [Event day](event-day.md) open on the day.
- **The owner on the beach** with a problem: look up the symptom in [Troubleshooting](troubleshooting.md) or search the exact sentence on the screen (it is in [Errors and refusals](errors.md)). Most problems are a step that is not done yet: the [dependency map](dependencies.md) says what must be true before each action.
- **A support agent later**: every page stands on its own, names the screen, the button and the sentence exactly as the product shows them, and never describes a button that does not exist.

## How to read it {#readme-how-to-read}

- **Where it is.** Inside the product at **/help** (public, kept out of search engines): contents on the left, search at the top, **Download as PDF** for the beach folder (the whole manual in one file). The same pages are Markdown files in the repository under `docs/manual/`.
- **Words.** The manual uses the product's words: *Rider label* (how a rider is shown and recognised), *Lycra* (the coloured top), *score* (a judge's number), *Impression / Variety score*, *Second-chance round*, *Advances without riding*. The [glossary](glossary.md) explains every term with a beach example.
- **Buttons and sentences** are written exactly as on screen, in **bold** for a button and in “quotes” for a sentence. A value the product fills in is written ‹like this›.
- **Screenshots** are real, taken from the product with made-up riders, at laptop width (1280 px) and phone width (390 px). Their file name says the page and the step; the caption under each says what it shows. They are retaken with one command after every change (see below).
- **“Being built”** labels a section about a part of the product that is being changed right now. It describes the product as it is on `main`; the pull request that changes it updates the section.
- **Every page** starts with one line saying what it covers and a line “Last checked: ‹date› · Product version ‹version›”: the product version the page was last compared with.

## The product version {#readme-version}

- The product version is the `version` in `package.json`. It is shown on the Health page (/admin/health), in the footer of the home page and at the top of /help.
- The version was **0.9.0** when the manual was first written, two days before the Arrow launch event (El Gouna, 8–9 October 2026); it becomes **1.0.0** after the event.
- Every pull request raises it before it is merged: the third number for a fix (0.10.1), the second for a feature (0.11.0), the first for a change that needs everybody to relearn something (1.0.0).
- Every pull request also adds its release entry to `docs/RELEASES.md` (what changed, what to test on the live address, known issues); the platform owner ticks the checks on [Releases](screens/admin-releases.md). The rule is on that page.
- The [changelog](changelog.md) has one entry per version: the date, what changed for users, which manual pages were updated, and a link to the release entry.

## How to keep it up to date (the rule) {#readme-update-rule}

> Every pull request that changes a screen, a setting, a sentence or a rule updates the manual pages it touches, retakes their screenshots, and adds a changelog line.

In practice, in the same pull request:

1. **Edit the pages** that describe what changed (the screen's page under `screens/`, and [Quick start](quick-start.md), [dependency map](dependencies.md), [Troubleshooting](troubleshooting.md) or [Event day](event-day.md) if the change shows there). Set their “Last checked” line to today and the new version.
2. **Regenerate the tables** that are written from the code: `npm run manual:generate`. This rewrites the settings tables in [Settings](settings.md), the sentence and code tables in [Errors and refusals](errors.md) and the sentence index in [Troubleshooting](troubleshooting.md). A new refusal sentence needs its meaning and fix in `scripts/manual/error-notes.ts` (otherwise it gets its screen's general fix).
3. **Retake the screenshots**: `npm run manual:shots` (needs the keys in `.env.local`; it builds a throwaway organisation on the hosted project, plays a simulation for the results, photographs every screen, and removes everything). A stale screenshot is worse than none.
4. **Raise the version and add the entries**: `version` in `package.json`, the release entry at the top of `docs/RELEASES.md`, and the changelog line in [Changelog](changelog.md) with its “Release entry” link ([the rule](screens/admin-releases.md#releases-rule)).

Three tests stop the manual from drifting silently (`npm test`): every refusal sentence of `src/lib/ui-copy.ts` and every database code must appear in [Errors and refusals](errors.md); every setting of the scoring, format, event and division schemas must appear in [Settings](settings.md); the generated tables must be up to date. A browser test (`e2e/help.spec.ts`) opens /help, searches for “Hold”, follows every internal link and loads every picture.

## The pages {#readme-pages}

- Start: [Quick start](quick-start.md) · [Dependency map](dependencies.md) · [Event day](event-day.md) · [Troubleshooting](troubleshooting.md)
- Screens: one page per screen, listed in the contents on the left (organiser steps, Go live, the head judge console on a laptop and a phone, judge, spotter, announcer, observer, the public pages, the big screen, the simulator, the platform owner's admin).
- Reference: [Settings](settings.md) · [Resets and undo](resets-and-undo.md) · [Roles](roles.md) · [Glossary](glossary.md) · [Errors and refusals](errors.md) · [Changelog](changelog.md)
