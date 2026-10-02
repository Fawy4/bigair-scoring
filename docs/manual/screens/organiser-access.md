# Organiser access: sign-in, organisations, the events list

How an organiser gets in (/org/login), the events list (/org), the organisation switcher, the account menu, Organisation settings and Feedback. *Being built — check after Polish 1 merges* (the Polish 1 work changes organiser access; this page describes `main` on 2 Oct 2026).

Last checked: 2 Oct 2026 · Product version 0.9.0

## Getting in {#oa-getting-in}

- Organiser logins are **invite-only**. Today only the **platform owner** invites one: /admin → the organisation → **Invite first organiser** (email). The login is made as *owner* of that organisation. See [Admin: organisations](admin-organisations.md).
- **Organiser sign in** (/org/login): **Email me a sign-in link** — open the email on the same phone or computer, in the same browser, and tap the link (it works once). Or, once a password is set: **Sign in with a password instead** → **Sign in**. **Forgot password?** emails a link that signs you in and opens the password page.
- **Set or change password** (account menu) — at least the shown number of characters, typed twice.
- The hosted email plan sends only a few sign-in emails per hour (“Too many sign-in emails were requested…”): set a password once so the beach does not depend on email.

![Organiser sign-in](../img/org-login-390.png)
*org-login-390.png — the sign-in page on a phone.*

## The events list and the frame {#oa-frame}

| Control | What it does |
|---|---|
| Top bar | Product name, **organisation switcher** (when you belong to several), inside an event its name, dates, state and **Public link** (copy, open, QR), and the **account menu**. |
| Account menu | **On this device**: Daylight / Dark and Normal / Large (remembered on this device only); **Note**; **Set or change password**; **Sign out**; inside an event also the links to the events list, Organisation settings and Feedback. |
| **‹organisation›: events** | Your events with dates and state; **Open setup**; **+ New event**. Archived events are hidden behind **Show archived events (‹n›)**. |
| **Organisation settings** | Name, web address (slug), logo, default time zone. Only owners and admins of the organisation can save; others can look (“Only owners and admins can change these settings. You can look, but not save.”). See [Settings](../settings.md#settings-organisation). |
| **Feedback** | The notes your team left with the **Note** button, with filters (kind, status, screen, event). |
| **Note** (floating button) | Leave a note about the screen you are on (type or **Dictate**, optional screenshot, kind: Bug, Wording, Layout, New rule, Idea). The page, event, division, heat and your role are saved with it. |

![The events list](../img/org-events-1280.png)
*org-events-1280.png — the events list.*

## Roles inside an organisation {#oa-roles}

A membership has a role: **owner**, **admin** or **staff**. Owners and admins may change Organisation settings; every member can set up and run the organisation's events. Platform owners can open any organisation (“Open as this organiser”; a slim strip “Viewing as ‹organisation›” with **Back to admin** shows it, and every visit is in the audit log). See [Roles](../roles.md).

## What it depends on {#oa-depends}

An invitation from the platform owner; the email service for links (or a password); for “Viewing as”, a platform owner or staff login.
