import { desc, sql } from "drizzle-orm";
import Image from "next/image";

import { LocationRequester } from "@/components/feed/LocationRequester";
import { db } from "@/lib/db/client";
import { complaints } from "@/lib/db/schema";
import { CATEGORIES, type Category, type FeedItem } from "@/types/complaint";

const FEED_LIMIT = 20;

function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}

// SSR proximity feed query (RESEARCH.md Pattern 2 / FEED-01). Drizzle's
// `geometry` column is planar/degree-based, so every distance computation
// casts `::geography` inline via raw sql to get meter-accurate results, and
// ordering uses the `<->` KNN operator so the GiST index is used.
async function nearbyFeed(lng: number, lat: number, limit: number): Promise<FeedItem[]> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  const rows = await db
    .select({
      publicId: complaints.publicId,
      category: complaints.category,
      createdAt: complaints.createdAt,
      photoKey: complaints.photoKey,
      distanceM: sql<number>`ST_Distance(${complaints.location}::geography, ${point}::geography)`,
    })
    .from(complaints)
    .orderBy(sql`${complaints.location} <-> ${point}`)
    .limit(limit);

  return rows.map((row) => ({
    publicId: row.publicId,
    category: row.category as Category,
    distanceM: row.distanceM,
    createdAt: row.createdAt,
    photoUrl: photoUrl(row.photoKey),
  }));
}

// D-07 fallback: if the visitor's location is unavailable/denied, the feed
// still renders — recency order, distance hidden — never a query against a
// fake (0,0) coordinate.
async function recentFeed(limit: number): Promise<FeedItem[]> {
  const rows = await db
    .select({
      publicId: complaints.publicId,
      category: complaints.category,
      createdAt: complaints.createdAt,
      photoKey: complaints.photoKey,
    })
    .from(complaints)
    .orderBy(desc(complaints.createdAt))
    .limit(limit);

  return rows.map((row) => ({
    publicId: row.publicId,
    category: row.category as Category,
    distanceM: null,
    createdAt: row.createdAt,
    photoUrl: photoUrl(row.photoKey),
  }));
}

function formatDistance(distanceM: number): string {
  if (distanceM < 1000) return `${Math.round(distanceM)} m away`;
  return `${(distanceM / 1000).toFixed(1)} km away`;
}

function formatRelativeTime(date: Date): string {
  const diffMin = Math.round((Date.now() - new Date(date).getTime()) / 60_000);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return `${Math.round(diffH / 24)}d ago`;
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

  const items = hasLocation ? await nearbyFeed(lng, lat, FEED_LIMIT) : await recentFeed(FEED_LIMIT);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <LocationRequester hasLocation={hasLocation} />
      <h1 className="text-2xl font-semibold">Know Your Area</h1>

      {items.length === 0 ? (
        <div className="flex flex-col gap-1 py-12 text-center">
          <p className="text-lg font-semibold">No reports near you yet</p>
          <p className="text-sm text-muted-foreground">
            Reports from your area will show up here.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((item) => (
            <li key={item.publicId} className="overflow-hidden rounded-md border">
              <div className="relative aspect-video w-full bg-zinc-100">
                <Image
                  src={item.photoUrl}
                  alt={categoryLabel(item.category)}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
              <div className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium">{categoryLabel(item.category)}</span>
                <span className="text-muted-foreground">
                  {item.distanceM != null
                    ? formatDistance(item.distanceM)
                    : formatRelativeTime(item.createdAt)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
