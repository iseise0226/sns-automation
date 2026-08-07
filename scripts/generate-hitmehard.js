// 「ハッとしたんだよね」: satoshi_mind_coaching専用の日替わりInstagramリール生成・投稿
// ちびキャラ×鉛筆画5枚(背景は毎回変える)+ VOICEVOXナレーション15フレーズ(結起承転結×3)
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, spawn } = require('child_process');
const { google } = require('googleapis');

function req(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: options.headers || {} },
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

const ACCOUNT = 'satoshi_mind_coaching';
const IG_USER_ID = '17841417429080871';
const SLIDE_COUNT = 5;
const PHRASES_PER_SLIDE = 3;

const SYSTEM_PROMPT =
  'あなたは聖（さとし）。美容師歴25年以上、算命学の鑑定を300人以上やってきた50代の経営者。一人称は「僕」。' +
  '日常のちょっとした辛さ・しんどさから始まり、ふとした瞬間に考え方が変わって前向きになる、という物語を毎回違う具体的なエピソードで作る。' +
  '説教くさくならず、自分の失敗や弱さも正直に見せながら、隣に座って話すような優しい語り口にする。';

// Groqが失敗したらOpenAI(gpt-4o-mini)にフォールバック
async function callTextAI(messages, maxTokens) {
  const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await req(
      'https://api.groq.com/openai/v1/chat/completions',
      { method: 'POST', headers: { Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`, 'Content-Type': 'application/json' } },
      body
    );
    const content = res.json?.choices?.[0]?.message?.content;
    if (content) return content;
    const errStr = JSON.stringify(res.json || {}).slice(0, 300);
    if (/tokens per day|TPD/i.test(errStr)) break;
    if (attempt < 3 && /rate limit|429/i.test(errStr)) {
      await new Promise((r) => setTimeout(r, 65000));
      continue;
    }
    break;
  }
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) throw new Error('Groqで台本生成できず、OPENAI_API_KEYも未設定');
  const res2 = await req(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } },
    JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } })
  );
  const content2 = res2.json?.choices?.[0]?.message?.content;
  if (!content2) throw new Error('OpenAIフォールバックも失敗');
  return content2;
}

async function generateScenario() {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content:
        '今日の具体的なエピソードを1つ考えて、「結(結論)→起(辛かった日常)→承(それでも続けた)→転(気づき)→結び直し」の5段階構成で書いてください。' +
        `各段階につき日本語1行(15〜20字程度)を${PHRASES_PER_SLIDE}個作ってください(合計${SLIDE_COUNT * PHRASES_PER_SLIDE}行)。各日本語行に対応する英訳も1行ずつ付けてください。` +
        '各段階(5つ)にはそれぞれ全く違う背景シーンを英語で考えてください(例: 横断歩道、川辺、屋上、丘の上、窓辺など、5つとも別ロケーションで内容の雰囲気に合うもの)。' +
        'さらにInstagramキャプションを5〜8行、最後にテーマに合うハッシュタグ5個を付けて考えてください。' +
        'JSON形式で返してください: {"caption":"...", "slides":[5個。各{"scene":"英語のシーン描写(場所・状況、キャラの描写は含めない)","phrases":[3個。各{"jp":"...","en":"..."}]}]}',
    },
  ];
  const content = await callTextAI(messages, 3000);
  const data = JSON.parse(content || '{}');
  if (!Array.isArray(data.slides) || data.slides.length !== SLIDE_COUNT) {
    throw new Error(`slidesが${SLIDE_COUNT}個ではありません: ${JSON.stringify(data).slice(0, 300)}`);
  }
  for (const s of data.slides) {
    if (!Array.isArray(s.phrases) || s.phrases.length !== PHRASES_PER_SLIDE) {
      throw new Error(`phrasesが${PHRASES_PER_SLIDE}個ではないスライドがあります`);
    }
  }
  return data;
}

const CHIBI_STYLE =
  "Hand-drawn pencil sketch illustration on beige textured paper, cute chibi character with a large round head and tiny simple body (2-head-tall proportions), short spiky black hair, simple dot eyes and small smile, wearing a plain vest over a long-sleeve shirt, loose sketchy pencil linework with visible pencil texture and light shading, soft muted sepia pencil tones, no text, no letters, no watermark, minimalist Japanese sketch diary aesthetic";

async function requestImage(scene) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  const prompt =
    `${CHIBI_STYLE}. The chibi character is ${scene}. ` +
    'Draw a full sketched background environment that clearly shows this location and its mood ' +
    '(e.g. buildings, trees, furniture, sky, ground texture, or room details, all in the same loose pencil-sketch style) ' +
    '- the background should fill the scene and set the atmosphere, not be left blank or mostly empty paper. ' +
    'The character stays small in the frame relative to the surrounding scene.';
  const res = await req(
    'https://api.openai.com/v1/images/generations',
    { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } },
    JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: 'low', n: 1 })
  );
  const b64 = res.json?.data?.[0]?.b64_json;
  if (!b64) throw new Error(`status=${res.status} ${JSON.stringify(res.json || res.raw || {}).slice(0, 300)}`);
  return b64;
}

// AIが考えた場面描写がOpenAIの安全フィルタ(self-harm等)に引っかかることがあるため、
// 一度弾かれたら場面描写を汎用的なもの(座って考え込む/窓辺で微笑む等)に差し替えて再挑戦する。
// それでも失敗する場合は動画生成自体を止めず、最も無難な場面で通す。
const SAFE_FALLBACK_SCENES = [
  'sitting quietly at a desk, calm expression',
  'standing by a window, gentle smile',
  'walking on a quiet street, looking forward',
  'sitting on a park bench, relaxed posture',
  'looking up at the sky, peaceful expression',
];

async function generateImage(scene, outPath, slideIndex = 0) {
  let lastErr;
  const candidates = [scene, SAFE_FALLBACK_SCENES[slideIndex % SAFE_FALLBACK_SCENES.length]];
  for (const candidate of candidates) {
    try {
      const b64 = await requestImage(candidate);
      if (!b64) throw new Error('画像データが空です');
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      return;
    } catch (e) {
      lastErr = e;
      console.log(`画像生成リトライ(${candidate}): ${e.message.slice(0, 200)}`);
    }
  }
  throw new Error(`画像生成失敗(フォールバックも失敗): ${lastErr?.message?.slice(0, 300)}`);
}

// --- VOICEVOX (generate-reel.jsと同じ仕組みを流用) ---
const VOICEVOX_ENGINE = 'http://127.0.0.1:50021';
const VOICEVOX_ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'daily-pipeline', 'voicevox_engine');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function voicevoxAlive() {
  try {
    const res = await fetch(`${VOICEVOX_ENGINE}/version`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

function findVoicevoxRunBinary(dir) {
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

async function ensureVoicevoxEngine() {
  if (await voicevoxAlive()) return;
  const exe = findVoicevoxRunBinary(VOICEVOX_ENGINE_DIR);
  if (!exe) throw new Error(`VOICEVOXエンジンが見つかりません: ${VOICEVOX_ENGINE_DIR}`);
  if (process.platform !== 'win32') {
    try { fs.chmodSync(exe, 0o755); } catch (e) {}
  }
  const child = spawn(exe, [], { detached: true, stdio: 'inherit', cwd: path.dirname(exe) });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (await voicevoxAlive()) return;
  }
  throw new Error('VOICEVOXエンジンが3分以内に起動しませんでした');
}

async function resolveSpeakerId() {
  const res = await fetch(`${VOICEVOX_ENGINE}/speakers`);
  const speakers = await res.json();
  const sp = speakers.find((s) => s.name === '玄野武宏') || speakers[0];
  const style = sp.styles.find((st) => st.name === 'ノーマル') || sp.styles[0];
  return style.id;
}

async function generateNarration(text, speaker, outPath) {
  const q = await fetch(`${VOICEVOX_ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' });
  const query = await q.json();
  query.speedScale = 0.85;
  query.pauseLengthScale = 1.2;
  query.prePhonemeLength = 0.0;
  query.postPhonemeLength = 0.1;
  const s = await fetch(`${VOICEVOX_ENGINE}/synthesis?speaker=${speaker}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  });
  fs.writeFileSync(outPath, Buffer.from(await s.arrayBuffer()));
}

function getAudioDuration(audioPath) {
  const out = execFileSync('ffprobe', ['-i', audioPath, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'], { timeout: 15000 })
    .toString()
    .trim();
  return parseFloat(out);
}

// 長い1行は画面幅(1080px)からはみ出て字幕が切れるため、句読点付近か中央で2行に折り返す
function wrapJp(text, maxPerLine = 13) {
  const chars = [...text];
  if (chars.length <= maxPerLine) return text;
  const mid = Math.ceil(chars.length / 2);
  let splitAt = -1;
  for (let offset = 0; offset < mid; offset++) {
    if (mid - offset > 0 && '、。'.includes(chars[mid - offset - 1])) { splitAt = mid - offset; break; }
    if (mid + offset < chars.length && '、。'.includes(chars[mid + offset])) { splitAt = mid + offset + 1; break; }
  }
  if (splitAt <= 0 || splitAt >= chars.length) splitAt = mid;
  return chars.slice(0, splitAt).join('') + '\n' + chars.slice(splitAt).join('');
}

function wrapEn(text, maxPerLine = 24) {
  if (text.length <= maxPerLine) return text;
  const words = text.split(' ');
  let line1 = '';
  let i = 0;
  while (i < words.length && (line1 + words[i]).length <= maxPerLine) {
    line1 += (line1 ? ' ' : '') + words[i];
    i++;
  }
  const line2 = words.slice(i).join(' ');
  return line2 ? `${line1}\n${line2}` : line1;
}

// 15ビート(5スライド×3フレーズ)を組み立てて最終動画を作る
function buildVideo(outDir, slides) {
  const beats = [];
  slides.forEach((slide, slideIdx) => {
    slide.phrases.forEach((p, pIdx) => {
      beats.push({ slideIdx, jp: p.jp, en: p.en });
    });
  });

  const segFiles = [];
  beats.forEach((beat, i) => {
    const n = i + 1;
    const jpRel = `jp${n}.txt`;
    const enRel = `en${n}.txt`;
    fs.writeFileSync(path.join(outDir, jpRel), wrapJp(beat.jp), 'utf-8');
    fs.writeFileSync(path.join(outDir, enRel), wrapEn(beat.en), 'utf-8');
    const audioRel = `narration${n}.wav`;
    const imgRel = `slide${beat.slideIdx + 1}.png`;
    const dur = (getAudioDuration(path.join(outDir, audioRel)) + 0.5).toFixed(2);
    const segRel = `seg${n}.mp4`;
    // 絶対パス(Windowsのドライブレター"C:")はffmpegのフィルタ構文と衝突するため、
    // cwd=outDirにして全て相対パスで渡す(Linux/Windows両対応)
    execFileSync(
      'ffmpeg',
      [
        '-y', '-loop', '1', '-i', imgRel, '-i', audioRel,
        '-filter_complex',
        // Instagram Reelsは9:16(1080x1920)必須。4:5(1080x1350)だとMedia upload failed(2207077)で弾かれるため
        // 元画像(1024x1536)を高さ基準でカバースケール→幅を1080に中央クロップして縦長キャンバスにする
        `[0:v]scale=1280:1920,crop=1080:1920,drawtext=font='Noto Sans CJK JP':textfile='${jpRel}':fontcolor=black:fontsize=54:line_spacing=8:x=(w-text_w)/2:y=1420:box=1:boxcolor=white@0.75:boxborderw=20,drawtext=font='Noto Sans CJK JP':textfile='${enRel}':fontcolor=white:fontsize=40:line_spacing=6:bordercolor=black@0.8:borderw=4:x=(w-text_w)/2:y=1660,fps=30[v];[1:a]aresample=48000,apad[a]`,
        '-map', '[v]', '-map', '[a]', '-t', String(dur),
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000',
        segRel,
      ],
      { cwd: outDir, timeout: 60000, stdio: 'inherit' }
    );
    segFiles.push(segRel);
  });

  fs.writeFileSync(path.join(outDir, 'concat_list.txt'), segFiles.map((f) => `file '${f}'`).join('\n'), 'utf-8');
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', 'concat_list.txt', '-c', 'copy', 'video.mp4'], { cwd: outDir, timeout: 60000, stdio: 'inherit' });
  return path.join(outDir, 'video.mp4');
}

function isDirectVideoUrl(url) {
  try {
    const out = execFileSync('curl', ['-s', '-I', '-L', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url], { timeout: 30000 }).toString().trim();
    const [code, type] = out.split(' ');
    return code === '200' && (type || '').startsWith('video/');
  } catch (e) {
    return false;
  }
}

function uploadPublic(videoPath) {
  const uploaders = [
    { name: 'litterbox', run: () => execFileSync('curl', ['-s', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'], { timeout: 300000 }).toString().trim() },
    { name: 'uguu', run: () => execFileSync('curl', ['-s', '-F', `files[]=@${videoPath}`, 'https://uguu.se/upload?output=text'], { timeout: 300000 }).toString().trim() },
    { name: 'tmpfiles', run: () => { const out = execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload'], { timeout: 300000 }).toString(); return JSON.parse(out).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'); } },
  ];
  for (const up of uploaders) {
    try {
      const url = up.run();
      if (url.startsWith('https://') && isDirectVideoUrl(url)) return url;
    } catch (e) {}
  }
  throw new Error('全アップロードホストが失敗しました');
}

async function postReel(videoPath, caption) {
  const igToken = (process.env.IG_TOKEN_SATOSHI_MIND_COACHING || '').trim();
  const publicUrl = uploadPublic(videoPath);
  console.log(`upload: ${publicUrl}`);
  const container = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`,
      '-d', 'media_type=REELS', '-d', `video_url=${encodeURIComponent(publicUrl)}`, '-d', `caption=${encodeURIComponent(caption)}`,
      '-d', 'thumb_offset=1500', '-d', `access_token=${igToken}`]).toString()
  );
  if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);
  let statusCode = 'IN_PROGRESS';
  for (let i = 0; i < 20 && statusCode !== 'FINISHED'; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const statusRes = JSON.parse(execFileSync('curl', ['-s', `https://graph.facebook.com/v23.0/${container.id}?fields=status_code,status&access_token=${igToken}`]).toString());
    statusCode = statusRes.status_code;
    if (statusCode === 'ERROR') throw new Error(`processing error: ${JSON.stringify(statusRes)}`);
  }
  if (statusCode !== 'FINISHED') throw new Error(`processing timeout: ${statusCode}`);
  const publish = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', `https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`, '-d', `creation_id=${container.id}`, '-d', `access_token=${igToken}`]).toString()
  );
  if (!publish.id) throw new Error(`publish failed: ${JSON.stringify(publish)}`);
  return publish;
}

// YouTube Shorts投稿(WF6のbuild_and_upload.jsと同じACCOUNTS_JSONの仕組みを流用)
async function postYoutubeShort(videoPath, title, description) {
  const accountsJson = process.env.ACCOUNTS_JSON;
  if (!accountsJson) {
    console.log('ACCOUNTS_JSON未設定のためYouTube投稿をスキップ');
    return null;
  }
  const accounts = JSON.parse(accountsJson);
  const acc = accounts.satoshi_mind_coach;
  if (!acc?.refreshToken) {
    console.log('satoshi_mind_coachのrefreshTokenがないためYouTube投稿をスキップ');
    return null;
  }
  const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: acc.refreshToken });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title: `${title} #Shorts`, description, categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  return 'https://youtu.be/' + res.data.id;
}

async function main() {
  await ensureVoicevoxEngine();
  const speaker = await resolveSpeakerId();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve('hitmehard_media', today);
  fs.mkdirSync(outDir, { recursive: true });

  console.log('台本生成中...');
  const scenario = await generateScenario();
  console.log('caption:', scenario.caption);

  for (let i = 0; i < SLIDE_COUNT; i++) {
    console.log(`画像生成中 ${i + 1}/${SLIDE_COUNT}...`);
    await generateImage(scenario.slides[i].scene, path.join(outDir, `slide${i + 1}.png`), i);
  }

  let n = 0;
  for (const slide of scenario.slides) {
    for (const p of slide.phrases) {
      n++;
      console.log(`ナレーション生成中 ${n}/${SLIDE_COUNT * PHRASES_PER_SLIDE}...`);
      await generateNarration(p.jp, speaker, path.join(outDir, `narration${n}.wav`));
    }
  }

  console.log('動画組み立て中...');
  const videoPath = buildVideo(outDir, scenario.slides);
  console.log('video:', videoPath);

  const caption = scenario.caption + '\n\nプロフィールのリンクから、経営者の心が軽くなる7日間の無料配信を受け取れます😊';
  if (process.env.HITMEHARD_DRY_RUN === 'true') {
    console.log('DRY RUN: 投稿をスキップしました。caption:', caption);
    return;
  }
  const result = await postReel(videoPath, caption);
  console.log('posted (IG):', result.id);

  try {
    const title = scenario.slides[0].phrases[0].jp.slice(0, 90);
    const youtubeUrl = await postYoutubeShort(videoPath, title, caption);
    if (youtubeUrl) console.log('posted (YouTube):', youtubeUrl);
  } catch (e) {
    console.error('YouTube投稿失敗(Instagramへの投稿は成功済み):', e.message);
  }
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
