"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type CameraCaptureProps = {
  onCaptured: (photoKey: string) => void;
};

type Status = "starting" | "ready" | "uploading" | "captured" | "error";

// D-01: full getUserMedia live preview + capture-to-canvas (basic tracer
// version — the geotag/timestamp overlay burn-in from D-02 and iOS
// orientation hardening from RESEARCH.md Pitfall 3 are Plan 03's
// refinement of this same component).
export function CameraCapture({ onCaptured }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>("starting");
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : "Camera access failed.");
        setStatus("error");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  async function handleCapture() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    // Read live track settings rather than assuming portrait/landscape
    // (RESEARCH.md Pitfall 3) and never mirror this draw (rear camera is
    // not mirrored by convention — RESEARCH.md Anti-Patterns).
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

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    if (!blob) {
      setError("Couldn't capture the photo.");
      setStatus("error");
      return;
    }

    setStatus("uploading");
    setError(null);
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

  return (
    <div className="flex flex-col items-center gap-4">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        data-testid="camera-preview"
        className="aspect-video w-full max-w-md rounded-md bg-black object-cover"
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        onClick={handleCapture}
        disabled={status === "starting" || status === "uploading"}
      >
        {status === "uploading" ? "Uploading…" : "Capture Photo"}
      </Button>
    </div>
  );
}
