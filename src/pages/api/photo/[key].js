export const prerender = false;

// GET /api/photo/<key> — stream a community photo from R2 (immutable, cached).
export async function GET({ params, locals }) {
  const env = locals.runtime.env;
  const obj = env.PHOTOS ? await env.PHOTOS.get(params.key) : null;
  if (!obj) return new Response(null, { status: 404 });
  return new Response(obj.body, {
    headers: {
      "content-type": obj.httpMetadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
