"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FeedCard } from "@/components/feed/FeedCard";
import type { FeedItem } from "@/types/complaint";

type FeedListProps = {
  initialItems: FeedItem[];
  initialCursor: string | null;
  hasLocation: boolean;
  lat?: number;
  lng?: number;
};

// D-09 infinite scroll: an IntersectionObserver sentinel calls the
// cursor-paginated /api/feed endpoint. When the server returns a null
// cursor, the sentinel is unmounted entirely — no more observing, no
// infinite spinner at the end of the list (must_haves: "reaching the end
// stops fetching").
export function FeedList({ initialItems, initialCursor, hasLocation, lat, lng }: FeedListProps) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Re-sync when the server re-renders with a new first page (e.g. once
  // LocationRequester attaches lat/lng and the SSR proximity query re-runs).
  useEffect(() => {
    setItems(initialItems);
    setCursor(initialCursor);
  }, [initialItems, initialCursor]);

  const fetchNext = useCallback(
    async (nextCursor: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ cursor: nextCursor });
        if (hasLocation && lat !== undefined && lng !== undefined) {
          params.set("lat", String(lat));
          params.set("lng", String(lng));
        }
        const res = await fetch(`/api/feed?${params.toString()}`);
        if (!res.ok) return;
        const page: { items: FeedItem[]; nextCursor: string | null } = await res.json();
        setItems((prev) => [...prev, ...page.items]);
        setCursor(page.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [hasLocation, lat, lng],
  );

  useEffect(() => {
    if (!cursor) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) {
        fetchNext(cursor);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, fetchNext]);

  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <FeedCard key={item.publicId} item={item} />
      ))}
      {cursor && (
        <div ref={sentinelRef} className="flex justify-center py-4">
          {loading && <span className="text-sm text-muted-foreground">Loading more…</span>}
        </div>
      )}
    </ul>
  );
}
