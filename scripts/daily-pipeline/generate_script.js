// Groqで台本JSON(build_video.js形式)を自動生成する
// トピックは各アカウントのお題リストから順番に消費し、使い切ったら最初に戻る
const fs = require('fs');
const path = require('path');

const GROQ_KEY = process.env.GROQ_API_KEY;
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOPICS_PATH = path.join(DATA_DIR, 'daily_topics.json');
const CONFIG_PATH = path.join(DATA_DIR, 'daily_config.json');
const STATE_PATH = path.join(DATA_DIR, 'daily_state.json');
const OUT_DIR = path.join(__dirname, 'generated');

const FACTS = `
【聖さんの実体験(必要な回だけ自然に使う。無理に毎回使わなくていい)】
・美容師歴25年以上。40歳のときコロナ禍(2020年)に独立。
・独立初月の売上26万円、毎月の返済60万円。1年後に月商100万円。
・アシスタント時代は夜7時半〜10時、11時まで練習。カット講師時代は帰宅が毎晩23時過ぎ。
・長男が小さい頃、子どもの顔をまともに見てやれなかった。子育ては妻に任せきり。
・友達とも家族とも休みが合わず、それが20年続いた。
・「シャンパンタワーの法則」に出会い、自分を満たさないと下に流れないと気づいた。
・「やり方より、あり方」という言葉が刺さった。
・独立後、停滞期に体が重く判断力が鈍った時期があったが、後で「力を蓄える時期」だったと分かった。
・算命学に出会い、自分の運勢を鑑定してもらって迷いが晴れた。以降300人以上を鑑定。
・実家は理容師で家にいないことが多く、鍵っ子で寂しかった。
`;

async function callGroq(system, user) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 9000,
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('Groq応答が空: ' + JSON.stringify(json).slice(0, 300));
  return JSON.parse(content);
}

function nextTopic(accountKey) {
  const topics = JSON.parse(fs.readFileSync(TOPICS_PATH, 'utf-8'));
  const list = topics[accountKey];
  if (!list || !list.length) throw new Error(`daily_topics.jsonに${accountKey}のお題がありません`);
  let state = {};
  if (fs.existsSync(STATE_PATH)) state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
  const idx = state[accountKey] || 0;
  const topic = list[idx % list.length];
  state[accountKey] = idx + 1;
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
  return topic;
}

function stripForeignChars(text) {
  if (!text) return text;
  return text
    .replace(/[a-zA-Z]+/g, '')
    .replace(/[가-힣]/g, '')
    .replace(/[Ѐ-ӿ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const CHIBI_POSES = ['default', 'arms_crossed', 'bowing', 'explaining', 'guts', 'pointing_left', 'thinking', 'thumbs_up'];
const BEAT_SE_KEYS = ['clink', 'reveal', 'reveal_multi', 'spark', 'sad', 'impact', 'decide', 'decide2', 'cash', 'punch', 'drum', 'clapper', 'clapper2', 'bell', 'bell2'];
function sanitizeScenes(scenes) {
  for (const sc of scenes) {
    if (sc.title) sc.title = stripForeignChars(sc.title);
    for (const b of sc.beats || []) {
      b.text = stripForeignChars(b.text);
      b.sub = stripForeignChars(b.sub);
      if (!BEAT_SE_KEYS.includes(b.se)) delete b.se;
    }
    sc.pose = CHIBI_POSES.includes(sc.pose) ? sc.pose : 'default';
  }
  const last = scenes[scenes.length - 1];
  if (last && last.type === 'cta') last.pose = 'bowing';
  return scenes;
}

// pointsシーンのlayoutをコード側で確実にランダム化する(AI任せだと偏る/連続するため)
// ビート数に合わないレイアウトは候補から除外し、直前と同じレイアウトは避ける
const ALL_LAYOUTS = ['stack', 'panels', 'row', 'compare', 'timeline', 'grid', 'pyramid', 'meter'];
function compatibleLayouts(beatCount) {
  return ALL_LAYOUTS.filter((l) => {
    if (l === 'compare') return beatCount === 2;
    if (l === 'grid') return beatCount >= 2 && beatCount <= 4;
    if (l === 'timeline' || l === 'pyramid' || l === 'meter') return beatCount >= 2 && beatCount <= 4;
    return true;
  });
}
function randomizeLayouts(scenes) {
  let prevLayout = null;
  for (const sc of scenes) {
    if (sc.type !== 'points') continue;
    const candidates = compatibleLayouts((sc.beats || []).length).filter((l) => l !== prevLayout);
    const pool = candidates.length ? candidates : compatibleLayouts((sc.beats || []).length);
    sc.layout = pool[Math.floor(Math.random() * pool.length)];
    if (sc.layout === 'compare' || sc.layout === 'row') sc.separator = sc.layout === 'compare' ? '≠' : '→';
    else delete sc.separator;
    prevLayout = sc.layout;
  }
  return scenes;
}

// シーン型・pose・seの共通定義(アウトライン生成と章生成の両方で使う)
const SCENE_TYPES_DOC = `各sceneは次のいずれかの型:
- {"type":"points","title":"シーン見出し(12字以内)","layout":"stack"|"panels"|"row"|"compare"|"timeline"|"grid"|"pyramid"|"meter","beats":[3個、各{"kind":"bubble"|"box"|"check"|"cross","text":"短いフレーズ\\n改行可(**強調**可、10〜16文字程度)","sub":"読み上げ文(40〜70文字)"}],"pose":"..."}
   - layout="compare"のときはbeatsは2個ちょうど
   - layout="timeline"は時系列・ステップの流れ(例: 過去→現在→未来)。beatsは3〜4個
   - layout="grid"はまとめ・要点の一気見せ。beatsは4個(2×2)が基本
   - layout="pyramid"は「まず土台、その上に○○」の積み上げ構造。beats[0]が一番下。beatsは2〜4個
   - layout="meter"は段階が進むほど到達度が上がる話。beatsは2〜4個
   - kindは、compareなら両方box、それ以外はbubble中心、良い話ならcheck、NG例ならcross
- {"type":"stock","stockQuery":"Pexels検索用の英語キーワード(2〜4語)","beats":[2〜3個、{"kind":"big","text":"短い一文\\n改行可","sub":"読み上げ文(50〜90文字)"}],"pose":"..."}

poseフィールド(シーンの内容に合わせて1つ選ぶ):
"default"(基本)|"explaining"(説明)|"arms_crossed"(断言/対比)|"thinking"(問いかけ)|"guts"(励まし)|"thumbs_up"(ポジティブな結論)|"pointing_left"(注意)|"bowing"(挨拶/締め)

seフィールド(beat単位の効果音。要所の3〜5割だけに付ける):
"clink"|"reveal"|"reveal_multi"|"spark"(気づき)|"sad"(残念)|"impact"(衝撃)|"decide"|"decide2"|"cash"(お金)|"punch"(言い切り)|"drum"(和風)|"clapper"|"clapper2"|"bell"(穏やか)|"bell2"

共通ルール:
- 数字は必ず全部ひらがな表記(例: 26万円→にじゅうろくまんえん、40歳→よんじゅっさい)
- 英数字・アルファベット・他言語の文字は本文に使わない(stockQueryだけ英語)
- 誇張表現・断定しすぎる表現は禁止。癒しと気づきのトーンで
- 教科書のような一般論で終わらせず、具体的な場面・エピソード・手順まで踏み込む`;

// フェーズ1: 動画全体の設計図(タイトル・サムネ・3章立て・冒頭とCTA)を作る
async function generateOutline(cfg, topic) {
  const lpInstruction = cfg.lpUrl
    ? `\nctaSceneのbeatsは3個: 1個目で今日の話を一言で振り返り、2個目で「今日話しきれなかった部分は、概要欄のリンクから続きを読めます」という趣旨をテーマに絡めて自然に伝え、3個目で名乗り(${cfg.speakerLabel})と「今日も、いい一日にしていきましょう」的な締めの挨拶。`
    : `\nctaSceneのbeatsは3個構成で、最後のbeatに名乗り(${cfg.speakerLabel})と締めの挨拶を入れる。`;
  const system = `あなたはYouTube解説動画(5〜6分)の構成作家です。出力は厳密なJSONのみ。

次の構造で動画の設計図を作ってください:
{
  "youtubeTitle": "興味を引くタイトル(28〜40文字、【】使用可)",
  "description": "概要欄用の説明文(100〜200文字)",
  "thumbnailKicker": "サムネイル左上の小タグ(4〜8文字)",
  "thumbnailText": "サムネイルのメインコピー(改行\\nで2〜3行、合計12〜20文字、一番刺さる語だけ**強調**で1箇所囲む)",
  "titleScene": {"type":"title","kicker":"見出し英字ラベル","beats":[{"kind":"big","text":"印象的な一文(改行\\n可、**強調**可)","sub":"導入の読み上げ文(80〜130文字。テーマの悩みに共感し、この動画で何がわかるかを予告する)"}],"pose":"explaining"},
  "chapters": [3個ちょうど、各{"title":"章タイトル(12字以内)","summary":"この章で話す内容(50文字程度。主張+使う具体例のメモ)","hookSub":"冒頭フックでこの章を予告する読み上げ文(30〜50文字)","keyPoint":"まとめ画面用の要点(12字以内)","keySub":"まとめでこの要点を振り返る読み上げ文(40〜60文字)"}],
  "ctaScene": {"type":"cta","beats":[3個、{"kind":"big","text":"...","sub":"読み上げ文(40〜80文字)"}],"pose":"bowing"}
}

共通ルール:
- 数字は必ず全部ひらがな表記
- 英数字・他言語の文字は本文に使わない
- 誇張・煽り表現は禁止(thumbnailTextにも「悲報」「警告」「絶対に」等は使わない)
- 3つの章は重複せず、順に聞くと理解が深まる流れにする`;
  const user = `話者設定: ${cfg.persona}
今日のテーマ: ${topic}
${cfg.persona.includes('聖') || cfg.persona.includes('僕') ? FACTS : ''}${lpInstruction}`;
  return callGroq(system, user);
}

// フェーズ2: 1つの章を2〜3シーンに深掘りする
async function generateChapterScenes(cfg, topic, outline, chapterIdx, previousRecap) {
  const ch = outline.chapters[chapterIdx];
  const system = `あなたはYouTube解説動画の台本作家です。出力は厳密なJSONのみ: {"scenes":[2〜3個のscene]}

${SCENE_TYPES_DOC}

この章のルール:
- シーンは2〜3個。「主張→具体例やエピソード→今日からできる行動」の流れで深掘りする
- 1個はstock型(実写映像)を使ってもよい(使わなくてもよい)
- 前の章と同じエピソード・同じ言い回しを繰り返さない
- 語り口は、一人の人間が自分の言葉で友達に打ち明けるように。必要なら語り手自身の失敗談・本音を一人称で入れる`;
  const user = `話者設定: ${cfg.persona}
動画全体のテーマ: ${topic}
この動画の3章構成: ${outline.chapters.map((c, i) => `${i + 1}. ${c.title}`).join(' / ')}
${cfg.persona.includes('聖') || cfg.persona.includes('僕') ? FACTS : ''}
【すでに話した内容(繰り返し禁止)】
${previousRecap || '(まだ無し)'}

今回書くのは第${chapterIdx + 1}章「${ch.title}」です。内容: ${ch.summary}
この章の台本(scenes 2〜3個)を作ってください。`;
  return callGroq(system, user);
}

// 2段階生成: アウトライン→各章→コード側で組み立て(構成とシーン数をコードで保証する)
async function generate(cfg, topic) {
  const outline = await generateOutline(cfg, topic);
  if (!Array.isArray(outline.chapters) || outline.chapters.length < 3) {
    throw new Error('アウトライン生成に失敗(chaptersが3個未満)');
  }
  outline.chapters = outline.chapters.slice(0, 3);

  // 冒頭フック: 3章の予告をチェックリストで見せる
  const hookScene = {
    type: 'points',
    title: 'この動画でわかること',
    layout: 'stack',
    beats: outline.chapters.map((c, i) => ({
      kind: 'check',
      text: c.title,
      sub: c.hookSub || `${i + 1}つ目は、${c.title}についてです。`,
      se: i === 0 ? 'reveal_multi' : undefined,
    })),
    pose: 'pointing_left',
  };

  // 各章を順番に生成(直前までの内容を要約として渡して重複を防ぐ)
  const bodyScenes = [];
  let recap = '';
  for (let i = 0; i < outline.chapters.length; i++) {
    const res = await generateChapterScenes(cfg, topic, outline, i, recap.slice(0, 1500));
    const scenes = (Array.isArray(res.scenes) ? res.scenes : []).slice(0, 3).filter((sc) => Array.isArray(sc.beats) && sc.beats.length);
    if (!scenes.length) throw new Error(`第${i + 1}章の生成に失敗`);
    // 章の始まりがわかるよう、各章の先頭シーンの見出しは章タイトルに揃える
    if (scenes[0].type === 'points') scenes[0].title = outline.chapters[i].title;
    bodyScenes.push(...scenes);
    recap += scenes.map((sc) => sc.beats.map((b) => b.sub).join('')).join('') + '\n';
  }

  // まとめ: 3章の要点をグリッドで振り返る
  const summaryScene = {
    type: 'points',
    title: 'きょうのまとめ',
    layout: 'grid',
    beats: outline.chapters.map((c) => ({
      kind: 'check',
      text: c.keyPoint || c.title,
      sub: c.keySub || `${c.title}、これが今日の要点です。`,
    })),
    pose: 'thumbs_up',
  };

  const scenes = [outline.titleScene, hookScene, ...bodyScenes, summaryScene, outline.ctaScene].filter(Boolean);
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
  if (!accountKey) { console.error('使い方: node generate_script.js <アカウントキー>'); process.exit(1); }
  if (!GROQ_KEY) throw new Error('環境変数GROQ_API_KEYが未設定です');

  const accountsConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  const cfg = accountsConfig[accountKey];
  if (!cfg) throw new Error(`daily_config.jsonに${accountKey}の設定がありません`);

  const topic = nextTopic(accountKey);
  console.log(`[${accountKey}] お題: ${topic}`);

  const generated = await generate(cfg, topic);
  generated.scenes = randomizeLayouts(sanitizeScenes(generated.scenes));
  generated.youtubeTitle = stripForeignChars(generated.youtubeTitle);
  generated.description = stripForeignChars(generated.description);
  generated.thumbnailText = stripForeignChars(generated.thumbnailText || generated.youtubeTitle);
  generated.thumbnailKicker = stripForeignChars(generated.thumbnailKicker || '');

  if (cfg.lpUrl) {
    const ctaScene = [...generated.scenes].reverse().find((sc) => sc.type === 'cta');
    if (ctaScene) ctaScene.ctaUrl = cfg.lpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `daily_${accountKey}_${today}`;
  const script = {
    id,
    youtubeTitle: generated.youtubeTitle,
    description: generated.description,
    thumbnailText: generated.thumbnailText,
    thumbnailKicker: generated.thumbnailKicker,
    mood: cfg.mood,
    account: accountKey,
    footer: cfg.footer,
    useChibi: !!cfg.useChibi,
    speaker: cfg.speaker,
    cta: cfg.cta,
    scenes: generated.scenes,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`台本生成完了: ${outPath}`);
  console.log(`::set-output name=script_path::${outPath}`);
  return outPath;
}

if (require.main === module) {
  main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
}

module.exports = { main };
