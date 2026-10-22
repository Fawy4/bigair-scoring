# Public: the rider report

/e/‹event›/riders/‹id›/report: how one rider performed and what to work on, for the rider and for anybody who looks at it. It exists only when the organiser switches **Rider reports** on (Event step → **Public page**).

Last checked: 22 Oct 2026 · Product version 0.26.0

## What it is for {#prr-purpose}

A rider opens **Open the report** on their own page (from the **Riders** tab, from Results or Ladder, or from a shared link) and sees where they finished, the path they took through the rounds, their numbers beside the field's, three things to take away and every heat jump by jump. Anyone can open any rider's report. No login is needed.

![The rider report on a phone, in Day](../img/public-report-390.png)
*public-report-390.png — the top of a report: place, path and the numbers beside the field's.*

## The setting {#prr-setting}

The Event step → **Public page** → **Rider reports** has three choices:

- **Off** — the default for every event, old and new. The rider page has no link and the report address answers “not available”.
- **After each heat** — a rider's report opens as soon as their first heat is published and grows with every published heat. The report says it is **so far**, and so do the parts that compare riders (the place, the highlights, the field's figures).
- **When the event is complete** — reports open only once the event is set to complete.

While it is Off, or before the report opens, the organiser (and the platform owner through **Open as this organiser**) can read any rider's report with **Preview a rider's report**, in the same card: pick the rider and press **Open the preview**. The preview says it is for the organiser; the public cannot read it.

![The Public page card with Rider reports](../img/organiser-event-rider-reports-1280.png)
*organiser-event-rider-reports-1280.png — the three choices and the preview.*

**Switching it on makes trick names, sides and times of published heats public**, also in a division whose results page shows numbers only. It never shows any single judge's score (J1, J2…), the judges' reference hints, a score still being entered, anything of a heat that is not published, or a rider's contact details.

## What the report shows {#prr-parts}

| Part | What it shows |
|---|---|
| Top card | The event and division, the rider's name and their final place (**Joint 5th** for a shared place) or the round they reached (**Out in Round 3**). **so far** while the event is not complete. |
| **Your path** | One step per round: **Won**, **Through**, **Out**, **Walkover**, **Did not ride**, **Out of the event**, with the place. |
| **Your numbers** | Ten tiles, each with the field's figure and the finalists' beside it: jumps (“of N allowed” only when the division has a limit), landed, crashes and crash rate, different tricks, loops landed out of tried, the two sides with how many jumps had a side, heats won, average heat total, best heat total (and where), steadiness (the spread of the heat totals; **lower = steadier**). |
| **Highlights** | Up to three lines, only where the rider was first or joint first in the division: highest scoring trick, best heat total, longest winning run, most tricks, most different tricks, most loops, fewest crashes for the jumps taken (from 8 jumps), the highest score of the event's name for the separate score, and “the only rider to land …” (only for one of their three best tricks). No highlight, no card. |
| **Three things to take away** | One strength, one thing to train and one heat strategy point, chosen by fixed rules ([the rules](#prr-rules)); and, for the heat that knocked the rider out, the gap line: “You missed the Final by 0.4 points. One more trick scoring above 2.0, in place of your third best (1.6), would have taken you through.” — only when a trick scoring that much was landed at the event. |
| **Your best three tricks** | With their published score. |
| **Heat by heat** | Outcome, the total written as best tricks + the separate score, the gap, attempts, crash rate, first landed trick, pace (“a jump every 1:07”), a **timeline** of the heat (a dot for every landed trick at its time and score, a cross for every crash, a dashed line at the average landed trick of the heat, the counting tricks larger with their score) and every jump with its time, trick, side, landed or crash, published score and a **Counts** tag. |
| **Trick mix** | A bar and a list by family of the trick base: landed out of tried, **Landed** and **Still to land**. |
| **You and the field** | Landing rate, attempts used a heat, jumps with a loop, different tricks a heat, average landed trick, and the separate score, for the rider, for all riders and for the finalists. Field figures are averages; no other rider is named. |
| **Goals for next time** | Two or three goals taken from the takeaways, and three questions to think about. Nothing is saved. |

![A heat of the report](../img/public-report-heat-390.png)
*public-report-heat-390.png — the total, the timeline and every jump of one heat.*

![The three takeaways](../img/public-report-takeaways-390.png)
*public-report-takeaways-390.png — a strength, something to train and a heat strategy point.*

Names come from the event: the separate score is called what the event calls it (**Impression**, **Variety**…), and the two sides are the words the event shows (**Left / Right** or **In / Out**). All scores are the published panel scores, exactly as the Results page shows them. Two spellings of one trick (“Double backroll board off”, “×2 Backroll Board-off”) count as one trick; words the trick base did not recognise stay as typed and count as their own trick.

## Day and Dark {#prr-theme}

The report follows the page's Day / Dark choice and has its own **Daylight / Dark** switch at the top, the same choice that is kept on the device everywhere. Its words are at least 4.5:1 against their ground.

![The same report in Dark](../img/public-report-dark-390.png)
*public-report-dark-390.png — Dark.*

## The rules for the takeaways {#prr-rules}

- **Strength** (the first that applies): landing rate at least 8 points above the field; two or more loops landed; more different tricks a heat than the field; a trick landed on both sides; growth from the first heat's total to the last; every attempt used in every heat (when the division has a limit).
- **To train** (the first that applies): a trick tried at least twice and never landed; loops landed less than half the time; no loops at all while the finalists' jumps include loops; one side on at least 75% of the jumps with a side (only with 8 such jumps, and at least half the rider's jumps); a heat with half or more of the jumps crashed; the same trick landed twice on the same side in one heat.
- **Heat strategy** (the heats lost first, the latest first, then the heats won): in a heat not won — attempts left unused; first landed trick after half the heat; the winner landed more loops or more tricks; or as many tricks as the winner, so the difference was in the tricks themselves. In a heat won — a counting trick banked in the first third; the best trick in the second half.

## Who has no report {#prr-none}

A rider whose date of birth says under 18 has no report and no link; the address answers the same “not available” as for a closed report, so nothing says why. A rider with no published heat yet is told the report opens with the first one. A report is kept out of search engines.

## What it depends on {#prr-depends}

The event must be public, **Rider reports** must not be Off, the rider must be in a locked draw with a published heat. It reads through one database function (read as a visitor and shared for 3 seconds with the other public pages), so a report costs no extra read per visitor.
