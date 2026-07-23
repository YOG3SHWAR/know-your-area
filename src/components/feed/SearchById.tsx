"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Best-effort extraction of the {id} segment from a pasted full permalink
// URL (".../c/{id}"); otherwise the raw input is treated as the literal ID
// (D-13, UI-SPEC long-text consideration).
const PERMALINK_SEGMENT_RE = /\/c\/([^/?#]+)/;

function extractId(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(PERMALINK_SEGMENT_RE);
  return match ? match[1] : trimmed;
}

// FEED-03: search-by-ID box on the feed page. Checks existence (via a GET
// against the permalink page itself, which 404s for a missing/malformed ID
// per src/app/c/[id]/not-found.tsx) BEFORE navigating, so an unknown ID
// shows the inline not-found copy and stays on the page rather than
// navigating into a dead permalink (UI-SPEC: "stays on page, no navigation
// on failure").
export function SearchById() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = extractId(value);
    if (!id) return;

    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/c/${encodeURIComponent(id)}`, { method: "GET" });
      if (res.ok) {
        router.push(`/c/${id}`);
      } else {
        setError("We couldn't find a report with that ID. Check the code and try again.");
      }
    } catch {
      setError("We couldn't find a report with that ID. Check the code and try again.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          placeholder="Enter a report ID (e.g. KYA-7F3X2)"
          aria-label="Search by report ID"
          className="focus-visible:border-amber-500 focus-visible:ring-amber-500/50"
        />
        <Button type="submit" disabled={checking || value.trim().length === 0}>
          Search
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </form>
  );
}
