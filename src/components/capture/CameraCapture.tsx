"use client";

import { useEffect, useRef, useState } from "react";

import { usePermissionDenial } from "@/components/capture/PermissionGate";
import { Button } from "@/components/ui/button";
import { captureBestFix } from "@/lib/geolocation";
import { drawOverlay, formatOverlayText } from "@/lib/overlay";

type CameraCaptureProps = {
  onCaptured: (photoKey: string) => void;
};

type Status = "starting" | "ready" | "locating" | "uploading" | "captured" | "error";

// D-01: full getUserMedia live preview + capture-to-canvas. D-02: a fresh
// GPS read taken right at capture time is burned onto the canvas as a
// visible geotag+timestamp overlay (RESEARCH.md "Canvas capture with
// orientation-safe sizing + overlay burn-in" example) — this is a
// best-effort visual proof independent of the wait-for-fix read
// `src/app/capture/page.tsx` takes again just before submit for the value
// actually stored in the complaint row (see the plan's `captureBestFix`
// key_link).
export function CameraCapture({ onCaptured }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);
  const reportDenied = usePermissionDenial();

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        // G-01-3: on a browser that does not proactively report camera as
        // "denied" (Safari, or any browser on a first-visit "prompt"),
        // PermissionGate's own check fails open — this is the actual
        // denial signal. Escalate into the shared hard-block instead of
        // rendering the raw browser error text (T-01-07: no UA-specific
        // internals leak into the UI).
        if (err instanceof DOMException && err.name === "NotAllowedError") {
          reportDenied("camera");
          return;
        }
        setError("Couldn't start the camera.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, [reportDenied]);

  async function handleCapture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    // Read live track settings rather than assuming portrait/landscape
    // (RESEARCH.md Pitfall 3) — re-read on every capture, never cache
    // across the session — and never mirror this draw (rear camera is not
    // mirrored by convention — RESEARCH.md Anti-Patterns; a mirrored draw
    // would also flip the burned-in overlay text backwards).
    const track = stream.getVideoTracks()[0];
    const { width, height } = track.getSettings();

    const canvas = document.createElement("canvas");
    canvas.width = width ?? video.videoWidth;
    canvas.height = height ?? video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setError("Couldn't capture the photo.");
      setStatus("error");
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setStatus("locating");
    setError(null);
    let fix: Awaited<ReturnType<typeof captureBestFix>>;
    try {
      fix = await captureBestFix();
    } catch (err) {
      // G-01-3: a GeolocationPositionError with code 1 (PERMISSION_DENIED)
      // is a real denial — escalate into the shared hard-block. Any other
      // rejection (e.g. captureBestFix's "no-fix" timeout) keeps the
      // existing generic retry message.
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: unknown }).code === 1
      ) {
        reportDenied("location");
        return;
      }
      setError("Couldn't get your location for this photo. Try again.");
      setStatus("error");
      return;
    }

    // Burn the geotag + timestamp overlay onto the canvas BEFORE toBlob so
    // it's part of the stored image bytes, not a separate CSS layer (D-02).
    const overlayText = formatOverlayText(
      { lat: fix.lat, lng: fix.lng },
      fix.accuracy,
      new Date(),
    );
    drawOverlay(ctx, canvas, overlayText);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) {
      setError("Couldn't capture the photo.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    try {
      const uploadUrlRes = await fetch("/api/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ext: "jpg" }),
      });
      if (!uploadUrlRes.ok) throw new Error("Couldn't prepare the upload.");
      const { url, key } = (await uploadUrlRes.json()) as { url: string; key: string };

      const putRes = await fetch(url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": "image/jpeg" },
      });
      if (!putRes.ok) throw new Error("Couldn't upload the photo.");

      setStatus("captured");
      onCaptured(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the photo.");
      setStatus("error");
    }
  }

  const captureLabel =
    status === "locating" ? "Getting your location…" : status === "uploading" ? "Uploading…" : "Capture Photo";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-md">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          data-testid="camera-preview"
          className="aspect-video w-full rounded-md bg-black object-cover"
        />
        {status === "starting" && (
          <div
            className="absolute inset-0 flex items-center justify-center rounded-md bg-black/40 text-sm text-white"
            data-testid="camera-starting"
          >
            Starting camera…
          </div>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        onClick={handleCapture}
        disabled={status === "starting" || status === "locating" || status === "uploading"}
      >
        {captureLabel}
      </Button>
    </div>
  );
}
