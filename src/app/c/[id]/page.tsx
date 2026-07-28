import { sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import Link from "next/link";

import { ComplaintPhoto } from "@/components/feed/ComplaintPhoto";
import { LocationRequester } from "@/components/feed/LocationRequester";
import { db } from "@/lib/db/client";
import { formatDistance, formatRelativeTime } from "@/lib/distance";
import { CATEGORIES, type Category } from "@/types/complaint";

function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}

type Row = {
  public_id: string;
  category: string;
  created_at: Date;
  photo_key: string;
  distance_m: number | null;
};

// FEED-04 SSR permalink page, looked up by the opaque public_id (unique
// index) — never the internal serial id, never a geo/radius query
// (RESEARCH.md Architecture Diagram step 13; T-01-01 IDOR mitigation).
// Reuses LocationRequester so the page can show distance when a visitor
// location is available, same as the feed card (must_haves: "full photo +
// category + distance/timestamp").
export default async function ComplaintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const lat = sp.lat !== undefined ? Number(sp.lat) : undefined;
  const lng = sp.lng !== undefined ? Number(sp.lng) : undefined;
  const hasLocation = lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng);

  const rows = hasLocation
    ? await db.execute<Row>(sql`
        SELECT public_id, category, created_at, photo_key,
          ST_Distance(location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
        FROM complaints
        WHERE public_id = ${id}
        LIMIT 1
      `)
    : await db.execute<Row>(sql`
        SELECT public_id, category, created_at, photo_key, NULL::double precision AS distance_m
        FROM complaints
        WHERE public_id = ${id}
        LIMIT 1
      `);

  const row = rows[0];

  // Malformed/nonexistent id -> the dedicated not-found.tsx boundary, never
  // a generic 500/crash (must_haves).
  if (!row) {
    notFound();
  }

  const category = row.category as Category;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-6">
      <LocationRequester hasLocation={hasLocation} />
      <div className="overflow-hidden rounded-md border">
        <ComplaintPhoto
          src={photoUrl(row.photo_key)}
          category={category}
          alt={categoryLabel(category)}
        />
        <div className="flex flex-col gap-1 p-3 text-sm">
          <span className="font-medium">{categoryLabel(category)}</span>
          <span className="text-muted-foreground">
            {row.distance_m != null ? `${formatDistance(row.distance_m)} · ` : ""}
            {formatRelativeTime(row.created_at)}
          </span>
          <span className="text-muted-foreground">Reported by a nearby resident</span>
        </div>
      </div>
      <Link href="/" className="text-sm font-medium text-amber-600 underline">
        Back to feed
      </Link>
    </div>
  );
}
