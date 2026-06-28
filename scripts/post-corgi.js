// WF2: ko_gi_omoti専用 — 投稿文生成 + シーンに合わせた画像生成 + Threads画像付き投稿
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

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
const REPO = 'iseise0226/sns-automation';

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

async function generateImageBase64(sceneText) {
  const prompt =
    'ウェルシュコーギーの子犬を描いた、絵本のような温かみのある水彩イラスト。' +
    'やわらかい筆致と陰影で立体感を出し、毛は白とオレンジ・タン色、丸くつぶらな瞳。' +
    '背景はベタ塗りの単色ではなく、日本の住宅の室内（畳・木の床・浴室・廊下など）や生活感のあるシーンを、暖色系の柔らかい光（夕方の窓辺の光、暖色の照明など）で描き込む。' +
    '色調はくすんだベージュ・茶色・淡いオレンジを中心とした落ち着いた色合いで、リアルな質感と奥行きのある背景。' +
    `次のシーンを、コーギーが実際にその場所にいる情景として描く: ${sceneText}。`;
  const body = JSON.stringify({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
  });
  const res = await req(
    'https://api.openai.com/v1/images/generations',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(process.env.OPENAI_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    },
    body
  );
  const b64 = res.json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`image generation failed: ${JSON.stringify(res.json)}`);
  return b64;
}

async function postImageToThreads(text, imageUrl) {
  const token = (process.env.THREADS_TOKEN_KO_GI_OMOTI || '').trim();
  const step1Url =
    `https://graph.threads.net/v1.0/${THREADS_USER_ID}/threads?` +
    `media_type=IMAGE&image_url=${encodeURIComponent(imageUrl)}&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`;
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

  const b64 = await generateImageBase64(text);
  const filename = `${Date.now()}.png`;
  const relPath = `images/ko_gi_omoti/${filename}`;
  fs.mkdirSync(path.dirname(relPath), { recursive: true });
  fs.writeFileSync(relPath, Buffer.from(b64, 'base64'));

  execFileSync('git', ['config', 'user.name', 'corgi-bot']);
  execFileSync('git', ['config', 'user.email', 'corgi-bot@users.noreply.github.com']);
  execFileSync('git', ['add', relPath]);
  execFileSync('git', ['commit', '-m', `chore: ko_gi_omoti投稿画像 ${filename}`]);
  execFileSync('git', ['push']);

  const imageUrl = `https://raw.githubusercontent.com/${REPO}/main/${relPath}`;
  await new Promise((r) => setTimeout(r, 10000));

  const result = await postImageToThreads(text, imageUrl);
  console.log('posted:', result?.id || result);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
