// ローカル実行用: Manusで作った画像3枚 + ナレーション3つ → ElevenLabs音声 → Remotion動画
// 使い方: node scripts/render-corgi-local.js "ナレーション1" "ナレーション2" "ナレーション3"
// 画像は事前に C:/Users/isesa/n8n_media/corgi_manus/img1.png ~ img3.png に保存しておくこと
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const IMAGE_DIR = 'C:/Users/isesa/n8n_media/corgi_manus';
const ELEVENLABS_KEY_PATH = 'C:/Users/isesa/n8n_scripts/elevenlabs_key.txt';
const VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

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

async function generateNarrationAudio(narrations, outDir) {
  const key = fs.readFileSync(ELEVENLABS_KEY_PATH, 'utf-8').trim();
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

async function main() {
  const narrations = process.argv.slice(2);
  if (narrations.length !== 3) {
    console.error('usage: node scripts/render-corgi-local.js "ナレーション1" "ナレーション2" "ナレーション3"');
    process.exit(1);
  }

  const srcImgPaths = [1, 2, 3].map((i) => path.join(IMAGE_DIR, `img${i}.png`));
  for (const p of srcImgPaths) {
    if (!fs.existsSync(p)) {
      console.error(`画像が見つかりません: ${p}`);
      process.exit(1);
    }
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.join(IMAGE_DIR, today);
  fs.mkdirSync(outDir, { recursive: true });

  const imgPaths = srcImgPaths.map((p, i) => {
    const dest = path.join(outDir, `img${i + 1}.png`);
    fs.copyFileSync(p, dest);
    return dest;
  });

  console.log('ナレーション音声を生成中...');
  const audioPaths = await generateNarrationAudio(narrations, outDir);

  console.log('Remotionで動画をレンダリング中...');
  const videoPath = renderVideo(imgPaths, audioPaths, narrations, outDir);

  console.log('完成:', videoPath);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
