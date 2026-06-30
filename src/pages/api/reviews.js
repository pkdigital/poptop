import { addReview } from "../../lib/engagement.mjs";

export const prerender = false;

// POST { ref, author?, body, rating? } -> stored as pending for moderation.
// (Workers AI moderation hooks in here next: classify, then set status.)
export async function POST({ request, locals }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }

  const ref = String(body.ref || "").trim();
  const text = String(body.body || "").trim();
  const author = String(body.author || "").trim().slice(0, 60) || null;
  let rating = Number(body.rating);
  if (!(rating >= 1 && rating <= 5)) rating = null;

  if (!ref || text.length < 3) {
    return Response.json({ error: "ref and a review body are required" }, { status: 400 });
  }
  if (text.length > 2000) {
    return Response.json({ error: "review too long (2000 char max)" }, { status: 400 });
  }

  const id = await addReview(locals.runtime.env.DB, {
    ref, author, body: text, rating, status: "pending",
  });
  return Response.json({ ok: true, id, status: "pending" });
}
