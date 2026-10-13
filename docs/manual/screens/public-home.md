# Public: the home page

The product's home page (/) for riders and spectators: live events, upcoming events, recent results, and a box for an event code.

Last checked: 13 Oct 2026 · Product version 0.22.0

## What it is for {#ph-purpose}

The front door. At the top: the orange Sendbook arc, the product name large and the tagline on one line. Under the tagline, when the owner has set the contact number: “Running a kite competition?” and an orange **Get in touch on WhatsApp** button (opens WhatsApp in a new tab with a ready message). The Daylight / Dark switch has orange on the side you chose. This is the only page with orange buttons and links (the **Go** button, **Sign in**, **Join with your PIN** and the footer links); everything else in the product is teal. Under it, only published, public events: **Live now** first (the first live event is a larger card with a gently pulsing dot and “Now: Pro Men · R1 · Heat 3”), then **Coming up**, then **Results** (a quiet “Results” tag on each finished event). Every card is one tap target that opens the event page. Simulation and archived events never appear. The page opens in Daylight and has the Daylight / Dark switch at the top right (kept on the device).

**The background** is drawn, never photos: thin orange air streams flowing left to right, low water along the bottom (both move) and one rider upside down in a megaloop with his kite looping below him (he never moves). On a laptop he is to the right of the wordmark; on a phone he is in a band under it and scrolls away with the page. He is never behind text; the event cards and the code box have solid backgrounds, and the header, the sections and the footer are transparent (the footer ends just above the water). With the phone's **Reduce motion** on, the picture is still. The background loads after the page is visible, so the words never wait for it.

![Home page: a live event, light, laptop](../img/public-home-live-light-1280.png)
*public-home-live-light-1280.png — a live event first and larger, then the event code field.*

![Home page: a live event, dark, laptop](../img/public-home-live-dark-1280.png)
*public-home-live-dark-1280.png — the same page in dark.*

![Home page: many events, light](../img/public-home-many-light-1280.png)
*public-home-many-light-1280.png — ten events: live, coming up and results.*

![Home page: many events, dark](../img/public-home-many-dark-1280.png)
*public-home-many-dark-1280.png — the same in dark.*

![Home page: nothing public, light](../img/public-home-empty-light-1280.png)
*public-home-empty-light-1280.png — “No public events right now”, with the event code field under it.*

![Home page: nothing public, dark](../img/public-home-empty-dark-1280.png)
*public-home-empty-dark-1280.png — the same in dark.*

![Home page on a phone](../img/public-home-390.png)
*public-home-390.png — the home page on a phone (light); public-home-live-dark-390.png is the dark one.*

## Controls {#ph-controls}

| Control | What it does |
|---|---|
| Event cards | Open the event's public page (the whole card is the button). The tile on the left shows the organisation's first letter. |
| **Have an event code?** + **Go** (the orange button) | Opens /e/‹code›; the code is the last part of the event's address (for example arrow-launch-2026). For an event that is not listed. |
| “Organiser? **Sign in** · Official? **Join with your PIN**” | Organiser sign-in (/org/login) and the officials' join page (/join). |
| **Get in touch on WhatsApp** (orange) | Opens WhatsApp in a new tab to the owner's number with the message “Hi! I saw Sendbook and I'd like to know more.” Shown only when the number is set (Vercel → Environment Variables → `NEXT_PUBLIC_CONTACT_WHATSAPP`: digits only, country code first); otherwise neither the line nor the button appears. |
| Footer | The product version, **Help** (this manual), **Legal** (only when the owner wrote terms or a privacy notice) and a small **Admin** link (the platform owner's sign-in, lands on /admin). Nothing else. |

There is no sign-up anywhere on the page.

## What it depends on {#ph-depends}

An event appears when it is published and is neither a simulation nor archived (Event step). The product name, logo and tagline come from Platform settings. If the database cannot be read: “The event list could not be loaded just now. Try again in a minute.”
