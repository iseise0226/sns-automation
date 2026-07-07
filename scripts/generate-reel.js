// WF4: 指定アカウントのInstagramリール(手描きスケッチ解説スタイル10シーン・約30秒)を生成・投稿
// 素材DLなし: 背景・カード・装飾は全てRemotionのコードで描画する（@ClaudeCode-videoチャンネル風）
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

const PASONA_STRUCTURE = `台本はナレーション${SCENE_COUNT}シーン分。各シーン20文字前後(全体で合計200文字程度・30秒の動画になる)で、以下のPASONAの流れに沿って一つのストーリーとして繋がるように書いてください。1シーン1メッセージで、テンポよく短く言い切ってください。
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
          `テーマを1つ選び、${PASONA_STRUCTURE}\n\nさらに各シーンの「見出し」を作ってください。見出しはそのシーンのナレーションの要点を6〜12文字で言い切る短いフレーズ（体言止めや短い断言。例:「旅費が高い問題」「1日3000円でOK」）。この台本・見出しとInstagramキャプション（150文字以内）をJSONで返してください。` +
          `{"caption":"投稿文","narrations":[${SCENE_COUNT}個の文字列の配列],"headlines":[${SCENE_COUNT}個の文字列の配列]}`,
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
  const narrations =
    Array.isArray(data.narrations) && data.narrations.length === SCENE_COUNT ? data.narrations : fallback;
  // 見出しが欠けたシーンはナレーション先頭を切り出して代用する
  const headlines = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const h = Array.isArray(data.headlines) ? String(data.headlines[i] || '').trim() : '';
    return h || String(narrations[i]).replace(/[。、！？!?]/g, '').slice(0, 12);
  });
  return {
    caption: data.caption || systemPrompt,
    narrations,
    headlines,
  };
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

function renderVideo(narrations, headlines, audioPaths, outDir) {
  // 全シーン共通: 手描きスケッチ風カード（Remotionで全描画・素材ファイルなし）
  const scenes = narrations.map((narration, i) => {
    return {
      headline: headlines[i] || '',
      narration: narration || '',
      audio: audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '',
      durationInSeconds: Math.max(2.4, audioPaths[i] && fs.existsSync(audioPaths[i]) ? getAudioDuration(audioPaths[i]) : 3.0),
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

// URLが「200で video/* を直接返すか」を確認する（HTMLページやリダイレクト先がHTMLだとIGの取得が失敗するため）
function isDirectVideoUrl(url) {
  try {
    const out = execFileSync('curl', ['-s', '-I', '-L', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url], {
      timeout: 30000,
    })
      .toString()
      .trim();
    const [code, type] = out.split(' ');
    return code === '200' && (type || '').startsWith('video/');
  } catch (e) {
    return false;
  }
}

// 動画を公開URLにアップロードする。複数ホストを順に試し、直リンクとして機能するものだけを採用する
// (tmpfiles.orgは2026-07に/dl/がHTMLへの302を返す仕様になり、IG側でエラー2207082になった)
function uploadPublic(videoPath) {
  const uploaders = [
    {
      name: 'litterbox',
      run: () =>
        execFileSync(
          'curl',
          ['-s', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'],
          { timeout: 300000 }
        )
          .toString()
          .trim(),
    },
    {
      name: 'uguu',
      run: () =>
        execFileSync('curl', ['-s', '-F', `files[]=@${videoPath}`, 'https://uguu.se/upload?output=text'], { timeout: 300000 })
          .toString()
          .trim(),
    },
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

async function postReel(igUserId, videoPath, caption) {
  const igToken = (process.env[`IG_TOKEN_${process.env.WF4_ACCOUNT_UPPER}`] || '').trim();

  const publicUrl = uploadPublic(videoPath);
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
  console.log(`[${account}] headlines:`, scenario.headlines.join(' / '));

  const audioPaths = await generateTTS(scenario.narrations, outDir);
  const videoPath = renderVideo(scenario.narrations, scenario.headlines, audioPaths, outDir);
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
