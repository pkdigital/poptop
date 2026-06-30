// Browser-side auth client. baseURL is inferred from window.location, so it works
// in dev and prod without config. Use from client scripts / islands, e.g.:
//   import { signIn } from "../lib/auth-client";
//   signIn.social({ provider: "google", callbackURL: "/explore" });
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient();
export const { signIn, signOut, useSession, getSession } = authClient;
