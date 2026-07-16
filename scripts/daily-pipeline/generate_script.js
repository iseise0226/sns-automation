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

const SYSTEM_PROMPT = `あなたはYouTubeスライド動画の台本作家です。出力は厳密なJSONのみ。説明文や前置きは書かないこと。

台本の構造:
{
  "youtubeTitle": "興味を引くタイトル(28〜40文字、【】使用可)",
  "description": "概要欄用の説明文(100〜200文字)",
  "thumbnailKicker": "サムネイル左上の小タグ(4〜8文字、ジャンルが一目でわかる言葉)",
  "thumbnailText": "サムネイルのメインコピー(改行\\nで2〜3行、合計12〜20文字、文法的に完結した一文にする。一番刺さる語だけ**強調**で1箇所囲む。例: 頑張っても、\\n**報われない**理由 / 焦らなくて\\n**いい**理由)",
  "scenes": [ ...13〜16個... ]
}

各sceneは次のいずれかの型:
1. {"type":"title","kicker":"見出し英字ラベル","beats":[{"kind":"big","text":"改行\\nを含む短い印象的な一文(**強調**可)","sub":"読み上げ文(80〜130文字)"}],"pose":"..."}
2. {"type":"points","title":"シーン見出し(12字以内)","layout":"stack"|"panels"|"row"|"compare"|"timeline"|"grid"|"pyramid"|"meter","beats":[3個、各{"kind":"bubble"|"box"|"check"|"cross","text":"短いフレーズ\\n改行可(**強調**可、10〜16文字程度)","sub":"読み上げ文(40〜70文字)"}],"pose":"..."}
   - layout="compare"のときはbeatsは2個ちょうど
   - layout="timeline"は時系列・ステップの流れを見せたいときに使う(例: 過去→現在→未来、1年目→3年目→今)。beatsは3〜4個
   - layout="grid"はまとめ・要点を一気に並べたいときに使う。beatsは4個(2×2)が基本
   - layout="pyramid"は「まず土台、その上に○○」という積み上げ構造の話に使う。beats[0]が一番下の土台、最後が頂点。beatsは2〜4個
   - layout="meter"は、段階が進むほど到達度・レベルが上がっていく話に使う(ゲージが左から満ちていく)。beatsは2〜4個
   - kindは、layout="compare"なら1個目box/2個目box、"stack"/"grid"/"pyramid"/"meter"ではbubble中心、良い話ならcheck、NG例ならcrossを使う
3. {"type":"stock","stockQuery":"Pexels検索用の英語キーワード(2〜4語、風景・人物・物のイメージ)","beats":[2〜3個、{"kind":"big","text":"短い一文\\n改行可","sub":"読み上げ文(50〜90文字)"}],"pose":"..."}
4. {"type":"cta","beats":[3個、{"kind":"big","text":"...","sub":"..."}],"pose":"bowing"} ※最後のシーンのみ。poseは必ず"bowing"

poseフィールド(全シーン共通・キャラのポーズをシーン内容に合わせて選ぶ):
"default"(指差いて話す基本ポーズ)|"explaining"(両手を開いて説明)|"arms_crossed"(腕組み・断言/対比)|"thinking"(考え中・問いかけ)|"guts"(ガッツポーズ・成功/嬉しい話)|"thumbs_up"(サムズアップ・おすすめ/ポジティブな結論)|"pointing_left"(左指差し・注意を促す)|"bowing"(お辞儀・挨拶/締め/感謝)
- 各シーンのbeatsの内容に一番合うものを1つ選ぶ。同じポーズを3シーン以上連続させない
- cta型(最後のシーン)は必ず"bowing"
- title型(最初のシーン)は"default"か"explaining"

seフィールド(各beat単位、その一文が画面に出る瞬間に鳴る効果音。付けたい時だけbeatに"se":"..."を追加。全beatに付けない、要所の3〜5割程度に留める):
"clink"(小さな金属音・注目させたい一言)|"reveal"(パッ・1つの答え/ポイントを見せる)|"reveal_multi"(パパッ・リストやステップを連続で見せる)|"spark"(キラッ・気づき/前向きな発見)|"sad"(チーン・残念/失敗/後悔の話)|"impact"(ドン・強い驚き/衝撃的な事実)|"decide"(決定音・結論/断言)|"decide2"(決定音・別バージョン)|"cash"(レジ音・お金/値段の話)|"punch"(パンチ・言い切り/強調)|"drum"(和太鼓・算命学など和風/伝統の話)|"clapper"(拍子木・場面の区切り)|"clapper2"(拍子木・別バージョン)|"bell"(鈴・穏やか/癒しの一言)|"bell2"(鈴・別バージョン)
- 内容に合わないなら無理に付けない。同じseを1シーン内で連続させない

ルール:
- 数字は必ず全部ひらがな表記にする(例: 26万円→にじゅうろくまんえん、40歳→よんじゅっさい、2020年→にせんにじゅうねん、1年→いちねん)
- 英数字・アルファベット・他言語の文字は本文に使わない(stockQueryだけ英語でよい)
- 全体で13〜16シーン(合計5〜6分のしっかりした解説動画)。次の構成に従う:
  1. title型(1個目): テーマ提示
  2. フック(2個目): points型で「この動画でわかること」を3つ提示し、最後まで見る理由を作る
  3. 本編(3個目〜): テーマを3つの章に分けて深掘りする。各章は「主張→具体例やエピソード→今日からできる行動」の2〜3シーンで構成し、points/stockを混ぜて飽きさせない
  4. まとめ(最後から2個目): points型(grid推奨)で動画全体の要点を振り返る
  5. cta型(最後)
- 本編は一般論で終わらせず、具体的な場面・数字・手順まで踏み込む。1シーン1メッセージを守り、詰め込みすぎない
- layoutは同じものを連続させない。stack/panels/row/compare/timeline/grid/pyramid/meterを散らす
- 締めのcta型では、最後のbeatに「今日も、いい一日にしていきましょう」的な結びを入れる（名乗りの指定があれば使う）
- 誇張表現・断定しすぎる表現は禁止。癒しと気づきのトーンで
- thumbnailTextは「悲報」「警告」「絶対に」のような煽り・断定語は使わない。好奇心を引く短い言葉で`;

async function generate(cfg, topic) {
  const lpInstruction = cfg.lpUrl
    ? `\n【重要】cta型シーンのbeatsは3個構成にし、2個目のbeatで「この続きの話は、概要欄のリンクからご覧いただけます」という趣旨を、今日のテーマの内容に絡めて自然な一文で入れること（例: 今日話しきれなかった部分は、概要欄のリンクから続きを読めます、など）。3個目のbeatで締めの挨拶をする。`
    : '';
  const userPrompt = `話者設定: ${cfg.persona}
名乗り(cta最後で使う): ${cfg.speakerLabel}
今日のテーマ: ${topic}
${cfg.persona.includes('聖') || cfg.persona.includes('僕') ? FACTS : ''}${lpInstruction}
このテーマで、上記の構造に従った台本JSONを1つ作成してください。`;
  return callGroq(SYSTEM_PROMPT, userPrompt);
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
