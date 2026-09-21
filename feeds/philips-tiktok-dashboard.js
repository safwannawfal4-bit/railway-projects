'use strict';

// Feed for pages/philips-tiktok-dashboard.html. Turns the raw TikTok Ads
// Manager export kept in a Google Sheet into the DATA object the page embeds,
// so the server can serve a fresh copy at <page>/data.json. See "Live data
// feeds" in AGENTS.md.
//
// The sheet must be shared "Anyone with the link: Viewer" — the server has no
// Google login. It is not a secret: the same numbers are on the public page.

const SHEET_ID = '1kpGJf8ZhpIA5qNKJ8YX5QB_0EZSZPc0E2Jn7_rk8p_4';

// Sheet header -> DATA.meta.columns name. Matched by header text, not position,
// so inserting or reordering columns in the sheet does not shift the metrics.
const METRICS = [
  ['Impressions', 'imp'],
  ['Clicks (destination)', 'clicks'],
  ['Cost $', 'cost'],
  ['Video views', 'vv'],
  ['2-second video views', 'vv2s'],
  ['6-second video views', 'vv6s'],
  ['Video views at 25%', 'q25'],
  ['Video views at 50%', 'q50'],
  ['Video views at 75%', 'q75'],
  ['Video views at 100%', 'q100'],
  ['Total landing page view (TikTok)', 'lpv'],
];
const COST = METRICS.findIndex(([, k]) => k === 'cost');

// Cost is stored as an integer number of 1/10000 dollars so sums stay exact.
const COST_SCALE = 10000;

// Delivery days separated by more than this belong to different flights. The
// page's definitions panel quotes the same figure.
const FLIGHT_GAP_DAYS = 21;

const AGES = ['13-17', '18-24', '25-34', '35-44', '45-54', '≥55', 'Unknown'];
const GENDERS = ['Male', 'Female', 'Unknown'];

// Refreshed once a day, after the sheet's morning update.
const AT = { hour: 13, minute: 0, timeZone: 'Asia/Beirut' };

const FUNNELS = { UF: 'Upper Funnel', MF: 'Mid Funnel', LF: 'Lower Funnel' };
const MARKETS = { KSA: 'Saudi Arabia', UAE: 'United Arab Emirates' };
const PLATFORMS = { TT: 'TikTok' };
const LANGUAGES = { AR: 'Arabic', EN: 'English' };

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') ((field += '"'), i++);
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') (row.push(field), (field = ''));
    else if (c === '\n') (row.push(field), rows.push(row), (row = []), (field = ''));
    else if (c !== '\r') field += c;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  return rows;
}

// Agency_Client_Campaign_Funnel_Market_Objective_Destination_Platform_Language_
// PostType_CreativeType_Creative. The creative may itself contain underscores.
function describeAd(adName) {
  const p = adName.split('_');
  const creativeRaw = p.slice(11).join('_').trim();
  const postType = p[9] || '';
  return {
    adName,
    agency: p[0] || '',
    client: p[1] || '',
    campaign: p[2] || '',
    funnelCode: p[3] || '',
    funnel: FUNNELS[p[3]] || p[3] || '',
    marketCode: p[4] || '',
    market: MARKETS[p[4]] || p[4] || '',
    objective: p[5] || '',
    destination: p[6] || '',
    platformCode: p[7] || '',
    platform: PLATFORMS[p[7]] || p[7] || '',
    languageCode: p[8] || '',
    language: LANGUAGES[p[8]] || p[8] || '',
    postType,
    creativeType: p[10] || '',
    creativeRaw,
    // Dark posts are named "Video 1", which says nothing on a leaderboard.
    creative: postType === 'Dark Post' ? `Dark post · ${creativeRaw}` : creativeRaw,
  };
}

const num = (s) => {
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const dayNumber = (iso) => Date.parse(iso + 'T00:00:00Z') / 86400000;

function build(csv, now = new Date()) {
  const table = parseCsv(csv);
  const header = (table.shift() || []).map((h) => h.trim());
  const col = (name) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`sheet has no "${name}" column`);
    return i;
  };
  const cDate = col('By Day');
  const cAd = col('Ad name');
  const cAge = col('Age');
  const cGender = col('Gender');
  const cMetrics = METRICS.map(([name]) => col(name));

  // One ad name can run in several ad groups, and TikTok exports a line for
  // each, so the same day/ad/age/gender key repeats. Sum them.
  const byKey = new Map();
  const seen = new Set();
  for (const r of table) {
    const date = (r[cDate] || '').trim();
    const adName = r[cAd] || '';
    if (!/^\d{4}-\d\d-\d\d$/.test(date) || !adName) continue; // totals, blanks
    seen.add(adName);
    const m = cMetrics.map((c) => num(r[c]));
    const key = [date, adName, r[cAge], r[cGender]].join('\u0000');
    const rec = byKey.get(key);
    if (rec) m.forEach((v, i) => (rec.m[i] += v));
    else byKey.set(key, { date, adName, age: r[cAge], gender: r[cGender], m });
  }

  // An ad that never got an impression or spent anything is a shell left in the
  // account, not part of the campaign. The page lists these under "excluded".
  const IMP = 0;
  const delivered = new Set();
  for (const r of byKey.values()) if (r.m[IMP] > 0 || r.m[COST] > 0) delivered.add(r.adName);

  // TikTok also exports every idle day of a live ad; those rows carry nothing.
  const records = [];
  for (const r of byKey.values()) {
    if (!delivered.has(r.adName) || !r.m.some((v) => v > 0)) continue;
    r.m[COST] = Math.round(r.m[COST] * COST_SCALE);
    records.push(r);
  }
  if (!records.length) throw new Error('sheet has no rows with delivery');

  const adNames = [...delivered].sort();
  const dates = [...new Set(records.map((r) => r.date))].sort();
  const ages = [...AGES, ...new Set(records.map((r) => r.age).filter((a) => !AGES.includes(a)))];
  const genders = [
    ...GENDERS,
    ...new Set(records.map((r) => r.gender).filter((g) => !GENDERS.includes(g))),
  ];

  const index = (list) => new Map(list.map((v, i) => [v, i]));
  const iDate = index(dates);
  const iAd = index(adNames);
  const iAge = index(ages);
  const iGender = index(genders);

  const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const rows = records
    .sort(
      (a, b) =>
        cmp(a.date, b.date) ||
        cmp(a.adName, b.adName) ||
        cmp(a.age, b.age) ||
        cmp(a.gender, b.gender),
    )
    .map((r) => [
      iDate.get(r.date),
      iAd.get(r.adName),
      iAge.get(r.age),
      iGender.get(r.gender),
      ...r.m,
    ]);

  // Flights and the headline period follow paid delivery. A day whose only
  // activity is a few trailing video views is kept in the rows but does not
  // stretch a flight.
  const paidDays = [
    ...new Set(rows.filter((r) => r[4 + IMP] > 0 || r[4 + COST] > 0).map((r) => dates[r[0]])),
  ].sort();
  const flights = [];
  for (const d of paidDays) {
    const last = flights[flights.length - 1];
    if (last && dayNumber(d) - dayNumber(last.to) <= FLIGHT_GAP_DAYS) last.to = d;
    else flights.push({ from: d, to: d });
  }

  return {
    meta: {
      source: 'TikTok Ads Manager export',
      generated: new Intl.DateTimeFormat('en-CA', { timeZone: AT.timeZone }).format(now),
      dateFrom: paidDays[0],
      dateTo: paidDays[paidDays.length - 1],
      costScale: COST_SCALE,
      columns: ['date', 'ad', 'age', 'gender', ...METRICS.map(([, k]) => k)],
      excludedAds: [...seen].filter((a) => !delivered.has(a)).sort(),
      flights,
    },
    dates,
    ages,
    genders,
    ads: adNames.map(describeAd),
    rows,
  };
}

module.exports = {
  url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv`,
  at: AT,
  build,
};
