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

// Groq(無料)を優先し、TPM制限は待って再試行。1日枠(TPD)切れ等で復帰不能なら
// OpenAI gpt-4o-mini(低単価)へ自動フォールバックする
async function callGroq(system, user, maxTokens = 3000) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
        temperature: 0.85,
        response_format: { type: 'json_object' },
      }),
    });
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    if (content) return JSON.parse(content);

    const errMsg = JSON.stringify(json).slice(0, 400);
    // 1日枠(TPD)切れは待っても無駄なので即フォールバック
    if (/tokens per day|TPD/i.test(errMsg)) break;
    if (attempt < 3 && /rate limit|Rate limit|429/i.test(errMsg)) {
      const m = errMsg.match(/try again in ([0-9.]+)s/i);
      const waitSec = m ? Math.ceil(parseFloat(m[1])) + 5 : 65;
      console.log(`Groqレート制限。${waitSec}秒待って再試行(${attempt}/2)...`);
      await new Promise((r) => setTimeout(r, waitSec * 1000));
      continue;
    }
    if (attempt >= 3 || !/rate limit|Rate limit|429/i.test(errMsg)) {
      if (!process.env.OPENAI_API_KEY) throw new Error('Groq応答が空: ' + errMsg);
      break;
    }
  }
  console.log('GroqからOpenAI(gpt-4o-mini)にフォールバックします');
  return callOpenAI(system, user, maxTokens);
}

async function callOpenAI(system, user, maxTokens) {
  const key = (process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEYが未設定のためフォールバックできません');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI応答も空: ' + JSON.stringify(json).slice(0, 300));
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

// LineIcons.tsx のIconNameと同じ並び
const ICON_NAMES = ['person_worried', 'person_calm', 'clock', 'wallet', 'coin', 'yen', 'chart_up', 'chart_bar', 'document', 'document_check', 'pencil', 'book', 'wall', 'flag', 'smartphone', 'cart', 'calendar', 'envelope', 'safe', 'gear', 'check_circle', 'cross_circle', 'piggy', 'lightbulb', 'target', 'hourglass'];
const CHIBI_POSES = ['default', 'arms_crossed', 'bowing', 'explaining', 'guts', 'pointing_left', 'thinking', 'thumbs_up'];
const BEAT_SE_KEYS = ['clink', 'reveal', 'reveal_multi', 'spark', 'sad', 'impact', 'decide', 'decide2', 'cash', 'punch', 'drum', 'clapper', 'clapper2', 'bell', 'bell2'];
function sanitizeScenes(scenes) {
  for (const sc of scenes) {
    if (sc.title) sc.title = stripForeignChars(sc.title);
    for (const b of sc.beats || []) {
      b.text = stripForeignChars(b.text);
      b.sub = stripForeignChars(b.sub);
      if (b.note) b.note = stripForeignChars(b.note);
      // iconはアイコン名なので英字を残す。未知の名前はRemotion側の既定にフォールバックさせる
      if (b.icon && !ICON_NAMES.includes(b.icon)) delete b.icon;
      if (!BEAT_SE_KEYS.includes(b.se)) delete b.se;
    }
    sc.pose = CHIBI_POSES.includes(sc.pose) ? sc.pose : 'default';
  }
  const last = scenes[scenes.length - 1];
  if (last && last.type === 'cta') last.pose = 'bowing';
  return scenes;
}

// pointsシーンのlayoutをコード側で確実にランダム化する(AI任せだと偏る/連続するため)
// 白背景シーンは線画アイコンの図解3種のみ(枠付きカードの旧レイアウトは廃止)
const ALL_LAYOUTS = ['flow3', 'iconsteps', 'reject'];
function compatibleLayouts(beatCount) {
  return ALL_LAYOUTS.filter((l) => {
    if (l === 'flow3') return beatCount >= 2 && beatCount <= 3;
    if (l === 'iconsteps') return beatCount >= 3 && beatCount <= 4;
    if (l === 'reject') return beatCount === 2;
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
    prevLayout = sc.layout;
  }
  return scenes;
}

// 実写(cut)と白背景(points)を必ず交互に近い形で並べる。AIが固まって出しても強制的に整列する。
// 少ない方(通常cut)を多い方(points)の間に均等に差し込むことで、
// 「cutのあとpointsが2連続」のような偏りを避ける。
function alternateCutAndPoints(scenes) {
  const cuts = scenes.filter((s) => s.type === 'cut');
  const others = scenes.filter((s) => s.type !== 'cut');
  if (!cuts.length || !others.length) return scenes;

  const minority = cuts.length <= others.length ? cuts : others;
  const majority = cuts.length <= others.length ? others : cuts;

  const woven = [];
  let mi = 0;
  // majorityをminorityの数+1個のブロックに分け、ブロックの間にminorityを1個ずつ挟む
  const blockCount = minority.length + 1;
  const baseSize = Math.floor(majority.length / blockCount);
  let extra = majority.length % blockCount;
  let idx = 0;
  for (let b = 0; b < blockCount; b++) {
    const size = baseSize + (extra > 0 ? 1 : 0);
    if (extra > 0) extra--;
    for (let k = 0; k < size; k++) woven.push(majority[idx++]);
    if (mi < minority.length) woven.push(minority[mi++]);
  }
  return woven;
}

// シーン型・pose・seの共通定義(アウトライン生成と章生成の両方で使う)
const SCENE_TYPES_DOC = `各sceneは次のいずれかの型:
- {"type":"points","title":"大見出し(18字以内。一番刺さる語だけ**強調**で1箇所囲む)","layout":"flow3"|"iconsteps"|"reject","beats":[...],"pose":"..."}
   すべて白背景に線画アイコンを置いた図解。各beatに必ず"icon"を付ける。
   - layout="flow3": 3つの場面を矢印でつないで見せる(出発点→うまくいかない→だからこうする)。beatsは2〜3個。
     各beat: {"kind":"bubble","text":"アイコンの上に置く見出し(3行以内・1行8字程度)","icon":"アイコン名","note":"アイコンの下の補足(2行以内・**強調**可)","sub":"読み上げ文(40〜70文字)"}
   - layout="iconsteps": 丸で囲んだアイコンを矢印でつなぐ手順・流れ。beatsは3〜4個。
     各beat: {"kind":"box","text":"アイコンの下のラベル(2行以内・1行5字程度)","icon":"アイコン名","sub":"読み上げ文(40〜70文字)"}
   - layout="reject": 左に「これではない」もの(大きな赤い×が引かれる)、右に本当に伝えたいこと。beatsは2個ちょうど。
     beats[0]: {"kind":"cross","text":"否定する内容(2行・**強調**可)","icon":"アイコン名","note":"下の一言","sub":"..."}
     beats[1]: {"kind":"big","text":"本当に伝えたいこと(3行以内。一番大事な語を**強調**で囲む)","icon":"アイコン名","sub":"..."}
   iconに使える名前: person_worried(悩む人)/person_calm(穏やかな人)/clock(時計)/wallet(財布)/coin(コイン)/yen(お金)/chart_up(右肩上がり)/chart_bar(棒グラフ)/document(書類)/document_check(チェック済み書類)/pencil(鉛筆)/book(本)/wall(壁)/flag(旗)/smartphone(スマホ)/cart(買い物カゴ)/calendar(カレンダー)/envelope(封筒・給料)/safe(金庫・貯金)/gear(歯車・自動)/check_circle(チェック)/cross_circle(バツ)/piggy(貯金箱)/lightbulb(気づき)/target(目標)/hourglass(砂時計)
- {"type":"cut","stockQuery":"Pexels検索用の英語キーワード(2〜4語、実写で見せたい具体的な場面)","beats":[1個ちょうど、{"kind":"big","text":"短い一文\\n改行可(一番刺さる語だけ**強調**で1箇所囲む)","sub":"読み上げ文(20〜40文字)"}],"pose":"..."} ※実写の上に一言だけ出す4秒の短いカット

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
- 【必須】このうち1個は必ずcut型(実写4秒)にする。残りはpoints型(白背景の図解)。cut型は章の中で一番強く言い切りたい一言を短く出す場所として使う
- 前の章と同じエピソード・同じ言い回しを繰り返さない。cut型のstockQueryも章ごとに違う場面にする
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

  // 冒頭フック: 3章の予告を丸アイコンの手順風に見せる
  const hookScene = {
    type: 'points',
    title: 'この動画でわかること',
    layout: 'iconsteps',
    beats: outline.chapters.map((c, i) => ({
      kind: 'box',
      text: c.title,
      icon: 'check_circle',
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
    // 章の始まりがわかるよう、各章の先頭のpoints型シーンの見出しは章タイトルに揃える
    const firstPoints = scenes.find((sc) => sc.type === 'points');
    if (firstPoints) firstPoints.title = outline.chapters[i].title;
    // 実写と白背景が必ず交互になるよう、章の中でも並べ替えておく
    bodyScenes.push(...alternateCutAndPoints(scenes));
    recap += scenes.map((sc) => sc.beats.map((b) => b.sub).join('')).join('') + '\n';
  }

  // まとめ: 3章の要点を矢印でつないで振り返る
  const summaryScene = {
    type: 'points',
    title: 'きょうのまとめ',
    layout: 'flow3',
    beats: outline.chapters.map((c) => ({
      kind: 'bubble',
      text: c.keyPoint || c.title,
      icon: 'check_circle',
      sub: c.keySub || `${c.title}、これが今日の要点です。`,
    })),
    pose: 'thumbs_up',
  };

  // bodyScenesはすでに章単位でcut/points交互に整列済み(章の順序はそのまま保つ)
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
