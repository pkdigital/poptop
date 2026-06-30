// AI moderation for community submissions (and reusable for reviews).
// Uses Workers AI when available; degrades to manual-review ("pending") so the
// pipeline never blocks if AI is unavailable or errors.

const MODEL = "@cf/meta/llama-3.1-8b-instruct";

const SYSTEM =
  "You are a strict but fair content moderator for a UK motorhome/campervan " +
  "stopover directory. Approve genuine places to stop overnight or refill " +
  "(pub stopovers, driveways, aires, campsites, water points, waste/Elsan " +
  "disposal). Reject spam, adverts, abuse, hate, gibberish, personal/contact " +
  "data dumps, or anything irrelevant. If unsure, choose review. " +
  'Reply with ONLY strict JSON: {"verdict":"approve|reject|review","reason":"short reason"}.';

export async function moderateListing(env, listing) {
  if (!env || !env.AI) {
    return { status: "pending", score: null, reason: "AI unavailable — queued for manual review" };
  }

  const user =
    `Name: ${listing.name}\n` +
    `Type: ${listing.type}\n` +
    `Description: ${listing.description || "(none)"}`;

  try {
    const out = await env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user },
      ],
      max_tokens: 200,
      temperature: 0,
    });

    const text = out?.response ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : null;
    const verdict = parsed?.verdict;
    const reason = (parsed?.reason || "").slice(0, 200);

    if (verdict === "approve") return { status: "approved", score: 1, reason };
    if (verdict === "reject") return { status: "rejected", score: 0, reason };
    return { status: "pending", score: 0.5, reason: reason || "Uncertain — manual review" };
  } catch (err) {
    return { status: "pending", score: null, reason: "Moderation error — queued for manual review" };
  }
}
