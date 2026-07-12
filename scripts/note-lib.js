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
  const key = (process.env.GROQ_API_KEY_NOTE || process.env.GROQ_API_KEY || '').trim();
  for (let attempt = 0; attempt < 15; attempt++) {
    const res = await req(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      },
      JSON.stringify(body)
    );
    if (res.json?.choices) return res.json.choices[0].message.content;
    // レート制限(429/TPM超過)の場合は長めに待つ。それ以外は短い待機でリトライ。
    const isRateLimit = res.status === 429 || res.json?.error?.code === 'rate_limit_exceeded';
    await new Promise((r) => setTimeout(r, isRateLimit ? 30000 : 3000));
  }
  throw new Error('Groq API呼び出し失敗（リトライ上限）');
}

async function fetchPexelsImage(query) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key) return null;
  const res = await req(
    `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=portrait`,
    { headers: { Authorization: key } }
  );
  const photoUrl = res.json?.photos?.[0]?.src?.large;
  if (!photoUrl) return null;
  return reqBinary(photoUrl, {});
}

async function fetchPixabayImage(query) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  if (!key) return null;
  const res = await req(
    `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&per_page=3&safesearch=true`,
    {}
  );
  const photoUrl = res.json?.hits?.[0]?.largeImageURL;
  if (!photoUrl) return null;
  return reqBinary(photoUrl, {});
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

// Pexels→Pixabay→Unsplashの順で試し、最初に取れた画像を返す
async function fetchStockImage(query) {
  try {
    const buf = await fetchPexelsImage(query);
    if (buf && buf.length) return buf;
  } catch (e) {}
  try {
    const buf = await fetchPixabayImage(query);
    if (buf && buf.length) return buf;
  } catch (e) {}
  try {
    const buf = await fetchUnsplashImage(query);
    if (buf && buf.length) return buf;
  } catch (e) {}
  return null;
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

module.exports = { req, reqBinary, groqChat, fetchUnsplashImage, fetchPexelsImage, fetchPixabayImage, fetchStockImage, getBraveTrends };
