---
status: diagnosed
trigger: "capture-preview-not-shown-after-photo: After capturing a photo on the /capture page, the live camera feed remains on screen instead of switching to a captured-photo preview / confirmation. There is no visible feedback that a photo was captured. This blocks the user from proceeding to confirm category selection and tap Publish, so it also blocks verifying UAT test 9 (rapid double-tap Publish guard)."
created: 2026-07-26T00:00:00Z
updated: 2026-07-26T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — CameraCapture.tsx's JSX never branches on `status` to render a captured-photo preview or hide the live video; the MediaStream also stays attached to the <video> element's srcObject through and after capture (only stopped on unmount), so the live feed keeps playing uninterrupted regardless of status.
test: Read full render function of CameraCapture.tsx and traced every status transition (starting -> ready -> locating -> uploading -> captured/error) against the JSX return block.
expecting: N/A — confirmed by direct code read, not a runtime experiment (goal: find_root_cause_only).
next_action: Return ROOT CAUSE FOUND report.

## Reasoning Checkpoint (RCA branching, Phase 2)

candidate_causes:
  - "code: CameraCapture.tsx's return JSX has exactly one status-conditional block (status === \"starting\" -> spinner overlay); there is no status === \"captured\" (or uploading/locating) branch that swaps the <video> for a static preview, freezes the frame, or stops the stream."
  - "config/environment/data: none found — no env flag, build config, or data-shape issue is implicated; this is a pure rendering/state-to-UI mapping gap in one component."
and_gate: "no — single code-category cause fully explains the symptom; confirmed by direct read of the component's entire render output, no other contributing condition needed."

## Symptoms

expected: After the user captures a photo, the live camera view (video element) is replaced by a static preview of the captured photo (or other clear visual confirmation) before/while the category picker and Publish button are shown.
actual: The live camera feed continues to display after capture; no captured-photo preview or other capture feedback is shown to the user.
errors: None reported by the user for this specific symptom (a separate, unrelated home-page SSR error was also reported in the same session — being investigated separately, not conflated here).
reproduction: Test 9 in UAT — open /capture, grant camera+location permissions, tap the capture control to take a photo, observe whether the live camera view is replaced by a photo preview.
started: Discovered during UAT (phase 01 verify-work session, 2026-07-26).

## Eliminated

## Evidence

- timestamp: 2026-07-26T00:05:00Z
  checked: src/components/capture/CameraCapture.tsx (full file, 193 lines)
  found: >
    `status` state machine is "starting" | "ready" | "locating" | "uploading" | "captured" | "error".
    `handleCapture()` correctly progresses status through locating -> uploading -> captured on
    success (line 152: setStatus("captured"); onCaptured(key)). But the JSX return block (lines
    163-192) contains exactly ONE status-conditional render: `{status === "starting" && (...Starting
    camera… spinner...)}`. There is no conditional for "captured", "locating", or "uploading" that
    changes what's shown in the media area. The `<video>` element (lines 166-173) is unconditionally
    rendered at all times with no status-gated visibility/replacement logic.
  implication: The component tracks "captured" internally but never renders anything different for it — this is the direct code path causing the reported symptom.

- timestamp: 2026-07-26T00:06:00Z
  checked: src/components/capture/CameraCapture.tsx — MediaStream lifecycle
  found: >
    `streamRef.current` is set once in the mount useEffect (line 41) and is only ever stopped in
    that same effect's cleanup function (line 65: `streamRef.current?.getTracks().forEach(track =>
    track.stop())`), which only runs on component unmount (dependency array `[reportDenied]` never
    changes). `handleCapture()` never calls `stream.getTracks().forEach(t => t.stop())` nor clears
    `video.srcObject` after drawing the frame to canvas. So the live camera stream keeps feeding the
    <video> element indefinitely after a successful capture.
  implication: Even if a preview were added, the live feed would need to be explicitly paused/stopped or covered — currently nothing does either, so the video visually never stops.

- timestamp: 2026-07-26T00:07:00Z
  checked: src/components/capture/CameraCapture.tsx — captured image data disposition
  found: >
    The frame is drawn onto an in-memory `<canvas>` created via `document.createElement("canvas")`
    (line 82) — this canvas is never appended to the DOM, never read back via `toDataURL()` for
    display, and is discarded after `canvas.toBlob(...)` produces the upload Blob (lines 126-128).
    No captured-photo image data ever reaches the rendered UI.
  implication: There is no code path in this component that could show a static "photo you just took" preview — the captured image only ever exists as bytes sent to the upload endpoint.

- timestamp: 2026-07-26T00:08:00Z
  checked: src/components/capture/CameraCapture.tsx — button label/disabled feedback
  found: >
    `captureLabel` (line 160-161) only special-cases "locating" -> "Getting your location…" and
    "uploading" -> "Uploading…"; for every other status (including "captured" and "ready") it falls
    through to "Capture Photo". `disabled` (line 187) is only true for "starting" | "locating" |
    "uploading" — once status flips to "captured", the button re-enables and its label reverts to
    the same "Capture Photo" text shown before any capture happened.
  implication: Even the button — the one interactive element that does branch on status — gives zero distinguishable feedback for the "captured" success state vs. the pre-capture "ready" state.

- timestamp: 2026-07-26T00:10:00Z
  checked: src/app/capture/page.tsx (full file, 115 lines)
  found: >
    CapturePage renders `<CameraCapture onCaptured={setPhotoKey} />` unconditionally alongside
    `<CategoryPicker .../>` and the Publish button on every render — it does not itself add any
    wrapper/overlay to indicate photo-captured state; it relies entirely on CameraCapture's own
    internal status-driven UI (which per above provides none) to signal capture success. The only
    externally observable effect of a successful capture is that `photoKey` becomes non-null,
    which enables the Publish button — a distant, easy-to-miss signal with no visual change in the
    capture area itself.
  implication: Root cause is isolated to CameraCapture.tsx; CapturePage.tsx correctly wires onCaptured but has no independent bug contributing to this symptom.

- timestamp: 2026-07-26T00:12:00Z
  checked: .planning/phases/01-core-capture-to-feed-skeleton/01-UI-SPEC.md (grep for preview/captured/camera/feedback)
  found: >
    Line 100's Capture-screen media row specifies only "Live camera preview" as the primary media
    element for the Capture screen — there is no row/state defined for a post-capture confirmation
    view. Line 146's state-coverage table lists only a "loading" state for the camera capture flow
    ("Starting camera…" spinner) and line 147 an "error" state (permission-denied hard-block) — there
    is no "populated"/"success" state entry for the camera capture flow at all.
  implication: The UI-SPEC itself never specified a captured-photo confirmation state — this is a design-contract gap in addition to the implementation gap, meaning the missing feedback isn't a regression from a previously-specified behavior but an original omission carried through planning into code.

- timestamp: 2026-07-26T00:14:00Z
  checked: tests/e2e/capture.spec.ts (full file, 166 lines) — the only e2e coverage of the capture flow
  found: >
    The happy-path test ("capture flow: live camera + GPS produces a published complaint") clicks
    "Capture Photo" and then waits for the "Publish Report" button to become enabled
    (`toBeEnabled({ timeout: 20_000 })`) — it never asserts anything about the video/preview area's
    visual state after capture. No test in this file (or any other e2e/unit test found) asserts a
    captured-photo preview appears, or that the live video stops/changes after capture.
  implication: No existing automated gate (test, typecheck, lint) would have caught this — the test suite validates the functional outcome (upload succeeds, Publish becomes enabled) but has zero coverage of the visual "capture succeeded" feedback the UAT tester was checking for. Confirms "why not caught": no test asserted the preview-state UI at all.

## Resolution

root_cause: >
  CameraCapture.tsx's render function has no UI branch for the "captured" status (or any status
  other than "starting"). The <video> element showing the live getUserMedia MediaStream is rendered
  unconditionally and its stream is never stopped/replaced after a successful capture (stream.stop()
  only runs on unmount). The captured frame is drawn to an off-screen, never-rendered <canvas> that
  is discarded immediately after producing the upload Blob — no captured-photo image data, freeze-
  frame, or "photo captured" indicator ever reaches the DOM. The only other status-driven signal
  (the Capture button's label/disabled state) also does not distinguish "captured" from the initial
  "ready" state, reverting to the plain "Capture Photo" label. Net effect: after tapping Capture,
  nothing in the UI visibly changes except that the (easy-to-miss) Publish button becomes enabled —
  the live camera feed keeps playing throughout and after capture, exactly matching the reported
  symptom. This is both an implementation gap (CameraCapture.tsx) and an upstream design-contract gap
  (01-UI-SPEC.md's Capture screen state table never specified a post-capture confirmation state).
fix:
verification:
files_changed: []
