# Admin: feedback and audit log

/admin/feedback (the notes left with the Note button, exported for Claude) and /admin/audit (what happened, who did it and when).

Last checked: 3 Oct 2026 · Product version 0.11.0

## What it is for {#af-purpose}

Collecting what testers and organisers noticed, and tracing every platform action.

![Admin feedback](../img/admin-feedback-1280.png)
*admin-feedback-1280.png — the notes with their filters and the export panel.*

## Controls {#af-controls}

| Control | What it does |
|---|---|
| Filters | **Kind** (Bug, Wording, Layout, New rule, Idea, Ask Sendbook — the notes written by Ask's **Was this right?** buttons, with the question, the answer and the screen's context), **Status** (Open, Done), **Screen**, **Event** → **Filter**. |
| Note rows | Note, kind, status, where (screen, event, division, heat), who, when, exported; **Set as done** / **Reopen**, **Change kind**, the **Screenshot** link. |
| **Export for Claude** | Owner only: writes every open note into one file grouped by kind and screen (each note gets the export date); **Download FEEDBACK.md** or **Copy for Claude**. |
| /admin/ask | **Ask log** (owner only): every Ask Sendbook question and answer with tokens, model and cost estimate, **Search questions and answers**. See [Ask Sendbook](../ask-sendbook.md#ask-log). |
| /admin/audit | **Show**: Platform actions only / Everything, including scoring changes; **Organisation** filter → **Apply**. Columns: when, who, what happened, organisation, details. Nothing can be changed or deleted. |

Organisers see their own team's notes at /org/feedback.

## What it depends on {#af-depends}

A platform owner or staff login; export is owner only.
