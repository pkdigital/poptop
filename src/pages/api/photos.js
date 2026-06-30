export const prerender = false;

const EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// POST multipart { ref, file, submitter? } -> stores image in R2, records row.
export async function POST({ request, locals }) {
  const env = locals.runtime.env;
  if (!env.PHOTOS) return Response.json({ error: "Photo uploads aren't available yet." }, { status: 503 });

  let form;
  try { form = await request.formData(); } catch { return Response.json({ error: "bad form data" }, { status: 400 }); }
  const ref = String(form.get("ref") || "").trim();
  const submitter = String(form.get("submitter") || "").trim().slice(0, 60) || null;
  const file = form.get("file");

  if (!ref || !file || typeof file === "string") {
    return Response.json({ error: "ref and an image file are required" }, { status: 400 });
  }
  const ext = EXT[file.type];
  if (!ext) return Response.json({ error: "Image must be JPEG, PNG or WebP" }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "Max image size is 8 MB" }, { status: 400 });

  const key = `${ref.replace(/[^a-z0-9]/gi, "_")}-${crypto.randomUUID()}.${ext}`;
  await env.PHOTOS.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  await env.DB.prepare(
    "INSERT INTO place_photos (id, place_ref, key, status, submitter, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), ref, key, "approved", submitter, new Date().toISOString()).run();

  return Response.json({ ok: true, url: `/api/photo/${key}` });
}
