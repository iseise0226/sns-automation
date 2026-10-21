const https = require('https');
const posts = require('../data/noir_threads_posts.json');

const SITE_URL = 'https://noir-lounge.com/';
const SLOT_OFFSETS = { morning: 0, afternoon: 1, night: 2 };
const WINDOWS = {
  morning: [9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60],
  afternoon: [14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30, 16 * 60],
  night: [19 * 60, 19 * 60 + 30, 20 * 60, 20 * 60 + 30, 21 * 60],
};

function hash(value) {
  let result = 2166136261;
  for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}

function dailySchedule(date) {
  return Object.fromEntries(Object.entries(WINDOWS).map(([slot, candidates]) => [
    slot,
    candidates[hash(`${date}:${slot}`) % candidates.length],
  ]));
}

function shouldRunAt(schedule, minutes) {
  return Object.entries(schedule).find(([, selected]) => selected === minutes)?.[0] || null;
}

function dueSlots(schedule, minutes, postedSlots = []) {
  const posted = new Set(postedSlots);
  return Object.entries(schedule)
    .filter(([slot, selected]) => selected <= minutes && !posted.has(slot))
    .sort((left, right) => left[1] - right[1])
    .map(([slot]) => slot);
}

function choosePost(sourcePosts, date, slot) {
  if (!Array.isArray(sourcePosts) || sourcePosts.length < 3) throw new Error('At least three NOIR Threads posts are required');
  const base = hash(date) % sourcePosts.length;
  return sourcePosts[(base + SLOT_OFFSETS[slot]) % sourcePosts.length];
}

function jstDate(value) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

function jstNow(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${map.year}-${map.month}-${map.day}`, minutes: Number(map.hour) * 60 + Number(map.minute) };
}

function buildPostText(text, date, slot) {
  const [year, month, day] = date.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const includeLink = slot === 'night' && (weekday === 0 || weekday === 3);
  return includeLink ? `${text}\n\n眠れない夜に、話せる場所はこちら\n${SITE_URL}` : text;
}

function wasPostedToday(items, text, date) {
  return items.some((item) => item.text === text && item.timestamp && jstDate(new Date(item.timestamp)) === date);
}

function postedSlotsForDate(sourcePosts, items, date) {
  return Object.keys(SLOT_OFFSETS).filter((slot) => {
    const text = buildPostText(choosePost(sourcePosts, date, slot), date, slot);
    return wasPostedToday(items, text, date);
  });
}

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({ hostname: target.hostname, path: target.pathname + target.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = {};
        try { json = JSON.parse(raw || '{}'); } catch (_) { json = { raw }; }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function profile(token) {
  const query = new URLSearchParams({ fields: 'id,username', access_token: token });
  const response = await request(`https://graph.threads.net/v1.0/me?${query}`);
  if (response.status !== 200 || response.json.username !== 'seira_noir_ai' || !response.json.id) {
    throw new Error(`Threads connection failed (${response.status}): ${response.json.error?.message || 'unexpected account'}`);
  }
  return response.json;
}

async function recentThreads(token, userId) {
  const query = new URLSearchParams({ fields: 'id,text,timestamp', limit: '25', access_token: token });
  const response = await request(`https://graph.threads.net/v1.0/${userId}/threads?${query}`);
  if (response.status !== 200) throw new Error(`Threads history failed (${response.status}): ${response.json.error?.message || ''}`);
  return response.json.data || [];
}

async function publish(token, userId, text) {
  const createBody = new URLSearchParams({ media_type: 'TEXT', text, access_token: token }).toString();
  const created = await request(`https://graph.threads.net/v1.0/${userId}/threads`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: createBody,
  });
  if (!created.json.id) throw new Error(`Threads container failed (${created.status}): ${created.json.error?.message || ''}`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const publishBody = new URLSearchParams({ creation_id: created.json.id, access_token: token }).toString();
  const published = await request(`https://graph.threads.net/v1.0/${userId}/threads_publish`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: publishBody,
  });
  if (!published.json.id) throw new Error(`Threads publish failed (${published.status}): ${published.json.error?.message || ''}`);
  return published.json.id;
}

async function main() {
  const mode = process.env.NOIR_THREADS_MODE || 'publish';
  const now = jstNow();
  const schedule = dailySchedule(now.date);
  let slot = process.env.NOIR_THREADS_SLOT || '';

  if (mode === 'dryrun') {
    if (!SLOT_OFFSETS.hasOwnProperty(slot)) throw new Error('NOIR_THREADS_SLOT must be morning, afternoon, or night');
    const text = buildPostText(choosePost(posts, now.date, slot), now.date, slot);
    console.log(`DRYRUN ${now.date} ${slot} (${schedule[slot]} minutes JST)\n${text}`);
    return;
  }

  const token = (process.env.THREADS_TOKEN_SEIRA_NOIR_AI || '').trim();
  if (!token) throw new Error('THREADS_TOKEN_SEIRA_NOIR_AI is required');
  const account = await profile(token);
  if (mode === 'verify') {
    console.log(`Connection verified for @${account.username}.`);
    return;
  }
  if (mode !== 'publish') throw new Error('NOIR_THREADS_MODE must be dryrun, verify, or publish');

  const recent = await recentThreads(token, account.id);
  if (process.env.NOIR_THREADS_SCHEDULED === '1') {
    const postedSlots = postedSlotsForDate(posts, recent, now.date);
    const slots = dueSlots(schedule, now.minutes, postedSlots);
    if (!slots.length) {
      console.log(`No overdue Threads posts. JST ${now.date} schedule=${JSON.stringify(schedule)} posted=${JSON.stringify(postedSlots)}`);
      return;
    }
    for (const dueSlot of slots) {
      const text = buildPostText(choosePost(posts, now.date, dueSlot), now.date, dueSlot);
      const id = await publish(token, account.id, text);
      console.log(`Threads post published: ${id} (${now.date} ${dueSlot}, scheduled ${schedule[dueSlot]} JST minutes)`);
    }
    return;
  }

  if (!SLOT_OFFSETS.hasOwnProperty(slot)) throw new Error('NOIR_THREADS_SLOT must be morning, afternoon, or night');
  const text = buildPostText(choosePost(posts, now.date, slot), now.date, slot);
  if (wasPostedToday(recent, text, now.date)) {
    console.log(`Skipped duplicate ${slot} post for ${now.date}.`);
    return;
  }
  const id = await publish(token, account.id, text);
  console.log(`Threads post published: ${id}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = {
  buildPostText,
  choosePost,
  dailySchedule,
  dueSlots,
  postedSlotsForDate,
  shouldRunAt,
  wasPostedToday,
};
