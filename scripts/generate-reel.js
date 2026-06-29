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

async function generateScenario(systemPrompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          'テーマを1つ選び、台本（ナレーション3シーン分、各20〜30文字、起→承→結の流れ）とInstagramキャプション（150文字以内）、画像説明（英語20文字以内）をJSONで返してください。{"caption":"投稿文","detail":"画像説明(英語)","narrations":["1文目","2文目","3文目"]}',
      },
    ],
    max_tokens: 500,
    response_format: { type: 'json_object' },
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`, 'Content-Type': 'application/json' } },
    body
  );
  const data = JSON.parse(res.json?.choices?.[0]?.message?.content || '{}');
  return {
    caption: data.caption || systemPrompt,
    detail: data.detail || 'lifestyle content',
    narrations:
      Array.isArray(data.narrations) && data.narrations.length === 3
        ? data.narrations
        : ['今日はこんな出来事があった。', 'そこから見えてきたことがある。', '一歩ずつ、進んでいこう。'],
  };
}

async function generateIllustration(detail, imgStyle, outDir) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const prompt = `${imgStyle}, ${detail}, scene 1`;
  const body = JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', quality: 'low', n: 1 });
  const res = await req(
    'https://api.openai.com/v1/images/generations',
    { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' } },
    body
  );
  const b64 = res.json?.data?.[0]?.b64_json;
  if (!b64) return null;
  const p = path.join(outDir, 'image1.png');
  fs.writeFileSync(p, Buffer.from(b64, 'base64'));
  return { path: p, type: 'image' };
}

async function fetchPexelsVideo(keyword, usedIds) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  const res = await req(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=15&orientation=portrait`, {
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
  const res = await req(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(keyword)}&per_page=15`, {});
  const candidates = (res.json?.hits || []).filter((v) => v.duration >= 6 && !usedIds.includes(`pb_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const v = pick.videos.medium || pick.videos.small || pick.videos.large;
  return { id: `pb_${pick.id}`, url: v.url };
}

async function generateBroll(detail, imgStyle, outDir, account) {
  const usedIdsPath = path.join(__dirname, '..', 'data', 'wf4_used_ids', `${account}.json`);
  fs.mkdirSync(path.dirname(usedIdsPath), { recursive: true });
  let usedIds = [];
  try {
    usedIds = JSON.parse(fs.readFileSync(usedIdsPath, 'utf-8'));
  } catch (e) {}

  const styleKeyword = imgStyle.split(',')[0].trim();
  const keywordPool = [detail, styleKeyword, 'japan lifestyle', 'calm nature', 'daily life moment'].filter(Boolean);

  const mediaItems = [];
  for (let i = 0; i < 2; i++) {
    let found = null;
    for (const kw of keywordPool) {
      found = await fetchPexelsVideo(kw, usedIds);
      if (found) break;
    }
    if (!found) {
      for (const kw of keywordPool) {
        found = await fetchPixabayVideo(kw, usedIds);
        if (found) break;
      }
    }
    if (found) {
      const buf = await reqBinary(found.url, {});
      const p = path.join(outDir, `video${i + 1}.mp4`);
      fs.writeFileSync(p, buf);
      mediaItems.push({ path: p, type: 'video' });
      usedIds.push(found.id);
    }
  }
  fs.writeFileSync(usedIdsPath, JSON.stringify(usedIds.slice(-200)), 'utf-8');
  return mediaItems;
}

async function generateTTS(narrations, outDir) {
  const key = (process.env.GOOGLE_TTS_KEY || '').trim();
  const audioPaths = [];
  for (let i = 0; i < narrations.length; i++) {
    const body = JSON.stringify({
      input: { text: narrations[i] },
      voice: { languageCode: 'ja-JP', name: 'ja-JP-Wavenet-B' },
      audioConfig: { audioEncoding: 'MP3' },
    });
    const res = await req(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      body
    );
    const audioPath = path.join(outDir, `audio${i + 1}.mp3`);
    if (res.json?.audioContent) {
      fs.writeFileSync(audioPath, Buffer.from(res.json.audioContent, 'base64'));
      audioPaths.push(audioPath);
    } else {
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

function renderVideo(mediaItems, audioPaths, narrations, outDir) {
  const scenes = mediaItems.map((m, i) => ({
    type: m.type,
    image: path.basename(m.path),
    audio: audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '',
    narration: narrations[i] || '',
    durationInSeconds: audioPaths[i] && fs.existsSync(audioPaths[i]) ? getAudioDuration(audioPaths[i]) : 4.0,
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

async function postReel(igUserId, videoPath, caption) {
  const igToken = (process.env[`IG_TOKEN_${process.env.WF4_ACCOUNT_UPPER}`] || '').trim();

  const uploadOut = execFileSync('curl', ['-s', '-F', `file=@${videoPath}`, 'https://tmpfiles.org/api/v1/upload']).toString();
  const publicUrl = JSON.parse(uploadOut).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');

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
const INTERVAL_DAYS = 3;

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

  const mediaItems = [];
  const illust = await generateIllustration(scenario.detail, persona.imgStyle, outDir);
  if (illust) mediaItems.push(illust);
  const broll = await generateBroll(scenario.detail, persona.imgStyle, outDir, account);
  mediaItems.push(...broll);

  if (mediaItems.length < 2) throw new Error(`メディアが足りません: ${mediaItems.length}`);
  console.log(`[${account}] media items:`, mediaItems.length);

  const audioPaths = await generateTTS(scenario.narrations, outDir);
  const videoPath = renderVideo(mediaItems, audioPaths, scenario.narrations, outDir);
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
