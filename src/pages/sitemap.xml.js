import { TOWNS } from "../data/towns.mjs";

export const prerender = false;

export async function GET({ site }) {
  const base = (site || new URL("https://poptop.uk")).origin;
  const urls = [
    `${base}/`,
    ...TOWNS.map((t) => `${base}/motorhome-stopovers/${t.slug}`),
  ];
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") +
    `\n</urlset>\n`;
  return new Response(body, { headers: { "content-type": "application/xml" } });
}
