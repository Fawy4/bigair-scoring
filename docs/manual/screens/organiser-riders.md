# Organiser: Riders step

Step 3 of an event (/org/events/‹id›/riders): who rides in each division, in seed order, with their identifiers; registrations from the public page; import and print.

Last checked: 10 Oct 2026 · Product version 0.19.0

## What it is for {#ri-purpose}

Riders belong to your organisation; an *entry* puts a rider into a division (one rider can be in several divisions). The list's order is the seeding: the draw deals riders in this order. Only **Confirmed** riders are drawn.

![Riders on a laptop](../img/org-riders-1280.png)
*org-riders-1280.png — the seeded grid: sticky header, search, tick boxes and the bulk bar.*

![Riders on a phone](../img/org-riders-390.png)
*org-riders-390.png — the same list on a phone.*

## Controls {#ri-controls}

| Control | What it does |
|---|---|
| **Division** | Which division's riders are shown. “Rider label: ‹scheme› (the event’s / this division’s own)” says how riders are recognised. |
| **Registrations from the public page** | Riders who registered online: **Approve** (becomes Confirmed, gets the next seed) or **Decline** (optional reason for your notes). Declined registrations are listed in their own fold. |
| **Search riders** | Filters the list; drag and ↑ ↓ still move a rider in the whole list. |
| Grid columns | Seed, Rider label, names, nationality, email, phone, sponsor, status, and the identifier columns the division's Rider label uses (Lycra colour, bib, kite, rash guard, photo). **Show every identifier column** shows all of them. Click a cell to edit it; it saves on its own (“Saved”). |
| Status | **Confirmed** (taking part), **Withdrawn**, **No-show**. After the draw is locked, **Withdrawn** and **No-show** turn the rider's seat into a **walkover**: the seat stays (the heat of 3 runs with 2), the stored draw says so, a rider left without an opponent moves on and the next seat fills as the format says, and the public ladder shows it. **Withdrawn is the same thing as Out of the event on the head console** ([When a rider doesn't show up or is injured](console-laptop.md#cl-no-show)): both use the same function, so the draw and the seats come out the same. It is refused once the rider's heat has started (“This rider's heat has already started. Use Out of the event (or Did not start) on the head console instead.”). **Remove** is refused for a rider who has a seat in a heat or in a locked draw (“This rider has a seat in the draw — set them to Withdrawn instead”); it stays for riders without a seat. |
| Tick boxes + bulk bar | **Set status** or **Remove from division** for the ticked riders. |
| Drag handle, ↑ ↓ | Move a rider; seeds are renumbered 1, 2, 3… after every move (“Order saved”). |
| **Sort by seed number** | Puts riders in the order of the seed numbers you typed (warns when a seed is used twice). |
| **Shuffle randomly** / **Repeat this shuffle** / **Shuffle code** | A random order with a code; the same code puts everybody back in exactly that order. |
| **Print start list** | One printable page per division (seed, rider, Rider label, nationality, sponsor). |
| **Rider links** | Opens a printable sheet in a new tab: one card per confirmed rider of the whole event with a **QR code** and the **address of the rider's own page** (no login needed to open it), and below it the same list as “Name — address” lines in a box with **Copy the lines**, ready to paste into a WhatsApp group. The pages follow the public rules: a rider's page opens once the division's draw is locked (the sheet says how many riders are still waiting for that), and a rehearsal (simulation) event is not public, so its links open only for you. |
| **Check these riders** | Warnings only (nothing is blocked): two riders with the same Lycra colour, bib, kite, rash guard or name. |
| **Add a rider by hand** | First and last name (+ the visible identifier fields) → **+ Add rider** (status Confirmed). |
| **Paste or upload a CSV** | Paste rows with a header line or choose a file → **Preview** (nothing saved yet; problems listed per line) → **Import ‹n› riders**. Columns are found by their header: First, Last, Nationality, Email, Phone, Sponsor, Seed, Bib, Lycra colour, Kite brand, Kite model, Kite size, Kite colours, Rash guard colour, Photo URL. A rider with an email you already have is linked, never overwritten. |
| **Add from this organisation’s riders** | Tick riders from earlier events → **Add ‹n› riders**. |

## What it depends on {#ri-depends}

A division must exist (“Add a division first (Step 2), then come back to add riders.”). Once the division's draw is locked, changing seeds here no longer changes the draw (“The draw of this division is locked: changing seeds here does not change it. A rider you set to Withdrawn or No-show keeps the seat as a walkover.”); a rider withdrawn after the lock keeps their seat as a walkover (a DNS in the stored draw and in the heat; the head judge's **Did not start** in the console's rider menu still sets a DNS for one heat only). Public registration needs the event published and registration open (Event step).
