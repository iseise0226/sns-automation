// WF5: YouTube動画を週1本自動生成してアップロードする
// 台本(Groq) → スライド動画(Remotion+ElevenLabsクローン声) → YouTubeアップロード まで一気通貫
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');
const { google } = require('googleapis');

const SLIDE_COUNT = 10;
const VOICE_ID = 'vbCcTi45GPClIVFqHVYz'; // 聖さん本人ボイス(インスタントクローン)
const TTS_MODEL = 'eleven_flash_v2_5'; // 0.5クレジット/文字。週1本ペースを維持するため軽量モデル

const REPO_ROOT = path.join(__dirname, '..');
const TOPICS_PATH = path.join(REPO_ROOT, 'data', 'wf5_youtube_topics.json');
const STATE_PATH = path.join(REPO_ROOT, 'data', 'wf5_state.json');
const REMOTION_DIR = path.join(REPO_ROOT, 'remotion');
const PUBLIC_DIR = path.join(REMOTION_DIR, 'public', 'yt5');
const OUT_DIR = path.join(REPO_ROOT, 'youtube_out');

function req(url, options, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const r = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method: options.method || 'GET', headers: options.headers || {} },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const data = Buffer.concat(chunks);
          resolve({ status: res.statusCode, buffer: data, text: data.toString('utf8') });
        });
      }
    );
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function nextTopic() {
  const topics = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf-8'));
  let state = { index: 0 };
  if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  const topic = topics[state.index % topics.length];
  const nextIndex = (state.index + 1) % topics.length;
  fs.writeFileSync(STATE_PATH, JSON.stringify({ index: nextIndex, lastTopic: topic, lastRun: new Date().toISOString() }, null, 2));
  return topic;
}

const SYSTEM_PROMPT = `あなたは伊勢聖(いせさとし)本人として台本を書きます。
プロフィール: 美容業界25年以上の経営者。40歳でコロナ禍に独立、初月売上26万円・返済60万円のどん底から1年で月商100万円へ。算命学鑑定300人以上。
トーン: 「僕」を使う、癒しと気づき重視、煽らない、誇張しない、説教くさくしない。「やり方より、あり方」が軸。
出力は厳密なJSONのみ。`;

function buildUserPrompt(topic) {
  return `テーマ「${topic}」で、YouTube動画(10分想定)の台本を作ってください。
構成は10枚のスライド。1枚目は導入(フック+自己紹介)、2〜9枚目は本編、10枚目はまとめ+次回予告+チャンネル登録・LINE誘導。
各スライドについて、次の2種類のテキストを作成してください:
1. screen: 画面に出すスライドの見出し(15字以内)と箇条書き2〜3個(各20字以内)。強調したい語は**語**で囲む。
2. narration: 実際にナレーションで読み上げる自然な話し言葉(150〜300文字)。**数字は必ず全部ひらがな表記にする**(例:「26万円」→「にじゅうろくまんえん」、「40歳」→「よんじゅっさい」、「1年」→「いちねん」)。英数字やアルファベットも使わない。

JSON形式で出力:
{
  "title": "YouTubeタイトル(32文字前後、興味を引く形。【】を使ってよい)",
  "description": "概要欄用の文章(200〜400文字、最後に「登録・LINE誘導」を含めない。誘導文はこちらで別途追加する)",
  "slides": [
    {"kicker": "SANMEIGAKU × MIND", "screenTitle": "見出し\\n2行まで", "bullets": ["**強調**入りの箇条書き1", "箇条書き2", "箇条書き3"], "narration": "読み上げ文(数字は全部ひらがな)"},
    ...10個...
  ]
}
1枚目と10枚目は bullets を省略して screenTitle だけにしてもよい(type:titleのイメージ)。`;
}

async function generateScript(topic) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildUserPrompt(topic) },
    ],
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } },
    body
  );
  const json = JSON.parse(res.text);
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq応答が空: ' + res.text.slice(0, 300));
  return JSON.parse(content);
}

async function tts(text, outPath) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  const body = JSON.stringify({
    text,
    model_id: TTS_MODEL,
    voice_settings: { stability: 0.55, similarity_boost: 0.8 },
  });
  const res = await req(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' } },
    body
  );
  if (res.status !== 200) throw new Error(`TTS失敗 ${res.status}: ${res.text.slice(0, 200)}`);
  fs.writeFileSync(outPath, res.buffer);
}

function audioDuration(p) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]);
  return parseFloat(out.toString().trim());
}

async function buildSlideProps(script) {
  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const slides = [];
  for (let i = 0; i < script.slides.length; i++) {
    const s = script.slides[i];
    const audioFile = `audio${i + 1}.mp3`;
    const audioFull = path.join(PUBLIC_DIR, audioFile);
    console.log(`TTS ${i + 1}/${script.slides.length} (${s.narration.length}文字)...`);
    await tts(s.narration, audioFull);
    await new Promise((r) => setTimeout(r, 500));
    const dur = audioDuration(audioFull);
    const isEdge = i === 0 || i === script.slides.length - 1;
    slides.push({
      type: isEdge ? 'title' : 'bullets',
      kicker: s.kicker || 'SANMEIGAKU × MIND',
      title: s.screenTitle,
      bullets: isEdge ? undefined : s.bullets,
      page: `${String(i + 1).padStart(2, '0')} / ${script.slides.length}`,
      audio: `yt5/${audioFile}`,
      durationInSeconds: Math.round((dur + 0.9) * 10) / 10,
    });
  }
  const bgmSrc = path.join(REMOTION_DIR, 'assets', 'bgm.mp3');
  const bgmDst = path.join(PUBLIC_DIR, 'bgm.mp3');
  fs.copyFileSync(bgmSrc, bgmDst);
  return { slides, bgm: 'yt5/bgm.mp3' };
}

function renderVideo(propsPath, outPath) {
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/index.ts', 'SlideVideo', outPath, `--props=${propsPath}`],
    { cwd: REMOTION_DIR, timeout: 600000, stdio: 'inherit', shell: true }
  );
}

async function uploadToYoutube(videoPath, title, description) {
  const oauth2Client = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });
  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: { title, description, categoryId: '22' },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(videoPath) },
  });
  return res.data.id;
}

const CTA = `

▼経営者の心が軽くなる「7日間の無料LINE配信」
https://lin.ee/60aEpWN
（売り込みはありません。読むだけでOKです）

#経営者 #マインド #サロン経営 #算命学`;

async function main() {
  const topic = nextTopic();
  console.log('今週のテーマ:', topic);

  const script = await generateScript(topic);
  console.log('タイトル:', script.title);

  const props = await buildSlideProps(script);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const propsPath = path.join(OUT_DIR, 'props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props, null, 2));

  const videoPath = path.join(OUT_DIR, 'video.mp4');
  renderVideo(propsPath, videoPath);

  const description = script.description + CTA;
  const videoId = await uploadToYoutube(videoPath, script.title, description);
  console.log('アップロード完了: https://youtu.be/' + videoId);

  // トピックの進行状態をコミット
  try {
    execFileSync('git', ['config', 'user.name', 'wf5-bot']);
    execFileSync('git', ['config', 'user.email', 'wf5-bot@users.noreply.github.com']);
    execFileSync('git', ['add', 'data/wf5_state.json']);
    execFileSync('git', ['commit', '-m', `chore: WF5 topic progress - ${topic}`]);
    execFileSync('git', ['push']);
  } catch (e) {
    console.log('no changes to commit or push failed:', e.message);
  }
}

main().catch((e) => {
  console.error('WF5失敗:', e.message);
  process.exit(1);
});
