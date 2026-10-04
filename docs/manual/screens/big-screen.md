# Big screen

/screen/‹event›: the beach screen — Dark (white on dark) or Day (dark on light), large digits, pages that rotate by themselves.

Last checked: 4 Oct 2026 · Product version 0.13.2

## What it is for {#bs-purpose}

A laptop connected to a TV or projector on the beach. Open it from Go live → **Big screen** (new tab), press F11 for full screen.

![Big screen](../img/big-screen-1280.png)
*big-screen-1280.png — the live-heat page of the big screen.*

## Pages and keys {#bs-controls}

| Page / key | What it does |
|---|---|
| **Flag frame** | With the Flags on, a coloured **frame** runs around the whole screen in the flag's colour, and the state's word and countdown are large in the header (for example “Running 7:42”, “Finished — next: ‹heat›, est. ‹time›”). It shows in both Day and Dark colours and does not hide the Day / Dark button. See [Flags](flags.md). |
| **Live heat** | The heat on the water with its clock and riders (at most four per page) and their totals when live scores are allowed; otherwise “Scores published after the heat.”; with nothing on: “Waiting for the next heat”. |
| **Timetable** | Up next and the day's rows (six at most), “Times are estimates and update live.” |
| **Latest result** | The last published (and released) heat. |
| **Podium** | Once a final is released; riders who share a place all show. |
| Sponsors | “Thank you to our sponsors” with the logos. |
| QR code | “Scores and timetable on your phone”: opens the public event page. |
| Wind banner | The wind call, when set and switched on. |
| **The header** | Nothing on the big screen is ever cut with “…”: text wraps (or the page is scaled down a little, never below about half size) instead. The heat's flag pill always shows the whole heat name (division · round · heat and its time) and takes its room first; the event name takes the rest and wraps onto a second line when it must, never smaller than 2% of the screen width (readable from 10 metres). The same rule holds on every page (live heat, timetable, latest result, podium, sponsors) and on the [Flag view](flags.md). |
| **Day / Dark colours** | A quiet button appears in the bottom left corner (a strip of its own: it never covers text) when you move the mouse or tap the screen, and goes away again after three seconds, so the screen stays clean. On a laptop the key **D** switches without showing it. The browser remembers its own choice; until it has chosen, the screen opens in the event's default (Event step → **Big screen: colours**, Dark unless you change it). Day keeps sunlight contrast: dark text on a light ground, the same sizes, and the Lycra labels and the wind banner keep their own solid colours. |
| Rotation | Every “Big screen: seconds per page” (Event step, default 20). **Space** pauses (“Paused — press space to continue”); the **number keys** jump to a page. Nothing animates. |

![Big screen with a very long event name and heat name](../img/big-screen-long-name-1280.png)
*big-screen-long-name-1280.png — a 40-character event name and a 30-character heat name: the pill shows the whole heat name, the event name wraps, nothing ends in “…”.*

![Big screen in Day colours](../img/big-screen-day-1280.png)
*big-screen-day-1280.png — the same live-heat page in Day colours.*

## What it depends on {#bs-depends}

The event must be public (as the [event page](public-event.md#pe-depends)); live totals need live scores allowed; the podium needs the final released.
