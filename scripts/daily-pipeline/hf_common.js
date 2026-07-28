// HyperFrames版パイプラインで使う共通処理(VOICEVOX・実写取得・BGM選択)。
// 中身はbuild_and_upload.js(Remotion版)と同じ。8チャンネル全部をHyperFramesに移したら
// Remotion版ごと消して、この1本に寄せる。移行中は稼働中のRemotion版に触らないため意図的に分けている。
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ENGINE = 'http://127.0.0.1:50021';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function engineAlive() {
  try {
    const res = await fetch(`${ENGINE}/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
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

async function ensureEngine(engineDir) {
  if (await engineAlive()) return;
  const exe = findRunBinary(engineDir);
  if (!exe) throw new Error(`VOICEVOXエンジンが見つかりません: ${engineDir}`);
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
  const PEXELS_KEY = process.env.PEXELS_API_KEY;
  const PIXABAY_KEY = process.env.PIXABAY_API_KEY;
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

function pickBgm(bgmRoot, mood) {
  const dir = path.join(bgmRoot, mood);
  const candidates = [];
  for (const d of [dir, bgmRoot]) {
    if (fs.existsSync(d)) {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        if (f.isFile() && /\.(mp3|wav|m4a)$/i.test(f.name)) candidates.push(path.join(d, f.name));
      }
      if (candidates.length) break;
    }
  }
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

module.exports = { ensureEngine, resolveSpeakerId, tts, audioDuration, fetchStockVideo, pickBgm, download };
