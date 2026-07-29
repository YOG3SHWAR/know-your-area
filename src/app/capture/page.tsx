import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CaptureClient } from "@/components/capture/CaptureClient";
import { auth } from "@/lib/auth";

// D-04/D-05: this is a Server Component (no "use client") — the session
// check + redirect run entirely server-side, BEFORE any client component in
// the tree mounts. This structurally guarantees an anonymous visitor never
// reaches CaptureClient, so no camera/GPS permission prompt can ever fire
// for them (RESEARCH.md Pattern 3). auth.api.getSession() does a real
// DB-backed session lookup — never a cookie-presence-only check (T-02-01).
export default async function CapturePage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/login?callbackUrl=/capture");
  }

  return <CaptureClient />;
}
