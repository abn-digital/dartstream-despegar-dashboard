#!/usr/bin/env node
/**
 * Fetch pre-aggregated GA4 data for Naranja X Viajes (Despegar B2B2C)
 * from the Cube.dev semantic layer and write it to data.js.
 *
 * Why Cube instead of a direct BigQuery query:
 *   - The dashboard consumes the SAME semantic layer the rest of the org uses,
 *     so metric definitions (CVR, funnel rates, etc.) live in one place
 *     (the despegar_b2b2c_master cube), not duplicated in the frontend.
 *   - Cube returns data already aggregated to the requested grain, so the
 *     payload is a few thousand rows (90 days) instead of 100k raw rows.
 *
 * Grain requested here: date(day) x campaign x channel x device x source_medium.
 * All measures are additive sums, so the browser can re-aggregate freely for
 * any filter combination. upa_id is intentionally NOT requested — it is a
 * high-cardinality dimension that explodes row volume, and unique-device counts
 * are non-additive (cannot be re-summed in the browser). Sessions is the base.
 *
 * Auth: signs a short-lived HS256 JWT with CUBE_JWT_SECRET and calls the
 * public, JWT-protected Cube endpoint at cube.hikethecloud.com.
 */

const crypto = require('crypto');
const fs = require('fs');

const CUBE_API_URL = process.env.CUBE_API_URL || 'https://cube.hikethecloud.com';
const CUBE_JWT_SECRET = process.env.CUBE_JWT_SECRET || '';
const CUBE = 'despegar_b2b2c_master';
const LOOKBACK_DAYS = 90;
const MAX_RETRIES = 30;     // Cube returns 200 {error:"Continue wait"} while building pre-aggs
const WAIT_MS = 2000;

if (!CUBE_JWT_SECRET) {
  console.error('ERROR: CUBE_JWT_SECRET is not set.');
  process.exit(1);
}

// --- JWT (HS256), mirrors the org tooling's signer ---
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function signJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    sub: 'despegar-dashboard',
    iat: now,
    exp: now + 300,
    // Cube model has an access_policy gating on allowed_clients; include both
    // the client slug and the cube name so the token passes RBAC.
    allowed_clients: ['despegar_b2b2c'],
    allowed_cubes: [CUBE],
  }));
  const msg = `${header}.${payload}`;
  const sig = b64url(crypto.createHmac('sha256', CUBE_JWT_SECRET).update(msg).digest());
  return `${msg}.${sig}`;
}

const m = (n) => `${CUBE}.${n}`;
const query = {
  measures: [
    // session_start (GA4 eventCount) is the single session proxy / CVR base.
    // The session-scoped `sessions` measure was removed from the cube model.
    'session_start', 'first_visit', 'page_view', 'search', 'view_search_results',
    'view_item', 'begin_checkout', 'purchase', 'purchase_revenue', 'margin',
    'user_engagement', 'scroll', 'click', 'form_start', 'file_download',
  ].map(m),
  dimensions: ['campaign_name', 'channel_group', 'device_category', 'source_medium'].map(m),
  timeDimensions: [{
    dimension: m('date'),
    granularity: 'day',
    dateRange: `last ${LOOKBACK_DAYS} days`,
  }],
  limit: 50000,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load() {
  const token = signJwt();
  const url = `${CUBE_API_URL}/cubejs-api/v1/load`;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Cube API ${resp.status}: ${text.slice(0, 500)}`);
    }
    const json = await resp.json();
    if (json.error === 'Continue wait') {
      console.log(`Cube building pre-aggregations... (${attempt}/${MAX_RETRIES})`);
      await sleep(WAIT_MS);
      continue;
    }
    if (json.error) throw new Error(`Cube error: ${json.error}`);
    return json.data || [];
  }
  throw new Error('Cube did not return data after max retries (Continue wait).');
}

// Strip the "cube." prefix, drop the redundant date.day key, truncate date to YYYY-MM-DD.
function normalize(rows) {
  const prefix = `${CUBE}.`;
  return rows.map((r) => {
    const out = {};
    for (const k in r) {
      let key = k.startsWith(prefix) ? k.slice(prefix.length) : k;
      if (key === 'date.day' || key === 'date.week' || key === 'date.month') continue;
      let v = r[k];
      if (key === 'date' && typeof v === 'string' && v.length > 10 && v[10] === 'T') v = v.slice(0, 10);
      out[key] = v;
    }
    return out;
  });
}

(async () => {
  console.log(`Querying Cube (${CUBE}) for last ${LOOKBACK_DAYS} days...`);
  const raw = await load();
  const data = normalize(raw);
  if (data.length === 0) {
    console.error('ERROR: Cube returned 0 rows — refusing to overwrite data.js.');
    process.exit(1);
  }
  const dates = data.map((r) => r.date).filter(Boolean).sort();
  console.log(`Rows: ${data.length} | Date range: ${dates[0]} to ${dates[dates.length - 1]}`);
  fs.writeFileSync('data.js', `const INLINE_DATA = ${JSON.stringify(data)};\n`, 'utf8');
  console.log(`data.js written with ${data.length} rows`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
