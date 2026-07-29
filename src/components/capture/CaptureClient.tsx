"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitComplaint } from "@/actions/submit-complaint";
import { CameraCapture } from "@/components/capture/CameraCapture";
import { CategoryPicker } from "@/components/capture/CategoryPicker";
import { PermissionGate } from "@/components/capture/PermissionGate";
import { Button } from "@/components/ui/button";
import { captureBestFix } from "@/lib/geolocation";
import { sanitizeError } from "@/lib/sanitize-error";
import { type Category } from "@/types/complaint";

// D-03/D-04: the whole flow is wrapped in PermissionGate (proactive
// camera/location denial hard-block, RESEARCH.md Pitfall 5). The
// captureBestFix wait-for-fix window (D-04) runs right before submit — if
// no reading arrives in the window, the flow hard-blocks rather than
// submitting a fabricated/default coordinate, matching the same treatment
// as a denied permission. `submitComplaint` re-validates `category` against
// the 5-value enum server-side (SUBM-02) — the client is never trusted.
type PublishPhase = "idle" | "locating" | "submitting";

const NO_FIX_COPY =
  "We couldn't get an accurate location fix for this report. Make sure location services are turned on for this site, then reload the page and try again.";

export function CaptureClient() {
  const router = useRouter();
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [noFix, setNoFix] = useState(false);

  async function handlePublish() {
    // Single-flight guard: a double-tap while a publish is already in
    // flight must never create two complaints for one capture (SUBM-01).
    if (!photoKey || !category || publishPhase !== "idle") return;

    setError(null);
    setPublishPhase("locating");

    let fix: Awaited<ReturnType<typeof captureBestFix>>;
    try {
      fix = await captureBestFix();
    } catch {
      setPublishPhase("idle");
      setNoFix(true);
      return;
    }

    setPublishPhase("submitting");
    try {
      await submitComplaint({
        photoKey,
        category,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
      });
      router.push("/");
    } catch (err) {
      // Form state (photo, category) is preserved on failure, not cleared.
      // G-01-CR-01: never render an arbitrary thrown message — submitComplaint
      // now throws only sanitized/intentional messages, and this sink no
      // longer reads the thrown message at all, closing the leak at both the
      // source and the sink. Trade-off: the near-unreachable photoExists
      // "Photo not found" edge case now also surfaces this generic message
      // instead of its own text — accepted because Publish only enables
      // after a confirmed upload, so that case is effectively unreachable in
      // the real flow.
      setError(
        sanitizeError(
          err,
          "Couldn't publish your report. Check your connection and try again.",
          "publish failed",
        ),
      );
      setPublishPhase("idle");
    }
  }

  if (noFix) {
    return (
      <PermissionGate>
        <div
          className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
          data-testid="gps-no-fix-block"
        >
          <p className="text-base text-destructive">{NO_FIX_COPY}</p>
        </div>
      </PermissionGate>
    );
  }

  const publishing = publishPhase !== "idle";
  const publishLabel =
    publishPhase === "locating"
      ? "Getting your location…"
      : publishPhase === "submitting"
        ? "Publishing…"
        : "Publish Report";

  return (
    <PermissionGate>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">Report a Problem</h1>

        <CameraCapture onCaptured={setPhotoKey} />

        <CategoryPicker value={category} onChange={setCategory} />

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          type="button"
          onClick={handlePublish}
          disabled={!photoKey || !category || publishing}
        >
          {publishLabel}
        </Button>
      </div>
    </PermissionGate>
  );
}
