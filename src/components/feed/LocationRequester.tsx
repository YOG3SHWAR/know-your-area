"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Requests the visitor's live location once on first load and encodes it
// into the URL so the mounting server component (src/app/page.tsx's feed,
// or src/app/c/[id]/page.tsx's permalink) can run its proximity-aware
// query. Replaces the *current* pathname (via usePathname) rather than a
// hardcoded "/", since both pages reuse this component — replacing a fixed
// "/" would silently bounce a visitor on /c/{id} back to the feed. If
// permission is denied or the browser has no geolocation support, this is a
// no-op — the page keeps rendering its recency-sorted/no-distance fallback
// rather than blocking browsing (D-07; never a fake (0,0) coordinate).
export function LocationRequester({ hasLocation }: { hasLocation: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (hasLocation) return;
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = new URLSearchParams(searchParams.toString());
        next.set("lat", String(position.coords.latitude));
        next.set("lng", String(position.coords.longitude));
        router.replace(`${pathname}?${next.toString()}`);
      },
      () => {
        // Denied/unavailable — keep the recency fallback (D-07).
      },
      { enableHighAccuracy: true, timeout: 5000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, pathname]);

  return null;
}
