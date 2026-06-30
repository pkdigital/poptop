import { addVote } from "../../lib/engagement.mjs";

export const prerender = false;

// POST { ref, vote: "up" | "down" } -> updated counts
export async function POST({ request, locals }) {
  let body;
  try { body = await request.json(); } catch { body = {}; }
  const { ref, vote } = body;

  if (!ref || (vote !== "up" && vote !== "down")) {
    return Response.json({ error: "ref and vote (up|down) required" }, { status: 400 });
  }
  const counts = await addVote(locals.runtime.env.DB, ref, vote);
  return Response.json(counts);
}
