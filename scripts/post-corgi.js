// WF2: ko_gi_omoti専用 — 投稿文生成 + Threadsテキスト投稿
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
    if (body) r.write(body);
    r.end();
  });
}

const ACCOUNT = 'ko_gi_omoti';
const THREADS_USER_ID = '27835475659410595';
const persona = require('./personas.json')[ACCOUNT];

async function generateText() {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: persona.system },
      { role: 'user', content: persona.userTemplate },
    ],
    max_tokens: 300,
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    },
    body
  );
  return res.json?.choices?.[0]?.message?.content?.trim();
}

async function postTextToThreads(text) {
  const token = (process.env.THREADS_TOKEN_KO_GI_OMOTI || '').trim();
  const step1Url =
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads?` +
    `media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`;
  const step1 = await req(step1Url, { method: 'POST' });
  const creationId = step1.json?.id;
  if (!creationId) throw new Error(`step1 failed: ${JSON.stringify(step1.json)}`);

  await new Promise((r) => setTimeout(r, 8000));

  const step2Url =
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads_publish?` +
    `creation_id=${creationId}&access_token=${encodeURIComponent(token)}`;
  const step2 = await req(step2Url, { method: 'POST' });
  return step2.json;
}

async function main() {
  const text = await generateText();
  if (!text) throw new Error('text generation failed');
  console.log('text:', text);

  const result = await postTextToThreads(text);
  console.log('posted:', result?.id || result);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
