// WF3: コーギーInstagramカルーセル投稿 — シナリオ生成→画像生成→ナレーション音声→Remotion動画(保存用)→IGカルーセル投稿
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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

function reqBinary(url, options, body) {
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
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

const IG_USER_ID = '17841468335300918';
const SCENES = [
  'sitting calmly with a gentle proud expression',
  'looking up at the sky with hope in its eyes',
  'walking forward confidently on a sunny path',
];

async function generateScenario() {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'あなたはプラス思考・マインド系のメッセージを届ける、笑顔の可愛いコーギーキャラのInstagramコンテンツクリエイターです。日常の小さな出来事から前向きな気づきにつなげる投稿を作ります。説教っぽくならず、コーギーらしい温かみのある言葉で伝えます。',
      },
      {
        role: 'user',
        content:
          '今日のプラス思考・マインド系の投稿を1つ考えて、JSONで返してください。{"scenario":"テーマ","caption":"投稿キャプション","detail":"画像の雰囲気を表す英語の短い説明","narrations":["1枚目のナレーション(20〜30文字)","2枚目のナレーション(20〜30文字)","3枚目のナレーション(20〜30文字)"]}。narrationsは「座って一息ついている」→「空を見上げて気づきを得る」→「前向きに歩き出す」という3シーンの流れに合わせ、コーギーの一人称で日本語で書いてください。',
      },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
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
  const content = res.json?.choices?.[0]?.message?.content;
  const data = JSON.parse(content);
  return {
    scenario: data.scenario || '小さな一歩を大切にする',
    caption: data.caption || '今日も一歩前進できた自分に、ちょっと拍手🐾',
    detail: data.detail || 'happy smiling face',
    narrations:
      Array.isArray(data.narrations) && data.narrations.length === 3
        ? data.narrations
        : ['ちょっと一息ついてみる。それも立派な前進。', 'ふと空を見上げたら、気づきがあった。', '今日も前を向いて、歩いていこう。'],
  };
}

async function generateImages(detail, outDir) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const templatePath = path.join(__dirname, '..', 'assets', 'corgi_template.png');
  const imgPaths = [];
  for (let i = 0; i < SCENES.length; i++) {
    const prompt = `Keep the same corgi character design (face, colors, watercolor style) from the reference image, but change the pose and scene to: ${SCENES[i]}, ${detail}. Soft pastel watercolor illustration, vertical composition, uplifting and gentle mood.`;
    const outPath = path.join(outDir, `img${i + 1}.png`);
    execFileSync(
      'curl',
      [
        '-s',
        '--max-time',
        '170',
        '-X',
        'POST',
        'https://api.openai.com/v1/images/edits',
        '-H',
        `Authorization: Bearer ${apiKey}`,
        '-F',
        'model=gpt-image-1',
        '-F',
        `image=@${templatePath}`,
        '-F',
        `prompt=${prompt}`,
        '-F',
        'size=1024x1536',
        '-F',
        'n=1',
        '-o',
        `${outPath}.json`,
      ],
      { timeout: 180000 }
    );
    const data = JSON.parse(fs.readFileSync(`${outPath}.json`, 'utf-8'));
    const b64 = data?.data?.[0]?.b64_json;
    fs.unlinkSync(`${outPath}.json`);
    if (!b64) throw new Error(`image ${i + 1} generation failed: ${JSON.stringify(data)}`);
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    imgPaths.push(outPath);
  }
  return imgPaths;
}

async function generateNarrationAudio(narrations, outDir) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';
  const audioPaths = [];
  for (let i = 0; i < narrations.length; i++) {
    const body = JSON.stringify({
      text: narrations[i],
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const audioBuf = await reqBinary(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
      { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' } },
      body
    );
    const outPath = path.join(outDir, `audio${i + 1}.mp3`);
    fs.writeFileSync(outPath, audioBuf);
    audioPaths.push(outPath);
  }
  return audioPaths;
}

function getAudioDuration(audioPath) {
  try {
    const out = execFileSync('ffprobe', ['-i', audioPath, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'], {
      timeout: 15000,
    })
      .toString()
      .trim();
    return parseFloat(out) + 0.5;
  } catch (e) {
    return 4.0;
  }
}

function renderVideo(imgPaths, audioPaths, narrations, outDir) {
  const scenes = imgPaths.map((p, i) => ({
    image: path.basename(p),
    audio: fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '',
    narration: narrations[i] || '',
    durationInSeconds: fs.existsSync(audioPaths[i]) ? getAudioDuration(audioPaths[i]) : 4.0,
  }));
  const propsPath = path.join(outDir, 'remotion_props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes }), 'utf-8');

  const videoPath = path.join(outDir, 'video.mp4');
  const remotionDir = path.join(__dirname, '..', 'remotion');
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/index.ts', 'MyVideo', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`],
    { cwd: remotionDir, timeout: 180000, shell: true, stdio: 'inherit' }
  );
  return videoPath;
}

async function postCarousel(imgPaths, caption) {
  const igToken = (process.env.IG_TOKEN_KO_GI_OMOTI || '').trim();

  function uploadImage(imgPath) {
    const out = execFileSync('curl', ['-s', '-F', `file=@${imgPath}`, 'https://tmpfiles.org/api/v1/upload']).toString();
    const data = JSON.parse(out);
    return data.data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  }

  function createContainer(imageUrl) {
    const url = `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`;
    const out = execFileSync('curl', [
      '-s',
      '-X',
      'POST',
      url,
      '-d',
      `image_url=${encodeURIComponent(imageUrl)}`,
      '-d',
      'is_carousel_item=true',
      '-d',
      `access_token=${igToken}`,
    ]).toString();
    return JSON.parse(out);
  }

  const creationIds = [];
  for (const imgPath of imgPaths) {
    const publicUrl = uploadImage(imgPath);
    const container = createContainer(publicUrl);
    if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);
    creationIds.push(container.id);
  }

  const carouselUrl = `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`;
  const childrenArgs = creationIds.flatMap((id, i) => ['-d', `children[${i}]=${id}`]);
  const carouselRes = JSON.parse(
    execFileSync('curl', [
      '-s',
      '-X',
      'POST',
      carouselUrl,
      '-d',
      'media_type=CAROUSEL',
      ...childrenArgs,
      '-d',
      `caption=${encodeURIComponent(caption)}`,
      '-d',
      `access_token=${igToken}`,
    ]).toString()
  );
  if (!carouselRes.id) throw new Error(`carousel failed: ${JSON.stringify(carouselRes)}`);

  const publishUrl = `https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`;
  const publishRes = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', publishUrl, '-d', `creation_id=${carouselRes.id}`, '-d', `access_token=${igToken}`]).toString()
  );
  return publishRes;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join('corgi_media', today);
  fs.mkdirSync(outDir, { recursive: true });

  const scenario = await generateScenario();
  console.log('scenario:', scenario.scenario, '| caption:', scenario.caption);

  const imgPaths = await generateImages(scenario.detail, outDir);
  console.log('images generated:', imgPaths.length);

  const audioPaths = await generateNarrationAudio(scenario.narrations, outDir);
  console.log('narration audio generated:', audioPaths.length);

  const videoPath = renderVideo(imgPaths, audioPaths, scenario.narrations, outDir);
  console.log('video rendered:', videoPath);

  const result = await postCarousel(imgPaths, scenario.caption);
  console.log('posted:', result?.id || result);

  execFileSync('git', ['config', 'user.name', 'corgi-bot']);
  execFileSync('git', ['config', 'user.email', 'corgi-bot@users.noreply.github.com']);
  execFileSync('git', ['add', outDir]);
  execFileSync('git', ['commit', '-m', `chore: WF3コーギー投稿素材 ${today}`]);
  execFileSync('git', ['push']);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
