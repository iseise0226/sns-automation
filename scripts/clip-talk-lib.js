// トーク型リール(上に固定タイトル+1場面2〜3行の話+英訳+表紙B案)の台本・読み上げ・書き出し・表紙
// generate-clip-quote.js から、wf4_accounts.json の clipQuote.style が "talk" のときに使う(ise_sato_kosodate, 2026-10-22〜)
// 参考: issei_english「この3つで、人生うまくいく」(約束→3つ→結果→締め)。分析は 第2の脳/03_SNS運用・プロジェクト/参考分析_issei_english_*.md
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REMOTION_DIR = path.join(__dirname, '..', 'remotion');
const COVER_DIR = path.join(REMOTION_DIR, 'assets', 'cover_photos');
const SCENES = 8;

// 3つのコツの元にする、聖さん本人の考え方(第2の脳のヒーローズジャーニー由来)。ここから3つ選ばせる
const BELIEFS = [
  '当たり前のことは、当たり前じゃない。好きなことができて、好きなものが食べられる。今ある環境がどれだけありがたいか。',
  '不平不満や愚痴を言うより、今あることに感謝する。',
  '壁は自分が成長するために現れる。乗り越えられない壁は来ない。壁を越えた先には必ず成長がある。',
  '壁があると、ワクワクできる。',
  'やり方より、あり方。手法より、根本のマインドが整っていないと何も変わらない。',
  'まず一番上の自分を満たすと、周りにも良いものが流れていく(自分にお金や時間を使っていい)。',
  '行動しないと現実は変わらない。下りのエスカレーターと同じで、動き続けることが大事。',
  '停滞して深く考える時期こそ、実は一番大切な時間。',
  '自分の人生は自分で決める。',
  '人生には良い時も悪い時もある。',
];

const MOODS = ['smile', 'confident', 'explain', 'think', 'cheer'];

const DARK = /悩|つら|辛|さみし|寂し|後悔|不安|疲|失敗|孤独|苦し|絶望|死|(?<!機)嫌|ダメ|だめ|無理/;

function buildTalkPrompt(pastTitles, topicSeed, fact) {
  return `インスタのリール用に、トーク型の台本を1本作ってください。画面の上に固定タイトル、各場面に2〜3行の文が出て、ナレーションが同じ文を読み上げます。日本語の下に英語訳も出ます。
今回の話題の方向: 「${topicSeed}」

【型】(参考: 伸びている「この3つで、人生うまくいく」型。約束→3つ→結果→締め)
場面はちょうど${SCENES}個。
- 場面1: こちらで次の文に固定して差し込む(あなたの出力の場面1は何でもよい): 「${fact.lines.join(' ')}」
- 場面2: 場面1の続き。下の「僕の実話」だけを元に、その先(変化・気づき)を語り、「〜な3つのこと」へつなぐ。場面1と同じ言葉を繰り返さない。書いていない数字・出来事・人物は作らない。
- 場面3〜5: tag に「その1」「その2」「その3」。下の「僕が大事にしている考え方」から3つ選び、初めて聞く人にも分かる平易な言葉で言い直す。必ず2〜3行にして、1行目に「〜より」「〜じゃなくて」(やめること)、2行目に「〜する」(やること)を書く対比の形にする。例: 「ないものを数えるより / 今あるものに感謝する」「壁が来たら / 「成長のチャンスだ」と / 思ってみる」。場面1・2で使った言葉は使わない。
- 場面6: 「この3つができると」で始め、うれしい変化を言う。
- 場面7: さらにもう一つ、うれしい変化か、見ている人への言葉。
- 場面8: 背中を押す短い締め(「次は、あなたの番」のような一言)。

【僕の実話】
${fact.text}

【僕が大事にしている考え方】
${BELIEFS.map((b) => '- ' + b).join('\n')}

【各場面の書き方】
- lines: 画面に出す日本語。2〜3行。各場面の中で文を言い終える(「〜が、」で次の場面に続けない)。1行は13字以内。読み上げて4〜5秒で言える長さ。行の切れ目は意味の切れ目にする。
- en: その場面の自然な英語訳。1〜2文、80文字以内。直訳でなく英語圏の人が自然に読める言い方。日本語を含めない。
- tag: 場面3〜5だけ「その1」「その2」「その3」。他の場面には付けない。

【そのほか】
- titleTop と titleMain: 画面上の固定タイトルと表紙の文字。2つつなげて1文になり、どちらかに必ず「3つ」を入れる。例: titleTop「この3つで、」titleMain「毎日が楽しくなる」/ titleTop「僕が続けた」titleMain「3つの習慣」。titleTopは8字以内、titleMainは10字以内。毎回違う言い回しにする。
- titleEn: タイトルの英語(40文字以内)。
- coverMood: 表紙の写真の雰囲気。${MOODS.join(' / ')} のどれか1つ(笑顔/自信/説明/考える/応援)。台本の内容に一番合うもの。
- caption: 投稿文。1行目はタイトル。そのあと短い段落で改行多め200〜300字(日本語)。3つのコツは「その1　〜」の形で並べる。最後に英語の一言(1〜2行)と、ハッシュタグ4つ(#前向き を含む)。LINEやプロフィールへの誘導は書かない。

【中身のルール】
- 読む人は40〜50代の、毎日を頑張っている人。友達に話すように、言い切る(「〜しなさい」「〜すべき」は使わない)。
- 明るく前向きな言葉だけ。「悩み」「つらい」「さみしい」「後悔」「不安」「疲れた」「失敗」「無理」「ダメ」など暗い言葉、不安をあおる言い方は使わない。
- 「脳科学的に」「研究で証明」のような根拠を断定する言い方はしない。
- 部下・スタッフ・社員の話は出さない。
- 投稿文の「僕」の話は「僕の実話」に書いてある内容だけ。書いていない習慣・出来事を足さない。実話は過去のことなので「今日」「さっき」など、いま起きたように書かない。
- 誤字、助詞の抜け、不自然な日本語がないか、出す前に1つずつ読み直す。
- 下の「最近使ったタイトル」とかぶらないこと。

【最近使ったタイトル(かぶらないこと)】
${pastTitles.length ? pastTitles.map((t) => '- ' + t).join('\n') : '- (なし)'}

JSONだけを返す: {"titleTop":"..","titleMain":"..","titleEn":"..","coverMood":"..","scenes":[{"tag":"","lines":["..",".."],"en":".."}],"caption":".."}`;
}

function validateTalk(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['JSONではない'];
  d.titleTop = String(d.titleTop || '').trim();
  d.titleMain = String(d.titleMain || '').trim();
  d.titleEn = String(d.titleEn || '').trim();
  d.title = d.titleTop + d.titleMain;
  if (!MOODS.includes(d.coverMood)) d.coverMood = 'smile';
  d.scenes = (Array.isArray(d.scenes) ? d.scenes : []).slice(0, SCENES).map((s, i) => ({
    tag: i >= 2 && i <= 4 ? `その${i - 1}` : undefined,
    lines: (Array.isArray(s.lines) ? s.lines : [s.lines]).map((l) => String(l || '').trim()).filter(Boolean).slice(0, 3),
    en: String(s.en || '').trim(),
  }));
  if (!d.titleTop || !d.titleMain) errs.push('タイトルがない');
  if (!/3つ|３つ|3個/.test(d.title)) errs.push('タイトルに「3つ」がない');
  const s1 = d.scenes[0] ? d.scenes[0].lines.join('') : '';
  if (s1 && d.scenes[1] && d.scenes[1].lines.join('').includes(s1.slice(-8))) errs.push('場面2が場面1の繰り返し');
  if ([...d.titleTop].length > 9 || [...d.titleMain].length > 11) errs.push('タイトルが長い');
  if (d.scenes.length !== SCENES) errs.push(`場面が${SCENES}個でない`);
  d.scenes.forEach((s, i) => {
    if (!s.lines.length) errs.push(`場面${i + 1}が空`);
    if (s.lines.some((l) => [...l].length > 14)) errs.push(`場面${i + 1}の1行が長い`);
    if (/[、,が]$/.test(s.lines[s.lines.length - 1] || "")) errs.push(`場面${i + 1}の文が途中で切れている`);
    if (i >= 1 && s.lines.length < 2) errs.push(`場面${i + 1}が1行しかない(2〜3行にする)`);
    if (!s.en) errs.push(`場面${i + 1}に英訳がない`);
    else if (s.en.length > 100) errs.push(`場面${i + 1}の英訳が長い`);
    else if (/[぀-ヿ一-鿿]/.test(s.en)) errs.push(`場面${i + 1}の英訳に日本語が混ざっている`);
  });
  if (!String(d.caption || '').trim()) errs.push('captionがない');
  const body = JSON.stringify(d.scenes) + d.title + String(d.caption || '');
  if (DARK.test(body)) errs.push('暗い言葉が入っている');
  if (/部下|スタッフ|社員|従業員/.test(body)) errs.push('部下・スタッフの話が入っている');
  return errs;
}

async function generateTalkScript({ callLLM, systemPrompt, pastTitles, topicSeed, fact }) {
  if (process.env.WF4_RAW_FILE) {
    const d = JSON.parse(fs.readFileSync(process.env.WF4_RAW_FILE, 'utf-8'));
    const errs = validateTalk(d);
    if (errs.length) throw new Error('WF4_RAW_FILEの台本が不正: ' + errs.join(' / '));
    return d;
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildTalkPrompt(pastTitles, topicSeed, fact) },
  ];
  let lastErrs = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let d;
    try {
      d = JSON.parse(await callLLM(messages, 5000));
    } catch (e) {
      lastErrs = ['JSONの解析に失敗: ' + e.message];
      continue;
    }
    if (Array.isArray(d.scenes) && d.scenes.length) d.scenes[0] = { lines: fact.lines, en: fact.en };
    lastErrs = validateTalk(d);
    d.topicSeed = topicSeed;
    if (!lastErrs.length) return d;
    console.error(`台本が不正(${attempt}/3): ${lastErrs.join(' / ')}`);
  }
  throw new Error('台本を生成できませんでした: ' + lastErrs.join(' / '));
}

// 場面ごとに読み上げを作り、その長さ+余白を場面の秒数にする
async function generateTalkTTS({ engine, speakerId, scenes, outDir }) {
  const out = [];
  for (let i = 0; i < scenes.length; i++) {
    const s = scenes[i];
    const text = [s.tag ? s.tag + '。' : '', ...s.lines].join('');
    const q = await (await fetch(`${engine}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
    q.speedScale = 1.12;
    q.prePhonemeLength = 0.15;
    q.postPhonemeLength = 0.2;
    const res = await fetch(`${engine}/synthesis?speaker=${speakerId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
    if (!res.ok) throw new Error(`synthesis失敗 ${res.status}`);
    const file = `audio${i + 1}.wav`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(await res.arrayBuffer()));
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(outDir, file)]).toString());
    out.push({ audio: file, seconds: Math.max(3.4, Math.round((dur + 0.6) * 10) / 10) });
  }
  return out;
}

function renderCmd(args, label) {
  // 動画の読み込みが一時的に失敗することがあるため、最大3回まで書き出し直す
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('npx', args, { cwd: REMOTION_DIR, timeout: 2400000, shell: true, stdio: 'inherit' });
      return;
    } catch (e) {
      if (attempt === 3) throw e;
      console.error(`${label}に失敗(${attempt}/3)。やり直します`);
    }
  }
}

function renderTalk({ script, tts, clips, outDir }) {
  const props = {
    title: script.title,
    titleEn: script.titleEn,
    scenes: script.scenes.map((s, i) => ({ clip: `clips/${clips[i]}`, lines: s.lines, en: s.en, tag: s.tag, audio: tts[i].audio, seconds: tts[i].seconds })),
    bgm: 'bgm.mp3',
  };
  const propsPath = path.join(outDir, 'talk_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const videoPath = path.join(outDir, 'video.mp4');
  renderCmd(['remotion', 'render', 'src/talk-index.tsx', 'ClipTalk', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`, '--crf=23', '--concurrency=1', '--offthreadvideo-threads=1'], '書き出し');
  return videoPath;
}

// 表紙の写真: その日の雰囲気(coverMood)の写真から、前回までに使っていないものを選ぶ
function pickCoverPhoto(mood, recentPhotos) {
  const all = fs.readdirSync(COVER_DIR).filter((f) => f.endsWith('.jpg'));
  const same = all.filter((f) => f.startsWith(mood + '_'));
  const fresh = same.filter((f) => !recentPhotos.includes(f));
  const pool = fresh.length ? fresh : same.length ? same : all.filter((f) => !recentPhotos.slice(-3).includes(f));
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderCover({ script, photo, outDir }) {
  fs.mkdirSync(path.join(outDir, 'cover_photos'), { recursive: true });
  fs.copyFileSync(path.join(COVER_DIR, photo), path.join(outDir, 'cover_photos', photo));
  const props = { photo: `cover_photos/${photo}`, badge: '3つのこと', titleTop: script.titleTop, titleMain: script.titleMain, titleEn: script.titleEn };
  const propsPath = path.join(outDir, 'cover_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const coverPath = path.join(outDir, 'cover.jpg');
  renderCmd(['remotion', 'still', 'src/talk-index.tsx', 'TalkCover', coverPath, `--props=${propsPath}`, `--public-dir=${outDir}`, '--image-format=jpeg', '--jpeg-quality=90'], '表紙の書き出し');
  return coverPath;
}

module.exports = { BELIEFS, SCENES, generateTalkScript, generateTalkTTS, renderTalk, pickCoverPhoto, renderCover, validateTalk, buildTalkPrompt };
