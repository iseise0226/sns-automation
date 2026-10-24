// 縦書き明朝の「文章リール」(ise_sato_kosodate, 2026-10-24〜)。generate-clip-quote.js から clipQuote.style が "essay" のときに使う
// 参考: tomo_mindcoach。共感→本音→葛藤→(実話)→言い換え→許可→希望。前半は暗い映像・後半は明るく暖かい映像
// 分析: 第2の脳/03_SNS運用・プロジェクト/参考分析_tomo_mindcoach_縦書き文章リール_2026-10-24.md
// 聖さんの決定(2026-10-24): 暗い言葉は前半だけOK / ナレーションあり / 投稿文にLINE誘導は入れない / 背景は今の素材クリップから明るさで選ぶ
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const REMOTION_DIR = path.join(__dirname, '..', 'remotion');
const PHASES = ['共感', '本音', '葛藤', '実話', '言い換え', '許可', '希望'];
const DARK_OK = new Set(['共感', '本音', '葛藤', '実話']);
const TONE = { 共感: 'dark', 本音: 'dark', 葛藤: 'dark', 実話: 'dawn', 言い換え: 'dawn', 許可: 'warm', 希望: 'warm' };
const DARK = /悩|つら|辛|さみし|寂し|後悔|不安|疲|失敗|孤独|苦し|絶望|死|(?<!機)嫌|ダメ|だめ|無理|怖|重い|しんど|限界/;

function buildEssayPrompt(pastTitles, topicSeed, fact, beliefs) {
  return `インスタのリール用に、縦書きの「文章リール」の台本を1本作ってください。画面に縦書きの短い文が1枚ずつ出て、ナレーションが同じ文を読みます。見た人が、読み進めるうちに前向きになっていく内容にします。
今回の話題の方向: 「${topicSeed}」

【流れ】cards は全部で18〜21枚。phase を必ずこの順で付ける。
1. 共感(3〜4枚): 毎日を頑張っている40〜50代の、今の気持ちを一人称の心の声で代わりに書く(例「毎日、ちゃんと頑張ってる。」「なのに、なぜか心が重い。」)。
2. 本音(2枚): 「本当は〜したい」という本音。
3. 葛藤(2〜3枚): でも変えるのは怖い、という揺れ。かぎかっこで心の声を入れてよい(例「うまくいかなかったら？」)。
4. 実話(1〜2枚): 語り手(僕)の実話。下の「僕の実話」だけを元にする。書いていない数字・出来事・人物は作らない。
5. 言い換え(2〜3枚): 「でも、気づいた。」のように視点を変える。下の「僕が大事にしている考え方」から1〜2個を、平易な言葉で言い直す。
6. 許可(2枚): 「〜してもいい。」(例「怖くてもいい。」「迷ってもいい。」)。
7. 希望(3〜4枚): 小さな一歩の背中を押し、言い切って終わる。最後の1枚は「次は、あなたの番だ。」のような短い一言。

【僕の実話】
${fact.text}

【僕が大事にしている考え方】
${beliefs.map((b) => '- ' + b).join('\n')}

【書き方】
- lines: 1枚の文。1〜3行。1行は14字以内。1枚は3〜4秒で読める長さ。行の切れ目は意味の切れ目にし、助詞(を・が・は・に・と・の など)や「だ」「いる」で次の行を始めない。各枚の中で文を言い終える。
- 「〜しなさい」「〜すべき」と教えない。友達に語りかけるように、最後は言い切る。
- 暗い言葉(怖い・重い・つらい・不安・疲れた など)は「共感」「本音」「葛藤」「実話」だけで使ってよい。「言い換え」「許可」「希望」では使わず、明るい言葉だけにする(「許可」の「怖くてもいい。」「迷ってもいい。」はよい)。
- 「脳科学的に」「研究で証明」のような根拠を断定する言い方はしない。部下・スタッフ・社員の話は出さない。
- 誤字、助詞の抜け、不自然な日本語がないか、出す前に1つずつ読み直す。

【そのほか】
- title: 1枚目に大きく出す題。2行(各7字以内)。例: ["壁の向こうに","景色がある"]。明るい言葉にする。下の「最近使ったタイトル」とかぶらないこと。
- caption: 投稿文。1行目は題。そのあと動画と同じ流れを短い段落で(改行多め、300〜450字)。「僕」の話は「僕の実話」の範囲だけ。最後に問いかけ(例「あなたが今、越えたい壁は何ですか？よかったらコメントで教えてください。」)、英語の一言(1行)、ハッシュタグ4つ(#前向き を含む)。LINEやプロフィールへの誘導は書かない。

【最近使ったタイトル(かぶらないこと)】
${pastTitles.length ? pastTitles.map((t) => '- ' + t).join('\n') : '- (なし)'}

JSONだけを返す: {"title":["..",".."],"cards":[{"phase":"共感","lines":["..",".."]}],"caption":".."}`;
}

function validateEssay(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['JSONではない'];
  d.titleLines = (Array.isArray(d.title) ? d.title : [d.title]).map((l) => String(l || '').trim()).filter(Boolean).slice(0, 2);
  d.title = d.titleLines.join('');
  d.cards = (Array.isArray(d.cards) ? d.cards : []).map((c) => ({
    phase: String(c.phase || '').trim(),
    lines: (Array.isArray(c.lines) ? c.lines : [c.lines]).map((l) => String(l || '').trim()).filter(Boolean).slice(0, 3),
  }));
  if (!d.titleLines.length || d.titleLines.some((l) => [...l].length > 8)) errs.push('題がない・長い');
  if (DARK.test(d.title)) errs.push('題に暗い言葉');
  if (d.cards.length < 16 || d.cards.length > 23) errs.push(`枚数が${d.cards.length}枚`);
  let last = -1;
  d.cards.forEach((c, i) => {
    const pi = PHASES.indexOf(c.phase);
    if (pi < 0) errs.push(`${i + 1}枚目のphaseが不正(${c.phase})`);
    else if (pi < last) errs.push(`${i + 1}枚目のphaseの順番が逆`);
    else last = pi;
    if (!c.lines.length) errs.push(`${i + 1}枚目が空`);
    if (c.lines.some((l) => [...l].length > 15)) errs.push(`${i + 1}枚目の1行が長い`);
    // 行の頭が助詞・助動詞だと、言葉の途中で改行したように見える(例「当たり前が宝物 / だと気づく」)
    if (c.lines.slice(1).some((l) => /^(を|は|へ|だと|だっ|です|でし|いる|いた|ある|ない|が(?!ん))/.test(l))) errs.push(`${i + 1}枚目の行の区切りが不自然`);
    if (/[、,]$/.test(c.lines[c.lines.length - 1] || '')) errs.push(`${i + 1}枚目の文が途中で切れている`);
    // 許可では「怖くてもいい」「迷ってもいい」のように怖さを認める言葉だけは使ってよい
    const body = c.phase === '許可' ? c.lines.join('').replace(/怖|迷/g, '') : c.lines.join('');
    if (!DARK_OK.has(c.phase) && DARK.test(body)) errs.push(`${i + 1}枚目(${c.phase})に暗い言葉`);
  });
  for (const p of PHASES) if (!d.cards.some((c) => c.phase === p)) errs.push(`「${p}」がない`);
  if (d.cards.filter((c) => c.phase === '実話').length > 2) errs.push('実話が多すぎる');
  const cap = String(d.caption || '').trim();
  if (!cap) errs.push('captionがない');
  if (/LINE|ライン|プロフィール|プロフ/.test(cap)) errs.push('投稿文に誘導が入っている');
  if (DARK.test(cap.slice(Math.floor(cap.length * 0.6)))) errs.push('投稿文の後半に暗い言葉');
  if (/部下|スタッフ|社員|従業員/.test(JSON.stringify(d.cards) + cap)) errs.push('部下・スタッフの話');
  return errs;
}

async function generateEssayScript({ callLLM, systemPrompt, pastTitles, topicSeed, fact, beliefs }) {
  if (process.env.WF4_RAW_FILE) {
    const d = JSON.parse(fs.readFileSync(process.env.WF4_RAW_FILE, 'utf-8'));
    const errs = validateEssay(d);
    if (errs.length) throw new Error('WF4_RAW_FILEの台本が不正: ' + errs.join(' / '));
    return d;
  }
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildEssayPrompt(pastTitles, topicSeed, fact, beliefs) },
  ];
  let lastErrs = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    let d;
    try {
      d = JSON.parse(await callLLM(messages, 6000));
    } catch (e) {
      lastErrs = ['JSONの解析に失敗: ' + e.message];
      continue;
    }
    lastErrs = validateEssay(d);
    d.topicSeed = topicSeed;
    if (!lastErrs.length) return d;
    console.error(`台本が不正(${attempt}/3): ${lastErrs.join(' / ')}`);
  }
  throw new Error('台本を生成できませんでした: ' + lastErrs.join(' / '));
}

// 素材の明るさ(中央1フレームの平均輝度)を測り、暗い順に並べる
function clipsByBrightness(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.mp4'))
    .map((f) => {
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', '1.5', '-i', path.join(dir, f), '-frames:v', '1', '-vf', 'scale=32:32,format=gray', '-f', 'rawvideo', '-']);
      return { f, y: raw.reduce((a, b) => a + b, 0) / raw.length };
    })
    .sort((a, b) => a.y - b.y);
}

// 1枚目の題(暖かい映像)+本文。同じ色調の枚が続く間は、3枚までを1本の映像にまとめる
function buildShots(script) {
  const cards = [{ title: true, lines: script.titleLines, tone: 'warm' }, ...script.cards.map((c) => ({ lines: c.lines, phase: c.phase, tone: TONE[c.phase] }))];
  const shots = [];
  let run = 0;
  cards.forEach((c, i) => {
    const prev = cards[i - 1];
    if (!prev || prev.tone !== c.tone || run >= 3 || prev.title) {
      shots.push({ tone: c.tone });
      run = 0;
    }
    run++;
    c.shot = shots.length - 1;
  });
  return { cards, shots };
}

// 色調ごとに、暗い1/3・真ん中・明るい1/3から素材を選ぶ。使用済みと、同じ元動画(sNN)の重複を避ける
function pickEssayClips({ clipDir, shots, used, outDir }) {
  const ranked = clipsByBrightness(clipDir);
  const third = Math.floor(ranked.length / 3);
  const pools = { dark: ranked.slice(0, third), dawn: ranked.slice(third, third * 2), warm: ranked.slice(third * 2) };
  // 同じ元動画(sNN)は直近4本の間は避ける(長い動画でも続けて同じ映像にならないように)
  const recent = [];
  const isRecent = (f) => recent.slice(-4).includes(f.split('_')[0]);
  const pickedSet = new Set();
  const picked = [];
  fs.mkdirSync(path.join(outDir, 'clips'), { recursive: true });
  for (const s of shots) {
    const base = pools[s.tone];
    const tiers = [base.filter((c) => !used.includes(c.f) && !pickedSet.has(c.f) && !isRecent(c.f)), base.filter((c) => !isRecent(c.f)), base];
    const pool = tiers.find((t) => t.length);
    const c = pool[Math.floor(Math.random() * pool.length)];
    recent.push(c.f.split('_')[0]);
    pickedSet.add(c.f);
    picked.push(c.f);
    fs.copyFileSync(path.join(clipDir, c.f), path.join(outDir, 'clips', c.f));
    s.clip = `clips/${c.f}`;
  }
  return picked;
}

// 文章をかみしめるように、少しゆっくり・低めに読む。長さ+余白を1枚の秒数にする
async function generateEssayTTS({ engine, speakerId, cards, outDir }) {
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const text = c.lines.join('').replace(/[「」『』]/g, '');
    const q = await (await fetch(`${engine}/audio_query?speaker=${speakerId}&text=${encodeURIComponent(text)}`, { method: 'POST' })).json();
    q.speedScale = 0.95;
    q.pitchScale = -0.02;
    q.intonationScale = 1.1;
    q.prePhonemeLength = 0.3;
    q.postPhonemeLength = 0.4;
    const res = await fetch(`${engine}/synthesis?speaker=${speakerId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(q) });
    if (!res.ok) throw new Error(`synthesis失敗 ${res.status}`);
    const file = `audio${i + 1}.wav`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(await res.arrayBuffer()));
    const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(outDir, file)]).toString());
    c.audio = file;
    c.seconds = Math.max(c.title ? 3.5 : 3.0, Math.round((dur + 0.5) * 10) / 10);
  }
}

function renderEssay({ cards, shots, outDir, composition = 'ClipEssay' }) {
  const props = { cards: cards.map(({ lines, title, shot, audio, seconds }) => ({ lines, title, shot, audio, seconds })), shots, bgm: 'bgm.mp3' };
  const propsPath = path.join(outDir, 'essay_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const videoPath = path.join(outDir, 'video.mp4');
  // 動画の読み込みが一時的に失敗することがあるため、最大3回まで書き出し直す
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execFileSync('npx', ['remotion', 'render', 'src/essay-index.tsx', composition, videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`, '--crf=22', '--concurrency=1', '--offthreadvideo-threads=1'], {
        cwd: REMOTION_DIR,
        timeout: 3600000,
        shell: true,
        stdio: 'inherit',
      });
      return videoPath;
    } catch (e) {
      if (attempt === 3) throw e;
      console.error(`書き出しに失敗(${attempt}/3)。やり直します`);
    }
  }
}

module.exports = { PHASES, buildEssayPrompt, validateEssay, generateEssayScript, buildShots, pickEssayClips, generateEssayTTS, renderEssay };
