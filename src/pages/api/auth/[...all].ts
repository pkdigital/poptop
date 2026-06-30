// Catch-all that hands every /api/auth/* request to Better Auth (sign-in, OAuth
// callbacks, session, sign-out). Auth is built per-request from the runtime D1 binding.
import type { APIRoute } from "astro";
import { getAuth } from "../../../lib/auth";

export const ALL: APIRoute = (ctx) => getAuth(ctx.locals.runtime.env).handler(ctx.request);
