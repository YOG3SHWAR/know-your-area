"use client";

import { Droplet, Lightbulb, TrafficCone, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, type ComponentType } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { formatDistance, formatRelativeTime } from "@/lib/distance";
import { CATEGORIES, type Category, type FeedItem } from "@/types/complaint";

const CATEGORY_ICONS: Record<Category, ComponentType<{ className?: string }>> = {
  pothole: TriangleAlert,
  garbage: Trash2,
  streetlight: Lightbulb,
  water: Droplet,
  traffic_light: TrafficCone,
};

// Distinct muted hues per category for the broken-photo placeholder tile
// (UI-SPEC backstop: forced-404 image URL -> category tile, not a broken
// image icon). Never amber (reserved for CTAs/selected states) and never
// red (reserved for destructive/error states).
const CATEGORY_TILE_STYLES: Record<Category, string> = {
  pothole: "bg-orange-100 text-orange-700",
  garbage: "bg-emerald-100 text-emerald-700",
  streetlight: "bg-yellow-100 text-yellow-700",
  water: "bg-blue-100 text-blue-700",
  traffic_light: "bg-violet-100 text-violet-700",
};

function categoryLabel(category: Category): string {
  return CATEGORIES.find((c) => c.value === category)?.label ?? category;
}

// FEED-01/D-08 feed card: photo (with its burned-in overlay), category
// badge, raw distance (hidden when the visitor's location is unavailable,
// D-07), relative timestamp, and the generic poster label (D-06 — never a
// username/submitter_id). Wrapped in a Link to /c/{publicId} so the card is
// itself the discovery path to the shareable permalink (FEED-04).
export function FeedCard({ item }: { item: FeedItem }) {
  const [imgError, setImgError] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const Icon = CATEGORY_ICONS[item.category];

  return (
    <li className="overflow-hidden rounded-md border">
      <Link href={`/c/${item.publicId}`} className="block">
        <div
          className={`relative aspect-video w-full ${
            imgError ? CATEGORY_TILE_STYLES[item.category] : "bg-zinc-100"
          } flex items-center justify-center`}
        >
          {imgError ? (
            <Icon className="size-10" aria-hidden />
          ) : (
            <>
              {!imgLoaded && <Skeleton className="absolute inset-0" />}
              <Image
                src={item.photoUrl}
                alt={categoryLabel(item.category)}
                fill
                unoptimized
                className={`object-cover transition-opacity ${imgLoaded ? "opacity-100" : "opacity-0"}`}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
              />
            </>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <Icon className="size-4" aria-hidden />
              {categoryLabel(item.category)}
            </span>
            {item.distanceM != null && (
              <span className="text-muted-foreground">{formatDistance(item.distanceM)}</span>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Reported by a nearby resident</span>
            <span>{formatRelativeTime(item.createdAt)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}
