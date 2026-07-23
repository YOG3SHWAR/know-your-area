"use client";

import { useEffect, useState } from "react";

// D-03 / RESEARCH.md Pitfall 5: once a user denies camera or location
// permission, calling getUserMedia/getCurrentPosition again does NOT
// re-trigger the browser's permission prompt — the app would otherwise
// silently keep failing. PermissionGate proactively queries the Permissions
// API for both `camera` and `geolocation` before the capture flow ever
// starts, and hard-blocks with settings-specific guidance the moment either
// is `denied` — no retry-submit path, no degraded fallback (SUBM-01
// anti-abuse: the live in-app camera is the only way to produce a
// submission photo).
type GateState = "checking" | "ok" | "camera-denied" | "location-denied";

const CAMERA_DENIED_COPY =
  "Camera access is off. This app only accepts photos taken live in the app, so we can't continue without it. Turn on camera access in your browser's site settings, then reload this page.";

const LOCATION_DENIED_COPY =
  "Location access is off. Every report needs your live location to show up in the nearby feed, so we can't continue without it. Turn on location access in your browser's site settings, then reload this page.";

export function PermissionGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      if (!navigator.permissions?.query) {
        // Some browsers don't implement the Permissions API for these
        // names at all (notably Safari for "camera") — fail open and let
        // the capture flow's own getUserMedia/geolocation calls surface a
        // denial instead of false-blocking a browser we can't introspect.
        if (!cancelled) setState("ok");
        return;
      }

      try {
        const [camera, location] = await Promise.all([
          navigator.permissions.query({ name: "camera" }),
          navigator.permissions.query({ name: "geolocation" }),
        ]);
        if (cancelled) return;

        const evaluate = () => {
          if (camera.state === "denied") {
            setState("camera-denied");
          } else if (location.state === "denied") {
            setState("location-denied");
          } else {
            setState("ok");
          }
        };
        evaluate();

        // A user can flip a permission in browser settings while this tab
        // stays open — keep the hard block reactive rather than requiring
        // a manual reload to detect the change.
        camera.onchange = evaluate;
        location.onchange = evaluate;
      } catch {
        if (!cancelled) setState("ok");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "checking") {
    return null;
  }

  if (state === "camera-denied" || state === "location-denied") {
    return (
      <div
        className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center"
        data-testid="permission-hard-block"
      >
        <p className="text-base text-destructive">
          {state === "camera-denied" ? CAMERA_DENIED_COPY : LOCATION_DENIED_COPY}
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
