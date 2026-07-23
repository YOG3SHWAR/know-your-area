import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import type { Category, FeedItem } from "@/types/complaint";

function photoUrl(photoKey: string): string {
  return `${process.env.R2_PUBLIC_BASE_URL}/${photoKey}`;
}

export type FeedPage = {
  items: FeedItem[];
  nextCursor: string | null;
};

// Opaque cursor: encodes the last row's sort key so the next page can pick
// up exactly where this one left off. `distanceM` is present only for
// nearbyFeed cursors — recentFeed cursors never carry it.
type FeedCursor = {
  createdAt: string;
  publicId: string;
  distanceM?: number;
};

function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(raw: string): FeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.createdAt !== "string" ||
      typeof parsed.publicId !== "string"
    ) {
      return null;
    }
    return parsed as FeedCursor;
  } catch {
    return null;
  }
}

type NearbyRow = {
  public_id: string;
  category: string;
  created_at: Date;
  photo_key: string;
  distance_m: number;
};

type RecentRow = {
  public_id: string;
  category: string;
  created_at: Date;
  photo_key: string;
};

// RESEARCH.md Pattern 2 / FEED-01: distance-sorted proximity feed. Selects
// only external-safe columns (public_id, category, created_at, photo_key) —
// never submitter_id or the internal serial id (T-01-01 IDOR mitigation).
// Ordering has a deterministic tie-break (distance ASC, created_at DESC,
// public_id ASC) and the cursor's row-comparison mirrors that ORDER BY
// exactly, so pagination never skips or duplicates a row even when two
// complaints are equidistant.
export async function nearbyFeed({
  lng,
  lat,
  limit,
  cursor,
}: {
  lng: number;
  lat: number;
  limit: number;
  cursor?: string;
}): Promise<FeedPage> {
  const point = sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`;
  const decoded = cursor ? decodeCursor(cursor) : null;

  const cursorFilter =
    decoded && decoded.distanceM !== undefined
      ? sql`AND (
          distance_m > ${decoded.distanceM}
          OR (distance_m = ${decoded.distanceM} AND created_at < ${new Date(decoded.createdAt)})
          OR (distance_m = ${decoded.distanceM} AND created_at = ${new Date(decoded.createdAt)} AND public_id > ${decoded.publicId})
        )`
      : sql``;

  const rows = await db.execute<NearbyRow>(sql`
    SELECT public_id, category, created_at, photo_key, distance_m FROM (
      SELECT
        public_id,
        category,
        created_at,
        photo_key,
        ST_Distance(location::geography, ${point}::geography) AS distance_m
      FROM complaints
    ) AS feed
    WHERE true ${cursorFilter}
    ORDER BY distance_m ASC, created_at DESC, public_id ASC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => ({
      publicId: row.public_id,
      category: row.category as Category,
      distanceM: Number(row.distance_m),
      createdAt: new Date(row.created_at),
      photoUrl: photoUrl(row.photo_key),
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: new Date(last.created_at).toISOString(),
            publicId: last.public_id,
            distanceM: Number(last.distance_m),
          })
        : null,
  };
}

// D-07 fallback: recency order when the visitor's location is
// unavailable/denied — never a query against a fake (0,0) coordinate. Same
// external-safe column selection and cursor discipline as nearbyFeed.
export async function recentFeed({
  limit,
  cursor,
}: {
  limit: number;
  cursor?: string;
}): Promise<FeedPage> {
  const decoded = cursor ? decodeCursor(cursor) : null;

  const cursorFilter = decoded
    ? sql`AND (
        created_at < ${new Date(decoded.createdAt)}
        OR (created_at = ${new Date(decoded.createdAt)} AND public_id > ${decoded.publicId})
      )`
    : sql``;

  const rows = await db.execute<RecentRow>(sql`
    SELECT public_id, category, created_at, photo_key
    FROM complaints
    WHERE true ${cursorFilter}
    ORDER BY created_at DESC, public_id ASC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows.at(-1);

  return {
    items: pageRows.map((row) => ({
      publicId: row.public_id,
      category: row.category as Category,
      distanceM: null,
      createdAt: new Date(row.created_at),
      photoUrl: photoUrl(row.photo_key),
    })),
    nextCursor:
      hasMore && last
        ? encodeCursor({
            createdAt: new Date(last.created_at).toISOString(),
            publicId: last.public_id,
          })
        : null,
  };
}
