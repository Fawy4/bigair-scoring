# Public: results and placings

/e/‹event›/results (one tab per heat) and /e/‹event›/placings (final places and the highest jump).

Last checked: 17 Oct 2026 · Product version 0.24.3

## What it is for {#pr-purpose}

The published result of every heat, readable on a phone in the sun, and the division's final placings.

![Results on a phone](../img/public-results-390.png)
*public-results-390.png — a heat summary: one row per rider, the formula in words and the attempt boxes.*

![Results on a laptop](../img/public-results-1280.png)
*public-results-1280.png — the same on a laptop.*

![Placings on a phone](../img/public-placings-390.png)
*public-placings-390.png — placings with shared places (“13=”) and the highest jump.*

## Controls {#pr-controls}

| Control | What it does |
|---|---|
| **Divisions** and **Heats** tabs | Pick the heat; it opens on the live heat, otherwise the last published (“Showing the live heat, otherwise the last published.”). |
| Rider rows | Place, Rider label, total and the formula in words (“20.5 = tricks 15.5 + Variety 5.0”; “ + bonus”, “ − penalty” when they apply; a percentage only when the division's “Show scores as % of maximum” is on); DNS, DNF, DSQ. |
| Attempt boxes | In attempt order: crash red with CRASH, not counted grey, counted graded yellow (lowest in the heat) to green (highest), each with an icon or a word. What a box shows is the division setting “What spectators see per attempt” (Divisions → Scoring → ‹n› more settings → Live screens): attempt number + score, trick name + score, or scores only. A division shows trick names only when its organiser picks “trick name + score” — then everywhere that division appears in public. With **trick name + score** a box reads the number, the trick in the short form riders say, then the score: “1 · L ×2 BR · 7.33” (L or R is the side the spotter set; BR is Backroll, KL Kiteloop, ×2 and ×3 stay; the letters of every trick are under *Short trick names* below). A crash reads “2 · CRASH” with no trick; an attempt whose trick the spotter has not logged yet reads “1 · 7.33” and fills in by itself. A trick shows only where its score does: with live scores off, tricks appear once the heat is published, together with the scores. On a narrow phone the boxes wrap onto new lines as before; when one box is still too wide for the card only its trick part ends in “…” — the number and the score are never cut — and the full text is in the box’s accessible label. The other two settings look exactly as they always did. The same boxes are on the Live tab, a rider’s page and Follow the heat. |
| “How to tell the riders apart” | The Lycra colours and how riders are recognised. |
| **Placings** | Final places (riders knocked out in the same round share a place, “13=”), and “Highest jump: ‹h› m — ‹rider› (‹trick›)” when heights are measured. |

“No results have been published yet.” · held result: “Result to be announced.”

## Short trick names {#pr-short-tricks}

With “trick name + score” a trick is written in capital letters only, so it fits a small box on a phone and is readable on the beach TV. The rule: **the first letter of each part of the trick’s name**, so Backroll (back + roll) is **BR**, Kiteloop **KL**, Doobie loop **DL**, Handle pass **HP**, Heart attack **HA**. The **side** comes first (**L** or **R**, from the spotter’s L / R; nothing when no side was set). A **rotation count** stays a number: **×2**, **×3**, **×4** (a typed “double”, “triple” or “quad” becomes the number); a single rotation shows nothing. A count in front (“6x”) stays as typed. Capitals, spaces and hyphens do not matter (“back roll”, “Back-roll” and “BACKROLL” are one word), and a small slip of the pen is read the way the spotter’s suggestions read it.

The special cases the owner decided, and the only ones:

| Trick list word | Box shows |
|---|---|
| Double loop, Triple loop (they are kiteloops) | ×2 KL, ×3 KL |
| + Kiteloop | KL, the same as Kiteloop |
| Blind landing | BD (not BL: that is Boogie loop) |
| Every grab: Grab, Indy, Tail, Nose, Melon, Mute, Method, Stalefish | GR |
| Late | joins the trick right after it, no space: Late backroll **LBR**, Late frontroll **LFR**, Late + Kiteloop **LKL**; it never stands alone |
| The judges' codes (0.24.3) | Snakeloop SnL, KGB, Loop back rotation invert BRI, Straight dangle pass DP, Double dangle pass DDP, 36 Kung-Fu HP 36HP, 36 Kung-Fu 2 HP 362HP, KL3, Board flip BF, Osmosis OS, Unhook UH |
| Late rotations, Downloop landing | left out of the box |

Everything else in the Trick list is the plain rule: Straight jump SJ, Backroll BR, Frontroll FR, Kiteloop KL, Megaloop ML, S-loop SL, Contra loop CL, Doobie loop DL, Boogie loop BL, Board-off BO, One-foot OF, Board spin BS, Handle pass HP, Tic-tac TT, Toeside TS, Heart attack HA.

**A trick added to the trick base later** (Admin → Trick base, or a block the event added) needs nothing from us: it is found by its name and aliases, and its letters are the first letter of each word of its name, a word ending in “roll” or “loop” counting as two parts (“Sushi roll” SR, “Wakeloop” WL). Letters are never only **L** or **R**, because they would read as the side: then the first two letters are shown (“Rodeo” is RO, not R).
**Text that matches nothing in the trick base** is the first letter of each word, never a single letter: “Shark attack” is SA, a one-word unknown trick shows its first two letters (“Rodeo” is RO). Unknown words come after the known ones.

Example: Left, ×2, Backroll, Board-off, Handle pass is shown as “L ×2 BR BO HP”. The letters are kept exactly as the rule gives them, so two different tricks can share letters (all grabs are GR; Kiteloop and + Kiteloop are KL). When the spotter or the head judge corrects a trick, the box changes by itself within the page’s usual refresh. The Placings line “Highest jump” names its trick, in these letters, only for a division on “trick name + score”.

## What it depends on {#pr-depends}

A heat appears after the head judge publishes it **and** either “Show results automatically when a heat is published” is on or the result was released ([dependency map](../dependencies.md#dep-public)). A held final shows nothing until **Release result**.
