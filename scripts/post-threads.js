// WF2: Threads 1日5回自動投稿（GitHub Actions用スタンドアロン版）
// n8nの「Braveトレンド検索」→「Groq_<acc>」→「Step1_<acc>」→「Step2_<acc>」を1スクリプトに統合
const https = require('https');

function req(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: options.method || 'GET',
        headers: options.headers || {},
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, json: null, raw: data });
          }
        });
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

const THREADS_USER_IDS = {
  ise_satoshi: '26973238305690728',
  satoshi_mindset: '27572186385708529',
  satoshi_mind_coaching: '27564265113177740',
  ise_sato_kosodate: '36293625490253020',
  sessi_life: '27092097873810306',
  ise_kenkou_otaku: '36254291047552363',
  tabi_life_design40: '27612434671719929',
  ko_gi_omoti: '27835475659410595',
};

// persona本文（system/userTemplate）はpersonas.jsonから読み込む（リポジトリ内に同梱、トークン等は含まない）
const personas = require('./personas.json');
const ACCOUNTS = {};
for (const key of Object.keys(THREADS_USER_IDS)) {
  ACCOUNTS[key] = {
    threadsUserId: THREADS_USER_IDS[key],
    system: personas[key].system,
    userTemplate: personas[key].userTemplate,
  };
}

async function getBraveTrends() {
  const url =
    'https://api.search.brave.com/res/v1/news/search?q=' +
    encodeURIComponent('マインド プラス思考 自己成長 日本') +
    '&count=5&country=JP&search_lang=ja';
  const res = await req(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
    },
  });
  const results = res.json?.results || [];
  return results.slice(0, 3).map((r) => r.title).join(', ');
}

async function generateText(account, trends) {
  const a = ACCOUNTS[account];
  const userContent = a.userTemplate.replace('{{TRENDS}}', trends);
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: a.system },
      { role: 'user', content: userContent },
    ],
    max_tokens: 500,
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
    },
    body
  );
  return res.json?.choices?.[0]?.message?.content;
}

async function postToThreads(account, text) {
  const a = ACCOUNTS[account];
  const token = (process.env[`THREADS_TOKEN_${account.toUpperCase()}`] || '').trim();
  if (!token) throw new Error(`missing token for ${account}`);

  const step1Url =
    `https://graph.threads.net/v1.0/${a.threadsUserId}/threads?` +
    `media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`;
  const step1 = await req(step1Url, { method: 'POST' });
  const creationId = step1.json?.id;
  if (!creationId) throw new Error(`step1 failed for ${account}: ${JSON.stringify(step1.json)}`);

  const step2Url =
    `https://graph.threads.net/v1.0/${a.threadsUserId}/threads_publish?` +
    `creation_id=${creationId}&access_token=${encodeURIComponent(token)}`;
  const step2 = await req(step2Url, { method: 'POST' });
  return step2.json;
}

async function main() {
  const targetAccount = process.argv[2];
  const accountsToRun = targetAccount ? [targetAccount] : Object.keys(ACCOUNTS);

  const trends = await getBraveTrends();
  console.log('trends:', trends);

  for (const acc of accountsToRun) {
    try {
      const text = await generateText(acc, trends);
      if (!text) {
        console.error(`[${acc}] text generation failed, skipping`);
        continue;
      }
      const result = await postToThreads(acc, text);
      console.log(`[${acc}] posted:`, result?.id || result);
    } catch (e) {
      console.error(`[${acc}] error:`, e.message);
    }
  }
}

main();
