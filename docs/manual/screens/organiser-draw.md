# Organiser: Draw step

Step 5 of an event (/org/events/‹id›/draw): each division's ladder made from its format and its confirmed riders, moved by hand if needed, then locked.

Last checked: 2 Oct 2026 · Product version 0.9.0

## What it is for {#dr-purpose}

The draw puts every confirmed rider in a seat of a Round 1 heat (in seed order, with the seat's Lycra colour when Lycras change every heat) and lays out the later rounds with placeholders such as “1st H1”. **Locking** the draw makes it final: heats can start only in a locked draw, and locking saves the starting copy that a Reset goes back to.

![Draw on a laptop](../img/org-draw-1280.png)
*org-draw-1280.png — division tabs (no draw / draft / locked), the status pill, the toolbar, the ladder, the checks.*

![Draw on a phone](../img/org-draw-390.png)
*org-draw-390.png — the ladder on a phone (scrolls sideways inside its box).*

## Controls {#dr-controls}

| Control | What it does |
|---|---|
| Division tabs | One per division, with its state: no draw, draft, locked. |
| **Generate draw** / **Regenerate draw** | Makes the draw from the format and the confirmed riders. Regenerating asks first; when you arranged heats by hand it offers **Regenerate and keep my hand-arranged heats** or **Regenerate and discard my changes**. Refused once a heat has started or while locked. |
| Tap a rider, then a seat (or drag) | Moves the rider (**Move here**) or swaps with the rider there (**Swap with ‹name›**). Every hand change is audited. |
| Seat menu | **Place a rider here**, **This seat waits for…** (a place of an earlier heat), **Clear seat**, **Take seat out**. |
| **+ Seat**, **+ Heat**, **+ Round after**, **Take heat out**, **Take round out** | Change the ladder's shape by hand. |
| Round and heat names | Click to rename (kept when regenerated; used on timetables and public pages). |
| **Lock draw** / **Unlock draw** | Lock when final. Unlock needs a reason of at least 5 characters (written to the log). |
| **Print / PDF** | Opens a printable page (one A4 landscape page per division, in colour, with estimated times) with **Print or save as PDF** and **Export PNG** (a picture to send on WhatsApp). |
| **Checks** | Warnings about the whole ladder (a rider without a seat, a heat of the wrong size). “The checks warn you; they never stop you.” |

## What it depends on {#dr-depends}

The division has a format (Divisions → Format) and at least one **Confirmed** rider (Riders). Started and finished heats never change; once a heat of the division has started the draw cannot be regenerated. A seat fed by an earlier heat is filled when that heat is published ([dependency map](../dependencies.md#dep-next-seat)). The Go live checklist asks for every draw to be locked.
