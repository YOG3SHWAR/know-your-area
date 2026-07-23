import { NextResponse } from "next/server";

import { nearbyFeed, recentFeed } from "@/lib/feed";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Cursor-paginated feed endpoint consumed by FeedList's infinite scroll.
// lat/lng are optional -> proximity sort when present, else recency (D-07).
// The visitor's lat/lng is used only to compute this request's ORDER BY —
// never persisted to a table or written to a log (T-01-05).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  const cursor = url.searchParams.get("cursor") ?? undefined;

  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(Math.floor(limitParam), MAX_LIMIT)
      : DEFAULT_LIMIT;

  const lat = latParam !== null ? Number(latParam) : undefined;
  const lng = lngParam !== null ? Number(lngParam) : undefined;
  const hasLocation =
    lat !== undefined && lng !== undefined && !Number.isNaN(lat) && !Number.isNaN(lng);

  try {
    const page = hasLocation
      ? await nearbyFeed({ lng: lng as number, lat: lat as number, limit, cursor })
      : await recentFeed({ limit, cursor });

    return NextResponse.json(page);
  } catch (err) {
    console.error("feed query failed", err);
    return NextResponse.json({ error: "Couldn't load reports." }, { status: 500 });
  }
}
