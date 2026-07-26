// WF4-Stories: 指定アカウントのInstagramストーリーズ(1シーン・10〜15秒)を生成・投稿
// generate-reel.js(9シーンのReels)と同じ土台(VOICEVOX/Pexels/Remotion/chibi)を使うが、
// ストーリーズ向けに1シーンだけの軽量版として独立させた別スクリプト(Reels側は一切変更しない)。
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, spawn } = require('child_process');

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

function reqBinary(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: options.headers || {} },
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

const ICON_NAMES = ['person_worried', 'person_calm', 'clock', 'wallet', 'coin', 'yen', 'chart_up', 'chart_bar', 'document', 'document_check', 'pencil', 'book', 'wall', 'flag', 'smartphone', 'cart', 'calendar', 'envelope', 'safe', 'gear', 'check_circle', 'cross_circle', 'piggy', 'lightbulb', 'target', 'hourglass'];
const ICON_DOC = 'person_worried(悩む人)/person_calm(穏やかな人)/clock(時計)/wallet(財布)/coin(コイン)/yen(お金)/chart_up(右肩上がり)/chart_bar(棒グラフ)/document(書類)/document_check(チェック済み書類)/pencil(鉛筆)/book(本)/wall(壁)/flag(旗)/smartphone(スマホ)/cart(買い物カゴ)/calendar(カレンダー)/envelope(封筒・給料)/safe(金庫・貯金)/gear(歯車・自動)/check_circle(チェック)/cross_circle(バツ)/piggy(貯金箱)/lightbulb(気づき)/target(目標)/hourglass(砂時計)';

// Reels(generate-reel.js)と同じフォールバック付きGroq呼び出し(トークン枠を小さくした版)
async function callGroqWithFallback(messages, maxTokens) {
  const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } });
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
    if (attempt < 3 && /rate limit|Rate limit|429/i.test(lastErr)) {
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

// ストーリーズ用: diagramシーン1枚だけの軽量台本(今日の一言・気づき・小さなヒント)
async function generateStoryScenario(systemPrompt) {
  const layoutOptions = [
    { layout: 'iconsteps', pointCount: 3 },
    { layout: 'flow3', pointCount: 2 },
    { layout: 'reject', pointCount: 2 },
  ];
  const chosen = layoutOptions[Math.floor(Math.random() * layoutOptions.length)];

  const directive =
    chosen.layout === 'reject'
      ? '今日の一言メッセージ。1個目は「これは○○の話ではありません」という否定+icon+note、2個目は本当に伝えたいこと(**強調**1箇所)+icon。ナレーション(narration)は25〜40文字'
      : `今日その場で伝えたい、具体的で小さな気づき・ヒントを1つ。points${chosen.pointCount}個。各pointは{text(2行以内・具体的な一言), icon}${chosen.layout === 'flow3' ? '、note(補足1行、最後のpointは**強調**可)' : ''}。ナレーション(narration)は25〜40文字`;

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        `Instagramストーリーズ(24時間で消える・一瞬で読める短い1枚)向けに、今日のテーマを1つ選び、${directive}。\n` +
        `titleはカテゴリ名ではなく、内容そのものを表す8〜16字の見出し(体言止めや短い断言)。\n` +
        `トーン：AIが書いた説明文ではなく、自分の言葉で友達にひとこと呟くように。「〜なんですよね」「〜だったんです」のような柔らかい語尾を使う。禁止表現:「〜してみませんか」「いかがでしょうか」「大切です」「おすすめです」。\n` +
        `アイコンに使える名前: ${ICON_DOC}\n` +
        `解説キャラクターのポーズを次から1つ選ぶ: "default"(口パクで喋る・基本), "arms_crossed", "thinking", "explaining", "pointing_left", "guts", "thumbs_up", "bowing"。\n` +
        `以下の形式のJSONで返してください: {"scenes":[{"title":"...","narration":"...","points":[{"text":"...","icon":"...","note":"..."(任意)}],"stockQuery":"英語2〜4語"}],"chibi_pose":"..."}`,
    },
  ];
  const content = await callGroqWithFallback(messages, 1200);
  let data = {};
  try {
    data = JSON.parse(content || '{}');
  } catch (e) {
    console.error('シナリオJSONのパースに失敗:', e.message, '| raw:', String(content).slice(0, 400));
  }
  const raw = (Array.isArray(data.scenes) && data.scenes[0]) || {};
  if (!raw.narration) throw new Error(`ストーリーズ台本の生成に失敗しました。投稿を中止します。raw: ${String(content).slice(0, 400)}`);

  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map((p) => ({
      text: String((p && p.text) || '').trim(),
      icon: ICON_NAMES.includes(p && p.icon) ? p.icon : 'check_circle',
      note: p && p.note ? String(p.note).trim() : undefined,
    }))
    .filter((p) => p.text)
    .slice(0, chosen.layout === 'iconsteps' ? 4 : chosen.pointCount);

  const VALID_POSES = ['default', 'arms_crossed', 'bowing', 'explaining', 'guts', 'pointing_left', 'thinking', 'thumbs_up'];
  const pose = VALID_POSES.includes(data.chibi_pose) ? data.chibi_pose : 'default';

  return {
    scene: {
      type: 'diagram',
      layout: chosen.layout,
      title: String(raw.title || '').trim() || 'きょうの話',
      points,
      narration: String(raw.narration || '').trim(),
      stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
    },
    pose,
  };
}

async function fetchPexelsVideo(keyword, usedIds) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  const res = await req(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=portrait`, { headers: { Authorization: key } });
  const candidates = (res.json?.videos || []).filter((v) => v.duration >= 6 && !usedIds.has(`px_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const files = (pick.video_files || []).filter((f) => f.height && f.height <= 1920).sort((a, b) => b.height - a.height);
  const file = files[0] || pick.video_files[0];
  return { id: `px_${pick.id}`, url: file.link };
}

async function fetchPixabayVideo(keyword, usedIds) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  const res = await req(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(keyword)}&per_page=30`, {});
  const candidates = (res.json?.hits || []).filter((v) => v.duration >= 6 && !usedIds.has(`pb_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const v = pick.videos.medium || pick.videos.small || pick.videos.large;
  return { id: `pb_${pick.id}`, url: v.url };
}

// Reelsとかぶらないよう台帳を分ける(story_<account>.json)
async function fetchStoryBroll(scene, outDir, account) {
  const ledgerDir = path.join(__dirname, '..', 'data', 'wf4_used_ids');
  const usedIdsPath = path.join(ledgerDir, `story_${account}.json`);
  fs.mkdirSync(ledgerDir, { recursive: true });
  let usedIds = [];
  try {
    usedIds = JSON.parse(fs.readFileSync(usedIdsPath, 'utf-8'));
  } catch (e) {}
  const excludeIds = new Set(usedIds);
  const keywordChain = [scene.stockQuery, 'japan lifestyle', 'calm nature', 'daily life moment'].filter(Boolean);
  let found = null;
  for (const kw of keywordChain) {
    found = (await fetchPexelsVideo(kw, excludeIds)) || (await fetchPixabayVideo(kw, excludeIds));
    if (found) break;
  }
  if (!found) return undefined;
  const buf = await reqBinary(found.url, {});
  const p = path.join(outDir, 'video1.mp4');
  fs.writeFileSync(p, buf);
  usedIds.push(found.id);
  fs.writeFileSync(usedIdsPath, JSON.stringify(usedIds.slice(-200)), 'utf-8');
  return path.basename(p);
}

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

async function generateStoryTTS(narration, outDir, voicevoxName, voicevoxStyle) {
  const speaker = await resolveVoicevoxSpeaker(voicevoxName || DEFAULT_VOICEVOX_NAME, voicevoxStyle || DEFAULT_VOICEVOX_STYLE);
  const audioPath = path.join(outDir, 'audio1.wav');
  const q = await fetch(`${VOICEVOX_ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(narration)}`, { method: 'POST' });
  if (!q.ok) throw new Error(`audio_query失敗 ${q.status}`);
  const query = await q.json();
  query.speedScale = 1.0;
  query.postPhonemeLength = 0.3;
  const s = await fetch(`${VOICEVOX_ENGINE}/synthesis?speaker=${speaker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  if (!s.ok) throw new Error(`synthesis失敗 ${s.status}`);
  fs.writeFileSync(audioPath, Buffer.from(await s.arrayBuffer()));
  return audioPath;
}

function getAudioDuration(audioPath) {
  try {
    const out = execFileSync('ffprobe', ['-i', audioPath, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0'], { timeout: 15000 }).toString().trim();
    return parseFloat(out) + 0.5;
  } catch (e) {
    return 4.0;
  }
}

// 1シーンだけのMyVideo propsを作ってRemotionでレンダリング(generate-reel.jsのrenderVideoと同じ土台)
function renderStoryVideo(scene, videoFile, audioPath, outDir, useChibi, pose) {
  const audio = audioPath && fs.existsSync(audioPath) ? path.basename(audioPath) : '';
  const audioDur = audio ? getAudioDuration(audioPath) : null;
  const minDuration = (scene.points || []).length >= 3 ? 7.0 : 5.5;
  const scenes = [
    {
      type: scene.type,
      layout: scene.layout,
      title: scene.title,
      points: scene.points,
      narration: scene.narration || '',
      video: videoFile,
      audio,
      durationInSeconds: Math.max(minDuration, audioDur || minDuration),
      pose: pose || 'default',
      se: null,
    },
  ];
  const propsPath = path.join(outDir, 'remotion_props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes, chibi: Boolean(useChibi) }), 'utf-8');

  const remotionDir = path.join(__dirname, '..', 'remotion');
  fs.copyFileSync(path.join(remotionDir, 'assets', 'bgm.mp3'), path.join(outDir, 'bgm.mp3'));
  const seSrc = path.join(remotionDir, 'assets', 'se');
  const seDst = path.join(outDir, 'se');
  fs.mkdirSync(seDst, { recursive: true });
  for (const f of fs.readdirSync(seSrc)) fs.copyFileSync(path.join(seSrc, f), path.join(seDst, f));
  if (useChibi) {
    const chibiSrc = path.join(remotionDir, 'assets', 'satoshi_chibi');
    const chibiDst = path.join(outDir, 'satoshi_chibi');
    fs.mkdirSync(path.join(chibiDst, 'poses'), { recursive: true });
    for (const f of fs.readdirSync(chibiSrc)) {
      if (f.startsWith('mouth_')) fs.copyFileSync(path.join(chibiSrc, f), path.join(chibiDst, f));
    }
    for (const f of fs.readdirSync(path.join(chibiSrc, 'poses'))) fs.copyFileSync(path.join(chibiSrc, 'poses', f), path.join(chibiDst, 'poses', f));
  }

  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'MyVideo', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`], {
    cwd: remotionDir,
    timeout: 300000,
    shell: true,
    stdio: 'inherit',
  });
  return videoPath;
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
    {
      name: 'tmpfiles',
      run: () => {
        const out = execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload'], { timeout: 300000 }).toString();
        return JSON.parse(out).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
      },
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

// ストーリーズはmedia_type=STORIES。フィードと違いcaptionフィールドは無い(動画内の文字が全て)
async function postStory(igUserId, videoPath) {
  const igToken = (process.env[`IG_TOKEN_${process.env.WF4_ACCOUNT_UPPER}`] || '').trim();
  const publicUrl = uploadPublic(videoPath);
  const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`upload: ${publicUrl} (${sizeMb}MB)`);

  const createUrl = `https://graph.facebook.com/v23.0/${igUserId}/media`;
  const container = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', createUrl, '-d', 'media_type=STORIES', '-d', `video_url=${encodeURIComponent(publicUrl)}`, '-d', `access_token=${igToken}`]).toString()
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
  const publish = JSON.parse(execFileSync('curl', ['-s', '-X', 'POST', publishUrl, '-d', `creation_id=${container.id}`, '-d', `access_token=${igToken}`]).toString());
  if (!publish.id) throw new Error(`publish failed: ${JSON.stringify(publish)}`);
  return publish;
}

async function main() {
  const account = process.argv[2];
  if (!account) {
    console.error('usage: node generate-story.js <account>');
    process.exit(1);
  }
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona) throw new Error(`unknown account: ${account}`);

  process.env.WF4_ACCOUNT_UPPER = account.toUpperCase();
  await ensureVoicevoxEngine();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const stamp = Date.now();
  const outDir = path.resolve('wf4_story_media', account, `${today}_${stamp}`);
  fs.mkdirSync(outDir, { recursive: true });

  const { scene, pose } = await generateStoryScenario(persona.system);
  console.log(`[${account}] story:`, scene.layout, scene.title, '|', scene.narration);

  const videoFile = await fetchStoryBroll(scene, outDir, account);
  console.log(`[${account}] broll:`, videoFile || 'none');

  const audioPath = await generateStoryTTS(scene.narration, outDir, persona.voicevoxName, persona.voicevoxStyle);
  const videoPath = renderStoryVideo(scene, videoFile, audioPath, outDir, persona.chibi, pose);
  console.log(`[${account}] story video rendered:`, videoPath);

  if (process.env.WF4_STORY_DRYRUN === '1') {
    console.log(`[${account}] DRYRUN: 投稿はスキップしました。動画は ${videoPath} に残しています`);
    return;
  }

  const result = await postStory(persona.igUserId, videoPath);
  console.log(`[${account}] story posted:`, result.id);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
