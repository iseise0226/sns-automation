// WF4: 指定アカウントのInstagramリール(ブランドイラスト1枚+実写B-roll2本)を生成・投稿
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

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

const SCENE_COUNT = 10;
const ILLUST_COUNT = 2;
const BROLL_COUNT = SCENE_COUNT - ILLUST_COUNT;

const PASONA_STRUCTURE = `台本はナレーション${SCENE_COUNT}シーン分。各シーン30文字程度(音声コストの都合で30文字を大きく超えないこと)で、以下のPASONAの流れに沿って一つのストーリーとして繋がるように書いてください。
シーン1〜2（Problem）: 悩み・あるあるを提示する
シーン3〜4（Affinity）: その悩みに共感する。自分の体験談を交えてもいい
シーン5〜6（Solution）: 気づき・考え方の転換を伝える
シーン7〜8（Offer）: 具体的な提案・今日からできる行動のヒントを伝える
シーン9（Narrowing down）: 「特別なことじゃなくていい」と絞り込んで伝える
シーン10（Action）: 保存・フォローをやさしく促す

文章のトーン：機械的な説明文ではなく、寄り添うように、優しく、押しつけがましくならないように話し言葉で書いてください。断定しすぎず「〜かもしれません」「〜してみませんか」のような柔らかい語尾を使ってください。`;

async function generateScenario(systemPrompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `テーマを1つ選び、${PASONA_STRUCTURE}\n\nこの台本とInstagramキャプション（150文字以内）、画像説明（英語20文字以内）、各シーンの実写映像検索キーワード（そのシーンのナレーション内容に合う具体的な映像を表す英語2〜4語。例: "rainy window city night", "woman walking sunrise beach"）をJSONで返してください。` +
          `{"caption":"投稿文","detail":"画像説明(英語)","narrations":[${SCENE_COUNT}個の文字列の配列],"broll_keywords":[${SCENE_COUNT}個の英語キーワード文字列の配列]}`,
      },
    ],
    max_tokens: 1400,
    response_format: { type: 'json_object' },
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`, 'Content-Type': 'application/json' } },
    body
  );
  const data = JSON.parse(res.json?.choices?.[0]?.message?.content || '{}');
  const fallback = Array.from({ length: SCENE_COUNT }, (_, i) => `今日も一歩ずつ、進んでいこう。(${i + 1})`);
  return {
    caption: data.caption || systemPrompt,
    detail: data.detail || 'lifestyle content',
    narrations: Array.isArray(data.narrations) && data.narrations.length === SCENE_COUNT ? data.narrations : fallback,
    brollKeywords: Array.isArray(data.broll_keywords) ? data.broll_keywords.map((k) => String(k || '').trim()) : [],
  };
}

async function generateIllustrations(detail, imgStyle, outDir) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const items = [];
  for (let i = 0; i < ILLUST_COUNT; i++) {
    const prompt = `${imgStyle}, ${detail}, scene ${i + 1}, no text, no letters, no words, no typography, no titles, illustration only`;
    const body = JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: 'low', n: 1 });
    const res = await req(
      'https://api.openai.com/v1/images/generations',
      { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
      body
    );
    const b64 = res.json?.data?.[0]?.b64_json;
    if (!b64) continue;
    const p = path.join(outDir, `image${i + 1}.png`);
    fs.writeFileSync(p, Buffer.from(b64, 'base64'));
    items.push({ path: p, type: 'image' });
  }
  return items;
}

async function fetchPexelsVideo(keyword, usedIds) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  const res = await req(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=portrait`, {
    headers: { Authorization: key },
  });
  const candidates = (res.json?.videos || []).filter((v) => v.duration >= 6 && !usedIds.includes(`px_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const files = (pick.video_files || []).filter((f) => f.height && f.height <= 1920).sort((a, b) => b.height - a.height);
  const file = files[0] || pick.video_files[0];
  return { id: `px_${pick.id}`, url: file.link };
}

async function fetchPixabayVideo(keyword, usedIds) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  const res = await req(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(keyword)}&per_page=30`, {});
  const candidates = (res.json?.hits || []).filter((v) => v.duration >= 6 && !usedIds.includes(`pb_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const v = pick.videos.medium || pick.videos.small || pick.videos.large;
  return { id: `pb_${pick.id}`, url: v.url };
}

async function generateBroll(detail, imgStyle, outDir, account, sceneKeywords) {
  const ledgerDir = path.join(__dirname, '..', 'data', 'wf4_used_ids');
  const usedIdsPath = path.join(ledgerDir, `${account}.json`);
  fs.mkdirSync(ledgerDir, { recursive: true });
  let usedIds = [];
  try {
    usedIds = JSON.parse(fs.readFileSync(usedIdsPath, 'utf-8'));
  } catch (e) {}

  // かぶり防止: 除外リストは全アカウントの台帳を統合して作る（記録は自アカウントのみ）
  const excludeIds = new Set(usedIds);
  for (const f of fs.readdirSync(ledgerDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      for (const id of JSON.parse(fs.readFileSync(path.join(ledgerDir, f), 'utf-8'))) excludeIds.add(id);
    } catch (e) {}
  }

  const styleKeyword = imgStyle.split(',')[0].trim();
  const fallbackPool = [detail, styleKeyword, 'japan lifestyle', 'calm nature', 'daily life moment'].filter(Boolean);

  const mediaItems = [];
  for (let i = 0; i < BROLL_COUNT; i++) {
    // 空振り防止: そのシーンのキーワード → 全体の画像説明 → 汎用キーワードの順で試す
    const sceneKw = (sceneKeywords || [])[i];
    const keywordChain = [sceneKw, ...fallbackPool].filter(Boolean);
    const exclude = [...excludeIds];
    let found = null;
    for (const kw of keywordChain) {
      found = await fetchPexelsVideo(kw, exclude);
      if (found) break;
    }
    if (!found) {
      for (const kw of keywordChain) {
        found = await fetchPixabayVideo(kw, exclude);
        if (found) break;
      }
    }
    if (found) {
      const buf = await reqBinary(found.url, {});
      const p = path.join(outDir, `video${i + 1}.mp4`);
      fs.writeFileSync(p, buf);
      mediaItems.push({ path: p, type: 'video' });
      usedIds.push(found.id);
      excludeIds.add(found.id);
    }
  }
  fs.writeFileSync(usedIdsPath, JSON.stringify(usedIds.slice(-200)), 'utf-8');
  return mediaItems;
}

const ELEVENLABS_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

async function generateTTS(narrations, outDir) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  const audioPaths = [];
  for (let i = 0; i < narrations.length; i++) {
    const body = JSON.stringify({
      text: narrations[i],
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const audioPath = path.join(outDir, `audio${i + 1}.mp3`);
    try {
      const audioBuf = await reqBinary(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' } },
        body
      );
      fs.writeFileSync(audioPath, audioBuf);
      audioPaths.push(audioPath);
    } catch (e) {
      audioPaths.push(null);
    }
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

// ナレーション文章を「句読点の位置でのみ」最大4つの塊に分ける。
// 句読点がなければ全文を1塊にする（文中でぶった切ると読めない表示になるため）。
function splitIntoChunks(text) {
  const clean = (text || '').trim();
  if (!clean) return [];
  const parts = clean
    .split(/(?<=[。、！？!?])/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [clean];
  const target = Math.min(4, parts.length);
  const per = Math.ceil(parts.length / target);
  const chunks = [];
  for (let i = 0; i < parts.length; i += per) {
    chunks.push(parts.slice(i, i + per).join(''));
  }
  return chunks;
}

// textMotionを割り当てるシーンのインデックス（0始まり）: 5枚目とラスト(10枚目)
const TEXT_MOTION_SCENE_INDEXES = [4, 9];

function renderVideo(mediaItems, audioPaths, narrations, outDir) {
  const scenes = mediaItems.map((m, i) => {
    const isTextMotion = TEXT_MOTION_SCENE_INDEXES.includes(i) && m.type === 'image';
    return {
      type: isTextMotion ? 'textMotion' : m.type,
      image: path.basename(m.path),
      audio: audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '',
      narration: narrations[i] || '',
      textChunks: isTextMotion ? splitIntoChunks(narrations[i]) : undefined,
      durationInSeconds: audioPaths[i] && fs.existsSync(audioPaths[i]) ? getAudioDuration(audioPaths[i]) : 4.0,
    };
  });
  const propsPath = path.join(outDir, 'remotion_props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes }), 'utf-8');

  const remotionDir = path.join(__dirname, '..', 'remotion');
  // public-dirが実行ごとのoutDirになるため、BGMファイルもここにコピーしておく
  fs.copyFileSync(path.join(remotionDir, 'assets', 'bgm.mp3'), path.join(outDir, 'bgm.mp3'));

  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/index.ts', 'MyVideo', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`],
    { cwd: remotionDir, timeout: 180000, shell: true, stdio: 'inherit' }
  );
  return videoPath;
}

async function postReel(igUserId, videoPath, caption) {
  const igToken = (process.env[`IG_TOKEN_${process.env.WF4_ACCOUNT_UPPER}`] || '').trim();

  const uploadOut = execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload']).toString();
  const publicUrl = JSON.parse(uploadOut).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
  const sizeMb = (fs.statSync(videoPath).size / 1024 / 1024).toFixed(1);
  console.log(`upload: ${publicUrl} (${sizeMb}MB)`);

  const createUrl = `https://graph.facebook.com/v23.0/${igUserId}/media`;
  const container = JSON.parse(
    execFileSync('curl', [
      '-s',
      '-X',
      'POST',
      createUrl,
      '-d',
      'media_type=REELS',
      '-d',
      `video_url=${encodeURIComponent(publicUrl)}`,
      '-d',
      `caption=${encodeURIComponent(caption)}`,
      // 冒頭のフェードイン演出で真っ黒なフレームがサムネになるのを避けるため、
      // 1.5秒地点（フェードインが終わり画が見えている瞬間）をカバー画像に指定する
      '-d',
      'thumb_offset=1500',
      '-d',
      `access_token=${igToken}`,
    ]).toString()
  );
  if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);

  let statusCode = 'IN_PROGRESS';
  for (let i = 0; i < 20 && statusCode !== 'FINISHED'; i++) {
    await new Promise((r) => setTimeout(r, 6000));
    const statusUrl = `https://graph.facebook.com/v23.0/${container.id}?fields=status_code&access_token=${igToken}`;
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

const LAST_RUN_PATH = path.join(__dirname, '..', 'data', 'wf4_last_run.json');
const INTERVAL_DAYS = 2;

function shouldRunToday(account) {
  let lastRun = {};
  try {
    lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf-8'));
  } catch (e) {}
  const last = lastRun[account];
  if (!last) return true;
  const daysSince = (Date.now() - new Date(last).getTime()) / 86400000;
  return daysSince >= INTERVAL_DAYS;
}

function markRanToday(account) {
  let lastRun = {};
  try {
    lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf-8'));
  } catch (e) {}
  lastRun[account] = new Date().toISOString();
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(lastRun, null, 2), 'utf-8');
}

async function main() {
  const account = process.argv[2];
  if (!account) {
    console.error('usage: node generate-reel.js <account>');
    process.exit(1);
  }
  if (!process.env.WF4_FORCE && !shouldRunToday(account)) {
    console.log(`[${account}] skip: 前回実行から${INTERVAL_DAYS}日経過していません`);
    return;
  }
  process.env.WF4_ACCOUNT_UPPER = account.toUpperCase();
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona) throw new Error(`unknown account: ${account}`);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve('wf4_media', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const scenario = await generateScenario(persona.system);
  console.log(`[${account}] caption:`, scenario.caption);

  const illusts = await generateIllustrations(scenario.detail, persona.imgStyle, outDir);
  // B-rollが入るシーン（イラスト配置箇所を除く）のキーワードを、シーン順に並べて渡す
  const brollSceneKeywords = [];
  for (let i = 0; i < SCENE_COUNT; i++) {
    if (!TEXT_MOTION_SCENE_INDEXES.includes(i)) brollSceneKeywords.push(scenario.brollKeywords[i] || '');
  }
  const broll = await generateBroll(scenario.detail, persona.imgStyle, outDir, account, brollSceneKeywords);
  // イラストを5枚目・ラスト（TEXT_MOTION_SCENE_INDEXES）に配置し、残りをbrollで埋める
  const mediaItems = new Array(SCENE_COUNT).fill(null);
  TEXT_MOTION_SCENE_INDEXES.forEach((idx, i) => {
    if (illusts[i]) mediaItems[idx] = illusts[i];
  });
  let brollCursor = 0;
  for (let i = 0; i < SCENE_COUNT; i++) {
    if (mediaItems[i] === null) {
      mediaItems[i] = broll[brollCursor++] || null;
    }
  }
  const finalMediaItems = mediaItems.filter(Boolean);

  if (finalMediaItems.length < 2) throw new Error(`メディアが足りません: ${finalMediaItems.length}`);
  console.log(`[${account}] media items:`, finalMediaItems.length);

  const audioPaths = await generateTTS(scenario.narrations, outDir);
  const videoPath = renderVideo(finalMediaItems, audioPaths, scenario.narrations, outDir);
  console.log(`[${account}] video rendered:`, videoPath);

  const result = await postReel(persona.igUserId, videoPath, scenario.caption);
  console.log(`[${account}] posted:`, result.id);
  markRanToday(account);

  execFileSync('git', ['config', 'user.name', 'wf4-bot']);
  execFileSync('git', ['config', 'user.email', 'wf4-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'data/wf4_used_ids', 'data/wf4_last_run.json']);
  try {
    execFileSync('git', ['commit', '-m', `chore: WF4 ${account} used_ids ${today}`]);
    execFileSync('git', ['push']);
  } catch (e) {
    console.log('no changes to commit or push failed:', e.message);
  }
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
