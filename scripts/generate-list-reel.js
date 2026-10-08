// WF4: 「長押しして読んでね」型のリスト解説リールを生成・投稿する(satoshi_mindset, 2026-10-08〜)
// 一覧1枚(5秒) → 項目1つにつき1枚(5秒)×5 = 30秒。ナレーションなし、背景の実写とBGMはテーマに合わせて毎回選ぶ。
// wf4_accounts.json で "format": "list-slides" のアカウントだけ run-wf4.js がこちらを呼ぶ。
// generate-reel.js はファイル末尾で main() を実行するため require できない。共通処理はここに写している。
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ITEM_COUNT = 5;
const SLIDE_SECONDS = 5;
const TOTAL_SECONDS = SLIDE_SECONDS * (ITEM_COUNT + 1);
const DRYRUN = Boolean(process.env.WF4_DRYRUN);

const REMOTION_DIR = path.join(__dirname, '..', 'remotion');
const BGM_DIR = path.join(REMOTION_DIR, 'assets', 'bgm_list');
const DATA_DIR = path.join(__dirname, '..', 'data');
const USED_IDS_DIR = path.join(DATA_DIR, 'wf4_used_ids');
const TOPICS_DIR = path.join(DATA_DIR, 'wf4_list_topics');
const LAST_RUN_PATH = path.join(DATA_DIR, 'wf4_last_run.json');

// 曲の雰囲気。フォルダ名と一致させる(remotion/assets/bgm_list/<mood>/*.mp3)
const MOODS = {
  穏やか: '静かで落ち着く。気持ちをゆるめる話',
  切ない: 'しんみり。つらさ・孤独・後悔に寄り添う話',
  前向き: '明るく背中を押す。一歩踏み出す・変化の話',
  夜: '夜の静けさ。眠れない夜・ひとりで考え込む話',
  あたたか: 'ぬくもり。感謝・自分を認める・人とのつながりの話',
};

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

const SAMPLE = {
  title: ['知っておきたい', 'ひとりで抱えすぎている人の', '5つのサイン'],
  label: 'ひとりで抱えすぎている人の5つのサイン',
  items: [
    {
      text: '休みの日も仕事のことを考えている',
      short: '頭が休めていないと、疲れは抜けません',
      head: ['休みの日も', '仕事のことを考えている'],
      body: ['体を休めても、', '頭が働き続けていると', '疲れは抜けません。', '「何もしない時間」も', '大事な仕事のひとつです。'],
    },
  ],
};

function buildPrompt(pastTitles) {
  const moodDoc = Object.entries(MOODS)
    .map(([k, v]) => `${k}(${v})`)
    .join(' / ');
  return `インスタのリール用に「長押しして止めて読む」リスト型の台本を1本作ってください。

【形式】
- 一覧の1枚目: タイトル3行(1行目は「知っておきたい」「実は多い」「気づいてほしい」など短い前置き、2行目が誰の話か、3行目が「5つのサイン」「5つの習慣」「5つの言葉」など)。
- 続けて${ITEM_COUNT}項目を1枚ずつ解説する。
- 各項目: text(一覧に出す1行・16字以内)、short(一覧で項目の下に出す一言・19字以内)、head(解説スライドの見出し。textを自然な位置で1〜2行に分けたもの。1行12字以内)、body(解説の本文。3〜5行、1行14字以内、句読点で自然に改行。読んだ人の心が少し軽くなる言葉で締める)。
- 最後の項目のbodyは「ひとりで抱えなくていい」のように、相談してもいいと思える一言で終える(売り込みはしない)。
- label: 解説スライドの上に小さく出す見出し(タイトル2行目+3行目をつなげたもの、22字以内)。

【中身】
- 読む人は40〜50代の経営者・個人事業主・ひとりで頑張っている人。自分ごととして「当てはまる」と思える具体的な場面を書く。
- 上から教えず、同じ経験をしてきた人として寄り添う語り口。語り手(僕)の話は入れない。
- 下の「最近使ったタイトル」とテーマがかぶらないこと。

【投稿文 caption】
- 1行目は「当てはまるものはありましたか？」など問いかけ。
- 本文は短い段落で改行多め、200〜350字。途中で一度だけ「僕も、ずっとそうでした。」のような短い共感を入れてよい。
- 本文のあと「⸻」の行、その下に「今日のリール投稿は」とタイトル3行を…で囲んで載せ、最後にハッシュタグ3つ(#自己啓発 を含む)。
- LINEやプロフィールへの誘導文は書かない(あとで自動で付け足す)。

【背景と曲】
- mood: 内容に合う曲の雰囲気を次から1つ: ${moodDoc}
- stockQuery: 背景の縦動画をPexelsで探す英語キーワード(3〜4語)。人物の顔が映らない、文字が読める落ち着いた風景にする(例: "sunset ocean waves", "rain on window night", "morning forest light", "quiet lake mist", "city lights night bokeh")。内容とmoodに合わせて毎回変える。

【最近使ったタイトル(かぶらないこと)】
${pastTitles.length ? pastTitles.map((t) => '- ' + t).join('\n') : '- (なし)'}

JSONだけを返す: {"title":["..","..",".."],"label":"..","items":[{"text":"..","short":"..","head":[".."],"body":[".."]}],"caption":"..","mood":"..","stockQuery":".."}
itemsはちょうど${ITEM_COUNT}個。例(1項目ぶん): ${JSON.stringify(SAMPLE)}`;
}

const strs = (v) => (Array.isArray(v) ? v : [v]).map((s) => String(s || '').trim()).filter(Boolean);

function validate(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['JSONではない'];
  d.title = strs(d.title).slice(0, 3);
  if (d.title.length < 2) errs.push('titleが2行未満');
  d.label = String(d.label || d.title.slice(1).join('')).trim();
  d.items = (Array.isArray(d.items) ? d.items : []).slice(0, ITEM_COUNT).map((it) => ({
    text: String(it.text || '').trim(),
    short: String(it.short || '').trim(),
    head: strs(it.head).slice(0, 2),
    body: strs(it.body).slice(0, 5),
  }));
  if (d.items.length !== ITEM_COUNT) errs.push(`itemsが${ITEM_COUNT}個でない`);
  d.items.forEach((it, i) => {
    if (!it.text || !it.short || !it.head.length || it.body.length < 2) errs.push(`項目${i + 1}が欠けている`);
  });
  if (!String(d.caption || '').trim()) errs.push('captionがない');
  if (!MOODS[d.mood]) d.mood = '穏やか';
  d.stockQuery = String(d.stockQuery || '').trim() || 'calm ocean sunset';
  return errs;
}

async function generateScript(systemPrompt, pastTitles) {
  if (process.env.WF4_RAW_FILE) {
    const d = JSON.parse(fs.readFileSync(process.env.WF4_RAW_FILE, 'utf-8'));
    const errs = validate(d);
    if (errs.length) throw new Error('WF4_RAW_FILEの台本が不正: ' + errs.join(' / '));
    return d;
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildPrompt(pastTitles) },
  ];
  let lastErrs = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let d;
    try {
      d = JSON.parse(await callLLM(messages, 4000));
    } catch (e) {
      lastErrs = ['JSONの解析に失敗: ' + e.message];
      continue;
    }
    lastErrs = validate(d);
    if (!lastErrs.length) return d;
    console.error(`台本が不正(${attempt}/2): ${lastErrs.join(' / ')}`);
  }
  throw new Error('台本を生成できませんでした: ' + lastErrs.join(' / '));
}

// 背景の縦動画を1本選ぶ。全アカウントの使用済みIDを避け、30秒に満たなければループさせる
async function fetchBackground(query, account, outDir) {
  const usedPath = path.join(USED_IDS_DIR, `${account}.json`);
  const used = readJson(usedPath, []);
  const exclude = new Set(used);
  if (!DRYRUN && fs.existsSync(USED_IDS_DIR)) {
    for (const f of fs.readdirSync(USED_IDS_DIR)) if (f.endsWith('.json')) for (const id of readJson(path.join(USED_IDS_DIR, f), [])) exclude.add(id);
  }
  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key) throw new Error('PEXELS_API_KEYが未設定です');
  for (const q of [query, 'sunset ocean waves', 'calm lake nature', 'night city lights']) {
    const res = await req(`https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&per_page=30&orientation=portrait`, {
      headers: { Authorization: key },
    });
    const cands = (res.json?.videos || [])
      .filter((v) => !exclude.has(`px_${v.id}`) && Number(v.duration) >= 8)
      .map((v) => {
        const f = (v.video_files || []).filter((x) => x.height && x.height >= 1280 && x.height <= 1920).sort((a, b) => b.height - a.height)[0];
        return f ? { id: `px_${v.id}`, url: f.link, duration: Number(v.duration) } : null;
      })
      .filter(Boolean);
    if (!cands.length) continue;
    // 上位の候補から選ぶ(検索順位が高いほど内容に合う)
    const pick = cands[Math.floor(Math.random() * Math.min(5, cands.length))];
    const raw = path.join(outDir, 'bg_raw.mp4');
    fs.writeFileSync(raw, await req(pick.url, { binary: true }));
    // Remotionが安定して読める形(30fps・1080x1920・キーフレーム密・無音)に整え、足りない長さはループで埋める
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-stream_loop', '-1', '-i', raw, '-t', String(TOTAL_SECONDS + 1),
      '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30',
      '-g', '15', '-bf', '0', '-an', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
      path.join(outDir, 'bg.mp4'),
    ]);
    fs.unlinkSync(raw);
    console.log(`background: ${pick.id} (${q})`);
    if (!DRYRUN) {
      used.push(pick.id);
      fs.mkdirSync(USED_IDS_DIR, { recursive: true });
      fs.writeFileSync(usedPath, JSON.stringify(used.slice(-200)), 'utf-8');
    }
    return pick.id;
  }
  throw new Error('背景の動画が見つかりませんでした');
}

// moodのフォルダから1曲。前回と同じ曲は避ける
function pickBgm(mood, history, outDir) {
  const dir = path.join(BGM_DIR, mood);
  const all = fs.readdirSync(dir).filter((f) => f.endsWith('.mp3'));
  const lastBgm = history.length ? history[history.length - 1].bgm : null;
  const pool = all.filter((f) => `${mood}/${f}` !== lastBgm);
  const file = (pool.length ? pool : all)[Math.floor(Math.random() * (pool.length || all.length))];
  fs.copyFileSync(path.join(dir, file), path.join(outDir, 'bgm.mp3'));
  console.log(`bgm: ${mood}/${file}`);
  return `${mood}/${file}`;
}

function render(script, outDir) {
  const props = {
    title: script.title,
    label: script.label,
    items: script.items,
    video: 'bg.mp4',
    bgm: 'bgm.mp3',
    slideSeconds: SLIDE_SECONDS,
  };
  // public-dirが実行ごとのoutDirになるため、同梱の書体もここに置く
  fs.mkdirSync(path.join(outDir, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REMOTION_DIR, 'assets', 'fonts'))) {
    if (f.endsWith('.otf')) fs.copyFileSync(path.join(REMOTION_DIR, 'assets', 'fonts', f), path.join(outDir, 'fonts', f));
  }
  const propsPath = path.join(outDir, 'list_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'ListReel', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`, '--crf=20', ...(DRYRUN ? ['--concurrency=2'] : [])], {
    cwd: REMOTION_DIR,
    timeout: 600000,
    shell: true,
    stdio: 'inherit',
  });
  return videoPath;
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

async function main() {
  const account = process.argv[2];
  if (!account) throw new Error('usage: node generate-list-reel.js <account>');
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona || !persona.igUserId) throw new Error(`unknown account: ${account}`);
  const intervalDays = persona.intervalDays || 3;
  const lastRun = readJson(LAST_RUN_PATH, {});
  if (!process.env.WF4_FORCE && lastRun[account] && (Date.now() - new Date(lastRun[account]).getTime()) / 86400000 < intervalDays) {
    console.log(`[${account}] skip: 前回実行から${intervalDays}日経過していません`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve(DRYRUN ? 'wf4_preview' : 'wf4_media', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const historyPath = path.join(TOPICS_DIR, `${account}.json`);
  const history = readJson(historyPath, []);
  const script = await generateScript(persona.system, history.slice(-40).map((h) => h.title));
  console.log(`[${account}] title: ${script.title.join(' / ')} | mood: ${script.mood} | bg: ${script.stockQuery}`);
  script.items.forEach((it, i) => console.log(`  ${i + 1}. ${it.text}`));
  fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');

  const bgId = await fetchBackground(script.stockQuery, account, outDir);
  const bgm = pickBgm(script.mood, history, outDir);
  const videoPath = render(script, outDir);
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
  history.push({ date: today, title: script.title.join(''), mood: script.mood, bgm, bg: bgId, media: result.id });
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(-200), null, 2), 'utf-8');

  execFileSync('git', ['config', 'user.name', 'wf4-bot']);
  execFileSync('git', ['config', 'user.email', 'wf4-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'data/wf4_used_ids', 'data/wf4_last_run.json', 'data/wf4_list_topics']);
  try {
    execFileSync('git', ['commit', '-m', `chore: WF4 ${account} list-reel ${today}`]);
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
