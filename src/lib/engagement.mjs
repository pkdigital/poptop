// Votes + reviews for place detail pages, keyed by place_ref ("osm/node/123"
// or "community/<uuid>").

export async function getFeedback(DB, ref) {
  const r = await DB.prepare(
    `SELECT up, down FROM place_feedback WHERE place_ref = ?`
  ).bind(ref).first();
  return { up: r?.up || 0, down: r?.down || 0 };
}

export async function addVote(DB, ref, vote) {
  const up = vote === "up" ? 1 : 0;
  const down = vote === "down" ? 1 : 0;
  await DB.prepare(
    `INSERT INTO place_feedback (place_ref, up, down, updated_at) VALUES (?, ?, ?, ?)` +
      ` ON CONFLICT(place_ref) DO UPDATE SET up = up + excluded.up,` +
      ` down = down + excluded.down, updated_at = excluded.updated_at`
  ).bind(ref, up, down, new Date().toISOString()).run();
  return getFeedback(DB, ref);
}

export async function getApprovedReviews(DB, ref) {
  const r = await DB.prepare(
    `SELECT author, body, rating, created_at FROM reviews` +
      ` WHERE place_ref = ? AND status = 'approved' ORDER BY created_at DESC LIMIT 100`
  ).bind(ref).all();
  return r.results;
}

export async function addReview(DB, { ref, author, body, rating, status = "pending", reason }) {
  const id = crypto.randomUUID();
  await DB.prepare(
    `INSERT INTO reviews (id, place_ref, author, body, rating, status, mod_reason, created_at)` +
      ` VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, ref, author || null, body, rating || null, status, reason || null, new Date().toISOString())
    .run();
  return id;
}
