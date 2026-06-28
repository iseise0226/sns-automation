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
  const basePrompt = `An adorable chibi Pembroke Welsh Corgi mascot character.
Very large head, approximately 55% of the total body height.
Extremely short legs.
Very fluffy, rounded body.
Compact proportions with oversized head and tiny paws.
Soft rounded silhouette with absolutely no sharp angles.
Large upright ears, oversized and slightly rounded at the tips.
Huge sparkling round eyes with soft olive-green irises.
Large glossy pupils with multiple bright reflections.
Tiny black nose.
Small smiling mouth with a visible pink tongue.
Round cheeks.
Soft innocent facial expression.
Cute baby-like proportions.
Symmetrical face.

Cream white chest. Cream white muzzle. Cream white forehead stripe extending from forehead to nose.
Warm orange-tan fur on the ears, back, sides and upper body.
Long fluffy watercolor-style fur. Very soft feathered texture. No hard outlines.
Fine fluffy fur around the cheeks and chest. Short fluffy tail or hidden tail.

Soft watercolor illustration. Children's picture book style. Pastel color palette.
Hand-painted watercolor texture. Gentle color bleeding. Minimal line art.
Soft lighting. No harsh shadows. Paper texture. Dreamy atmosphere. Ultra cute.
Highly detailed watercolor brush strokes. Premium children's illustration quality.

Centered composition. Full body. Front facing. Eye level.
White soft background. Pastel watercolor background. Minimal background distractions.

Highest quality. Masterpiece. Extremely cute mascot. Consistent character design.
Professional children's book illustration. Beautiful watercolor painting. Soft edges. Ultra detailed. Clean composition.

Negative prompt: realistic dog, photorealistic, aggressive, sharp teeth, thin body, long legs, small ears, small eyes, blue eyes, brown eyes, dark lighting, hard shadows, anime style, 3D render, CGI, low quality, extra legs, extra ears, open mouth too wide, angry, sad, dirty fur, rough fur, collar, accessories, clothes, background objects, text, logo, watermark, cropped, side view, profile view.`;

  const prompt = `${basePrompt}\n\nScene/pose for this illustration (keep the character design above exactly, only change the pose/expression to match): ${sceneText}`;
  const body = JSON.stringify({
    model: 'gpt-image-1',
    prompt,
    size: '1024x1024',
    quality: 'high',
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
