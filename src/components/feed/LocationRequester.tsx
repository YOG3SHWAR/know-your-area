"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// Requests the visitor's live location once on first load and encodes it
// into the URL so the server component (src/app/page.tsx) can run the
// proximity-sorted `nearbyFeed` query. If permission is denied or the
// browser has no geolocation support, this is a no-op — the feed keeps
// rendering its recency-sorted fallback rather than blocking browsing
// (D-07; never a fake (0,0) coordinate).
export function LocationRequester({ hasLocation }: { hasLocation: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (hasLocation) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("lat", String(position.coords.latitude));
        next.set("lng", String(position.coords.longitude));
        router.replace(`/?${next.toString()}`);
      },
      () => {
        // Denied/unavailable — keep the recency fallback (D-07).
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation]);

  return null;
}
