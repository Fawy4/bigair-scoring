# Sendbook — Logo brief and generation prompts

> Generated: Wednesday 30 September 2026, 20:50 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack · Concept PNGs (when generated) sit next to this file in `branding/`

## 1. What Sendbook is (give this to any designer or AI)

- A web app that runs kitesurfing Big Air competitions: judges score on their phones, spotters call the tricks, ladders and timetables, live results for riders and spectators — on the beach, in full sun.
- The name: **"send"** (kiters say "send it" — go as big as you can) + **"book"** (the scorebook, the record of the event).
- Licensed to many organisers, so the logo is **neutral**: no Arrow Kites, no kite brand, no event colours.

## 2. Non-negotiables (from the beach readability standard, docs/06 §00)

- Works in **one colour**: black on white AND white on black.
- Bold shapes, thick strokes. No thin lines, no gradients, no shadows, no 3D, no photo.
- Readable at 16 px (browser tab, phone home screen) and from 3 m on the big screen.
- Two pieces: a square **mark** (icon) and a **wordmark** "Sendbook" — one word, lowercase or Title case, never "Send Book".
- Spelling exactly **S-e-n-d-b-o-o-k** (AI image tools misspell; check every result).
- Colours: near-black `#111111` + one accent. Preferred accents: electric orange `#FF6A00` or turquoise `#00B4D8`. Colour-blind-safe; meaning never carried by colour alone.

## 3. Three concept directions

1. **Jump arc** — the wordmark with a single bold arc rising from the "S" and landing after the "k": the trajectory of a huge jump. Mark = the arc alone in a rounded square.
2. **Kite-loop S** — a monogram "S" drawn as one continuous thick kite line making a loop (the path of a kiteloop). Mark = the S; wordmark beside it.
3. **Open book / wing** — an open book seen from the front whose two pages form the two halves of a kite canopy (a wide C-shaped arc). Mark = the book-wing; wordmark below.

## 4. Prompt to paste into an image tool (Claude, ChatGPT, Midjourney, Canva, Adobe Firefly)

```
Minimal flat vector logo for "Sendbook", a kitesurfing big-air competition scoring app.
[CONCEPT: a single bold arc rising from the S and landing after the k, like the trajectory of a huge jump; the mark is that arc alone inside a rounded square.]
Lowercase geometric sans-serif wordmark reading exactly "Sendbook" (one word).
Two colours only: near-black #111111 and electric orange #FF6A00 on a plain white background.
Thick strokes, no gradients, no shadows, no 3D, no photo, no extra text, no realistic kites.
Presented as a clean brand sheet: the mark alone on the left, the full wordmark on the right, centred, lots of white space.
```

Variants:
- Swap the `[CONCEPT: …]` sentence for concept 2 or 3 from §3.
- Swap `#FF6A00` for turquoise `#00B4D8`.
- Add "white logo on a pure black background" for the dark version.
- Midjourney: append `--style raw --no gradient, shadow, 3d, realistic, photo`.

## 5. After you pick a direction

1. Save the chosen PNG in `branding/` and note the concept number here.
2. In a Claude Code session (Phase 7 "branding", or any session), paste:

```
Rebuild the Sendbook logo as SVG from branding/<chosen file>.png: public/brand/logo.svg (mark + wordmark), mark.svg, both in a dark variant, plus favicon.ico, apple-touch-icon.png and a 512 px PNG for the phone home screen. Keep it two colours (#111111 + accent), thick strokes, exact spelling "Sendbook". Wire it into the header, login page, public event pages, the big screen, PDF/PNG exports and the officials' print cards. Add a "Product logo" upload to platform settings so a licensed organiser can replace it, falling back to the built-in SVG. Show me every place it appears in the PR click-through.
```

3. The PNGs are for choosing a direction only; the app ships the SVG (sharp at any size, tiny file, works in one colour).
