import { getAllPlaces, toCSV } from "../../../lib/export.mjs";

export const prerender = false;

export async function GET({ locals }) {
  const rows = await getAllPlaces(locals.runtime.env.DB);
  return new Response(toCSV(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="poptop-uk-stopovers.csv"',
      "cache-control": "public, max-age=3600",
    },
  });
}
