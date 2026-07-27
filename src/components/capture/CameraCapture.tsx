"use client";

import { useEffect, useRef, useState } from "react";

import { usePermissionDenial } from "@/components/capture/PermissionGate";
import { Button } from "@/components/ui/button";
import { captureBestFix } from "@/lib/geolocation";
import { drawOverlay, formatOverlayText } from "@/lib/overlay";

type CameraCaptureProps = {
  onCaptured: (photoKey: string | null) => void;
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // G-01-9: bumped by handleRetake to re-run the acquire effect below and
  // restart the live camera after a captured-photo preview is dismissed.
  const [cameraSession, setCameraSession] = useState(0);
  const reportDenied = usePermissionDenial();

  useEffect(() => {
    let cancelled = false;

    // G-01-9: a Retake bumps cameraSession, re-running this effect — reset
    // to the acquiring state each time so the restart is visibly signalled
    // (matches the very first mount's "starting" behavior).
    setStatus("starting");
    setError(null);

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
  }, [reportDenied, cameraSession]);

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
    // G-01-9: freeze a preview the instant Capture is tapped — this is the
    // direct fix for "still live camera after capture". Refreshed below once
    // the D-02 overlay is burned in so the shown preview matches the
    // uploaded bytes exactly.
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));

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
      setPreviewUrl(null);
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
    // G-01-9: refresh the preview so the user sees the same burned-in
    // overlay that is now part of the stored image bytes.
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) {
      setError("Couldn't capture the photo.");
      setStatus("error");
      setPreviewUrl(null);
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

      // G-01-9: stop the live stream on success — the overlaid preview
      // above stays on screen as confirmation, so the camera indicator can
      // go off without losing the "what did I just capture" feedback.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus("captured");
      onCaptured(key);
    } catch {
      // G-01-2: never reflect the raw thrown/network error text (e.g.
      // Safari's `TypeError: Load failed` on a CORS-blocked cross-origin
      // presigned PUT) into the UI — always one fixed, sanitized, actionable
      // message, mirroring the camera-start and geolocation paths above.
      setError("Couldn't upload the photo. Check your connection and try again.");
      setStatus("error");
      setPreviewUrl(null);
    }
  }

  function handleRetake() {
    setError(null);
    setPreviewUrl(null);
    onCaptured(null);
    setCameraSession((n) => n + 1);
  }

  const captureLabel =
    status === "locating" ? "Getting your location…" : status === "uploading" ? "Uploading…" : "Capture Photo";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-md">
        {/* Always mounted so the stream binding (srcObject) is never lost —
            a conditionally-unmounted video would remount without it, which
            would break the generic error/retry paths (G-01-9). */}
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
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt="Your just-captured photo, with geotag and timestamp overlay"
            data-testid="capture-preview"
            className="absolute inset-0 aspect-video w-full rounded-md bg-black object-cover"
          />
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="capture-error">
          {error}
        </p>
      )}
      {status === "captured" ? (
        <Button
          type="button"
          variant="outline"
          onClick={handleRetake}
          data-testid="retake-button"
        >
          Photo captured — Retake?
        </Button>
      ) : (
        <Button
          type="button"
          onClick={handleCapture}
          disabled={status === "starting" || status === "locating" || status === "uploading"}
        >
          {captureLabel}
        </Button>
      )}
    </div>
  );
}
