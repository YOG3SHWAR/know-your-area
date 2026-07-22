# Phase 1: Core Capture-to-Feed Skeleton - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-22
**Phase:** 1-Core Capture-to-Feed Skeleton
**Areas discussed:** Camera capture experience, Stub identity model, Feed behavior & content, Complaint ID & permalink format

---

## Camera Capture Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Full getUserMedia + canvas | Custom in-page live preview, capture to canvas, full control over framing, enables burned-in geotag overlay | ✓ |
| Native capture attribute | `<input capture="environment">` opens native camera app directly, less code, no overlay control | |
| You decide | — | |

**User's choice:** Full getUserMedia + canvas

| Option | Description | Selected |
|--------|-------------|----------|
| Visible burned-in overlay | Timestamp + approx. location rendered onto the canvas image itself | ✓ |
| Invisible metadata only | GPS + timestamp stored as fields, nothing rendered onto the image | |
| You decide | — | |

**User's choice:** Visible burned-in overlay

| Option | Description | Selected |
|--------|-------------|----------|
| Hard block with explanation | Clear message that camera/location access is required, no submission possible without both | ✓ |
| Allow retry without explanation | Just re-show the browser's native permission prompt | |
| You decide | — | |

**User's choice:** Hard block with explanation

| Option | Description | Selected |
|--------|-------------|----------|
| Short wait (~3-5s), submit best-available | Wait briefly for GPS refinement, then proceed with whatever accuracy is available, storing coords.accuracy | ✓ |
| Wait for high accuracy, longer timeout | Poll until accuracy < threshold or ~15s elapses | |
| You decide | — | |

**User's choice:** Short wait (~3-5s), submit best-available

**Notes:** None of these were "you decide" — user picked the recommended option in all four questions for this area.

---

## Stub Identity Model

| Option | Description | Selected |
|--------|-------------|----------|
| Per-browser anonymous device ID | Random ID stored in cookie/localStorage on first visit, maps to real user_id later | ✓ |
| Single hardcoded demo user | Everyone submitting is the same "Demo User" | |
| Lightweight name prompt | Ask for a display name (unverified) before first submission | |

**User's choice:** Per-browser anonymous device ID

| Option | Description | Selected |
|--------|-------------|----------|
| Generic label, no name | e.g. "Reported by a nearby resident," or omit poster identity entirely | ✓ |
| Auto-generated anon handle | Assign a throwaway display handle per device ID (e.g. "Reporter #4F2A") | |
| You decide | — | |

**User's choice:** Generic label, no name

**Notes:** User confirmed "Next area" after 2 questions rather than the full 4 — this area was resolved without needing further depth.

---

## Feed Behavior & Content

| Option | Description | Selected |
|--------|-------------|----------|
| Request location, fallback to unsorted/default view | Prompt for location on feed load; if denied, still show a feed (e.g. most recent) | ✓ |
| Require location to see any feed | No feed renders until location is granted | |
| You decide | — | |

**User's choice:** Request location, fallback to unsorted/default view

| Option | Description | Selected |
|--------|-------------|----------|
| Photo + category badge + distance + timestamp | Full-width photo, category icon, raw distance, relative time | ✓ |
| Minimal: photo + category only | Skip distance/timestamp | |
| You decide | — | |

**User's choice:** Photo + category badge + distance + timestamp

| Option | Description | Selected |
|--------|-------------|----------|
| Infinite scroll | Matches Reddit/Instagram reference point | ✓ |
| Simple paginated "Load more" button | Explicit button click for next batch | |
| You decide | — | |

**User's choice:** Infinite scroll

| Option | Description | Selected |
|--------|-------------|----------|
| No hard cutoff, sort by distance | Show all complaints ranked nearest-first, no radius limit | ✓ |
| Hard radius cutoff (e.g. 10-20km) | Only show complaints within a fixed radius | |
| You decide | — | |

**User's choice:** No hard cutoff, sort by distance

**Notes:** None of these were "you decide" — user picked the recommended option in all four questions for this area.

---

## Complaint ID & Permalink Format

| Option | Description | Selected |
|--------|-------------|----------|
| Short alphanumeric code, ~6-8 chars | Reddit/Twitter-style short code (e.g. "KYA-7F3X2") | ✓ |
| UUID | Standard UUID, zero collision-design effort but unwieldy to type/read aloud | |
| You decide | — | |

**User's choice:** Short alphanumeric code, ~6-8 chars

| Option | Description | Selected |
|--------|-------------|----------|
| /c/{id} | Short, Twitter-style path | ✓ |
| /complaint/{id} | More descriptive/explicit path | |
| You decide | — | |

**User's choice:** /c/{id}

| Option | Description | Selected |
|--------|-------------|----------|
| Simple search box on the feed page | Visible input where anyone can paste/type a complaint ID | ✓ |
| URL-only (no visible search box) | Only reachable via a known /c/{id} link | |
| You decide | — | |

**User's choice:** Simple search box on the feed page

**Notes:** User confirmed "Ready for context" after 3 questions — this area was resolved without needing a 4th.

---

## Claude's Discretion

None — every gray area discussed reached an explicit user decision.

## Deferred Ideas

None — discussion stayed fully within the Phase 1 scope boundary; no scope-creep suggestions came up.
