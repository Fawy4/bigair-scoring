# Exporting results and backups

The three files you can download from an event: the results spreadsheet, the printable results and the event backup — what each holds, when to press it, where to keep it, and why restoring from a backup does not exist yet.

Last checked: 4 Oct 2026 · Product version 0.14.0

## What it is for {#exp-purpose}

The results of a real event must never live in one place only. Two buttons on the **Go live** step (and the first two also on the head judge's console on a laptop) put them on paper, in Excel and in a file you keep:

| Button | What you get | Who sees it |
|---|---|---|
| **Download results** | A spreadsheet (a CSV file) that opens in Excel: one row per rider per published heat, with every attempt, its score, whether it counted, the Impression / Variety score, the heat total, the place, the result version, who published it and when. After the heat rows come the division placings so far and the ladder's seats. | An organiser; the head judge (on the console) |
| **Open printable results** | A page in a new tab that looks like the public Results page: every published heat, division by division, newest heat first, with the event name and the date and time of the export at the top of every page. Press **Print or save as PDF** (or Ctrl/Cmd + P) and choose **Save as PDF** to keep it. | An organiser; the head judge |
| **Download event backup** | One file (JSON) with the whole event: settings, divisions with their scoring and trick base, riders, officials (names and roles only), the draw and ladder, every run order, heats, attempts, scores, Impression / Variety scores, every version of every result, the audit log and the feedback notes. Open it in a text editor and you will recognise your event. | An organiser only (Go live step) |

Judges, spotters, announcers, observers and the public never see these buttons, and the addresses behind them refuse them. A practice (simulation) event has no buttons: a rehearsal can never end up on a real result sheet.

## What is in the results, and what is not {#exp-what}

- **Only what the public sees.** A heat appears when it is published and released. A heat still under review, a heat held back (a final waiting to be released) and a single judge's scores are never in the files, exactly as on the public Results page.
- **Include heats under review (draft).** An organiser-only tick box beside the buttons (its **?** explains it). Tick it before pressing **Download results** or **Open printable results** and the heats under review or held back are added, clearly labelled **DRAFT** (a DRAFT column in the spreadsheet; the word and a faint watermark on the printed page). It is for the end-of-day safety copy; do not hand it out. Their totals are worked out from the panel's scores at that moment, so they can still change before the head judge publishes.
- **Times** are in the event's own time zone, never the device's.
- **Pressing a button changes nothing.** You can press it during a running heat: nothing on any official's screen changes. The only thing written is one line in the audit log (“Results exported” or “Event backup downloaded”, who and when).
- **Speed.** A 24-rider, 15-heat event takes a few seconds. If a file takes longer than a minute, wait and press again.

## When to press them {#exp-when}

1. **After every published heat** (or every few heats): **Download results**. It takes seconds and the file is a complete copy up to that heat.
2. **At the end of each day**: **Download results** with the draft box ticked, **Open printable results** and save it as PDF, and **Download event backup**.
3. **At the very end of the event**: all three again, then check the files (below).

## Where to keep them {#exp-keep}

- Put each file in **two places that are not the laptop that ran the event**: for example your e-mail to yourself and a shared folder or cloud drive. The file name says what it is: `‹event›-results-2026-10-04-1432.csv`, `‹event›-backup-2026-10-04-1432.json` (date and time of the export).
- **The backup is private.** It holds the riders' contact details and dates of birth. It holds **no PINs, no links and no passwords** (officials are listed by name and role only), but do not post it in a group chat or on a public page.
- Never edit a backup file by hand.

## Restoring from a backup does not exist yet {#exp-restore}

There is **no “Restore from backup” button** and no way yet to load a backup file into the product. The file is the safety net for a rebuild: the format is written down (`docs/EXPORT-FORMAT.md`, with a section on how an import would work) so that a later version can read it. Until then:

- The backup lets a developer rebuild the event by hand if the worst happens.
- Your **results** are safe, for the public and on paper, without any restore: the printable results and the spreadsheet hold every released result.
- A **Reset** (see [Resets and undo](resets-and-undo.md)) is a different thing: it puts a running event back to its draw inside the product, and it has its own undo.

## Check the files {#exp-check}

- Spreadsheet: open it in Excel; the first row is the column names; one row per rider per heat; accents in names look right. If Excel shows strange letters, open it with **Data → From Text/CSV** and choose **UTF-8**.
- Printable results: the event name and “Exported ‹date› ‹time›” are at the top of every page; a heat looks the same as on the public Results page.
- Backup: open it in a text editor; you can find the event's name, a division, a rider, and the line `"format": "bigair-event-backup"` at the top.

## Controls {#exp-controls}

| Control | What it does |
|---|---|
| **Download results** | Makes the spreadsheet and downloads it. Grey with “Preparing the file…” while it works. |
| **Open printable results** | Opens the printable page in a new tab (the draft box applies). |
| **Include heats under review (draft)** | Organiser only. Adds the heats under review or held back, labelled DRAFT, to the next spreadsheet or printable page. Off by default. |
| **Download event backup** | Makes the backup file and downloads it (Go live step, organisers only). |
| **Print or save as PDF** | On the printable page: opens the print window of the browser. |

## What it depends on {#exp-depends}

- The event must be published: a draft event has no public results, so the files say “This event is not public yet, so no result has been published and there is nothing to export.”
- You must be an organiser of the event (or its head judge, for the results only). A judge, spotter, announcer or observer is refused: “Only an organiser of this event or its head judge can download the results.”
- The audit log must be writable: if the file cannot be given because its audit line could not be written, you get “The file could not be made. Try again in a minute; nothing has been changed.”
