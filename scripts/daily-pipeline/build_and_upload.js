// 台本JSON → VOICEVOX(無料TTS) → Pexels/Pixabay実写 → Remotionレンダリング → YouTube自動アップロード
// GitHub Actions(Ubuntu)想定。ENGINE_DIR環境変数でVOICEVOXエンジンのrunバイナリのディレクトリを指定する
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const { google } = require('googleapis');

const ENGINE = 'http://127.0.0.1:50021';
const ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'voicevox_engine');
const REMOTION_DIR = path.join(__dirname, '..', '..', 'remotion');
const BGM_ROOT = path.join(REMOTION_DIR, 'assets', 'bgm');
const SE_DIR = path.join(REMOTION_DIR, 'assets', 'se');
const OUT_ROOT = path.join(__dirname, 'out');
const POST_LOG = path.join(__dirname, '..', '..', 'data', 'post_log.csv');
const PEXELS_KEY = process.env.PEXELS_API_KEY;
const PIXABAY_KEY = process.env.PIXABAY_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function engineAlive() {
  try {
    const res = await fetch(`${ENGINE}/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch { return false; }
}

function findRunBinary(dir) {
  if (!fs.existsSync(dir)) return null;
  const names = ['run', 'run.exe'];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isFile() && names.includes(e.name.toLowerCase())) return full;
      if (e.isDirectory()) stack.push(full);
    }
  }
  return null;
}

async function ensureEngine() {
  if (await engineAlive()) return;
  const exe = findRunBinary(ENGINE_DIR);
  if (!exe) throw new Error(`VOICEVOXエンジンが見つかりません: ${ENGINE_DIR}`);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(exe, 0o755); } catch {}
  }
  console.log('VOICEVOXエンジンを起動中...', exe);
  const child = spawn(exe, [], { detached: true, stdio: 'inherit', cwd: path.dirname(exe) });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (await engineAlive()) { console.log('エンジン起動OK'); return; }
  }
  throw new Error('VOICEVOXエンジンが3分以内に起動しませんでした');
}

async function resolveSpeakerId(name, styleName) {
  const res = await fetch(`${ENGINE}/speakers`);
  const speakers = await res.json();
  const sp = speakers.find((s) => s.name === name);
  if (!sp) throw new Error(`話者「${name}」が見つかりません`);
  const style = sp.styles.find((st) => st.name === styleName) || sp.styles[0];
  console.log(`話者: ${name}(${style.name}) id=${style.id}`);
  return style.id;
}

async function tts(text, speaker, outPath) {
  const q = await fetch(`${ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  if (!q.ok) throw new Error(`audio_query失敗 ${q.status}`);
  const query = await q.json();
  query.speedScale = 1.0;
  query.postPhonemeLength = 0.3;
  const s = await fetch(`${ENGINE}/synthesis?speaker=${speaker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  if (!s.ok) throw new Error(`synthesis失敗 ${s.status}`);
  fs.writeFileSync(outPath, Buffer.from(await s.arrayBuffer()));
}

function audioDuration(p) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  return parseFloat(out.toString().trim());
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ダウンロード失敗 ${res.status}: ${url}`);
  fs.writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
}

async function fetchStockVideo(query, outPath, usedIds) {
  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    const json = await res.json();
    for (const v of json.videos || []) {
      if (usedIds.has(`px_${v.id}`) || v.duration < 5) continue;
      const files = (v.video_files || [])
        .filter((f) => f.file_type === 'video/mp4' && f.width >= 1280 && f.width <= 2560)
        .sort((a, b) => b.width - a.width);
      if (!files.length) continue;
      await download(files[0].link, outPath);
      usedIds.add(`px_${v.id}`);
      console.log(`  実写動画(Pexels): ${query} -> ${v.id}`);
      return true;
    }
  } catch (e) { console.log('  Pexels失敗:', e.message); }
  try {
    const res = await fetch(`https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&per_page=15`);
    const json = await res.json();
    for (const v of json.hits || []) {
      if (usedIds.has(`pb_${v.id}`) || v.duration < 5) continue;
      const f = v.videos?.large?.url || v.videos?.medium?.url;
      if (!f) continue;
      await download(f, outPath);
      usedIds.add(`pb_${v.id}`);
      console.log(`  実写動画(Pixabay): ${query} -> ${v.id}`);
      return true;
    }
  } catch (e) { console.log('  Pixabay失敗:', e.message); }
  return false;
}

function pickBgm(mood) {
  const dir = path.join(BGM_ROOT, mood);
  const candidates = [];
  for (const d of [dir, BGM_ROOT]) {
    if (fs.existsSync(d)) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isFile() && /\.(mp3|wav|m4a)$/i.test(f.name)) candidates.push(path.join(d, f.name));
      }
      if (candidates.length) break;
    }
  }
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

function pickSe() {
  if (!fs.existsSync(SE_DIR)) return null;
  const files = fs.readdirSync(SE_DIR).filter((f) => /\.(mp3|wav)$/i.test(f));
  if (!files.length) return null;
  return path.join(SE_DIR, files.find((f) => /transition/i.test(f)) || files[0]);
}

// 概要欄用のチャプター文字列を組み立てる(0:00 はじめに / m:ss 見出し ...)
// YouTubeの仕様: 0:00開始・3個以上・各10秒以上でチャプターとして認識される
function buildChapters(renderScenes, scriptScenes) {
  const lines = [];
  let t = 0;
  for (let i = 0; i < renderScenes.length; i++) {
    const src = scriptScenes[i] || {};
    let label = null;
    if (i === 0) label = 'はじめに';
    else if (src.type === 'cta') label = 'まとめ・お知らせ';
    else if (src.title) label = src.title;
    if (label) {
      const m = Math.floor(t / 60);
      const sec = Math.floor(t % 60);
      lines.push(`${m}:${String(sec).padStart(2, '0')} ${label}`);
    }
    t += renderScenes[i].durationInSeconds;
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
  const scriptPath = process.argv[2];
  if (!scriptPath) { console.error('使い方: node build_and_upload.js <台本.json>'); process.exit(1); }
  const script = JSON.parse(fs.readFileSync(scriptPath, 'utf-8'));
  const id = script.id || path.basename(scriptPath, '.json');

  await ensureEngine();
  const speaker = await resolveSpeakerId(script.speaker?.name || '玄野武宏', script.speaker?.style || 'ノーマル');

  const publicDir = path.join(REMOTION_DIR, 'public', id);
  fs.mkdirSync(publicDir, { recursive: true });

  // RichSlideVideoはビート効果音をse/、ちびキャラをsatoshi_chibi/(publicルート直下)で参照するため、assetsからコピーしておく
  fs.cpSync(path.join(REMOTION_DIR, 'assets', 'se'), path.join(REMOTION_DIR, 'public', 'se'), { recursive: true });
  if (script.useChibi) {
    const chibiSrc = path.join(REMOTION_DIR, 'assets', 'satoshi_chibi');
    const chibiDst = path.join(REMOTION_DIR, 'public', 'satoshi_chibi');
    fs.mkdirSync(path.join(chibiDst, 'poses'), { recursive: true });
    for (const f of fs.readdirSync(chibiSrc)) {
      if (f.startsWith('mouth_')) fs.copyFileSync(path.join(chibiSrc, f), path.join(chibiDst, f));
    }
    for (const f of fs.readdirSync(path.join(chibiSrc, 'poses'))) {
      fs.copyFileSync(path.join(chibiSrc, 'poses', f), path.join(chibiDst, 'poses', f));
    }
  }

  const seSrc = pickSe();
  let seFile = null;
  if (seSrc) {
    seFile = `${id}/se${path.extname(seSrc)}`;
    fs.copyFileSync(seSrc, path.join(publicDir, path.basename(seFile)));
  }

  const usedIds = new Set();
  const scenes = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const sc = script.scenes[i];
    const narration = sc.beats.map((b) => b.sub).join('');
    const audioFile = `audio${i + 1}.wav`;
    const audioFull = path.join(publicDir, audioFile);
    console.log(`TTS ${i + 1}/${script.scenes.length} (${narration.length}文字)...`);
    await tts(narration, speaker, audioFull);
    const dur = audioDuration(audioFull);

    let video;
    if (sc.type === 'stock') {
      const vFile = `stock${i + 1}.mp4`;
      const vFull = path.join(publicDir, vFile);
      const ok = await fetchStockVideo(sc.stockQuery || 'nature', vFull, usedIds);
      if (!ok) console.log(`  実写動画が見つからず: ${sc.stockQuery}（黒背景で続行）`);
      if (fs.existsSync(vFull)) video = `${id}/${vFile}`;
    }

    scenes.push({
      type: sc.type,
      layout: sc.layout,
      separator: sc.separator,
      title: sc.title,
      kicker: sc.kicker,
      beats: sc.beats,
      audio: `${id}/${audioFile}`,
      video,
      se: i > 0 ? seFile || undefined : undefined,
      pose: sc.pose,
      durationInSeconds: Math.round((dur + 0.7) * 10) / 10,
    });
  }

  const bgmSrc = pickBgm(script.mood || '穏やか');
  let bgm;
  if (bgmSrc) {
    bgm = `${id}/bgm${path.extname(bgmSrc)}`;
    fs.copyFileSync(bgmSrc, path.join(publicDir, path.basename(bgm)));
  }

  const outDir = path.join(OUT_ROOT, id);
  fs.mkdirSync(outDir, { recursive: true });
  const propsPath = path.join(outDir, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes, bgm, footer: script.footer, showChibi: !!script.useChibi }, null, 2));

  const totalSec = scenes.reduce((a, s) => a + s.durationInSeconds, 0);
  console.log(`合計 ${Math.floor(totalSec / 60)}分${Math.round(totalSec % 60)}秒 / ${scenes.length}シーン → レンダリング開始`);

  const videoPath = path.join(outDir, '本編.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'RichSlideVideo', videoPath, `--props=${propsPath}`], {
    cwd: REMOTION_DIR, timeout: 3600000, stdio: 'inherit', shell: true,
  });
  console.log(`完成: ${videoPath}`);

  let thumbnailPath;
  if (script.thumbnailText) {
    thumbnailPath = path.join(outDir, 'thumbnail.png');
    const thumbProps = {
      text: script.thumbnailText,
      kicker: script.thumbnailKicker || '',
      footer: script.footer || '',
      accentIndex: Math.floor(Math.random() * 4),
    };
    const thumbPropsPath = path.join(outDir, 'thumb-props.json');
    fs.writeFileSync(thumbPropsPath, JSON.stringify(thumbProps, null, 2));
    execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'Thumbnail', thumbnailPath, `--props=${thumbPropsPath}`], {
      cwd: REMOTION_DIR, timeout: 300000, stdio: 'inherit', shell: true,
    });
    console.log('サムネイル生成完了:', thumbnailPath);
  }

  if (script.account) {
    const accountsJson = process.env.ACCOUNTS_JSON;
    if (!accountsJson) { console.log('ACCOUNTS_JSON未設定のためアップロードをスキップ'); return; }
    const accounts = JSON.parse(accountsJson);
    const acc = accounts[script.account];
    if (!acc?.refreshToken) { console.log(`アカウント${script.account}のrefreshTokenがありません`); return; }
    const cta = script.cta || '';
    const chapters = buildChapters(scenes, script.scenes);
    const description = script.description + chapters + cta;
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
}

main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
