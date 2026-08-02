// 対談形式(質問役↔先生)のYouTube解説台本をAIで生成する。
// 既存の一人語りジェネレータ(generate_script.js)のGroq呼び出し・リッチ図解スキーマ・掃除処理を再利用。
// 図解(stairs/process/databadge)はそのまま使い、beatsを「Q&Aの掛け合い」にしてspeaker(q/s)を付けるのが違い。
const fs = require('fs');
const path = require('path');
const G = require('./generate_script');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'daily_config.json');
const OUT_DIR = path.join(__dirname, 'generated');

// beatに話者を交互に振る(0番=質問役q, 1番=先生s, 2番=q, ...)。掛け合いのリズムを確定させる
function stampAlt(beats) {
  (beats || []).forEach((b, i) => { b.speaker = i % 2 === 0 ? 'q' : 's'; });
}
function stampAll(beats, sp) {
  (beats || []).forEach((b) => { b.speaker = sp; });
}

// フェーズ1: 全体設計(タイトル・サムネ・3章・冒頭の質問・締め)
async function genOutline(cfg, topic) {
  const lineLine = cfg.lineUrl
    ? `4個目で「くわしくは概要欄のLINEから、${cfg.lineHook || '無料の配信'}を受け取れます」と先生が押し売り感なく伝える。`
    : '';
  const ctaCount = cfg.lineUrl ? 4 : 3;
  const system = `あなたはYouTubeの「対談解説」動画(3〜5分)の構成作家です。出力は厳密なJSONのみ。
登場人物は2人: 「質問役(視聴者代表の女性・素朴に質問する聞き手)」と「先生(${cfg.senseiName || '専門家'})」。
テーマは、お金・制度・年金など「知らないと損する暮らしの情報」。断定や煽りはせず、やさしく正確に。

次の構造で設計図を作る:
{
  "youtubeTitle": "興味を引くタイトル(28〜42文字、【】使用可、煽り禁止)",
  "description": "概要欄用の説明文(100〜200文字)",
  "thumbnailKicker": "サムネ左上の小タグ(4〜8文字)",
  "thumbnailText": "サムネのメインコピー(改行\\nで2〜3行、合計12〜20文字、一番刺さる語を1箇所**強調**)",
  "titleHook": "冒頭カードの大きな一文(改行\\n可、一番大事な語を**強調**、12〜22文字)",
  "openingQuestion": "質問役が冒頭で先生に投げかける自然な質問・相談(40〜70文字。テーマを自分ごとの悩みとして)",
  "chapters": [3個ちょうど、各{"title":"章タイトル(12字以内)","summary":"この章で説明する要点(50字程度・具体例のメモ)","keyPoint":"まとめ用の要点(12字以内)","keySub":"先生がまとめで振り返る読み上げ文(40〜60字)"}],
  "ctaBeats": [${ctaCount}個、各{"sub":"先生の締めの読み上げ文(30〜70字)"}]
}
ctaBeatsは全部「先生」のセリフ: 1個目で今日の話を一言で振り返る。${cfg.lpUrl ? '2個目で「くわしくは概要欄のリンクから読めます」と自然に添える。' : ''}${lineLine}最後の1個で「今日も、いい一日にしていきましょう」的な締め。

共通ルール:
- 数字はすべてひらがな表記(例: 65歳→ろくじゅうごさい)。ただし後の図解グラフの数値だけは算用数字可
- 英数字・他言語の文字は本文に使わない
- 3つの章は重複せず、順に聞くと理解が深まる流れにする`;
  const user = `先生の人物像: ${cfg.persona}
今日のテーマ: ${topic}`;
  return G.callGroq(system, user, 2200, 0.8);
}

// フェーズ2: 章ごとのリッチ図解を「Q&Aの掛け合い」として作る
async function genChapter(cfg, topic, outline, i, target, recap) {
  const ch = outline.chapters[i];
  const system = `あなたはYouTube対談解説の台本作家です。出力は厳密なJSONのみ: {"scene": <1個のsceneオブジェクト>}
2人の会話です:「質問役(素朴に聞く女性)」と「先生(${cfg.senseiName || '専門家'})」。

作るのは layout="${target}" のリッチ図解シーンを1個。これは${G.RICH_DESC[target]}。
図の中身(scene直下の専用フィールド)はこの型のとおり必ず全部埋める(型は絶対に変えない):
${G.RICH_SCHEMA[target]}

図の埋め方の見本(構造・キー・個数はこの通り。中身だけ章の内容に差し替える):
${G.RICH_EXAMPLES[target]}

ただしbeatsだけは「掛け合いの会話」にする。beatsは4個ちょうど、順に:
  1個目=質問役の素朴な疑問や驚き(先生に聞く)。sub=そのセリフ(30〜55字)
  2個目=先生が答え始め、図を見せながら説明。sub=先生のセリフ(40〜70字)
  3個目=質問役の相づち・もう一歩の質問。sub=そのセリフ(25〜50字)
  4個目=先生のまとめ。sub=先生のセリフ(40〜70字)
各beatに text(短いラベル4〜8字)と icon(アイコン名)も必ず入れる。

共通ルール:
- 数字は基本ひらがな。databadgeのchartのv(数値)だけ算用数字でよい
- 数値は「ある方の例」か制度上の一般的な範囲にとどめ、断定・誇張しない
- 英数字・他言語の文字は本文に使わない(iconのアイコン名を除く)`;
  const user = `先生の人物像: ${cfg.persona}
動画テーマ: ${topic}
【すでに話した内容(繰り返し禁止)】
${recap || '(まだ無し)'}

第${i + 1}章「${ch.title}」(${ch.summary})を、layout="${target}"の図解＋4往復の会話にしてください。`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await G.callGroq(system, user, 1900, 0.6);
      const sc = res.scene || (res.type ? res : null);
      if (sc && typeof sc === 'object') {
        sc.type = 'points';
        sc.layout = target;
        G.ensureRichBeats(sc, target);
        G.sanitizeRich(sc);
        if (G.isValidRich(sc)) { stampAlt(sc.beats); return sc; }
      }
    } catch (e) {
      console.log(`対談図解(${target})生成失敗 試行${attempt}: ${e.message}`);
    }
  }
  // 保険: 確定テンプレ(データ捏造なし)に、質問役の相づちビートを足して会話にする
  console.log(`対談図解(${target})は保険テンプレを使用`);
  const fb = G.buildFallbackRich(target, ch);
  // fallbackのbeatsは先生の説明調。1個目を質問役の問いに差し替え、相づちを挟む
  fb.beats.unshift({ text: 'しつもん', icon: 'lightbulb', sub: `先生、${ch.title}って、実際どういうことなんですか？` });
  if (fb.beats.length >= 3) fb.beats.splice(2, 0, { text: 'なるほど', icon: 'check_circle', sub: 'なるほど、そういう仕組みなんですね。' });
  stampAlt(fb.beats);
  return fb;
}

async function generate(cfg, topic) {
  const outline = await genOutline(cfg, topic);
  if (!Array.isArray(outline.chapters) || outline.chapters.length < 3) {
    throw new Error('アウトライン生成に失敗(chaptersが3個未満)');
  }
  outline.chapters = outline.chapters.slice(0, 3);

  // 冒頭: 質問役が先生に相談を持ちかける
  const titleScene = {
    type: 'title',
    title: outline.thumbnailKicker || 'お金の話',
    beats: [{ kind: 'big', text: outline.titleHook || outline.youtubeTitle, sub: outline.openingQuestion || '先生、今日は気になっていることがあって…', speaker: 'q' }],
    pose: 'default',
  };

  // 章ごとに図解＋掛け合い(型はローテーションで毎章変える)
  const bodyScenes = [];
  let recap = '';
  for (let i = 0; i < outline.chapters.length; i++) {
    const target = G.RICH_ROTATION[i % G.RICH_ROTATION.length];
    const sc = await genChapter(cfg, topic, outline, i, target, recap.slice(0, 1400));
    bodyScenes.push(sc);
    recap += (sc.beats || []).map((b) => b.sub).join('') + '\n';
  }

  // まとめ: 3章の要点を先生が振り返る
  const summaryScene = {
    type: 'points',
    layout: 'flow3',
    title: 'きょうのまとめ',
    beats: outline.chapters.map((c) => ({ kind: 'bubble', text: c.keyPoint || c.title, icon: 'check_circle', sub: c.keySub || `${c.title}、ここが大事なところです。`, speaker: 's' })),
    pose: 'thumbs_up',
  };

  // 締め(CTA): 先生のセリフ
  const ctaBeats = (Array.isArray(outline.ctaBeats) && outline.ctaBeats.length ? outline.ctaBeats : [{ sub: '今日の話が、少しでも役に立ったらうれしいです。' }, { sub: '今日も、いい一日にしていきましょう。' }])
    .map((b) => ({ kind: 'big', text: b.text || '', sub: b.sub || '', speaker: 's' }));
  const ctaScene = { type: 'cta', beats: ctaBeats, pose: 'bowing' };

  const scenes = [titleScene, ...bodyScenes, summaryScene, ctaScene];
  return {
    youtubeTitle: outline.youtubeTitle,
    description: outline.description,
    thumbnailKicker: outline.thumbnailKicker,
    thumbnailText: outline.thumbnailText,
    scenes,
  };
}

async function main() {
  const [accountKey] = process.argv.slice(2);
  if (!accountKey) { console.error('使い方: node generate_taidan_script.js <アカウントキー>'); process.exit(1); }
  if (!process.env.GROQ_API_KEY) throw new Error('環境変数GROQ_API_KEYが未設定です');

  const accountsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const cfg = accountsConfig[accountKey];
  if (!cfg) throw new Error(`daily_config.jsonに${accountKey}の設定がありません`);

  const topic = G.nextTopic(accountKey);
  console.log(`[${accountKey}] お題: ${topic}`);

  const generated = await generate(cfg, topic);
  // 掃除(speakerは保持される)。randomizeLayoutsは対談では使わない(図解の型を固定したいため)
  generated.scenes = G.sanitizeScenes(generated.scenes);
  generated.youtubeTitle = G.stripForeignChars(generated.youtubeTitle);
  generated.description = G.stripForeignChars(generated.description);
  generated.thumbnailText = G.stripForeignChars(generated.thumbnailText || generated.youtubeTitle);
  generated.thumbnailKicker = G.stripForeignChars(generated.thumbnailKicker || '');

  if (cfg.lpUrl) {
    const ctaScene = [...generated.scenes].reverse().find((sc) => sc.type === 'cta');
    if (ctaScene) ctaScene.ctaUrl = cfg.lpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `taidan_${accountKey}_${today}`;
  const script = {
    id,
    taidan: true,
    youtubeTitle: generated.youtubeTitle,
    description: generated.description,
    thumbnailText: generated.thumbnailText,
    thumbnailKicker: generated.thumbnailKicker,
    mood: cfg.mood,
    account: accountKey,
    footer: cfg.footer,
    speaker: cfg.speaker,       // 先生役の声
    speaker2: cfg.speaker2,     // 質問役の声
    qLabel: cfg.qLabel || '質問',
    sLabel: cfg.sLabel || '先生',
    cta: cfg.cta,
    lineUrl: cfg.lineUrl,
    lineHook: cfg.lineHook,
    scenes: generated.scenes,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`対談台本 生成完了: ${outPath}`);
  console.log(`::set-output name=script_path::${outPath}`);
  return outPath;
}

if (require.main === module) {
  main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
}

module.exports = { main, generate, genOutline, genChapter };
