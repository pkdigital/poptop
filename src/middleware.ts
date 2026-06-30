// Populates Astro.locals.user / .session on every rendered request so .astro pages
// and endpoints can gate on auth. With session cookie-cache enabled, anonymous SEO
// traffic (the bulk of our requests) short-circuits without a D1 read.
import { defineMiddleware } from "astro:middleware";
import { getAuth } from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const env = context.locals.runtime?.env;
  // env/DB is absent in some build-time / prerender contexts — fail open to anonymous.
  if (env?.DB) {
    const result = await getAuth(env).api.getSession({ headers: context.request.headers });
    context.locals.user = result?.user ?? null;
    context.locals.session = result?.session ?? null;
  } else {
    context.locals.user = null;
    context.locals.session = null;
  }
  return next();
});
