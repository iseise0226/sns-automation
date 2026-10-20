// WF4: 「3秒クリップ+中央の白い大きな字幕+ナレーション」のひとことリールを生成・投稿する(ise_sato_kosodate, 2026-10-20〜)
// 素材は prepare-clips.js で切ったクリップ(remotion/assets/clips/<set>)。1シーン3秒×N本(既定10本=30秒)。
// wf4_accounts.json で "format": "clip-quote" のアカウントだけ run-wf4.js がこちらを呼ぶ。
// generate-reel.js はファイル末尾で main() を実行するため require できない。共通処理はここに写している。
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, spawn } = require('child_process');

const DRYRUN = Boolean(process.env.WF4_DRYRUN);
const SCENE_SECONDS = 3;

const REMOTION_DIR = path.join(__dirname, '..', 'remotion');
const BGM_DIR = path.join(REMOTION_DIR, 'assets', 'bgm_list');
const CLIPS_DIR = path.join(REMOTION_DIR, 'assets', 'clips');
const DATA_DIR = path.join(__dirname, '..', 'data');
const USED_CLIPS_DIR = path.join(DATA_DIR, 'wf4_clip_used');
const TOPICS_DIR = path.join(DATA_DIR, 'wf4_list_topics');
const LAST_RUN_PATH = path.join(DATA_DIR, 'wf4_last_run.json');

function req(url, options = {}, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          if (options.binary) return resolve(data);
          try {
            resolve({ status: res.statusCode, json: JSON.parse(data.toString('utf8') || '{}') });
          } catch (e) {
            resolve({ status: res.statusCode, json: null, raw: data.toString('utf8') });
          }
        });
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

// generate-reel.js と同じ: Groq(gpt-oss-120b) → 429は待って再試行 → だめならOpenAI
async function callLLM(messages, maxTokens) {
  const body = JSON.stringify({ model: 'openai/gpt-oss-120b', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } });
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await req(
      'https://api.groq.com/openai/v1/chat/completions',
      { method: 'POST', headers: { Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`, 'Content-Type': 'application/json' } },
      body
    );
    const content = res.json?.choices?.[0]?.message?.content;
    if (content) return content;
    lastErr = JSON.stringify(res.json || {}).slice(0, 400);
    if (/tokens per day|TPD/i.test(lastErr)) break;
    if (attempt < 3 && /rate limit|429/i.test(lastErr)) {
      const m = lastErr.match(/try again in ([0-9.]+)s/i);
      const waitSec = m ? Math.ceil(parseFloat(m[1])) + 5 : 65;
      console.error(`Groqレート制限。${waitSec}秒待って再試行(${attempt}/2)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    break;
  }
  console.error(`Groq応答が空: ${lastErr}`);
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) throw new Error('Groqで台本を生成できず、OPENAI_API_KEYも未設定のため中止します');
  console.error('GroqからOpenAI(gpt-4o-mini)にフォールバックします');
  const res2 = await req(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } },
    JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } })
  );
  const content2 = res2.json?.choices?.[0]?.message?.content;
  if (!content2) throw new Error('OpenAIフォールバックも失敗: ' + JSON.stringify(res2.json || {}).slice(0, 300));
  return content2;
}

function readJson(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

// VOICEVOX(無料・ローカルエンジン)でTTS生成。ElevenLabsのクレジット枯渇を気にせず毎日投稿するため2026-07-26に移行。
// 既定は男声(玄野武宏)。女性ペルソナのアカウントはwf4_accounts.jsonのvoicevoxName/voicevoxStyleで上書きする(sessi_life=四国めたん等)
const VOICEVOX_ENGINE = 'http://127.0.0.1:50021';
const VOICEVOX_ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'daily-pipeline', 'voicevox_engine');
const DEFAULT_VOICEVOX_NAME = '玄野武宏';
const DEFAULT_VOICEVOX_STYLE = 'ノーマル';

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
    try {
      fs.chmodSync(exe, 0o755);
    } catch (e) {}
  }
  console.log('VOICEVOXエンジンを起動中...', exe);
  const child = spawn(exe, [], { detached: true, stdio: 'inherit', cwd: path.dirname(exe) });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (await voicevoxAlive()) {
      console.log('エンジン起動OK');
      return;
    }
  }
  throw new Error('VOICEVOXエンジンが3分以内に起動しませんでした');
}
async function resolveVoicevoxSpeaker(name, styleName) {
  const res = await fetch(`${VOICEVOX_ENGINE}/speakers`);
  const speakers = await res.json();
  const sp = speakers.find((s) => s.name === name) || speakers[0];
  if (!sp) throw new Error('VOICEVOXの話者一覧が取得できません');
  const style = sp.styles.find((st) => st.name === styleName) || sp.styles[0];
  console.log(`話者: ${sp.name}(${style.name}) id=${style.id}`);
  return style.id;
}
// generate-reel.js と同じ: 一時アップロード先を順に試し、直リンクとして使えるものを採用
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
    {
      name: 'litterbox',
      run: () =>
        execFileSync('curl', ['-s', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'], { timeout: 300000 })
          .toString()
          .trim(),
    },
    { name: 'uguu', run: () => execFileSync('curl', ['-s', '-F', `files[]=@${videoPath}`, 'https://uguu.se/upload?output=text'], { timeout: 300000 }).toString().trim() },
    {
      name: 'tmpfiles',
      run: () => JSON.parse(execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload'], { timeout: 300000 }).toString()).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/'),
    },
  ];
  for (const up of uploaders) {
    try {
      const url = up.run();
      if (url.startsWith('https://') && isDirectVideoUrl(url)) {
        console.log(`upload host: ${up.name}`);
        return url;
      }
      console.log(`${up.name} rejected: ${url.slice(0, 120)}`);
    } catch (e) {
      console.log(`${up.name} error:`, e.message.slice(0, 120));
    }
  }
  throw new Error('全アップロードホストが失敗しました');
}

async function postReel(account, igUserId, videoPath, caption) {
  const igToken = (process.env[`IG_TOKEN_${account.toUpperCase()}`] || '').trim();
  const publicUrl = uploadPublic(videoPath);
  const curlJson = (args) => JSON.parse(execFileSync('curl', ['-s', ...args]).toString());
  const container = curlJson([
    '-X', 'POST', `https://graph.facebook.com/v23.0/${igUserId}/media`,
    '-d', 'media_type=REELS',
    '-d', `video_url=${encodeURIComponent(publicUrl)}`,
    '-d', `caption=${encodeURIComponent(caption)}`,
    // 一覧が出ている1秒地点を表紙にする
    '-d', 'thumb_offset=1000',
    '-d', `access_token=${igToken}`,
  ]);
  if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);
  let statusCode = 'IN_PROGRESS';
  for (let i = 0; i < 20 && statusCode !== 'FINISHED'; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const st = curlJson([`https://graph.facebook.com/v23.0/${container.id}?fields=status_code,status&access_token=${igToken}`]);
    statusCode = st.status_code;
    if (statusCode === 'ERROR') throw new Error(`processing error: ${JSON.stringify(st)}`);
  }
  if (statusCode !== 'FINISHED') throw new Error(`processing timeout: ${statusCode}`);
  const publish = curlJson(['-X', 'POST', `https://graph.facebook.com/v23.0/${igUserId}/media_publish`, '-d', `creation_id=${container.id}`, '-d', `access_token=${igToken}`]);
  if (!publish.id) throw new Error(`publish failed: ${JSON.stringify(publish)}`);
  return publish;
}


// 毎回同じ切り口にならないよう、話題の方向をコード側で1つ選んで渡す(全部、前向きな方向)
const TOPIC_SEEDS = [
  '今日という日を大事にする', '小さな一歩が未来を変える', '感謝すると毎日が明るくなる', '笑うことの力', '続けてきた人が持っている強さ',
  '人と比べず、昨日の自分と比べる', '朝のはじまりを気持ちよくする', '自分へのねぎらい', '前に進めている実感', '自分の「好き」を大事にする',
  '年齢を重ねるほど増える魅力', '身近な人へのありがとう', 'やってみたい気持ちの育て方', '心が軽くなる考え方', '幸せは毎日の中にある',
];

function buildPrompt(sceneCount, pastTitles, topicSeed) {
  return `インスタのリール用に「画面の真ん中に大きく出る一言を、ナレーションが読み上げる」台本を1本作ってください。
今回の話題の方向: 「${topicSeed}」

【形式】
- scenes: ちょうど${sceneCount}個。1つが3秒の場面で、画面に出る文字とナレーションは同じ文。
  - lines: 画面に出す文字。1〜2行。1行は10字以内。つなげた全体が18字以内(3秒で読める長さ)。
  - 1つ目は「へえ、聞きたい」と思わせる一言。最後は背中を押す短い締め。
  - 全部をつなげて読むと、ひとつの前向きなメッセージとして流れること(箇条書きの寄せ集めにしない)。
- title: この動画のタイトル(15字以内)。
- caption: 投稿文。1行目は共感を呼ぶ一言、本文は短い段落で改行多め150〜250字、最後にハッシュタグ3つ(#前向き を含む)。LINEやプロフィールへの誘導は書かない。

【中身のルール】
- 読む人は40〜50代の、毎日を頑張っている人。
- 明るく、前向きで、読んだ人がプラスの気持ちになる言葉だけを使う。
- 「悩み」「つらい」「さみしい」「後悔」「不安」「疲れた」「失敗」など暗い言葉、不安をあおる言い方は使わない。
- 上から教えず、友達に話すように。「〜しなさい」「〜すべき」は使わない。
- 語り手(僕)の経験談は入れない。部下・スタッフ・社員の話は出さない。
- 誤字、助詞の抜け、不自然な日本語がないか、出す前に1つずつ読み直す。
- 下の「最近使ったタイトル」と話題がかぶらないこと。

【最近使ったタイトル(かぶらないこと)】
${pastTitles.length ? pastTitles.map((t) => '- ' + t).join('\n') : '- (なし)'}

JSONだけを返す: {"title":"..","scenes":[{"lines":[".."]}],"caption":".."}`;
}

const DARK = /悩|つら|辛|さみし|寂し|後悔|不安|疲|失敗|孤独|苦し|絶望|死|嫌|ダメ|だめ|無理/;

function validate(d, sceneCount) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['JSONではない'];
  d.title = String(d.title || '').trim();
  d.scenes = (Array.isArray(d.scenes) ? d.scenes : []).slice(0, sceneCount).map((s) => ({
    lines: (Array.isArray(s.lines) ? s.lines : [s.lines]).map((l) => String(l || '').trim()).filter(Boolean).slice(0, 2),
  }));
  if (d.scenes.length !== sceneCount) errs.push(`scenesが${sceneCount}個でない`);
  d.scenes.forEach((s, i) => {
    const total = [...s.lines.join('')].length;
    if (!s.lines.length) errs.push(`場面${i + 1}が空`);
    if (s.lines.some((l) => [...l].length > 11)) errs.push(`場面${i + 1}の1行が長い`);
    if (total > 20) errs.push(`場面${i + 1}が長い(${total}字)`);
  });
  if (!String(d.caption || '').trim()) errs.push('captionがない');
  if (DARK.test(JSON.stringify(d.scenes))) errs.push('暗い言葉が入っている');
  if (/部下|スタッフ|社員|従業員/.test(JSON.stringify(d.scenes))) errs.push('部下・スタッフの話が入っている');
  return errs;
}

async function generateScript(systemPrompt, sceneCount, pastTitles) {
  const topicSeed = TOPIC_SEEDS[Math.floor(Math.random() * TOPIC_SEEDS.length)];
  if (process.env.WF4_RAW_FILE) {
    const d = JSON.parse(fs.readFileSync(process.env.WF4_RAW_FILE, 'utf-8'));
    const errs = validate(d, d.scenes.length);
    if (errs.length) throw new Error('WF4_RAW_FILEの台本が不正: ' + errs.join(' / '));
    return d;
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildPrompt(sceneCount, pastTitles, topicSeed) },
  ];
  let lastErrs = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let d;
    try {
      d = JSON.parse(await callLLM(messages, 4000));
    } catch (e) {
      lastErrs = ['JSONの解析に失敗: ' + e.message];
      continue;
    }
    lastErrs = validate(d, sceneCount);
    d.topicSeed = topicSeed;
    if (!lastErrs.length) return d;
    console.error(`台本が不正(${attempt}/3): ${lastErrs.join(' / ')}`);
  }
  throw new Error('台本を生成できませんでした: ' + lastErrs.join(' / '));
}

// 1場面=3秒に収まるよう、読み上げが長ければ速度を上げて作り直す(最大1.45倍)
async function generateTTS(scenes, outDir, voicevoxName, voicevoxStyle) {
  const speaker = await resolveVoicevoxSpeaker(voicevoxName || DEFAULT_VOICEVOX_NAME, voicevoxStyle || DEFAULT_VOICEVOX_STYLE);
  const paths = [];
  for (let i = 0; i < scenes.length; i++) {
    const text = scenes[i].lines.join('');
    const audioPath = path.join(outDir, `audio${i + 1}.wav`);
    const q = await fetch(`${VOICEVOX_ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' });
    if (!q.ok) throw new Error(`audio_query失敗 ${q.status}`);
    const query = await q.json();
    query.prePhonemeLength = 0.1;
    query.postPhonemeLength = 0.15;
    let speed = 1.1;
    for (;;) {
      query.speedScale = speed;
      const s = await fetch(`${VOICEVOX_ENGINE}/synthesis?speaker=${speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
      if (!s.ok) throw new Error(`synthesis失敗 ${s.status}`);
      fs.writeFileSync(audioPath, Buffer.from(await s.arrayBuffer()));
      const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', audioPath]).toString());
      if (dur <= SCENE_SECONDS - 0.1 || speed >= 1.45) {
        if (dur > SCENE_SECONDS) console.log(`  場面${i + 1}: 読み上げが${dur.toFixed(2)}秒(3秒超え)`);
        break;
      }
      speed = Math.min(1.45, speed + 0.1);
    }
    paths.push(`audio${i + 1}.wav`);
  }
  return paths;
}

// クリップを選ぶ。使用済みを避け、隣り合う場面は同じ素材(sNN)にならないようにする
function pickClips(clipSet, count, account, outDir) {
  const dir = path.join(CLIPS_DIR, clipSet);
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.mp4'));
  const usedPath = path.join(USED_CLIPS_DIR, `${account}.json`);
  let used = readJson(usedPath, []);
  let pool = all.filter((f) => !used.includes(f));
  if (pool.length < count) {
    used = [];
    pool = all.slice();
  }
  const src = (f) => f.split('_')[0];
  const picked = [];
  while (picked.length < count && pool.length) {
    const prev = picked.length ? src(picked[picked.length - 1]) : null;
    const cands = pool.filter((f) => src(f) !== prev);
    const f = (cands.length ? cands : pool)[Math.floor(Math.random() * (cands.length || pool.length))];
    picked.push(f);
    pool = pool.filter((x) => x !== f);
  }
  fs.mkdirSync(path.join(outDir, 'clips'), { recursive: true });
  picked.forEach((f) => fs.copyFileSync(path.join(dir, f), path.join(outDir, 'clips', f)));
  return { picked, used };
}

function pickBgm(moods, history, outDir) {
  const mood = moods[Math.floor(Math.random() * moods.length)];
  const dir = path.join(BGM_DIR, mood);
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
  const lastBgm = history.length ? history[history.length - 1].bgm : null;
  const pool = all.filter((f) => `${mood}/${f}` !== lastBgm);
  const file = (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))];
  fs.copyFileSync(path.join(dir, file), path.join(outDir, 'bgm.mp3'));
  console.log(`bgm: ${mood}/${file}`);
  return `${mood}/${file}`;
}

function render(scenes, audios, clips, outDir) {
  const props = {
    scenes: scenes.map((s, i) => ({ clip: `clips/${clips[i]}`, lines: s.lines, audio: audios[i] })),
    bgm: 'bgm.mp3',
    sceneSeconds: SCENE_SECONDS,
  };
  const propsPath = path.join(outDir, 'clip_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'ClipQuote', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`, '--crf=23', ...(DRYRUN ? ['--concurrency=2'] : [])], {
    cwd: REMOTION_DIR,
    timeout: 900000,
    shell: true,
    stdio: 'inherit',
  });
  return videoPath;
}

async function main() {
  const account = process.argv[2];
  if (!account) throw new Error('usage: node generate-clip-quote.js <account>');
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona || !persona.igUserId || !persona.clipQuote) throw new Error(`unknown account or no clipQuote config: ${account}`);
  const cfg = persona.clipQuote;
  const sceneCount = Number(process.env.CLIP_SCENES) || cfg.scenes || 10;
  const intervalDays = persona.intervalDays || 1;
  const lastRun = readJson(LAST_RUN_PATH, {});
  if (!process.env.WF4_FORCE && lastRun[account] && (Date.now() - new Date(lastRun[account]).getTime()) / 86400000 < intervalDays - 0.5) {
    console.log(`[${account}] skip: 前回実行から${intervalDays}日経過していません`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve(DRYRUN ? 'wf4_preview' : 'wf4_media', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const historyPath = path.join(TOPICS_DIR, `${account}.json`);
  const history = readJson(historyPath, []);
  const script = await generateScript(cfg.system, sceneCount, history.slice(-40).map((h) => h.title));
  console.log(`[${account}] title: ${script.title}`);
  script.scenes.forEach((s, i) => console.log(`  ${i + 1}. ${s.lines.join(' / ')}`));
  fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');

  await ensureVoicevoxEngine();
  const audios = await generateTTS(script.scenes, outDir, persona.voicevoxName, persona.voicevoxStyle);
  const { picked, used } = pickClips(cfg.clipSet, sceneCount, account, outDir);
  const bgm = pickBgm(persona.bgmMoods || ['前向き'], history, outDir);
  const videoPath = render(script.scenes, audios, picked, outDir);
  const caption = String(script.caption).trim() + (persona.ctaLine || '');
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption, 'utf-8');
  console.log(`[${account}] video rendered: ${videoPath}`);

  if (DRYRUN) {
    console.log(`[${account}] DRYRUN: 投稿せず終了`);
    return;
  }

  const result = await postReel(account, persona.igUserId, videoPath, caption);
  console.log(`[${account}] posted:`, result.id);

  lastRun[account] = new Date().toISOString();
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(lastRun, null, 2), 'utf-8');
  history.push({ date: today, title: script.title, bgm, media: result.id });
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(-200), null, 2), 'utf-8');
  fs.mkdirSync(USED_CLIPS_DIR, { recursive: true });
  fs.writeFileSync(path.join(USED_CLIPS_DIR, `${account}.json`), JSON.stringify([...used, ...picked].slice(-400)), 'utf-8');

  execFileSync('git', ['config', 'user.name', 'wf4-bot']);
  execFileSync('git', ['config', 'user.email', 'wf4-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'data/wf4_clip_used', 'data/wf4_last_run.json', 'data/wf4_list_topics']);
  try {
    execFileSync('git', ['commit', '-m', `chore: WF4 ${account} clip-quote ${today}`]);
    execFileSync('git', ['pull', '--rebase']);
    execFileSync('git', ['push']);
  } catch (e) {
    console.log('no changes to commit or push failed:', e.message);
  }
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
