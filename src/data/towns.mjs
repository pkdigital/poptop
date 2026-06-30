// Seed gazetteer for programmatic SEO town pages. Each generates
// /motorhome-stopovers/<slug>. Start with high-intent touring towns; expand by
// appending rows (and later, auto-generate from a UK places dataset).

export const TOWNS = [
  { slug: "southampton", name: "Southampton", county: "Hampshire", lat: 50.9097, lng: -1.4044 },
  { slug: "portsmouth", name: "Portsmouth", county: "Hampshire", lat: 50.8198, lng: -1.0880 },
  { slug: "bournemouth", name: "Bournemouth", county: "Dorset", lat: 50.7192, lng: -1.8808 },
  { slug: "exeter", name: "Exeter", county: "Devon", lat: 50.7184, lng: -3.5339 },
  { slug: "plymouth", name: "Plymouth", county: "Devon", lat: 50.3755, lng: -4.1427 },
  { slug: "truro", name: "Truro", county: "Cornwall", lat: 50.2632, lng: -5.0510 },
  { slug: "newquay", name: "Newquay", county: "Cornwall", lat: 50.4129, lng: -5.0757 },
  { slug: "bristol", name: "Bristol", county: "Bristol", lat: 51.4545, lng: -2.5879 },
  { slug: "bath", name: "Bath", county: "Somerset", lat: 51.3811, lng: -2.3590 },
  { slug: "cheltenham", name: "Cheltenham", county: "Gloucestershire", lat: 51.8994, lng: -2.0783 },
  { slug: "oxford", name: "Oxford", county: "Oxfordshire", lat: 51.7520, lng: -1.2577 },
  { slug: "cambridge", name: "Cambridge", county: "Cambridgeshire", lat: 52.2053, lng: 0.1218 },
  { slug: "norwich", name: "Norwich", county: "Norfolk", lat: 52.6309, lng: 1.2974 },
  { slug: "york", name: "York", county: "North Yorkshire", lat: 53.9600, lng: -1.0873 },
  { slug: "harrogate", name: "Harrogate", county: "North Yorkshire", lat: 53.9919, lng: -1.5378 },
  { slug: "keswick", name: "Keswick", county: "Cumbria", lat: 54.6013, lng: -3.1347 },
  { slug: "windermere", name: "Windermere", county: "Cumbria", lat: 54.3807, lng: -2.9060 },
  { slug: "carlisle", name: "Carlisle", county: "Cumbria", lat: 54.8924, lng: -2.9320 },
  { slug: "edinburgh", name: "Edinburgh", county: "Midlothian", lat: 55.9533, lng: -3.1883 },
  { slug: "glasgow", name: "Glasgow", county: "Lanarkshire", lat: 55.8642, lng: -4.2518 },
  { slug: "fort-william", name: "Fort William", county: "Highland", lat: 56.8198, lng: -5.1052 },
  { slug: "inverness", name: "Inverness", county: "Highland", lat: 57.4778, lng: -4.2247 },
  { slug: "oban", name: "Oban", county: "Argyll and Bute", lat: 56.4152, lng: -5.4719 },
  { slug: "aberystwyth", name: "Aberystwyth", county: "Ceredigion", lat: 52.4140, lng: -4.0810 },
  { slug: "betws-y-coed", name: "Betws-y-Coed", county: "Conwy", lat: 53.0950, lng: -3.8009 },
  { slug: "tenby", name: "Tenby", county: "Pembrokeshire", lat: 51.6727, lng: -4.7036 },
  { slug: "llandudno", name: "Llandudno", county: "Conwy", lat: 53.3241, lng: -3.8276 },
  { slug: "whitby", name: "Whitby", county: "North Yorkshire", lat: 54.4863, lng: -0.6133 },
  { slug: "scarborough", name: "Scarborough", county: "North Yorkshire", lat: 54.2830, lng: -0.3996 },
  { slug: "skegness", name: "Skegness", county: "Lincolnshire", lat: 53.1438, lng: 0.3361 },
];

export const TOWN_BY_SLUG = Object.fromEntries(TOWNS.map((t) => [t.slug, t]));
