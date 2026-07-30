"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

// Official Google "G" logomark (multi-color, static inline SVG) — UI-SPEC
// Design System: not a lucide icon, ships as a small local asset since
// Google doesn't publish this in any icon set the project already uses.
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const error = searchParams.get("error");
  const [redirecting, setRedirecting] = useState(false);

  function handleSignIn() {
    // Set the disabled/loading state BEFORE the async signIn call — this
    // (not a callback after the promise resolves) is what prevents a
    // double-invoke of authClient.signIn.social on a slow network
    // (UI-SPEC loading state). On success the browser navigates away to
    // Google before this promise ever settles, so resetting `redirecting`
    // only matters on the failure path (network error, or better-auth's
    // {error} result) — without it the button stays stuck disabled forever.
    setRedirecting(true);
    authClient.signIn.social({ provider: "google", callbackURL: callbackUrl }).then(
      ({ error }) => {
        if (error) setRedirecting(false);
      },
      () => setRedirecting(false),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 p-6 pt-8">
      <div className="flex w-full flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">Sign in to report a problem</h1>
        <p className="text-base text-muted-foreground">
          Browsing nearby reports is always open. Signing in with Google is only needed to submit
          a new report.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          Something went wrong signing you in. Please try again.
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        onClick={handleSignIn}
        disabled={redirecting}
        className="h-11 w-full gap-2 border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 hover:text-neutral-900"
      >
        {redirecting ? (
          <>
            <Loader2 className="size-[18px] animate-spin" />
            Redirecting to Google…
          </>
        ) : (
          <>
            <GoogleLogo />
            Sign in with Google
          </>
        )}
      </Button>

      <Link
        href="/"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        Continue browsing without signing in
      </Link>
    </div>
  );
}

// useSearchParams() requires a Suspense boundary (Next.js App Router client
// component convention) — the inner component owns all state/hooks, this
// default export is just the boundary wrapper.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}
