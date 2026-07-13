// WF7: 週1で各SNS/LINEのフォロワー数・友だち数を記録し、data/weekly_stats.csvに追記する
const https = require('https');
const fs = require('fs');
const path = require('path');

function req(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, json: null, raw: data });
          }
        });
      }
    );
    r.on('error', reject);
    r.end();
  });
}

const ACCOUNTS = [
  'ise_satoshi',
  'satoshi_mindset',
  'satoshi_mind_coaching',
  'ise_sato_kosodate',
  'sessi_life',
  'ise_kenkou_otaku',
  'tabi_life_design',
  'ko_gi_omoti',
];

const THREADS_USER_IDS = {
  ise_satoshi: '26973238305690728',
  satoshi_mindset: '27572186385708529',
  satoshi_mind_coaching: '27564265113177740',
  ise_sato_kosodate: '36293625490253020',
  sessi_life: '27092097873810306',
  ise_kenkou_otaku: '36254291047552363',
  tabi_life_design: '27612434671719929', // Threads側の投稿アカウント名はtabi_life_design40
  ko_gi_omoti: '27835475659410595',
};

// IGアカウントを持たないise_satoshi以外は、wf4_accounts.jsonのigUserIdを使う
const IG_USER_IDS = { ko_gi_omoti: '17841468335300918' };
try {
  const wf4Accounts = require('../data/wf4_accounts.json');
  for (const [acc, cfg] of Object.entries(wf4Accounts)) {
    if (cfg.igUserId) IG_USER_IDS[acc] = cfg.igUserId;
  }
} catch (e) {
  console.error('wf4_accounts.json読み込み失敗:', e.message);
}

function threadsTokenEnvKey(account) {
  // THREADS_TOKEN_* のSecret名はtabi_life_design40のみ40付き
  const key = account === 'tabi_life_design' ? 'tabi_life_design40' : account;
  return `THREADS_TOKEN_${key.toUpperCase()}`;
}

async function getThreadsFollowers(account) {
  const userId = THREADS_USER_IDS[account];
  const token = (process.env[threadsTokenEnvKey(account)] || '').trim();
  if (!token || !userId) return null;
  try {
    const res = await req(
      `https://graph.threads.net/v1.0/${userId}/threads_insights?metric=followers_count&access_token=${encodeURIComponent(token)}`
    );
    const value = res.json?.data?.[0]?.total_value?.value;
    if (typeof value !== 'number') {
      console.error(`[threads:${account}] no value, status=${res.status} body=${JSON.stringify(res.json)}`);
    }
    return typeof value === 'number' ? value : null;
  } catch (e) {
    console.error(`[threads:${account}] error:`, e.message);
    return null;
  }
}

async function getIgFollowers(account) {
  const igUserId = IG_USER_IDS[account];
  const token = (process.env[`IG_TOKEN_${account.toUpperCase()}`] || '').trim();
  if (!token || !igUserId) return null;
  try {
    const res = await req(
      `https://graph.facebook.com/v23.0/${igUserId}?fields=followers_count&access_token=${encodeURIComponent(token)}`
    );
    return typeof res.json?.followers_count === 'number' ? res.json.followers_count : null;
  } catch (e) {
    console.error(`[ig:${account}] error:`, e.message);
    return null;
  }
}

async function getLineFriendsCount() {
  const apiKey = (process.env.LH_ADMIN_API_KEY || '').trim();
  const workerUrl = (process.env.LH_WORKER_URL || 'https://line-harness.ise-satoshi0226.workers.dev').trim();
  if (!apiKey) return null;
  try {
    const loginRes = await new Promise((resolve, reject) => {
      const u = new URL(`${workerUrl}/api/auth/login`);
      const r = https.request(
        { hostname: u.hostname, path: u.pathname, method: 'POST', headers: { 'Content-Type': 'application/json' } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve({ cookies: res.headers['set-cookie'] || [] }));
        }
      );
      r.on('error', reject);
      r.write(JSON.stringify({ apiKey }));
      r.end();
    });
    const sessionCookie = loginRes.cookies.map((c) => c.split(';')[0]).join('; ');
    if (!sessionCookie) return null;

    const friendsRes = await new Promise((resolve, reject) => {
      const u = new URL(`${workerUrl}/api/friends?limit=1`);
      const r = https.request(
        { hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { Cookie: sessionCookie } },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            try {
              resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
            } catch (e) {
              resolve(null);
            }
          });
        }
      );
      r.on('error', reject);
      r.end();
    });
    return typeof friendsRes?.data?.total === 'number' ? friendsRes.data.total : null;
  } catch (e) {
    console.error('[line] error:', e.message);
    return null;
  }
}

async function main() {
  const row = { date: new Date().toISOString().slice(0, 10) };

  for (const acc of ACCOUNTS) {
    row[`${acc}_threads`] = await getThreadsFollowers(acc);
    row[`${acc}_ig`] = acc === 'ise_satoshi' ? '' : await getIgFollowers(acc);
  }
  row.line_friends = await getLineFriendsCount();
  row.note_subscribers = ''; // noteはAPIがないため手動記入欄（空のまま）

  const csvPath = path.join(__dirname, '..', 'data', 'weekly_stats.csv');
  const headers = Object.keys(row);
  let existing = '';
  if (fs.existsSync(csvPath)) {
    existing = fs.readFileSync(csvPath, 'utf-8');
  } else {
    existing = headers.join(',') + '\n';
  }
  const line = headers.map((h) => row[h] ?? '').join(',');
  fs.writeFileSync(csvPath, existing.trimEnd() + '\n' + line + '\n');

  console.log('weekly_stats.csvに追記:', JSON.stringify(row, null, 2));
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
