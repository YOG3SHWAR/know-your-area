"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitComplaint } from "@/actions/submit-complaint";
import { CameraCapture } from "@/components/capture/CameraCapture";
import { PermissionGate } from "@/components/capture/PermissionGate";
import { Button } from "@/components/ui/button";
import { captureBestFix } from "@/lib/geolocation";
import { CATEGORIES, type Category } from "@/types/complaint";

// D-03/D-04: the whole flow is wrapped in PermissionGate (proactive
// camera/location denial hard-block, RESEARCH.md Pitfall 5). The
// captureBestFix wait-for-fix window (D-04) runs right before submit — if
// no reading arrives in the window, the flow hard-blocks rather than
// submitting a fabricated/default coordinate, matching the same treatment
// as a denied permission. Full 5-category picker + server-side
// re-validation lands in Plan 03 Task 3.
type PublishPhase = "idle" | "locating" | "submitting";

const NO_FIX_COPY =
  "We couldn't get an accurate location fix for this report. Make sure location services are turned on for this site, then reload the page and try again.";

export default function CapturePage() {
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
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't publish your report. Check your connection and try again.",
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

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">What&apos;s the problem?</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                aria-pressed={category === c.value}
                className={`rounded-full border px-3 py-2 text-sm ${
                  category === c.value
                    ? "border-amber-500 bg-amber-50 text-amber-900"
                    : "border-input bg-zinc-100"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

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
