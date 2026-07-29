// WF4: 指定アカウントのInstagramリール(約50秒)を生成・投稿
// YouTube(WF6)と同じデザイン: 白背景の線画アイコン図解(diagram)と4秒の実写ハイライト(cut)を交互に並べる(2026-07-25統一)
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync, spawn } = require('child_process');

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

// 9シーン固定: diagram(白背景の図解)とcut(4秒の実写)を交互に並べる。0,2,4,6,8がdiagram / 1,3,5,7がcut
const SCENE_COUNT = 9;
const DIAGRAM_SLOTS = [0, 2, 4, 6, 8];
const CUT_SLOTS = [1, 3, 5, 7];

// 線画アイコン一覧(remotion/src/LineIcons.tsxと同じ並び)
const ICON_NAMES = ['person_worried', 'person_calm', 'clock', 'wallet', 'coin', 'yen', 'chart_up', 'chart_bar', 'document', 'document_check', 'pencil', 'book', 'wall', 'flag', 'smartphone', 'cart', 'calendar', 'envelope', 'safe', 'gear', 'check_circle', 'cross_circle', 'piggy', 'lightbulb', 'target', 'hourglass'];
const ICON_DOC = 'person_worried(悩む人)/person_calm(穏やかな人)/clock(時計)/wallet(財布)/coin(コイン)/yen(お金)/chart_up(右肩上がり)/chart_bar(棒グラフ)/document(書類)/document_check(チェック済み書類)/pencil(鉛筆)/book(本)/wall(壁)/flag(旗)/smartphone(スマホ)/cart(買い物カゴ)/calendar(カレンダー)/envelope(封筒・給料)/safe(金庫・貯金)/gear(歯車・自動)/check_circle(チェック)/cross_circle(バツ)/piggy(貯金箱)/lightbulb(気づき)/target(目標)/hourglass(砂時計)';

// diagramスロットのlayoutと必要ポイント数を、5枠に偏りなく事前に割り当てる(直前と同じlayoutは避ける)
function assignDiagramLayouts() {
  const options = [
    { layout: 'iconsteps', pointCount: 4 },
    { layout: 'flow3', pointCount: 3 },
    { layout: 'reject', pointCount: 2 },
    { layout: 'iconsteps', pointCount: 3 },
    { layout: 'flow3', pointCount: 2 },
  ];
  const result = [];
  let prev = null;
  const pool = [...options];
  for (let i = 0; i < DIAGRAM_SLOTS.length; i++) {
    const candidates = pool.filter((o) => o.layout !== prev);
    const list = candidates.length ? candidates : pool;
    const idx = Math.floor(Math.random() * list.length);
    const chosen = list[idx];
    pool.splice(pool.indexOf(chosen), 1);
    result.push(chosen);
    prev = chosen.layout;
  }
  return result;
}

function buildStructureDoc(diagramLayouts) {
  // 「フェーズ名」のような名詞ラベルを渡すとAIがそれをそのままtitleにコピーしてしまうため、
  // 必ず具体的な指示文(動詞で終わる文)にする
  const directives = [
    '今日のテーマに関する、具体的でリアルな悩みの一場面(いつ・どこで・何をしていた時か)を提示する内容にする',
    'その悩みは自分だけじゃないと気づかせる、共感できる具体的な視点を書く',
    '考え方が変わった瞬間・気づきのきっかけを具体的に書く',
    '今日から実践できる具体的な手順・行動を書く',
    '内容全体を踏まえた前向きな一言と、保存・フォローへの自然な誘いを書く',
  ];
  const diagramDocs = diagramLayouts
    .map((d, i) => {
      const slot = DIAGRAM_SLOTS[i];
      const directive = directives[i];
      if (d.layout === 'reject') {
        return `- diagramシーン(scenes[${slot}]): ${directive}。points2個。1個目は「これは○○の話ではありません」という否定+icon+note、2個目は本当に伝えたいこと(**強調**1箇所)+icon。ナレーション(narration)は必ず35〜50文字。背景にうっすら流す実写のstockQuery(英語2〜4語)も付ける`;
      }
      return `- diagramシーン(scenes[${slot}]): ${directive}。points${d.pointCount}個。各pointは{text(2行以内・具体的な一言), icon}${d.layout === 'flow3' ? '、note(補足1行、最後のpointは**強調**可)' : ''}。ナレーション(narration)は必ず35〜50文字、単語だけの短い一言にしない。背景にうっすら流す実写のstockQuery(英語2〜4語)も付ける`;
    })
    .join('\n');
  const cutDocs = CUT_SLOTS.map((slot) => `- cutシーン(scenes[${slot}]): 直前のdiagramの内容を一言で言い切る強い見出し(headline、改行可、**強調**1箇所)+ナレーション(narration、必ず20〜30文字。単語だけの短い一言にしない)+実写検索キーワード(stockQuery、英語2〜4語)`).join('\n');
  return `${diagramDocs}\n${cutDocs}\n\n各diagramのtitleは、上の指示内容そのもの・カテゴリ名(「導入」「まとめ」等)ではなく、そのシーンで実際に話す具体的な内容を表す8〜16字の見出し(体言止めや短い断言)にすること。`;
}

const PASONA_STRUCTURE = `台本はscenes[0]〜scenes[8]の9シーン構成で、1つのストーリーとして繋がるように書いてください。
diagramシーンは白背景に線画アイコンを置いた図解、cutシーンは実写に一言だけ乗せる4秒のハイライトです。
アイコンに使える名前: ${ICON_DOC}

【重要】各diagramの構成リストにある「フェーズ:○○」は台本作成上の役割メモであり、そのままtitleに使ってはいけない。「導入」「共感と気づき」のようなフェーズ名そのものを見出しにするのは禁止。titleは必ず、そのシーンで話す具体的な内容を表す8〜16字の見出し(体言止めや短い断言)にすること。例: フェーズが「共感・気づき」でも、titleは「実は誰でも同じ」「気づけば手遅れに」のような内容そのものの見出しにする。

各シーンのnarration(読み上げ)は30〜45文字(diagram)/15〜25文字(cut)。全体で「悩みの一場面→共感→気づき→具体的な手順→まとめ」の流れにすること。

文章のトーン：AIが書いた説明文ではなく、一人の人間が自分の言葉で友達に打ち明けるように書いてください。急がず、ゆっくり、聴いている人の隣に座って話すような優しい語り口で。「〜なんですよね」「〜だったんです」「…って思うんです」のような、心の内をそっと明かす柔らかい語尾を多めに使ってください。
- 必ずどこかで語り手自身の体験・失敗談・本音を一人称で入れる（「僕も昔、〜で失敗しました」「正直、今でも〜が苦手です」のような自己開示）
- 感情の言葉を素直に使う（悔しかった、ホッとした、情けなかった、嬉しかった等）
- 完璧な人として語らない。「偉そうに言ってますが、僕もできない日があります」のような弱さを見せてよい
- 【禁止するAIっぽい定型表現】「〜してみませんか」「いかがでしょうか」「大切です」「おすすめです」「〜する方法をご紹介します」「〜と言われています」。これらは使わず、自分の実感として言い切るか、正直に迷いを見せる
- 教科書のような一般論だけのシーンを作らない。必ず具体的な場面・数字・固有の細部（時間帯、場所、誰の一言か等）を入れる
- 最後のdiagramシーン(scenes[8])で、保存・フォローをやさしく促す一言を添える。「フォローしてね」という定型文をそのまま使わず、毎回違う言い回しで表現すること
- テンプレート的な決まり文句の繰り返しを避け、毎回具体的で新鮮な表現を心がけること`;

// Groqは1分あたりのトークン上限(TPM)が厳しく、1リクエストで約8千トークン使うため
// 連続実行すると簡単に429になる。待って再試行し、それでもダメならOpenAIに逃がす。
// 最終的に台本が取れなかった場合は例外を投げる(既定文言だけの動画を投稿してしまわないため)。
async function callGroqWithFallback(messages, maxTokens) {
  const body = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } });
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
    // 1日枠(TPD)切れは待っても復帰しないので即フォールバックへ
    if (/tokens per day|TPD/i.test(lastErr)) break;
    if (attempt < 3 && /rate limit|Rate limit|429/i.test(lastErr)) {
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
  if (!openaiKey) throw new Error('Groqで台本を生成できず、OPENAI_API_KEYも未設定のため中止します');
  console.error('GroqからOpenAI(gpt-4o-mini)にフォールバックします');
  const res2 = await req(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } },
    JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: maxTokens, response_format: { type: 'json_object' } })
  );
  const content2 = res2.json?.choices?.[0]?.message?.content;
  if (!content2) throw new Error('OpenAIフォールバックも失敗: ' + JSON.stringify(res2.json || {}).slice(0, 300));
  return content2;
}

async function generateScenario(systemPrompt) {
  const diagramLayouts = assignDiagramLayouts();
  const structureDoc = buildStructureDoc(diagramLayouts);

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        `テーマを1つ選び、${PASONA_STRUCTURE}\n\n各シーンの構成(必ずこの通りに埋めること):\n${structureDoc}\n\n` +
        `さらに各シーンで画面に映る解説キャラクターのポーズを次の候補から1つずつ選んでください: "default"(口パクで喋る・基本), "arms_crossed"(腕組み・問題提起), "thinking"(考える・悩み), "explaining"(説明), "pointing_left"(指差し・注目), "guts"(ガッツポーズ・励まし), "thumbs_up"(いいね・肯定), "bowing"(お辞儀・挨拶)。半分以上のシーンは"default"にして、内容に特に合う場面だけ他のポーズを使うこと。` +
        `さらに、ナレーションの内容に効果音がハマるシーンだけ、次の候補から1つ選んでください（合う場面が無いシーンはnullのままでよい。目安は9シーン中2〜3個程度）: "kakan_impact"(コツンと軽い衝撃・失敗や気づき), "cancel"(否定・やめる・キャンセル), "kira_sparkle"(キラッと閃き・良いこと), "chiin_disappointment"(チーン・がっかり・落ち込み), "don_impact"(ドンと強い決意・インパクト), "pa_switch"(パッと場面転換・切り替え), "papa_quick_switch"(テンポよく2段階の切り替え), "register_payment"(お金・購入・レジ), "small_punch"(軽いツッコミ), "kotsuzumi_japanese"(和風の間・情緒), "hyoshigi1_japanese"(拍子木・和風の場面転換1), "hyoshigi2_japanese"(拍子木・和風の場面転換2), "decide1_button"(決定・確定1), "decide2_button"(決定・確定2), "suzu1_bell"(鈴・キラキラした気づき), "suzu2_bell_ring"(鈴・お知らせ・合図)。` +
        `このscenes(diagramはtitle/narration/points/stockQuery、cutはheadline/narration/stockQuery)・ポーズ・効果音とInstagramキャプションをJSONで返してください。キャプションはPREP法（結論→理由→具体例→結論の再提示）の構成で5～8行程度で書き、最後にテーマに合ったハッシュタグを５個つけてくださいをJSONで返してください。` +
        `{"caption":"投稿文","scenes":[9個。diagramは{"title":"...","narration":"...","points":[{"text":"...","icon":"...","note":"..."(任意)}],"stockQuery":"..."}、cutは{"headline":"...","narration":"...","stockQuery":"..."}],"chibi_poses":[9個の文字列],"se":[9個の「文字列またはnull」]}`,
    },
  ];
  // 9シーン分(各最大4ポイント×text/icon/note)の詳細なJSONを出力させるため、切れないよう余裕を持たせる
  const content = await callGroqWithFallback(messages, 5000);
  let data = {};
  try {
    data = JSON.parse(content || '{}');
  } catch (e) {
    console.error('シナリオJSONのパースに失敗:', e.message, '| raw:', String(content).slice(0, 500));
  }
  // シーン数が足りない場合、既定文言だけの中身のない動画を投稿してしまわないよう中止する
  const rawScenes = Array.isArray(data.scenes) && data.scenes.length === SCENE_COUNT ? data.scenes : [];
  if (!rawScenes.length) {
    throw new Error(
      `台本のscenesが期待の${SCENE_COUNT}個ではありません(実際:${Array.isArray(data.scenes) ? data.scenes.length : 'なし'})。投稿を中止します。raw: ${String(content).slice(0, 500)}`
    );
  }

  const scenes = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const raw = rawScenes[i] || {};
    if (DIAGRAM_SLOTS.includes(i)) {
      const layoutInfo = diagramLayouts[DIAGRAM_SLOTS.indexOf(i)];
      const points = (Array.isArray(raw.points) ? raw.points : [])
        .map((p) => ({
          text: String((p && p.text) || '').trim(),
          icon: ICON_NAMES.includes(p && p.icon) ? p.icon : 'check_circle',
          note: p && p.note ? String(p.note).trim() : undefined,
        }))
        .filter((p) => p.text)
        .slice(0, layoutInfo.layout === 'iconsteps' ? 4 : layoutInfo.pointCount);
      return {
        type: 'diagram',
        layout: layoutInfo.layout,
        title: String(raw.title || '').trim() || 'きょうの話',
        points,
        narration: String(raw.narration || '').trim() || '今日はこんな話をします。',
        stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
      };
    }
    return {
      type: 'cut',
      headline: String(raw.headline || '').trim() || 'きょうのポイント',
      narration: String(raw.narration || '').trim() || 'きょうのポイントです。',
      stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
    };
  });

  // ちびキャラのポーズ(不正値はdefault=口パクに落とす)
  const VALID_POSES = ['default', 'arms_crossed', 'bowing', 'explaining', 'guts', 'pointing_left', 'thinking', 'thumbs_up'];
  const chibiPoses = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const p = Array.isArray(data.chibi_poses) ? String(data.chibi_poses[i] || '').trim() : '';
    return VALID_POSES.includes(p) ? p : 'default';
  });
  // 効果音(内容に合う場面だけAIが選ぶ。不正値・null・空文字は「鳴らさない」)
  const VALID_SE = [
    'kakan_impact', 'cancel', 'kira_sparkle', 'chiin_disappointment', 'don_impact', 'pa_switch',
    'papa_quick_switch', 'register_payment', 'small_punch', 'kotsuzumi_japanese', 'hyoshigi1_japanese',
    'hyoshigi2_japanese', 'decide1_button', 'decide2_button', 'suzu1_bell', 'suzu2_bell_ring',
  ];
  const seChoices = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const s = Array.isArray(data.se) ? String(data.se[i] || '').trim() : '';
    return VALID_SE.includes(s) ? s : null;
  });

  return {
    caption: data.caption || systemPrompt,
    scenes,
    chibiPoses,
    seChoices,
  };
}

async function fetchPexelsVideo(keyword, usedIds) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  const res = await req(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=portrait`, {
    headers: { Authorization: key },
  });
  const candidates = (res.json?.videos || []).filter((v) => v.duration >= 6 && !usedIds.has(`px_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const files = (pick.video_files || []).filter((f) => f.height && f.height <= 1920).sort((a, b) => b.height - a.height);
  const file = files[0] || pick.video_files[0];
  return { id: `px_${pick.id}`, url: file.link };
}

async function fetchPixabayVideo(keyword, usedIds) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  const res = await req(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(keyword)}&per_page=30`, {});
  const candidates = (res.json?.hits || []).filter((v) => v.duration >= 6 && !usedIds.has(`pb_${v.id}`));
  if (!candidates.length) return null;
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const v = pick.videos.medium || pick.videos.small || pick.videos.large;
  return { id: `pb_${pick.id}`, url: v.url };
}

// 各シーン用の実写動画を取得する（かぶり除外は全アカウント台帳を統合）
// 9シーン全部ぶんの実写を取得する。diagramは白ベール70%をかけてうっすら流す背景として使う
async function fetchBrollVideos(scenes, outDir, account) {
  const ledgerDir = path.join(__dirname, '..', 'data', 'wf4_used_ids');
  const usedIdsPath = path.join(ledgerDir, `${account}.json`);
  fs.mkdirSync(ledgerDir, { recursive: true });
  let usedIds = [];
  try {
    usedIds = JSON.parse(fs.readFileSync(usedIdsPath, 'utf-8'));
  } catch (e) {}
  const excludeIds = new Set(usedIds);
  for (const f of fs.readdirSync(ledgerDir)) {
    if (!f.endsWith('.json')) continue;
    try {
      for (const id of JSON.parse(fs.readFileSync(path.join(ledgerDir, f), 'utf-8'))) excludeIds.add(id);
    } catch (e) {}
  }

  const fallbackPool = ['japan lifestyle', 'calm nature', 'daily life moment'];
  const videoBySlot = {};
  for (let sceneIdx = 0; sceneIdx < SCENE_COUNT; sceneIdx++) {
    const keywordChain = [scenes[sceneIdx].stockQuery, ...fallbackPool].filter(Boolean);
    let found = null;
    for (const kw of keywordChain) {
      found = (await fetchPexelsVideo(kw, excludeIds)) || (await fetchPixabayVideo(kw, excludeIds));
      if (found) break;
    }
    if (!found) {
      // 空振り枠は取得済みの映像を再利用
      const have = Object.values(videoBySlot);
      if (have.length > 0) videoBySlot[sceneIdx] = have[Math.floor(Math.random() * have.length)];
      continue;
    }
    const buf = await reqBinary(found.url, {});
    const p = path.join(outDir, `video${sceneIdx + 1}.mp4`);
    fs.writeFileSync(p, buf);
    videoBySlot[sceneIdx] = path.basename(p);
    usedIds.push(found.id);
    excludeIds.add(found.id);
  }
  fs.writeFileSync(usedIdsPath, JSON.stringify(usedIds.slice(-200)), 'utf-8');
  return videoBySlot;
}

// VOICEVOX(無料・ローカルエンジン)でTTS生成。ElevenLabsのクレジット枯渇を気にせず毎日投稿するため2026-07-26に移行。
// 既定は男声(玄野武宏)。女性ペルソナのアカウントはwf4_accounts.jsonのvoicevoxName/voicevoxStyleで上書きする(sessi_life=四国めたん等)
const VOICEVOX_ENGINE = 'http://127.0.0.1:50021';
const VOICEVOX_ENGINE_DIR = process.env.ENGINE_DIR || path.join(__dirname, 'daily-pipeline', 'voicevox_engine');
const DEFAULT_VOICEVOX_NAME = '玄野武宏';
const DEFAULT_VOICEVOX_STYLE = 'ノーマル';

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
    if (await voicevoxAlive()) {
      console.log('エンジン起動OK');
      return;
    }
  }
  throw new Error('VOICEVOXエンジンが3分以内に起動しませんでした');
}

async function resolveVoicevoxSpeaker(name, styleName) {
  const res = await fetch(`${VOICEVOX_ENGINE}/speakers`);
  const speakers = await res.json();
  const sp = speakers.find((s) => s.name === name) || speakers[0];
  if (!sp) throw new Error('VOICEVOXの話者一覧が取得できません');
  const style = sp.styles.find((st) => st.name === styleName) || sp.styles[0];
  console.log(`話者: ${sp.name}(${style.name}) id=${style.id}`);
  return style.id;
}

async function generateTTS(narrations, outDir, voicevoxName, voicevoxStyle) {
  const speaker = await resolveVoicevoxSpeaker(voicevoxName || DEFAULT_VOICEVOX_NAME, voicevoxStyle || DEFAULT_VOICEVOX_STYLE);
  const audioPaths = [];
  for (let i = 0; i < narrations.length; i++) {
    const audioPath = path.join(outDir, `audio${i + 1}.wav`);
    try {
      const q = await fetch(`${VOICEVOX_ENGINE}/audio_query?speaker=${speaker}&text=${encodeURIComponent(narrations[i])}`, { method: 'POST' });
      if (!q.ok) throw new Error(`audio_query失敗 ${q.status}`);
      const query = await q.json();
      query.speedScale = 1.0;
      query.postPhonemeLength = 0.3;
      const s = await fetch(`${VOICEVOX_ENGINE}/synthesis?speaker=${speaker}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!s.ok) throw new Error(`synthesis失敗 ${s.status}`);
      fs.writeFileSync(audioPath, Buffer.from(await s.arrayBuffer()));
      audioPaths.push(audioPath);
    } catch (e) {
      console.log(`  TTS失敗(scene${i + 1}):`, e.message);
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

// scenario.scenes(diagram/cut混在) + 実写 + 音声から、MyVideo.tsxのScene配列を組み立てる
function renderVideo(scenarioScenes, videoBySlot, audioPaths, outDir, useChibi, chibiPoses, seChoices) {
  const scenes = scenarioScenes.map((sc, i) => {
    const audio = audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '';
    const audioDur = audio ? getAudioDuration(audioPaths[i]) : null;
    const isCut = sc.type === 'cut';
    // cutは4秒固定に寄せる(短い一言なので音声もそれに収まる長さで生成させている)。diagramは音声長+図解を読む余白
    const minDuration = isCut ? 4.0 : (sc.points || []).length >= 3 ? 7.0 : 5.5;
    return {
      type: sc.type,
      layout: sc.layout,
      title: sc.title,
      points: sc.points,
      headline: sc.headline,
      narration: sc.narration || '',
      video: videoBySlot[i] || undefined,
      audio,
      durationInSeconds: Math.max(minDuration, audioDur || minDuration),
      pose: (chibiPoses && chibiPoses[i]) || 'default',
      se: (seChoices && seChoices[i]) || null,
    };
  });
  const propsPath = path.join(outDir, 'remotion_props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes, chibi: Boolean(useChibi) }), 'utf-8');

  const remotionDir = path.join(__dirname, '..', 'remotion');
  // public-dirが実行ごとのoutDirになるため、BGM・効果音ファイルもここにコピーしておく
  fs.copyFileSync(path.join(remotionDir, 'assets', 'bgm.mp3'), path.join(outDir, 'bgm.mp3'));
  const seSrc = path.join(remotionDir, 'assets', 'se');
  const seDst = path.join(outDir, 'se');
  fs.mkdirSync(seDst, { recursive: true });
  for (const f of fs.readdirSync(seSrc)) {
    fs.copyFileSync(path.join(seSrc, f), path.join(seDst, f));
  }
  if (useChibi) {
    // ちびキャラの口差分・ポーズ画像もpublic-dir(outDir)に置く
    const chibiSrc = path.join(remotionDir, 'assets', 'satoshi_chibi');
    const chibiDst = path.join(outDir, 'satoshi_chibi');
    fs.mkdirSync(path.join(chibiDst, 'poses'), { recursive: true });
    for (const f of fs.readdirSync(chibiSrc)) {
      if (f.startsWith('mouth_')) fs.copyFileSync(path.join(chibiSrc, f), path.join(chibiDst, f));
    }
    for (const f of fs.readdirSync(path.join(chibiSrc, 'poses'))) {
      fs.copyFileSync(path.join(chibiSrc, 'poses', f), path.join(chibiDst, 'poses', f));
    }
  }

  const videoPath = path.join(outDir, 'video.mp4');
  execFileSync(
    'npx',
    ['remotion', 'render', 'src/index.ts', 'MyVideo', videoPath, `--props=${propsPath}`, `--public-dir=${outDir}`],
    // 実写背景12本×約1分の構成でレンダリングが重いため余裕を持たせる
    { cwd: remotionDir, timeout: 600000, shell: true, stdio: 'inherit' }
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
// アカウントごとの間隔はdata/wf4_accounts.jsonのintervalDaysで指定（未指定時は3日おき）
const DEFAULT_INTERVAL_DAYS = 3;

function shouldRunToday(account, intervalDays) {
  let lastRun = {};
  try {
    lastRun = JSON.parse(fs.readFileSync(LAST_RUN_PATH, 'utf-8'));
  } catch (e) {}
  const last = lastRun[account];
  if (!last) return true;
  const daysSince = (Date.now() - new Date(last).getTime()) / 86400000;
  return daysSince >= intervalDays;
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
  const persona = require('../data/wf4_accounts.json')[account];
  if (!persona) throw new Error(`unknown account: ${account}`);
  const intervalDays = persona.intervalDays || DEFAULT_INTERVAL_DAYS;

  if (!process.env.WF4_FORCE && !shouldRunToday(account, intervalDays)) {
    console.log(`[${account}] skip: 前回実行から${intervalDays}日経過していません`);
    return;
  }
  process.env.WF4_ACCOUNT_UPPER = account.toUpperCase();
  await ensureVoicevoxEngine();

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve('wf4_media', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const scenario = await generateScenario(persona.system);
  console.log(`[${account}] caption:`, scenario.caption);
  console.log(
    `[${account}] scenes:`,
    scenario.scenes.map((s) => (s.type === 'cut' ? `cut:${s.headline}` : `diagram:${s.layout}:${s.title}`)).join(' / ')
  );

  const videoBySlot = await fetchBrollVideos(scenario.scenes, outDir, account);
  console.log(`[${account}] broll slots:`, Object.keys(videoBySlot).join(',') || 'none');

  const narrations = scenario.scenes.map((s) => s.narration);
  const audioPaths = await generateTTS(narrations, outDir, persona.voicevoxName, persona.voicevoxStyle);
  const videoPath = renderVideo(scenario.scenes, videoBySlot, audioPaths, outDir, persona.chibi, scenario.chibiPoses, scenario.seChoices);
  console.log(`[${account}] video rendered:`, videoPath);

  // マインド系アカウントはキャプション末尾にLINE誘導を固定で追加
  const caption = persona.ctaLine ? scenario.caption + persona.ctaLine : scenario.caption;
  const result = await postReel(persona.igUserId, videoPath, caption);
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
