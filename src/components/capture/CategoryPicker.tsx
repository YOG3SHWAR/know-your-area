"use client";

import { Droplet, Lightbulb, TrafficCone, Trash2, TriangleAlert } from "lucide-react";
import type { ComponentType } from "react";

import { CATEGORIES, type Category } from "@/types/complaint";

const CATEGORY_ICONS: Record<Category, ComponentType<{ className?: string }>> = {
  pothole: TriangleAlert,
  garbage: Trash2,
  streetlight: Lightbulb,
  water: Droplet,
  traffic_light: TrafficCone,
};

type CategoryPickerProps = {
  value: Category | null;
  onChange: (value: Category) => void;
};

// The 5 fixed categories (UI-SPEC Copywriting Contract). Amber accent is
// reserved for the selected chip only; 44px minimum touch target overrides
// the 8-point spacing scale per UI-SPEC's mobile tap-target exception.
export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">What&apos;s the problem?</p>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c.value];
          const selected = value === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => onChange(c.value)}
              aria-pressed={selected}
              className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-2 text-sm transition-colors ${
                selected
                  ? "border-amber-500 bg-amber-50 text-amber-900"
                  : "border-input bg-zinc-100 text-zinc-900"
              }`}
            >
              <Icon className="size-4" />
              {c.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
