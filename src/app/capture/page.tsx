"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { submitComplaint } from "@/actions/submit-complaint";
import { CameraCapture } from "@/components/capture/CameraCapture";
import { Button } from "@/components/ui/button";
import { captureBestFix } from "@/lib/geolocation";
import { CATEGORIES, type Category } from "@/types/complaint";

// Composes CameraCapture + a minimal category picker + Publish button — the
// walking-skeleton tracer version. Full UI-SPEC treatment (overlay burn-in,
// permission hard-blocks, wait-for-fix indicator) lands in Plan 03.
export default function CapturePage() {
  const router = useRouter();
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePublish() {
    if (!photoKey || !category) return;
    setPublishing(true);
    setError(null);
    try {
      const fix = await captureBestFix();
      await submitComplaint({
        photoKey,
        category,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
      });
      router.push("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Couldn't publish your report. Check your connection and try again.",
      );
      setPublishing(false);
    }
  }

  return (
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
        {publishing ? "Publishing…" : "Publish Report"}
      </Button>
    </div>
  );
}
