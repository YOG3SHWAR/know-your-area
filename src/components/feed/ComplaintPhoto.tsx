"use client";

import { Droplet, Lightbulb, TrafficCone, Trash2, TriangleAlert } from "lucide-react";
import Image from "next/image";
import { useState, type ComponentType } from "react";

import { type Category } from "@/types/complaint";

// Copied verbatim from FeedCard.tsx (same 5 categories, same icons, same
// tile classes) rather than shared-extracted, so this point-fix (G-01-WR-08)
// never risks touching the feed's already-working fallback.
const CATEGORY_ICONS: Record<Category, ComponentType<{ className?: string }>> = {
  pothole: TriangleAlert,
  garbage: Trash2,
  streetlight: Lightbulb,
  water: Droplet,
  traffic_light: TrafficCone,
};

const CATEGORY_TILE_STYLES: Record<Category, string> = {
  pothole: "bg-orange-100 text-orange-700",
  garbage: "bg-emerald-100 text-emerald-700",
  streetlight: "bg-yellow-100 text-yellow-700",
  water: "bg-blue-100 text-blue-700",
  traffic_light: "bg-violet-100 text-violet-700",
};

// G-01-WR-08: gives the permalink page the same photo-404 -> category-tile
// graceful degradation FeedCard already has, instead of a bare broken-image
// box on a publicly-shared link. The permalink page is an async Server
// Component, so this stateful onError fallback must live in its own client
// child component.
export function ComplaintPhoto({
  src,
  category,
  alt,
}: {
  src: string;
  category: Category;
  alt: string;
}) {
  const [imgError, setImgError] = useState(false);
  const Icon = CATEGORY_ICONS[category];

  return (
    <div
      className={`relative aspect-video w-full ${
        imgError ? CATEGORY_TILE_STYLES[category] : "bg-zinc-100"
      } flex items-center justify-center`}
      data-testid={imgError ? "photo-fallback" : undefined}
    >
      {imgError ? (
        <Icon className="size-10" aria-hidden />
      ) : (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          className="object-cover"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}
