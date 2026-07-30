import { createAuthClient } from "better-auth/react";

// Browser SDK used by Plan 02's /login "Sign in with Google" button (and any
// future client component that needs `useSession()`/`signOut()` etc.).
export const authClient = createAuthClient();
