// 台本JSON → VOICEVOX(ビート単位) → 実写取得 → HyperFramesレンダリング → 音声/BGM合成 → YouTube投稿
// Remotion版(build_and_upload.js)の置き換え。デザインは hyperframes_test で確定した線画図解＋実写の型。
//   使い方: node hf_build_and_upload.js <台本.json> [--no-upload]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { google } = require('googleapis');
const { ensureEngine, resolveSpeakerId, tts, audioDuration, fetchStockVideo, pickBgm } = require('./hf_common');
const { build } = require('./hf_build');

const ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'voicevox_engine');
const REPO_ROOT = path.join(__dirname, '..', '..');
const HF_DIR = path.join(REPO_ROOT, 'hyperframes');
const MEDIA_DIR = path.join(HF_DIR, 'assets', 'media');
const REMOTION_DIR = path.join(REPO_ROOT, 'remotion');
const BGM_ROOT = path.join(REMOTION_DIR, 'assets', 'bgm');
const OUT_ROOT = path.join(__dirname, 'out');
const POST_LOG = path.join(REPO_ROOT, 'data', 'post_log.csv');
const HF_CLI = 'hyperframes@0.7.77';

function buildChapters(timedScenes) {
  const lines = [];
  for (let i = 0; i < timedScenes.length; i++) {
    const sc = timedScenes[i];
    let label = null;
    if (i === 0) label = 'はじめに';
    else if (sc.type === 'cta') label = 'まとめ・お知らせ';
    else if (sc.title) label = sc.title;
    if (!label) continue;
    const m = Math.floor(sc.start / 60);
    const s = Math.floor(sc.start % 60);
    lines.push(`${m}:${String(s).padStart(2, '0')} ${label}`);
  }
  if (lines.length < 3) return '';
  return '\n\n⏱ チャプター\n' + lines.join('\n');
}

function logPost(account, title, url) {
  const date = new Date().toISOString().slice(0, 10);
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  if (!fs.existsSync(POST_LOG)) {
    fs.mkdirSync(path.dirname(POST_LOG), { recursive: true });
    fs.writeFileSync(POST_LOG, 'date,account,title,url\n');
  }
  fs.appendFileSync(POST_LOG, [date, account, esc(title), url].join(',') + '\n');
}

// 無音のレンダリング結果に、ビートごとのナレーションとBGMを重ねる
function muxAudio(videoIn, videoOut, narrations, bgmPath, total) {
  const args = ['-y', '-i', videoIn];
  const filters = [];
  const labels = [];
  narrations.forEach((n, i) => {
    args.push('-i', n.file);
    const ms = Math.round(n.at * 1000);
    filters.push(`[${i + 1}:a]adelay=${ms}|${ms}[n${i}]`);
    labels.push(`[n${i}]`);
  });

  let last;
  if (labels.length) {
    filters.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:dropout_transition=0[nar]`);
    last = '[nar]';
  }
  if (bgmPath) {
    const bi = narrations.length + 1;
    args.push('-stream_loop', '-1', '-i', bgmPath);
    filters.push(`[${bi}:a]volume=0.07,atrim=0:${total}[bg]`);
    last = last ? (filters.push(`${last}[bg]amix=inputs=2:normalize=0:dropout_transition=0[aout]`), '[aout]') : '[bg]';
  }
  if (!last) { fs.copyFileSync(videoIn, videoOut); return; }

  args.push(
    '-filter_complex', filters.join(';'),
    '-map', '0:v', '-map', last,
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(total), videoOut
  );
  execFileSync('ffmpeg', args, { stdio: 'inherit', timeout: 1800000 });
}

async function uploadToYoutube(videoPath, title, description, refreshToken, thumbnailPath) {
  const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    try {
      await youtube.thumbnails.set({ videoId: res.data.id, media: { body: fs.createReadStream(thumbnailPath) } });
      console.log('サムネイル設定完了');
    } catch (e) {
      console.log('サムネイル設定失敗:', e.message);
    }
  }
  return res.data.id;
}

async function main() {
  const args = process.argv.slice(2);
  const noUpload = args.includes('--no-upload');
  const scriptPath = args.find((a) => !a.startsWith('--'));
  if (!scriptPath) { console.error('使い方: node hf_build_and_upload.js <台本.json> [--no-upload]'); process.exit(1); }
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const id = script.id || path.basename(scriptPath, '.json');

  await ensureEngine(ENGINE_DIR);
  const speaker = await resolveSpeakerId(script.speaker?.name || '玄野武宏', script.speaker?.style || 'ノーマル');

  const outDir = path.join(OUT_ROOT, id);
  const audioDir = path.join(outDir, 'audio');
  fs.rmSync(MEDIA_DIR, { recursive: true, force: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  fs.mkdirSync(audioDir, { recursive: true });

  // ビート単位でTTSを作る。字幕が読み上げとぴったり合うのはこれが理由
  const usedIds = new Set();
  const scenes = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    const audio = [];
    for (let j = 0; j < sc.beats.length; j++) {
      const text = sc.beats[j].sub || sc.beats[j].text || '。';
      const file = path.join(audioDir, `s${i + 1}b${j + 1}.wav`);
      await tts(text, speaker, file);
      audio.push({ file, dur: audioDuration(file) });
    }
    console.log(`TTS ${i + 1}/${script.scenes.length} (${sc.beats.length}ビート)`);

    let videoFile;
    if (sc.type === 'cut' || sc.type === 'stock') {
      const name = `stock${i + 1}.mp4`;
      const ok = await fetchStockVideo(sc.stockQuery || 'calm nature', path.join(MEDIA_DIR, name), usedIds);
      if (ok) videoFile = name;
      else console.log(`  実写が見つからず: ${sc.stockQuery}（濃紺のベタで続行）`);
    }
    scenes.push({ ...sc, audio, videoFile });
  }

  const { total, scenes: timed } = build(scenes, HF_DIR, { title: script.youtubeTitle, footer: script.footer, useChibi: !!script.useChibi });
  console.log(`合計 ${Math.floor(total / 60)}分${Math.round(total % 60)}秒 / ${timed.length}シーン`);

  try {
    execFileSync('npx', ['--yes', HF_CLI, 'check'], { cwd: HF_DIR, stdio: 'inherit', shell: true, timeout: 600000 });
  } catch (e) {
    console.log('checkに指摘あり（レンダリングは続行）');
  }

  fs.mkdirSync(outDir, { recursive: true });
  const silent = path.join(outDir, 'silent.mp4');
  execFileSync('npx', ['--yes', HF_CLI, 'render', '--output', silent], {
    cwd: HF_DIR, stdio: 'inherit', shell: true, timeout: 5400000,
  });

  const narrations = [];
  for (const sc of timed) {
    for (const b of sc.beats) {
      if (b.audioFile) narrations.push({ file: b.audioFile, at: b.absStart });
    }
  }
  const bgm = pickBgm(BGM_ROOT, script.mood || '穏やか');
  const videoPath = path.join(outDir, '本編.mp4');
  muxAudio(silent, videoPath, narrations, bgm, total);
  console.log(`完成: ${videoPath}`);

  let thumbnailPath;
  if (script.thumbnailText) {
    thumbnailPath = path.join(outDir, 'thumbnail.png');
    const thumbPropsPath = path.join(outDir, 'thumb-props.json');
    fs.writeFileSync(thumbPropsPath, JSON.stringify({
      text: script.thumbnailText,
      kicker: script.thumbnailKicker || '',
      footer: script.footer || '',
      accentIndex: Math.floor(Math.random() * 4),
    }, null, 2));
    try {
      execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'Thumbnail', thumbnailPath, `--props=${thumbPropsPath}`], {
        cwd: REMOTION_DIR, timeout: 300000, stdio: 'inherit', shell: true,
      });
      console.log('サムネイル生成完了:', thumbnailPath);
    } catch (e) {
      console.log('サムネイル生成失敗（続行）:', e.message);
      thumbnailPath = undefined;
    }
  }

  if (noUpload) { console.log('--no-upload のためアップロードしません'); return; }
  if (!script.account) return;
  const accountsJson = process.env.ACCOUNTS_JSON;
  if (!accountsJson) { console.log('ACCOUNTS_JSON未設定のためアップロードをスキップ'); return; }
  const acc = JSON.parse(accountsJson)[script.account];
  if (!acc?.refreshToken) { console.log(`アカウント${script.account}のrefreshTokenがありません`); return; }
  // 概要欄は「もっと見る」を押さないと下が隠れるため、LINEリンクは埋もれないよう一番上に出す
  const lineHeader = script.lineUrl
    ? `▼${script.lineHook || '無料LINE配信'}\n${script.lineUrl}\n（売り込みはありません。読むだけでOKです）\n\n`
    : '';
  const description = lineHeader + script.description + buildChapters(timed) + (script.cta || '');
  try {
    const videoId = await uploadToYoutube(videoPath, script.youtubeTitle, description, acc.refreshToken, thumbnailPath);
    const videoUrl = 'https://youtu.be/' + videoId;
    console.log('アップロード完了: ' + videoUrl);
    logPost(script.account, script.youtubeTitle, videoUrl);
  } catch (e) {
    console.log('アップロード失敗:', e.message);
    process.exitCode = 1;
  }
}

main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
