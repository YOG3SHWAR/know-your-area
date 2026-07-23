import Link from "next/link";

// Rendered by notFound() in ./page.tsx for a malformed/nonexistent
// public_id — the exact UI-SPEC copy, never Next's generic 404 page, and
// never a crash (must_haves). Segment-scoped to /c/[id] only, so it doesn't
// leak into /capture or the feed's own loading/error states.
export default function ComplaintNotFound() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-base text-destructive">
        This report doesn&apos;t exist or may have been removed.
      </p>
      <Link href="/" className="text-sm font-medium text-amber-600 underline">
        Back to feed
      </Link>
    </div>
  );
}
