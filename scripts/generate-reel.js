// WF4: 指定アカウントのInstagramリール(手描きスケッチ解説スタイル・約1分)を生成・投稿
// 全12シーン実写B-roll背景の上に手描き風カードを重ねる。カード装飾はRemotionで全描画（@ClaudeCode-videoチャンネル風）
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

const SCENE_COUNT = 12;
// 全シーンを実写B-roll背景にする（2026-07-08 聖さん指示）
const BROLL_SCENE_INDEXES = Array.from({ length: SCENE_COUNT }, (_, i) => i);

const PASONA_STRUCTURE = `台本はナレーション${SCENE_COUNT}シーン分。各シーン30〜40文字(全体で合計420文字程度・約1分の動画になる)で、以下の流れに沿って一つのストーリーとして繋がるように書いてください。1シーン1メッセージ。短い中でも、間や迷いを感じさせる丁寧な語りかけにすること。
シーン1〜2（Problem）: 抽象的な「悩み」ではなく、具体的でリアルな一場面（いつ・どこで・何をしていた時か）から始める。毎回違う具体的なシチュエーションを考えること
シーン3〜4（Affinity）: その場面で感じたことに共感する。自分の体験談を交えてもいい
シーン5〜7（Solution）: 気づき・考え方の転換を伝える
シーン8〜10（Offer）: 具体的な提案・今日からできる行動のヒントを伝える
シーン11（Narrowing down）: 気負わなくていいと伝えて絞り込み、全体をまとめる。ただし「特別なことじゃなくていい」という定型文をそのまま使わず、毎回違う言い回しで表現すること
シーン12（Action）: 保存・フォローをやさしく促す。ただし「フォローしてね」という定型文をそのまま使わず、毎回違う言い回しで表現すること

【シーン11・12の締めの一言について】「今日も一歩ずつ進んでいこう」「一歩ずつ進んでいきましょう」のような当たり障りのない一般論の締めは絶対に使わないこと。このテーマ・このエピソードだからこそ言える具体的な一言で締めること（例: そのエピソードで出てきた物・場所・感覚に戻って着地する等）。毎回、前のシーン群の内容と結びついた違う締め方にすること

文章のトーン：AIが書いた説明文ではなく、一人の人間が自分の言葉で友達に打ち明けるように書いてください。急がず、ゆっくり、聴いている人の隣に座って話すような優しい語り口で。「〜なんですよね」「〜だったんです」「…って思うんです」のような、心の内をそっと明かす柔らかい語尾を多めに使ってください。
- 必ずどこかで語り手自身の体験・失敗談・本音を一人称で入れる（「僕も昔、〜で失敗しました」「正直、今でも〜が苦手です」のような自己開示）
- 感情の言葉を素直に使う（悔しかった、ホッとした、情けなかった、嬉しかった等）
- 完璧な人として語らない。「偉そうに言ってますが、僕もできない日があります」のような弱さを見せてよい
- 【禁止するAIっぽい定型表現】「〜してみませんか」「いかがでしょうか」「大切です」「おすすめです」「〜する方法をご紹介します」「〜と言われています」。これらは使わず、自分の実感として言い切るか、正直に迷いを見せる
- 教科書のような一般論だけのシーンを作らない。必ず具体的な場面・数字・固有の細部（時間帯、場所、誰の一言か等）を入れる
- テンプレート的な決まり文句の繰り返しを避け、毎回具体的で新鮮な表現を心がけること`;

async function generateScenario(systemPrompt) {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          `テーマを1つ選び、${PASONA_STRUCTURE}\n\nさらに各シーンの「見出し」と「要点リスト」を作ってください。` +
          `見出しはそのシーンのナレーションの要点を6〜12文字で言い切る短いフレーズ（体言止めや短い断言。例:「旅費が高い問題」「1日3000円でOK」）。` +
          `要点リストは各シーンに必ず3個、1個5〜14文字の具体的な補足（例:「宿は素泊まりでいい」「移動は鈍行が安い」「予約は3週間前まで」）。ナレーションと同じ文の繰り返しではなく、画面を読んだ人が得する追加情報にすること。シーン11の要点は動画全体の要点まとめ3つにすること。` +
          `さらに各シーンの実写映像検索キーワード（そのシーンの内容に合う映像を表す英語2〜4語。例: "rainy window city night"）も作ってください。` +
          `さらに各シーンで画面に映る解説キャラクターのポーズを次の候補から1つずつ選んでください: "default"(口パクで喋る・基本), "arms_crossed"(腕組み・問題提起), "thinking"(考える・悩み), "explaining"(説明), "pointing_left"(指差し・注目), "guts"(ガッツポーズ・励まし), "thumbs_up"(いいね・肯定), "bowing"(お辞儀・挨拶)。半分以上のシーンは"default"にして、内容に特に合う場面だけ他のポーズを使うこと。` +
          `さらに、ナレーションの内容に効果音がハマるシーンだけ、次の候補から1つ選んでください（合う場面が無いシーンはnullのままでよい。無理に全シーンに入れないこと。目安は12シーン中2〜4個程度）: "kakan_impact"(コツンと軽い衝撃・失敗や気づき), "cancel"(否定・やめる・キャンセル), "kira_sparkle"(キラッと閃き・良いこと), "chiin_disappointment"(チーン・がっかり・落ち込み), "don_impact"(ドンと強い決意・インパクト), "pa_switch"(パッと場面転換・切り替え), "papa_quick_switch"(テンポよく2段階の切り替え), "register_payment"(お金・購入・レジ), "small_punch"(軽いツッコミ), "kotsuzumi_japanese"(和風の間・情緒), "hyoshigi1_japanese"(拍子木・和風の場面転換1), "hyoshigi2_japanese"(拍子木・和風の場面転換2), "decide1_button"(決定・確定1), "decide2_button"(決定・確定2), "suzu1_bell"(鈴・キラキラした気づき), "suzu2_bell_ring"(鈴・お知らせ・合図)。` +
          `この台本・見出し・要点リスト・検索キーワード・ポーズ・効果音とInstagramキャプション（150文字以内）をJSONで返してください。` +
          `{"caption":"投稿文","narrations":[${SCENE_COUNT}個の文字列],"headlines":[${SCENE_COUNT}個の文字列],"points":[${SCENE_COUNT}個の「文字列2〜3個の配列」],"broll_keywords":[${SCENE_COUNT}個の英語キーワード文字列],"chibi_poses":[${SCENE_COUNT}個の文字列],"se":[${SCENE_COUNT}個の「文字列またはnull」]}`,
      },
    ],
    max_tokens: 2800,
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
  // 要点リスト（欠けたシーンは空配列＝見出しだけのカードになる）
  const points = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const p = Array.isArray(data.points) ? data.points[i] : null;
    if (!Array.isArray(p)) return [];
    return p.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 3);
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
    narrations,
    headlines,
    points,
    chibiPoses,
    seChoices,
    layouts: randomizeLayouts(points),
    brollKeywords: Array.isArray(data.broll_keywords) ? data.broll_keywords.map((k) => String(k || '').trim()) : [],
  };
}

// 各シーンの要点カードの見せ方(レイアウト)をコード側でランダムに割り当てる(AI任せだと偏る/連続するため)
// 要点の個数に合わないレイアウトは除外し、直前と同じレイアウトは避ける
const ALL_LAYOUTS = ['stack', 'panels', 'row', 'compare', 'timeline', 'grid', 'pyramid', 'meter'];
function compatibleLayouts(pointCount) {
  return ALL_LAYOUTS.filter((l) => {
    if (l === 'compare') return pointCount === 2;
    if (l === 'grid' || l === 'timeline' || l === 'pyramid' || l === 'meter') return pointCount >= 2 && pointCount <= 4;
    return pointCount >= 1;
  });
}
function randomizeLayouts(pointsPerScene) {
  let prevLayout = null;
  return pointsPerScene.map((pts) => {
    const count = (pts || []).length;
    if (count === 0) return { layout: 'stack' };
    const candidates = compatibleLayouts(count).filter((l) => l !== prevLayout);
    const pool = candidates.length ? candidates : compatibleLayouts(count);
    const layout = pool[Math.floor(Math.random() * pool.length)];
    prevLayout = layout;
    return { layout, separator: layout === 'compare' ? '≠' : layout === 'row' ? '→' : undefined };
  });
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
async function fetchBrollVideos(keywords, outDir, account) {
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
  for (let slot = 0; slot < BROLL_SCENE_INDEXES.length; slot++) {
    const sceneIdx = BROLL_SCENE_INDEXES[slot];
    const keywordChain = [keywords[sceneIdx], ...fallbackPool].filter(Boolean);
    let found = null;
    for (const kw of keywordChain) {
      found = (await fetchPexelsVideo(kw, excludeIds)) || (await fetchPixabayVideo(kw, excludeIds));
      if (found) break;
    }
    if (!found) {
      // 空振り枠は取得済みの映像を再利用（それも無ければ紙背景カードにフォールバック）
      const have = Object.values(videoBySlot);
      if (have.length > 0) videoBySlot[sceneIdx] = have[Math.floor(Math.random() * have.length)];
      continue;
    }
    const buf = await reqBinary(found.url, {});
    const p = path.join(outDir, `video${slot + 1}.mp4`);
    fs.writeFileSync(p, buf);
    videoBySlot[sceneIdx] = path.basename(p);
    usedIds.push(found.id);
    excludeIds.add(found.id);
  }
  fs.writeFileSync(usedIdsPath, JSON.stringify(usedIds.slice(-200)), 'utf-8');
  return videoBySlot;
}

// 既定は男性声(Adam)。聖さん本人として「僕」で語るため男声にする。
// 女性ペルソナのアカウントはwf4_accounts.jsonのvoiceIdで上書きする(sessi_life=Sarah)
const ELEVENLABS_VOICE_ID = 'pNInz6obpgDQGcFmaJgB';

async function generateTTS(narrations, outDir, voiceId) {
  const key = (process.env.ELEVENLABS_API_KEY || '').trim();
  const audioPaths = [];
  for (let i = 0; i < narrations.length; i++) {
    const body = JSON.stringify({
      text: narrations[i],
      model_id: 'eleven_flash_v2_5', // 0.5クレジット/文字。リールはBGM付き短文なので軽量版で十分(YouTube長尺はmultilingual_v2を使う)
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });
    const audioPath = path.join(outDir, `audio${i + 1}.mp3`);
    try {
      const audioBuf = await reqBinary(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId || ELEVENLABS_VOICE_ID}`,
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

function renderVideo(narrations, headlines, points, videoBySlot, audioPaths, outDir, useChibi, chibiPoses, seChoices, layouts) {
  // 手描きスケッチ風カード。B-rollシーンは実写背景の上にカードを重ねる
  const scenes = narrations.map((narration, i) => {
    const scenePoints = points[i] || [];
    // カード3枚を読む時間を確保するため最低尺を延ばす
    const minDuration = scenePoints.length >= 2 ? 4.2 : 2.8;
    const layoutInfo = (layouts && layouts[i]) || { layout: 'stack' };
    return {
      headline: headlines[i] || '',
      narration: narration || '',
      points: scenePoints,
      layout: layoutInfo.layout,
      separator: layoutInfo.separator,
      video: videoBySlot[i] || '',
      audio: audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '',
      durationInSeconds: Math.max(minDuration, audioPaths[i] && fs.existsSync(audioPaths[i]) ? getAudioDuration(audioPaths[i]) : 3.0),
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

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve('wf4_media', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const scenario = await generateScenario(persona.system);
  console.log(`[${account}] caption:`, scenario.caption);
  console.log(`[${account}] headlines:`, scenario.headlines.join(' / '));

  const videoBySlot = await fetchBrollVideos(scenario.brollKeywords, outDir, account);
  console.log(`[${account}] broll slots:`, Object.keys(videoBySlot).join(',') || 'none');

  const audioPaths = await generateTTS(scenario.narrations, outDir, persona.voiceId);
  const videoPath = renderVideo(scenario.narrations, scenario.headlines, scenario.points, videoBySlot, audioPaths, outDir, persona.chibi, scenario.chibiPoses, scenario.seChoices, scenario.layouts);
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
