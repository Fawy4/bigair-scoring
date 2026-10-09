# Organiser: Event step

Step 1 of an event (/org/events/‹id›/event, or **+ New event** on the events list): name, dates, place, time zone, branding, what the public sees, timing, registration, the officials' join details, rehearsal and visibility.

Last checked: 8 Oct 2026 · Product version 0.18.2

## What it is for {#ev-purpose}

Everything that belongs to the whole event rather than one division. Each setting has a “?” that opens one sentence and an example, with a **Learn more** link to its row in [Settings](../settings.md#settings-event). On a laptop the settings are on the left and the “In words” card (a sentence describing the event) and Visibility on the right; on a phone the card comes first. Some settings are folded under **‹n› more settings**; the fold is remembered on the device.

![The Event step on a laptop](../img/org-event-1280.png)
*org-event-1280.png — Event step on a laptop.*

![The Event step on a phone](../img/org-event-390.png)
*org-event-390.png — the same step on a phone: the step list is a drop-down at the top.*

![The Flags card of the Event step](../img/org-event-flags-1280.png)
*org-event-flags-1280.png — the Flags card (behind More settings): the switch, the four states, the two lengths.*

## Folding the cards {#ev-fold}

Behind **More settings**, every section card (Web address, Branding and sponsor logos, Test run, Timing and the big screens, Scoring settings, Flags, Public page, Registration, Officials' join details) has a header you click to fold or unfold, with a small chevron. The first card is open and the others are folded. Your choice is remembered in this browser, per card. A card that holds a mistake unfolds by itself when **Save event** finds it. Folding only hides a card: what you typed in it is still there when you open it again, and the **?** buttons and the Simple / More settings switch work as before. The phone has the same fold.

![The Event step with its cards folded](../img/org-event-folded-1280.png)
*org-event-folded-1280.png — More settings with the first card open and the others folded.*

## Controls {#ev-controls}

| Control | What it does |
|---|---|
| **Event name** | The name on the home page, the event page and every header. |
| **Dates** (First day, Last day) | The days of the event; the run order offers one plan per day between them. |
| **Location** | Shown on the public pages. |
| **Time zone** | Every time on every screen is shown in this zone, wherever the viewer is (Africa/Cairo for Egypt). |
| **Will riders wear coloured lycras?** | Yes: riders are told apart by Lycra colour; No: by name. Opens the Rider identification editor (preset, primary, fallback, call-out, Lycras, bibs, secondary details, kite fields, colour palette, “Allow a different scheme for individual divisions”, **Save as preset**) with a live Rider label preview. See [Settings](../settings.md#settings-identification). |
| **What riders and spectators see** | Three tick boxes: show live scores during a heat; show results automatically when a heat is published; hold the final's result until released (podium). Nothing is public until the head judge publishes unless these allow it. A division can override them (Divisions → More settings → Live screens). |
| **Web address (slug)** | The last part of …/e/‹slug› and the **event code** officials type. Changing it on a published event breaks shared links and QR codes: tick “I understand, change the address” first. **Open the public page in a new tab** and **Copy link** sit next to it. |
| **Branding** | **Event logo** and **Sponsor logos** (name, website, logo, ↑ ↓ to order, **Remove sponsor**, **+ Add sponsor**). PNG, JPEG or WebP, up to 2 MB. |
| **Rehearsal** | **Simulation event (never public)** tick box (only before any heat has started) and the **Simulate** link to the [Simulator](simulator.md). |
| **Public page** | A switch for every tab of the public event page — Home, Live, Results, Ladder, Placings, Rules, one per outside leaderboard, Join — all on by default. Switch a tab off and it disappears from the page; an old link to it lands on the first tab that is left. At least one tab stays on (the last one's switch is grey; Join counts like the others). The **Join** tab follows its own switch and nothing else: it stays when registration is closed, because officials enter their PIN there; riders then read “Registration is closed” in its Riders part. The big screen is not affected. |
| **Scoring settings** | **Name of the impression score**: what the separate score per rider is called on every screen (the console's card heading, the judges' phones, the review bar, the judges' sheets, the public results, the rules text and the big screen). Empty (the default) keeps the name each division's own scoring gives it (**Impression** for most), and the empty field shows that name in grey as its placeholder (with several divisions, their names one after the other: “Impression, Variety”), so it is never a mystery. The refusals the judges and the head judge meet about this score (“A rider has no Variety score from you yet.”, “The Variety score opens when the heat has ended.”) use the name you set; without one they say “Impression / Variety score”. *Variety* is the other common choice. Up to 24 characters; longer is refused: “Use 24 characters or fewer for the name of the impression score”. |
| **Flags** | A card with **Flags on** (on by default for every event), the **word and colour** of each of the four states (Before start, Running, Last minute, Stopped or paused), **Pre-start length** (60 seconds) and **Last-minute length** (60 seconds). Each “?” says where it shows. Off: every screen looks as it did before flags. See [Flags](flags.md). |
| **Timing and officials** | **Ready call (minutes before the heat)** (default 15; the one place it is set), **Live update every (seconds)** (default 7), **Big screen: seconds per page** (default 20; the first big screen only), **Follow the heat — seconds per page** (default 15, 5 to 120; how long each Results and Ladder page of [Big screen — Follow the heat](big-screen.md#bs-follow) stays up; typing a number outside 5 to 120 leaves the nearest allowed one in the box; a value that still gets through is refused with “Use a whole number of seconds from 5 to 120 for the pages of the Follow the heat screen”), **Big screen: colours** (Dark or Day; where the big screen opens until a browser chooses for itself; default Dark), **Heats that can run at the same time** (default 1), **Judges may log attempts too**, **Other leaderboards** (up to 6 extra public tabs, **+ Add leaderboard**), **Show the wind-call banner on public pages and the big screen**. |
| **Rider registration** | **Registration** Open / Closed, **Closing day**, **Closing time**, **Most riders per division**, **Message shown when registration is closed**, and the link to the public registration page (it only works once the event is published). |
| **Officials’ join details** | The join address and the **Event code**. Every official has their own PIN (made in the Officials step); there is no event-wide PIN. |
| **Visibility** | **Published: the event is listed on the home page and its public pages work**. Unticked (draft), only your team sees it. |
| **Create event** / **Save event** | Saves the step; it answers when it is stored (under a second), and the left rail catches up a moment later. “● Unsaved changes” shows until you save. Problems are highlighted (“Some settings need fixing. They are highlighted below.”). |
| **Next: Divisions →** | Saves first, then opens Divisions; stays with the error if the save fails. |
| **Delete or archive this event** | Platform owner only: **Archive event** (hidden everywhere, nothing deleted, **Restore event** brings it back) and **Delete event** (type the web address; only while no result was published). Organisers see “Only platform owners can delete or archive an event here.” |

## The Lycra colour list {#ev-lycra-colours}

In the **Rider identification** card (under **More settings**), **Colour palette (in slot order)** is the event's list of Lycra colours. With “The lycra colour changes every heat”, seat 1 of each heat gets the first colour, seat 2 the second, and so on: keep only the colours you really have (for example Red, Black, White) and put them in the order you want, with ↑ ↓. The list needs at least as many colours as the biggest heat has riders: “Heats here have up to 3 riders — keep at least 3 colours.” See [Draw](organiser-draw.md#dr-seat-colours).

![Rider identification card with Red, Black, White](../img/org-event-lycra-colours-1280.png)
*org-event-lycra-colours-1280.png — the Rider identification card with the palette Red, Black, White (in this order) and the preview label.*

## What it depends on {#ev-depends}

Nothing: it is the first step. The organisation's default time zone pre-fills new events (Organisation settings). Being **Published** is what makes the public pages, the home-page listing and registration work ([dependency map](../dependencies.md#dep-public)).
