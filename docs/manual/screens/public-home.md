# Public: the home page

The product's home page (/) for riders and spectators: live events, upcoming events, recent results, and a box for an event code.

Last checked: 2 Oct 2026 · Product version 0.9.0

## What it is for {#ph-purpose}

The front door. It lists only published, public events: live ones first (a live dot and “Now: Pro Men · R1 · Heat 3”), then upcoming, then recent results, each a compact card. Simulation and archived events never appear.

![Home page on a phone](../img/public-home-390.png)
*public-home-390.png — the home page on a phone.*

## Controls {#ph-controls}

| Control | What it does |
|---|---|
| Event cards | Open the event's public page. |
| **Have an event code?** + **Go** | Opens /e/‹code›; the code is the last part of the event's address (for example arrow-launch-2026). For an event that is not listed. |
| “Organiser? **Sign in** · Official? **Join with your PIN**” | Organiser sign-in (/org/login) and the officials' join page (/join). |
| Footer | The product name, the product version, **Help** (this manual), **Legal** (when the owner wrote terms or a privacy notice), and a small **Admin** link (the platform owner's sign-in, lands on /admin). |

## What it depends on {#ph-depends}

An event appears when it is published and is neither a simulation nor archived (Event step). The product name, logo and tagline come from Platform settings. If the database cannot be read: “The event list could not be loaded just now. Try again in a minute.”
