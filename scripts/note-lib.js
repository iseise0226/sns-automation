// WF1共通ロジック: Groq呼び出し・Unsplash画像取得（GitHub Actions用）
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

function reqBinary(url, options) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https
      .request(
        {
          hostname: u.hostname,
          path: u.pathname + u.search,
          method: options.method || 'GET',
          headers: options.headers || {},
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        }
      )
      .on('error', reject)
      .end();
  });
}

async function groqChat(messages, maxTokens, jsonMode) {
  const body = { model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const key = (process.env.GROQ_API_KEY || '').trim();
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await req(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      },
      JSON.stringify(body)
    );
    if (res.json?.choices) return res.json.choices[0].message.content;
    // レート制限(429)の場合は長めに待つ。それ以外は短い待機でリトライ。
    const isRateLimit = res.status === 429 || res.json?.error?.code === 'rate_limit_exceeded';
    await new Promise((r) => setTimeout(r, isRateLimit ? 15000 : 3000));
  }
  throw new Error('Groq API呼び出し失敗（リトライ上限）');
}

async function fetchUnsplashImage(query) {
  const key = (process.env.UNSPLASH_API_KEY || '').trim();
  const res = await req(
    `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
    { headers: { Authorization: `Client-ID ${key}` } }
  );
  const photoUrl = res.json?.results?.[0]?.urls?.regular;
  if (!photoUrl) return null;
  return reqBinary(photoUrl, {});
}

async function getBraveTrends() {
  const key = (process.env.BRAVE_API_KEY || '').trim();
  const url =
    'https://api.search.brave.com/res/v1/news/search?q=' +
    encodeURIComponent('マインド プラス思考 自己成長 日本') +
    '&count=5&country=JP&search_lang=jp';
  const res = await req(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': key } });
  const results = res.json?.results || [];
  return results.slice(0, 3).map((r) => r.title).join('、');
}

module.exports = { req, reqBinary, groqChat, fetchUnsplashImage, getBraveTrends };
