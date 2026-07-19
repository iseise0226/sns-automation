// WF2: Threads 1日5回自動投稿（GitHub Actions用スタンドアロン版）
// n8nの「Braveトレンド検索」→「Groq_<acc>」→「Step1_<acc>」→「Step2_<acc>」を1スクリプトに統合
const https = require('https');

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

const THREADS_USER_IDS = {
  ise_satoshi: '26973238305690728',
  satoshi_mindset: '27572186385708529',
  satoshi_mind_coaching: '27564265113177740',
  ise_sato_kosodate: '36293625490253020',
  sessi_life: '27092097873810306',
  ise_kenkou_otaku: '36254291047552363',
  tabi_life_design40: '27612434671719929',
  ko_gi_omoti: '27835475659410595',
};

// persona本文（system/userTemplate）はpersonas.jsonから読み込む（リポジトリ内に同梱、トークン等は含まない）
const personas = require('./personas.json');

// テーマが合う3アカウントのみ、通常投稿の代わりにCTA投稿を混ぜる（ジャンル違いのアカウントには入れない）
// 現在はセッションモニター募集期間: 1/5の高頻度。先着3名が埋まったらCTA_CHANCEを1/7に戻し、LINE_CTA_TEXTS_ARCHIVEに差し替える
const CTA_CHANCE = 1 / 5;
const CTA_TEXTS = {
  ise_satoshi: [
    'ちょっとお知らせです。\n\n生年月日から自分の「型」と今の流れを読む、90分の個人セッションを始めました。\n\n通常20,000円のところ、最初の3名さんだけモニター価格5,000円でやってます。\n感想を聞かせてもらえる方限定です。\n\n気になる方は、プロフィールのLINEから「セッション」と送ってください。',
    '算命学の個人セッション、モニターさんを先着3名だけ募集してます。\n\n90分かけて、あなたの型と今の時期を一緒に整理する時間です。\n通常20,000円のところ、モニター価格5,000円。\n\nプロフィールのLINEから「セッション」とどうぞ。',
  ],
  satoshi_mindset: [
    '頑張ってるのに、なぜか苦しい。\n\nその原因は努力不足じゃなくて、自分の型に合わない頑張り方をしているだけかもしれません。\n\n生年月日から型と今の時期を読み解く90分の個人セッション、先着3名限定のモニター価格5,000円(通常20,000円)で募集しています。\n\nプロフィールのLINEから「セッション」とどうぞ。',
    '成功者の真似をしても、うまくいかない。\nそれは才能の差ではなく、型が違うだけです。\n\nあなたの型と今の運気の流れを90分で整理する個人セッション、モニターを先着3名(5,000円・通常20,000円)で募集中です。\n\nプロフィールのLINEから「セッション」と送ってください。',
  ],
  satoshi_mind_coaching: [
    '美容の現場で25年以上働きながら、300人以上を鑑定してきました。\n\nあなたがどんな場面で力を出せる人か。\n今が攻める時期か、土台を作る時期か。\n\nそれを一緒に整理する90分セッションのモニターを、先着3名(5,000円・通常20,000円)で募集します。\n\nプロフィールのLINEから「セッション」と送ってください。',
    'ひとりで背負い続けて、そろそろ誰かと整理したい。\nそんな方のための90分個人セッションです。\n\n生年月日からあなたの型と今の流れを読み解いて、「どこで頑張って、どこで力を抜いていいか」まで持ち帰ってもらいます。\n\n先着3名モニター価格5,000円(通常20,000円)。\nプロフィールのLINEから「セッション」とどうぞ。',
  ],
};

// モニター募集終了後に戻す用（LINE7日間配信への誘導）
const LINE_CTA_TEXTS_ARCHIVE = [
  '頑張ってるのに、なぜか苦しい。\n\nそう感じている経営者の方へ。\n心が軽くなる考え方を、7日間に分けてLINEで届けています。\n\n登録は無料、売り込みもありません。\nプロフィールのリンクから読んでみてください。',
  '経営をしていれば、壁は必ず来ます。\n大事なのは、その壁をどう捉えるか。\n\n25年間、現場で学んできた「心が軽くなる考え方」を、LINEで7日間お届けしています。\n\n気になる方はプロフィールのリンクからどうぞ。',
  '「もっと頑張らなきゃ」と思っているあなたへ。\n\n足りないのは努力じゃなく、考え方の土台かもしれません。\n無料の7日間LINE配信で、その土台の整え方をお伝えしています。\n\nプロフィールのリンクから、登録は無料です。',
];
void LINE_CTA_TEXTS_ARCHIVE;

function pickCtaText(account) {
  const texts = CTA_TEXTS[account];
  return texts[Math.floor(Math.random() * texts.length)];
}
const ACCOUNTS = {};
for (const key of Object.keys(THREADS_USER_IDS)) {
  ACCOUNTS[key] = {
    threadsUserId: THREADS_USER_IDS[key],
    system: personas[key].system,
    userTemplate: personas[key].userTemplate,
  };
}

async function getBraveTrends() {
  const url =
    'https://api.search.brave.com/res/v1/news/search?q=' +
    encodeURIComponent('マインド プラス思考 自己成長 日本') +
    '&count=5&country=JP&search_lang=jp';
  const res = await req(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
    },
  });
  const results = res.json?.results || [];
  return results.slice(0, 3).map((r) => r.title).join(', ');
}

async function generateText(account, trends) {
  const a = ACCOUNTS[account];
  const userContent = a.userTemplate.replace('{{TRENDS}}', trends);
  const messages = [
    { role: 'system', content: a.system },
    { role: 'user', content: userContent },
  ];

  const groqBody = JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: 500 });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } },
    groqBody
  );
  const text = res.json?.choices?.[0]?.message?.content;
  if (text) return text;

  console.error(`[${account}] Groq応答が空: ${JSON.stringify(res.json).slice(0, 300)}`);
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!openaiKey) return null;
  console.error(`[${account}] OpenAI(gpt-4o-mini)にフォールバックします`);
  const openaiBody = JSON.stringify({ model: 'gpt-4o-mini', messages, max_tokens: 500 });
  const res2 = await req(
    'https://api.openai.com/v1/chat/completions',
    { method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' } },
    openaiBody
  );
  return res2.json?.choices?.[0]?.message?.content;
}

async function postToThreads(account, text) {
  const a = ACCOUNTS[account];
  const token = (process.env[`THREADS_TOKEN_${account.toUpperCase()}`] || '').trim();
  if (!token) throw new Error(`missing token for ${account}`);

  const step1Url =
    `https://graph.threads.net/v1.0/${a.threadsUserId}/threads?` +
    `media_type=TEXT&text=${encodeURIComponent(text)}&access_token=${encodeURIComponent(token)}`;
  const step1 = await req(step1Url, { method: 'POST' });
  const creationId = step1.json?.id;
  if (!creationId) throw new Error(`step1 failed for ${account}: ${JSON.stringify(step1.json)}`);

  await new Promise((r) => setTimeout(r, 5000));

  const step2Url =
    `https://graph.threads.net/v1.0/${a.threadsUserId}/threads_publish?` +
    `creation_id=${creationId}&access_token=${encodeURIComponent(token)}`;
  const step2 = await req(step2Url, { method: 'POST' });
  return step2.json;
}

async function main() {
  const targetAccount = process.argv[2];
  // ko_gi_omotiは画像付き投稿(post-corgi.js)専用のため、通常実行(全件)からは除外
  const accountsToRun = targetAccount
    ? [targetAccount]
    : Object.keys(ACCOUNTS).filter((a) => a !== 'ko_gi_omoti');

  const trends = await getBraveTrends();
  console.log('trends:', trends);

  // 第2引数に "cta" を渡すとCTA投稿を強制する（テスト・手動告知用）
  const forceCta = process.argv[3] === 'cta';

  for (const acc of accountsToRun) {
    try {
      const useCta = !!CTA_TEXTS[acc] && (forceCta || Math.random() < CTA_CHANCE);
      const text = useCta ? pickCtaText(acc) : await generateText(acc, trends);
      if (!text) {
        console.error(`[${acc}] text generation failed, skipping`);
        continue;
      }
      if (useCta) console.log(`[${acc}] CTA投稿を使用`);
      const result = await postToThreads(acc, text);
      console.log(`[${acc}] posted:`, result?.id || result);
    } catch (e) {
      console.error(`[${acc}] error:`, e.message);
    }
  }
}

main();
