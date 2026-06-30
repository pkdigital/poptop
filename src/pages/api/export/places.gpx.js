import { getAllPlaces, toGPX } from "../../../lib/export.mjs";

export const prerender = false;

export async function GET({ locals }) {
  const rows = await getAllPlaces(locals.runtime.env.DB);
  return new Response(toGPX(rows), {
    headers: {
      "content-type": "application/gpx+xml",
      "content-disposition": 'attachment; filename="poptop-uk-stopovers.gpx"',
      "cache-control": "public, max-age=3600",
    },
  });
}
