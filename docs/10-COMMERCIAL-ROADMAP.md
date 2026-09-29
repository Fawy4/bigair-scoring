# 10 — Commercialisation Roadmap

> Generated: Tuesday 29 September 2026, 20:10 EEST (Cairo, UTC+3) · Part of the Big Air Scoring System handover pack

## 1. Positioning
"The competition operating system built for Big Air." Differentiators vs generic action-sports platforms: (1) Big-Air-native scoring models (best-N + impression, trick-family counting, single-best-jump) as editable presets; (2) wind-aware timetable with anchors, holds and alternative plans; (3) spotter → judge → head judge flow designed for 3-rider heats in 40 knots; (4) WOO/sensor height module; (5) runs an event from a phone with a 3-judge volunteer panel.

## 2. Competitors (for your pitch deck, from public pages Sep 2026)
- **Liveheats** — 1,200+ organisations, 15,000+ events across surf/skate/snow; web-based judging, draw builder, head-judge approvals, rankings, registration & payments, streaming graphics, API. Strength: maturity. Gap: not Big-Air-specific (no trick families/impression presets, no wind-aware re-flow as a first-class feature).
- **JudgeMate** — criteria-based scoring with a kiteboarding template, panel agreement report, PDF/Excel export. Gap: generic, no ladder/timetable depth for Big Air.
- **WOO Events** — sensor-only leaderboards; complementary (partner, not competitor).

## 3. Product tiers (proposal)
| Tier | For | Includes | Price idea |
|---|---|---|---|
| Free | Club sessions | 1 division, ≤12 riders, 3 judges, public page, [PRODUCT_NAME] branding | $0 |
| Event | One competition | Unlimited divisions/riders, presets, timetable, exports, custom branding, WOO module | $149–299 per event |
| Season | Tours/federations | Multi-event, rankings/points, organiser presets library, priority support | $99–199 / month |
| Pro services | Big events | Setup + on-site head-judge tooling support | day rate |

Add-ons later: registration payments (Stripe, take a small fee), video-entry judging, streaming overlay API, white-label domains.

## 4. Roadmap after Gouna
1. **V1.0 (4–6 weeks)**: multi-organisation accounts, billing (Stripe), organiser preset library, duplicate-event, email/WhatsApp ready calls, offline-first judging, Arabic/French/Spanish/Dutch.
2. **V1.1**: WOO API integration (with WOO's cooperation), video-entry module (KOTA/Megaloop/PUKL-style qualification), season rankings and points tables, sponsor analytics (impressions on public pages).
3. **V1.2**: streaming overlay endpoints, commentator tools, freestyle & hydrofoil big air trick lists (GKA appendices), federation exports.

## 5. Costs & legal basics
- Hosting: Vercel Pro $20/month per seat (Hobby is non-commercial only) + Supabase Pro $25/month per project (no auto-pause, daily backups) ≈ **$45/month**; domain ≈ $15/year. Scale costs stay low (text data, small events).
- Terms of service, privacy policy (rider personal data; EU-hosted; consent captured at registration), organiser data-processing terms; results/marks retention policy (e.g. 3 years); photo/video consent handled by the event, not the platform.
- Trademark check on the product name; keep "KOTA", "Red Bull", "GKA", "PUKL", "WOO" out of the product name; presets may say "KOTA-style" as description.

## 6. Go-to-market
- Gouna as the reference event (case study + video). Offer free use to 3–5 friendly organisers (Egypt/Red Sea, Tarifa, Cape Town, UK PUKL-style events) in exchange for feedback and logos.
- Partner angle with WOO (sensor sponsor → "official measurement" module) and with kite brands launching products (Arrow) who want a professional live-scores page.
- Federations (e.g. BKSA-style national bodies) as season customers.

## 7. Metrics to track from day one
Events run · heats published · median time from heat end to publish · judge marks entered on phones vs paper · public page views per event · organiser NPS · preset customisations made (signals product-market fit for "dynamic formats").
