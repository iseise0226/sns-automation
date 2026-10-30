// WF4: AIラク活(旧sessi_life)の「チャット型」リールを生成・投稿する(2026-10-30〜)
// 悩みを言い当てて本当の原因まで掘る → 「15分→30秒」で結論 → 理由 → コピペ用の文と、その文を実際にAIへ送った答え → もう一歩のコツ → 悩みが消えた一言と保存、の約1分のPREP(2026-10-30〜)。
// 答えは台本のAIに書かせず、コピペ用の文と入力例を別にAIへ送って返ってきたものを使う(作り話の結果を出さないため)。
// wf4_accounts.json で "format": "chat-prompt" のアカウントを wf4-ai-rakukatsu.yml が呼ぶ。
// generate-reel.js / generate-list-reel.js は末尾で main() を実行するため require できない。共通処理はここに写している。
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, spawn } = require('child_process');

const DRYRUN = Boolean(process.env.WF4_DRYRUN);
const FPS = 30;

const REMOTION_DIR = path.join(__dirname, '..', 'remotion');
const DATA_DIR = path.join(__dirname, '..', 'data');
const TOPICS_DIR = path.join(DATA_DIR, 'wf4_chat_topics');
const LAST_RUN_PATH = path.join(DATA_DIR, 'wf4_last_run.json');

// 毎回同じ話にならないよう、テーマの種をコード側で1つ選んで渡す。仕事と暮らしを交互に出す
const TOPIC_SEEDS = {
  仕事: [
    '断りのメール返信', '角が立たない催促', 'お詫びのメール', '長い資料を3行にまとめる', '会議メモから議事録',
    '言いにくいことをやわらかく言い換える', 'やることリストに分ける', '企画の弱いところを指摘してもらう', '面倒な問い合わせへの返信',
    'お礼のメッセージ', '自己紹介文を整える', 'SNSの投稿文を考える', '目上の人へのLINE', '退職・異動のあいさつ文',
    '報告を上司向けに短くまとめる', '箇条書きを読みやすい文章にする', 'プレゼンの話す順番を決める', 'アンケート結果のまとめ',
  ],
  暮らし: [
    '冷蔵庫の余りもので献立', '1週間の献立と買い物リスト', '旅行の計画表', '家計の固定費の見直し', '子どもの宿題の教え方',
    '片付けの手順を決める', '引っ越しのやることリスト', 'プレゼント選び', '学校や町内会への連絡文', '体調に合わせた作り置き',
    '家族旅行の持ち物リスト', '朝のルーティンを作る', '家事の分担表', '長い説明書をわかりやすく',
    '保険や契約書の要点をつかむ', '子どもへの声かけを言い換える', 'ママ友・近所へのお断りLINE',
  ],
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

// generate-list-reel.js と同じ: Groq(gpt-oss-120b) → 429は待って再試行 → だめならOpenAI。json=falseなら普通の文章で返す
async function callLLM(messages, maxTokens, json = true) {
  const fmt = json ? { response_format: { type: 'json_object' } } : {};
  const body = JSON.stringify({ model: 'openai/gpt-oss-120b', messages, max_tokens: maxTokens, ...fmt });
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
  if (!openaiKey) throw new Error('Groqで生成できず、OPENAI_API_KEYも未設定のため中止します');
  console.error('GroqからOpenAI(gpt-4o-mini)にフォールバックします');
  const res2 = await req(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } },
    JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, ...fmt })
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

// 2026-10-30にユーザーに見せた1本目の台本を、悩みの奥(本当の原因)まで掘ってから答える約1分のPREPに直したもの。AIへの「良い例」として渡す
const GOOD_EXAMPLE = {
  topLine: '返信メールに悩む時間、ゼロへ',
  topMain: '【AIに丸投げ】でOK',
  hook: { beforeLabel: '自分で書く', before: '15分', afterLabel: 'AIに頼む', after: '30秒', question: '断りのメール、\n何回も\n書き直してない？' },
  worries: ['失礼にならないかな…', '嫌われたくない', 'もう15分たってる'],
  root: '「断る＝相手を\n否定すること」と\n感じているから',
  reason: '断りながら\n感謝を伝える型を\nAIは知っているから',
  tip: '長いと思ったら\n「半分にして」と\n送るだけ',
  prompt: '次のメールに、[[丁寧だけど短め]]の返信を書いて。今回は[[お断り]]したいけど、関係は悪くしたくない。最初にお礼を入れて、150字以内で。\n【ここにメールを貼る】',
  sampleInput: '件名：来月のセミナー登壇のお願い\n〇〇様\nいつもお世話になっております。来月15日のセミナーで、30分ほどお話しいただけないでしょうか。ご検討よろしくお願いいたします。',
  lines: [
    { scene: 'pain', text: '断りのメール、【何回も】書き直してない？' },
    { scene: 'pain', text: '「失礼かな」「嫌われるかな」って手が止まる' },
    { scene: 'pain', text: '気づけば【15分】、まだ1行も書けてない' },
    { scene: 'root', text: 'でも本当の原因は、文章力じゃないんです' },
    { scene: 'root', text: '【断る＝相手を否定する】と感じてるから' },
    { scene: 'point', text: 'だから言葉選びは、【AIに任せて30秒】' },
    { scene: 'reason', text: 'AIは、断りながら【感謝を伝える型】を知ってる' },
    { scene: 'reason', text: 'あなたは「断る」と決めるだけでいいんです' },
    { scene: 'prompt', text: 'この文を【そのままコピペ】して' },
    { scene: 'prompt', text: '色の付いた所は、自分に合わせて書き換えてね' },
    { scene: 'prompt', text: '最後に、もらったメールを貼って送るだけ' },
    { scene: 'result', text: 'ほら、【お礼から始まる】返信が完成' },
    { scene: 'result', text: '断ってるのに、相手を大事にしてる文ですよね' },
    { scene: 'tip', text: '長いと思ったら、【「半分にして」】と送るだけ' },
    { scene: 'tip', text: '最後に自分の言葉を一言足すと、もっと自然に' },
    { scene: 'save', text: '断るたびに悩む日は、もう終わり。【保存】してね' },
  ],
  comment: '一番返信に困るメールは？',
  cover: { topic: '断りのメール', pain: '断りのメール、書けない…', hook: '原因は文章力じゃない' },
};

function buildPrompt(pastTopics, category, seed) {
  return `インスタのリール用に「AIにこう打てば、この作業が一瞬で終わる」を見せる、約1分の台本を1本作ってください。
今回のジャンル: ${category} / テーマの種: 「${seed}」(種はヒント。もっと具体的な場面にしてよい)

【見る人】30〜50代の働く人・家事をしている人。ChatGPTは入れたけど「何て打てばいいか分からない」で止まっている初心者。

【流れ】いきなり答えを出さない。悩みを言い当て、その奥にある本当の原因まで掘ってから、PREPで答える。表面的な「AIなら速い」で終わらせず、見る人が「そういうことだったのか」と気づく深さにする。
1. 悩み(pain・3行): 1行目=その場面を見る人の頭の中の言葉で言い当てる(ラベリング)。2行目=そのとき心の中で言っている本音。3行目=失っている時間や気力(損失回避)。責めない。「あるある」と思わせる
2. 本当の原因(root・2行): 1行目=「でも本当の原因は〇〇じゃない」と、思い込んでいる原因を外す。2行目=本当の原因(気持ちや思い込み、やり方の順番など、心の動きにふれる)。見る人の自己否定をほどく
3. 結論(point・1行): 原因を受けて「だから〇〇はAIに任せて〇〇」と言い切る。かかる時間の比較で見せる(コントラスト)
4. 理由(reason・2行): 1行目=なぜAIだとその原因ごと解決するのか(「〜だから」が伝わる言い方)。2行目=あなたがやることはこれだけ、と負担を小さく見せる
5. 具体例(prompt・3行 → result・2行): コピペ用の文の使い方(コピペ/[[ ]]の書き換え/貼る所)を説明し、実際にAIに送った答えを見せる。result2行目は、答えのどこが良いかを一言で
6. もう一歩のコツ(tip・2行): 答えをさらに良くする一言(「〇〇と送るだけ」など、すぐ試せるもの)と、自分らしくする小さなコツ
7. 結論をもう一度(save・1行): 悩みが消えた未来を言い、保存をすすめる

【形式】
- topLine: 上の帯の1行目。悩みが消える一言(18字以内)
- topMain: 上の帯の大きい文字(10字以内)。一番言いたい部分を【】で囲む
- hook: 時間の比較と、冒頭の問いかけ
  - beforeLabel / afterLabel: 「自分で書く」「AIに頼む」など(6字以内)
  - before / after: 「15分」「30秒」など、かかる時間の比較(4字以内。大げさにしすぎない)
  - question: 1秒目に大きく出す、悩みを言い当てる問いかけ。\nで3行以内(1行10字以内)
- worries: 悩んでいる時の心の声を3つ(各12字以内)。不安→本音→失っている時間の順
- root: 「本当の原因は…」のカードに出す文。\nで3行以内(1行10字以内)。「〜から」で終える
- reason: 「AIだと解決する理由」のカードに出す文。\nで3行以内(1行10字以内)。「〜から」で終える
- tip: 「＋1のコツ」のカードに出す文。\nで3行以内(1行10字以内)
- prompt: コピペ用の文。見る人がそのままAIに貼る文(130字以内)。
  - 自分の状況に合わせて書き換える所を[[ ]]で囲む(1〜3か所)
  - 本当の原因に効く一言(「最初にお礼を入れて」など)を入れる
  - 動画で答えを見せるため、文の中に「150字以内で」「3つまで」など答えの長さの指定を必ず入れる
  - 最後の行に、見る人が自分のもの(メール・メモ・食材など)を貼る場所を【ここに〇〇を貼る】と書く
- sampleInput: 【ここに〇〇を貼る】に入れる、それらしい入力例(実在の人名・会社名は使わない。150字以内)
- lines: ナレーション兼字幕。ちょうど16行。sceneは順に pain, pain, pain, root, root, point, reason, reason, prompt, prompt, prompt, result, result, tip, tip, save
  - 1行24字以内。話し言葉で、やさしく。強調したい部分を1か所だけ【】で囲む(無い行があってもよい)
- comment: 最後に出すコメントの問いかけ(16字以内)
- cover: 表紙の文字。表紙は「悩みの一言 → 本当の原因は… → (答え)」で、続きが気になるように作る
  - topic: 何の話か(8字以内。「断りのメール」)
  - pain: 悩みの一言(14字以内。「〜できない…」「〜決まらない…」など)
  - hook: 本当の原因を短く。「原因は〇〇」の形(12字以内。答えは言い切るが、どうすればいいかは動画を見ないと分からないように。「情報整理不足」のような漢字の固まりにせず、「原因は“決める順番”だった」のように話し言葉で)
- caption: 投稿文の本文。同じ流れで書く: 悩みを言い当てる一言 → 本音に寄りそう一言 → 「でも本当の原因は〜」 → 「だからAIに任せれば〇〇で終わります」と理由 → 「■ 使い方」として1〜3の手順 → 「■ もう一歩のコツ」を2つ。400〜600字。コピペ用の文とハッシュタグは書かない(あとで自動で付け足す)
- hashtags: 5つ(#ChatGPT #AI活用 を含む)

【良い例(この深さと流れを目指す。言い回しや締めの一言は真似しない)】
${JSON.stringify(GOOD_EXAMPLE)}

【ルール】
- 多くの人が週に1回はぶつかる、よくある困りごとにする(「2つの〇〇を比べる」のような、人によっては起きない場面は避ける)
- beforeLabel は今回の作業に合った言葉にする(書く作業でなければ「自分で考える」「自分で調べる」など)
- 同じことを別の言葉で言い直す行を作らない。1行ごとに話が1歩進むこと
- 1つの文を2行に分けない。どの行もそれだけで意味が通る言い切りにする(10字以上)
- 字幕の行に[[ ]]や【ここに〇〇を貼る】をそのまま書かない(「色の付いた所」「下の枠」などと言う)
- reasonとtipは、コピペ用の文で本当に起きることだけ言う(文に無い「AIが質問してくれる」などは言わない)
- 本当の原因は、そのテーマならではのものにする(どのテーマにも当てはまる「時間がない」「慣れていない」は使わない)
- 本当にAIに打てば今日から使えるものだけ。特定の有料サービスや最新機能に頼らない
- 「絶対」「誰でも稼げる」のような言い過ぎ、不安をあおりすぎる言い方はしない
- 下の「最近使ったテーマ」とかぶらないこと

【最近使ったテーマ(かぶらないこと)】
${pastTopics.length ? pastTopics.map((t) => '- ' + t).join('\n') : '- (なし)'}

JSONだけを返す: {"topLine":"..","topMain":"..","hook":{"beforeLabel":"..","before":"..","afterLabel":"..","after":"..","question":".."},"worries":[".."],"root":"..","reason":"..","tip":"..","prompt":"..","sampleInput":"..","lines":[{"scene":"pain","text":".."}],"comment":"..","cover":{"topic":"..","pain":"..","hook":".."},"caption":"..","hashtags":["#.."]}`;
}

const SCENES = ['pain', 'pain', 'pain', 'root', 'root', 'point', 'reason', 'reason', 'prompt', 'prompt', 'prompt', 'result', 'result', 'tip', 'tip', 'save'];
const len = (s) => [...String(s || '')].length;

function validate(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['JSONではない'];
  for (const k of ['topLine', 'topMain', 'prompt', 'sampleInput', 'comment', 'caption']) {
    d[k] = String(d[k] || '').trim();
    if (!d[k]) errs.push(`${k}がない`);
  }
  if (!/【[^】]+】/.test(d.topMain)) d.topMain = `【${d.topMain}】`;
  if (len(d.topMain.replace(/[【】]/g, '')) > 11) errs.push('topMainが長い');
  // 【】は「ここに〇〇を貼る」だけに使う。それ以外の【150字以内で】などは括弧を外す
  d.prompt = d.prompt.replace(/【(?!ここに)([^】]*)】/g, '$1');
  if (len(d.prompt) > 160) errs.push('promptが長い');
  if (/病院|診察|薬|症状|医師/.test(d.prompt + d.sampleInput)) errs.push('医療の話になっている');
  const h = d.hook || {};
  d.hook = {
    beforeLabel: String(h.beforeLabel || '自分でやる').trim(),
    before: String(h.before || '').trim(),
    afterLabel: String(h.afterLabel || 'AIに頼む').trim(),
    after: String(h.after || '').trim(),
    question: String(h.question || '').replace(/\\n/g, '\n').trim(),
  };
  if (!d.hook.before || !d.hook.after || !d.hook.question) errs.push('hookが欠けている');
  d.worries = (Array.isArray(d.worries) ? d.worries : []).map((w) => String(w).trim()).filter(Boolean).slice(0, 3);
  if (d.worries.length < 2 || d.worries.some((w) => len(w) > 14)) errs.push('worriesが2〜3個で短くない');
  for (const k of ['root', 'reason', 'tip']) {
    d[k] = String(d[k] || '').replace(/\\n/g, '\n').trim();
    if (!d[k] || len(d[k].replace(/\n/g, '')) > 34) errs.push(`${k}がないか長い`);
  }
  d.lines = (Array.isArray(d.lines) ? d.lines : []).slice(0, SCENES.length).map((l, i) => ({ scene: SCENES[i], text: String(l.text || '').replace(/\\n|\n/g, '').trim() }));
  if (d.lines.length !== SCENES.length || d.lines.some((l) => !l.text)) errs.push(`linesが${SCENES.length}行でない`);
  if (d.lines.some((l) => len(l.text.replace(/[【】]/g, '')) > 28)) errs.push('字幕の行が長い');
  if (d.lines.some((l) => len(l.text.replace(/[【】]/g, '')) < 10)) errs.push('字幕に短すぎる行(文を2行に分けている)がある');
  if (d.lines.some((l) => /\[\[|\]\]|ここに/.test(l.text))) errs.push('字幕に[[ ]]や「ここに〜」が入っている');
  const cv = d.cover || {};
  d.cover = { topic: String(cv.topic || '').trim(), pain: String(cv.pain || '').trim(), hook: String(cv.hook || '').trim() };
  if (!d.cover.topic || !d.cover.pain || !d.cover.hook) errs.push('coverが欠けている');
  if (len(d.cover.topic) > 10 || len(d.cover.pain) > 16 || len(d.cover.hook) > 14) errs.push('coverの文字が長い');
  d.hashtags = (Array.isArray(d.hashtags) ? d.hashtags : []).map((t) => '#' + String(t).replace(/^#+/, '').trim()).filter((t) => t.length > 1).slice(0, 5);
  return errs;
}

async function generateScript(systemPrompt, pastTopics) {
  const category = new Date().getDate() % 2 ? '仕事' : '暮らし';
  const seeds = TOPIC_SEEDS[category].filter((s) => !pastTopics.includes(s));
  const seed = (seeds.length ? seeds : TOPIC_SEEDS[category])[Math.floor(Math.random() * (seeds.length || TOPIC_SEEDS[category].length))];
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: buildPrompt(pastTopics, category, seed) },
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
    lastErrs = validate(d);
    d.seed = seed;
    if (!lastErrs.length) return d;
    console.error(`台本が不正(${attempt}/3): ${lastErrs.join(' / ')}`);
  }
  throw new Error('台本を生成できませんでした: ' + lastErrs.join(' / '));
}

// コピペ用の文に入力例を入れて、実際にAIへ送る。返ってきた答えをそのまま動画に出す
const fillPrompt = (prompt, input) => prompt.replace(/\[\[|\]\]/g, '').replace(/【ここに[^】]*】/, input);

// 見る人の多くが使うのはChatGPTなので、答えはOpenAIで取る(無ければGroq)
async function askLikeViewer(content) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (key) {
    const res = await req(
      'https://api.openai.com/v1/chat/completions',
      { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } },
      JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], max_tokens: 800 })
    );
    const text = res.json?.choices?.[0]?.message?.content;
    if (text) return text;
    console.error('OpenAIで答えを取れずGroqに切り替え: ' + JSON.stringify(res.json || {}).slice(0, 200));
  }
  return callLLM([{ role: 'user', content }], 1500, false);
}

async function runPrompt(script) {
  const answer = (await askLikeViewer(fillPrompt(script.prompt, script.sampleInput)))
    .replace(/\*\*/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
  // 吹き出しに収まる長さで切る。切った時は…を付ける
  const MAX = 170;
  return len(answer) > MAX ? [...answer].slice(0, MAX - 1).join('') + '…' : answer;
}

// ---- VOICEVOX(generate-reel.js から写した) ----
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
    try {
      fs.chmodSync(exe, 0o755);
    } catch (e) {}
  }
  console.log('VOICEVOXエンジンを起動中...', exe);
  const child = spawn(exe, [], { detached: true, stdio: 'inherit', cwd: path.dirname(exe) });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await sleep(3000);
    if (await voicevoxAlive()) return;
  }
  throw new Error('VOICEVOXエンジンが3分以内に起動しませんでした');
}

async function resolveSpeaker(name, styleName) {
  const speakers = await (await fetch(`${VOICEVOX_ENGINE}/speakers`)).json();
  const sp = speakers.find((s) => s.name === name) || speakers[0];
  const style = sp.styles.find((st) => st.name === styleName) || sp.styles[0];
  console.log(`話者: ${sp.name}(${style.name}) id=${style.id}`);
  return style.id;
}

function audioSeconds(p) {
  return parseFloat(execFileSync('ffprobe', ['-i', p, '-show_entries', 'format=duration', '-v', 'quiet', '-of', 'csv=p=0']).toString().trim());
}

// 1行ずつ声を作り、行の長さ(秒)を決める。読み方を直したい語は persona.readings で置き換える
async function makeVoices(lines, outDir, persona) {
  await ensureVoicevoxEngine();
  const speaker = await resolveSpeaker(persona.voicevoxName || '春日部つむぎ', persona.voicevoxStyle || 'ノーマル');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let text = lines[i].text.replace(/[【】]/g, '');
    for (const [from, to] of Object.entries(persona.readings || {})) text = text.split(from).join(to);
    const q = await fetch(`${VOICEVOX_ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(text)}`, { method: 'POST' });
    if (!q.ok) throw new Error(`audio_query失敗 ${q.status}`);
    const query = await q.json();
    query.speedScale = persona.voiceSpeed || 1.15;
    query.prePhonemeLength = 0.05;
    query.postPhonemeLength = 0.15;
    const s = await fetch(`${VOICEVOX_ENGINE}/synthesis?speaker=${speaker}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query),
    });
    if (!s.ok) throw new Error(`synthesis失敗 ${s.status}`);
    const file = `voice${i + 1}.wav`;
    fs.writeFileSync(path.join(outDir, file), Buffer.from(await s.arrayBuffer()));
    // 画面の動き(打ち込み・吹き出し)が見えるよう、場面ごとに最低の長さを持たせる
    const min = { pain: 2.4, root: 2.4, point: 2.6, reason: 2.4, prompt: 2.4, result: 2.8, tip: 2.4, save: 3.4 }[lines[i].scene];
    const pad = lines[i].scene === 'save' ? 1.2 : 0.25;
    out.push({ ...lines[i], audio: file, seconds: Math.max(min, Math.round((audioSeconds(path.join(outDir, file)) + pad) * FPS) / FPS) });
  }
  return out;
}

function render(props, outDir) {
  fs.mkdirSync(path.join(outDir, 'fonts'), { recursive: true });
  for (const f of fs.readdirSync(path.join(REMOTION_DIR, 'assets', 'fonts_rounded'))) {
    if (f.endsWith('.ttf')) fs.copyFileSync(path.join(REMOTION_DIR, 'assets', 'fonts_rounded', f), path.join(outDir, 'fonts', f));
  }
  const propsPath = path.join(outDir, 'chat_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync('npx', ['remotion', 'render', 'src/index.ts', 'ChatReel', `"${videoPath}"`, `--props="${propsPath}"`, `--public-dir="${outDir}"`, '--crf=20'], {
    cwd: REMOTION_DIR,
    timeout: 900000,
    shell: true,
    stdio: 'inherit',
  });
  return videoPath;
}

// 表紙(ChatCover)を1枚の画像にする。fontsは render() で public-dir に写したものを使う
function renderCover(props, outDir) {
  const propsPath = path.join(outDir, 'cover_props.json');
  fs.writeFileSync(propsPath, JSON.stringify(props), 'utf-8');
  const coverPath = path.join(outDir, 'cover.jpg');
  execFileSync('npx', ['remotion', 'still', 'src/index.ts', 'ChatCover', `"${coverPath}"`, `--props="${propsPath}"`, `--public-dir="${outDir}"`, '--image-format=jpeg', '--jpeg-quality=92'], {
    cwd: REMOTION_DIR,
    timeout: 300000,
    shell: true,
    stdio: 'inherit',
  });
  return coverPath;
}

// generate-list-reel.js と同じ: 一時アップロード先を順に試し、直リンクとして使えるものを採用
function isDirectUrl(url, kind) {
  try {
    const out = execFileSync('curl', ['-s', '-I', '-L', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url], { timeout: 30000 }).toString().trim();
    const [code, type] = out.split(' ');
    return code === '200' && (type || '').startsWith(`${kind}/`);
  } catch (e) {
    return false;
  }
}

function uploadPublic(videoPath, kind = 'video') {
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
      if (url.startsWith('https://') && isDirectUrl(url, kind)) {
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

async function postReel(account, igUserId, videoPath, caption, coverPath) {
  const igToken = (process.env[`IG_TOKEN_${account.toUpperCase()}`] || '').trim();
  const publicUrl = uploadPublic(videoPath);
  // 表紙の画像が上げられなければ、動画の途中のコマを表紙にする
  let coverArgs = ['-d', 'thumb_offset=2500'];
  if (coverPath) {
    try {
      coverArgs = ['-d', `cover_url=${encodeURIComponent(uploadPublic(coverPath, 'image'))}`];
    } catch (e) {
      console.log('表紙の画像を上げられず、動画のコマを表紙にします:', e.message);
    }
  }
  const curlJson = (args) => JSON.parse(execFileSync('curl', ['-s', ...args]).toString());
  const container = curlJson([
    '-X', 'POST', `https://graph.facebook.com/v23.0/${igUserId}/media`,
    '-d', 'media_type=REELS',
    '-d', `video_url=${encodeURIComponent(publicUrl)}`,
    '-d', `caption=${encodeURIComponent(caption)}`,
    ...coverArgs,
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

function buildCaption(script, persona) {
  return [
    script.caption.trim(),
    '',
    '▼ コピペ用（〔 〕の所を自分用に書き換えてね）',
    script.prompt.replace(/\[\[/g, '〔').replace(/\]\]/g, '〕'),
    '',
    `${script.comment.replace(/[？?]$/, '')}？コメントで教えてください。`,
    '保存して、あとで使ってね。',
    (persona.ctaLine || '').trim(),
    '',
    script.hashtags.join(' '),
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}

async function main() {
  const account = process.argv[2];
  if (!account) throw new Error('usage: node generate-chat-reel.js <account>');
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona || !persona.igUserId) throw new Error(`unknown account: ${account}`);
  const intervalDays = persona.intervalDays || 1;
  const lastRun = readJson(LAST_RUN_PATH, {});
  if (!process.env.WF4_FORCE && lastRun[account] && (Date.now() - new Date(lastRun[account]).getTime()) / 86400000 < intervalDays - 0.5) {
    console.log(`[${account}] skip: 前回実行から${intervalDays}日経過していません`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve(process.env.WF4_OUT_DIR || (DRYRUN ? 'wf4_preview' : 'wf4_media'), account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const historyPath = path.join(TOPICS_DIR, `${account}.json`);
  const history = readJson(historyPath, []);

  // WF4_RAW_FILE: 台本と答えを手で用意して試すとき用({...台本, result})
  let script;
  if (process.env.WF4_RAW_FILE) {
    script = JSON.parse(fs.readFileSync(process.env.WF4_RAW_FILE, 'utf-8'));
    const errs = validate(script);
    if (errs.length) throw new Error('WF4_RAW_FILEの台本が不正: ' + errs.join(' / '));
  } else {
    script = await generateScript(persona.system, history.slice(-40).map((h) => h.seed));
    script.result = await runPrompt(script);
  }
  console.log(`[${account}] seed: ${script.seed} | ${script.topLine} | ${script.hook.before}→${script.hook.after}`);
  fs.writeFileSync(path.join(outDir, 'script.json'), JSON.stringify(script, null, 2), 'utf-8');

  const lines = await makeVoices(script.lines, outDir, persona);
  for (const f of ['bgm.mp3', 'pop.mp3', 'save.mp3']) {
    const src = { 'bgm.mp3': persona.bgm || 'bgm_list/あたたか/coffee-shop-568148.mp3', 'pop.mp3': 'se/decide1_button.mp3', 'save.mp3': 'se/kira_sparkle.mp3' }[f];
    fs.copyFileSync(path.join(REMOTION_DIR, 'assets', src), path.join(outDir, f));
  }
  const props = {
    chip: persona.chip || 'コピペOK｜AIラク活',
    topLine: script.topLine,
    topMain: script.topMain,
    hook: script.hook,
    worries: script.worries,
    root: script.root,
    reason: script.reason,
    tip: script.tip,
    prompt: script.prompt,
    result: script.result,
    saveLabel: '保存してあとで使う',
    comment: script.comment,
    handle: persona.handle || '',
    lines,
    bgm: 'bgm.mp3',
    se: { pop: 'pop.mp3', save: 'save.mp3' },
  };
  const videoPath = render(props, outDir);
  let coverPath = null;
  try {
    coverPath = renderCover(
      {
        variant: persona.coverVariant || 'C',
        chip: props.chip,
        ...script.cover,
        question: script.hook.question,
        before: script.hook.before,
        after: script.hook.after,
        handle: props.handle,
      },
      outDir
    );
  } catch (e) {
    console.log('表紙を作れませんでした:', e.message);
  }
  const caption = buildCaption(script, persona);
  fs.writeFileSync(path.join(outDir, 'caption.txt'), caption, 'utf-8');
  console.log(`[${account}] video rendered: ${videoPath}`);

  if (DRYRUN) {
    console.log(`[${account}] DRYRUN: 投稿せず終了`);
    return;
  }

  const result = await postReel(account, persona.igUserId, videoPath, caption, coverPath);
  console.log(`[${account}] posted:`, result.id);

  lastRun[account] = new Date().toISOString();
  fs.writeFileSync(LAST_RUN_PATH, JSON.stringify(lastRun, null, 2), 'utf-8');
  history.push({ date: today, seed: script.seed, topLine: script.topLine, media: result.id });
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify(history.slice(-200), null, 2), 'utf-8');

  execFileSync('git', ['config', 'user.name', 'wf4-bot']);
  execFileSync('git', ['config', 'user.email', 'wf4-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'data/wf4_last_run.json', 'data/wf4_chat_topics']);
  try {
    execFileSync('git', ['commit', '-m', `chore: WF4 ${account} chat-reel ${today}`]);
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
