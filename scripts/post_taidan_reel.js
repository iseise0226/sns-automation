// 対談リール(質問役あかり×先生いせ)台本 → VOICEVOX(2声) → Remotionレンダリング(縦1080x1920) → Instagram Reels投稿
// 使い方: node post_taidan_reel.js <台本.json> [--no-upload]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ensureEngine, resolveSpeakerId, tts, audioDuration } = require('./daily-pipeline/hf_common');

const ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'daily-pipeline', 'voicevox_engine');
const REPO_ROOT = path.join(__dirname, '..');
const REMOTION_DIR = path.join(REPO_ROOT, 'remotion');
const OUT_ROOT = path.join(__dirname, 'daily-pipeline', 'out');
const IG_USER_ID = '17841443565092674'; // @oshiete.okane

function isDirectVideoUrl(url) {
  try {
    const out = execFileSync('curl', ['-s', '-I', '-L', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url], { timeout: 30000 })
      .toString()
      .trim();
    const [code, type] = out.split(' ');
    return code === '200' && (type || '').startsWith('video/');
  } catch (e) {
    return false;
  }
}

// 動画を公開URLにアップロードする(generate-reel.jsと同じ複数ホストのフォールバック方式)
function uploadPublic(videoPath) {
  const uploaders = [
    { name: 'litterbox', run: () => execFileSync('curl', ['-s', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'], { timeout: 300000 }).toString().trim() },
    { name: 'uguu', run: () => execFileSync('curl', ['-s', '-F', `files[]=@${videoPath}`, 'https://uguu.se/upload?output=text'], { timeout: 300000 }).toString().trim() },
    { name: 'tmpfiles', run: () => { const out = execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload'], { timeout: 300000 }).toString(); return JSON.parse(out).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'); } },
  ];
  for (const up of uploaders) {
    try {
      const url = up.run();
      if (url.startsWith('https://') && isDirectVideoUrl(url)) { console.log(`upload host: ${up.name}`); return url; }
      console.log(`${up.name} rejected: ${url.slice(0, 120)}`);
    } catch (e) {
      console.log(`${up.name} error:`, e.message.slice(0, 120));
    }
  }
  throw new Error('全アップロードホストが失敗しました');
}

async function postReel(igUserId, videoPath, caption) {
  const igToken = (process.env.IG_TOKEN_OKANE_TAIDAN || '').trim();
  if (!igToken) throw new Error('IG_TOKEN_OKANE_TAIDANが未設定です');

  const publicUrl = uploadPublic(videoPath);
  console.log(`upload: ${publicUrl}`);

  const createUrl = `https://graph.facebook.com/v23.0/${igUserId}/media`;
  const container = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', createUrl,
      '-d', 'media_type=REELS',
      '-d', `video_url=${encodeURIComponent(publicUrl)}`,
      '-d', `caption=${encodeURIComponent(caption)}`,
      '-d', 'thumb_offset=1500',
      '-d', `access_token=${igToken}`,
    ]).toString()
  );
  if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);

  let statusCode = 'IN_PROGRESS';
  for (let i = 0; i < 20 && statusCode !== 'FINISHED'; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const statusUrl = `https://graph.facebook.com/v23.0/${container.id}?fields=status_code,status&access_token=${igToken}`;
    const statusRes = JSON.parse(execFileSync('curl', ['-s', statusUrl]).toString());
    statusCode = statusRes.status_code;
    if (statusCode === 'ERROR') throw new Error(`processing error: ${JSON.stringify(statusRes)}`);
  }
  if (statusCode !== 'FINISHED') throw new Error(`processing timeout: ${statusCode}`);

  const publishUrl = `https://graph.facebook.com/v23.0/${igUserId}/media_publish`;
  const publish = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', publishUrl, '-d', `creation_id=${container.id}`, '-d', `access_token=${igToken}`]).toString()
  );
  if (!publish.id) throw new Error(`publish failed: ${JSON.stringify(publish)}`);
  return publish;
}

async function main() {
  const args = process.argv.slice(2);
  const noUpload = args.includes('--no-upload');
  const scriptPath = args.find((a) => !a.startsWith('--'));
  if (!scriptPath) { console.error('使い方: node post_taidan_reel.js <台本.json> [--no-upload]'); process.exit(1); }
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));

  await ensureEngine(ENGINE_DIR);
  const senseiId = await resolveSpeakerId('玄野武宏', 'ノーマル');
  const akariId = await resolveSpeakerId('四国めたん', 'ノーマル');

  const outDir = path.join(OUT_ROOT, script.id);
  const audioDir = path.join(outDir, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });

  const voiceOf = (speaker) => (speaker === 'q' ? akariId : senseiId);

  const beats = [];
  for (let i = 0; i < script.beats.length; i++) {
    const b = script.beats[i];
    const file = path.join(audioDir, `b${i + 1}.wav`);
    await tts(b.text, voiceOf(b.speaker), file);
    const dur = audioDuration(file);
    beats.push({ speaker: b.speaker, text: b.text, audio: `taidan_reel_audio/b${i + 1}.wav`, durationInSeconds: Math.max(2.6, dur + 0.5) });
    console.log(`TTS beat ${i + 1}/${script.beats.length} (${b.speaker})`);
  }

  // 図解スライドにもナレーション(comment)を付けて、下の2人が喋りながら解説するようにする
  const graphics = [];
  const rawGraphics = script.graphics || [];
  for (let i = 0; i < rawGraphics.length; i++) {
    const g = rawGraphics[i];
    const speaker = g.speaker === 'q' ? 'q' : 's';
    const comment = (g.comment || '').trim();
    let audio = '';
    let durationInSeconds = 3.4;
    if (comment) {
      const file = path.join(audioDir, `g${i + 1}.wav`);
      await tts(comment, voiceOf(speaker), file);
      durationInSeconds = Math.max(3.0, audioDuration(file) + 0.5);
      audio = `taidan_reel_audio/g${i + 1}.wav`;
      console.log(`TTS graphic ${i + 1}/${rawGraphics.length} (${speaker})`);
    }
    graphics.push({ ...g, speaker, audio, durationInSeconds });
  }

  // Remotionのpublic-dirを一時的にoutDirにし、bgm・音声・両キャラの画像をそこに集める
  // (remotion/assets/配下が正本。remotion/public/はgitignore対象なのでレンダーの度にここへコピーする)
  const publicDir = outDir;
  const bgmSrc = path.join(REMOTION_DIR, 'assets', 'bgm.mp3');
  if (fs.existsSync(bgmSrc)) fs.copyFileSync(bgmSrc, path.join(publicDir, 'bgm.mp3'));

  function copyDir(src, dst) {
    fs.mkdirSync(dst, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dst, entry.name);
      if (entry.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }
  copyDir(path.join(REMOTION_DIR, 'assets', 'satoshi_chibi'), path.join(publicDir, 'satoshi_chibi'));
  copyDir(path.join(REMOTION_DIR, 'assets', 'akari_chibi'), path.join(publicDir, 'akari_chibi'));

  const audioPublicDir = path.join(publicDir, 'taidan_reel_audio');
  fs.mkdirSync(audioPublicDir, { recursive: true });
  for (let i = 0; i < beats.length; i++) {
    fs.copyFileSync(path.join(audioDir, `b${i + 1}.wav`), path.join(audioPublicDir, `b${i + 1}.wav`));
  }
  for (let i = 0; i < graphics.length; i++) {
    if (graphics[i].audio) fs.copyFileSync(path.join(audioDir, `g${i + 1}.wav`), path.join(audioPublicDir, `g${i + 1}.wav`));
  }

  const propsPath = path.join(outDir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ beats, graphics, hook: script.hook || '', footer: 'いせ先生×あかり' }));

  const rawVideoPath = path.join(outDir, 'video_raw.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'TaidanReel', rawVideoPath, `--props=${propsPath}`, `--public-dir=${publicDir}`], {
    cwd: REMOTION_DIR, timeout: 600000, shell: true, stdio: 'inherit',
  });
  console.log('レンダー完了:', rawVideoPath);

  // Remotionの音声ミックスは高ビットレートになりがちで、Instagram Reelsが
  // 「Media upload has failed(2207077)」で弾くことがあるため、音声だけ128kbps AACに再エンコードする
  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync('ffmpeg', ['-y', '-i', rawVideoPath, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', videoPath], {
    timeout: 300000, shell: true, stdio: 'inherit',
  });
  console.log('音声再エンコード完了:', videoPath);

  if (noUpload) { console.log('--no-upload のためアップロードしません'); return; }
  const result = await postReel(IG_USER_ID, videoPath, script.caption || '');
  console.log('投稿完了:', result.id);
}

main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
