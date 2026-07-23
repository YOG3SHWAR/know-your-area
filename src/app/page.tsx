import Link from "next/link";
import { Suspense } from "react";

import { FeedList } from "@/components/feed/FeedList";
import { LocationRequester } from "@/components/feed/LocationRequester";
import { SearchById } from "@/components/feed/SearchById";
import { Skeleton } from "@/components/ui/skeleton";
import { nearbyFeed, recentFeed } from "@/lib/feed";

const FEED_LIMIT = 20;

// UI-SPEC: initial SSR load shows skeleton feed cards. This intentionally
// mirrors FeedCard's real layout (photo tile + two meta rows) so the swap
// from skeleton -> real content doesn't reflow the page.
function FeedSkeleton() {
  return (
    <ul className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="overflow-hidden rounded-md border">
          <Skeleton className="aspect-video w-full rounded-none" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-40" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-1 py-12 text-center">
      <p className="text-lg font-semibold">No reports near you yet</p>
      <p className="text-sm text-muted-foreground">Reports from your area will show up here.</p>
    </div>
  );
}

function FeedErrorBanner() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-center">
      <p className="text-sm text-destructive">
        Couldn&apos;t load reports. Check your connection and try again.
      </p>
      <Link href="/" className="text-sm font-medium text-amber-600 underline">
        Retry
      </Link>
    </div>
  );
}

// SSR data-fetching boundary, separated from Home so it can be wrapped in a
// <Suspense> that streams FeedSkeleton first (UI-SPEC "loading" state) and
// so a query failure can be caught locally without taking down the header
// or the search box above it (UI-SPEC "error" state — never blanks the
// feed).
async function FeedContent({
  hasLocation,
  lat,
  lng,
}: {
  hasLocation: boolean;
  lat?: number;
  lng?: number;
}) {
  let page;
  try {
    page =
      hasLocation && lat !== undefined && lng !== undefined
        ? await nearbyFeed({ lng, lat, limit: FEED_LIMIT })
        : await recentFeed({ limit: FEED_LIMIT });
  } catch (err) {
    console.error("feed query failed", err);
    return <FeedErrorBanner />;
  }

  if (page.items.length === 0) {
    return <EmptyState />;
  }

  return (
    <FeedList
      initialItems={page.items}
      initialCursor={page.nextCursor}
      hasLocation={hasLocation}
      lat={lat}
      lng={lng}
    />
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const params = await searchParams;
  const lat = params.lat !== undefined ? Number(params.lat) : undefined;
  const lng = params.lng !== undefined ? Number(params.lng) : undefined;
  const hasLocation = lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <LocationRequester hasLocation={hasLocation} />
      <h1 className="text-2xl font-semibold">Know Your Area</h1>
      <SearchById />
      {/* Re-mounting the Suspense boundary (via `key`) on the
          recency->proximity transition re-shows FeedSkeleton for that
          swap, not just the very first paint. */}
      <Suspense key={hasLocation ? `${lat}:${lng}` : "recent"} fallback={<FeedSkeleton />}>
        <FeedContent hasLocation={hasLocation} lat={lat} lng={lng} />
      </Suspense>
    </div>
  );
}
