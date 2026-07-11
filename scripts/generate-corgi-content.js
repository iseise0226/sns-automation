// WF3: コーギーInstagram投稿 — シナリオ生成→画像1枚生成→IG単体投稿
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
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

const IG_USER_ID = '17841468335300918';
const SCENE = 'sitting calmly with a gentle, warm, uplifting expression';

async function generateScenario() {
  const body = JSON.stringify({
    model: 'llama-3.3-70b-versatile',
    messages: [
      {
        role: 'system',
        content:
          'あなたはプラス思考・マインド系のメッセージを届ける、笑顔の可愛いコーギーキャラのInstagramコンテンツクリエイターです。日常の小さな出来事から前向きな気づきにつなげる投稿を作ります。説教っぽくならず、コーギーらしい温かみのある言葉で伝えます。',
      },
      {
        role: 'user',
        content:
          '今日のプラス思考・マインド系の投稿を1つ考えて、JSONで返してください。{"scenario":"テーマ","caption":"投稿キャプション","detail":"画像の雰囲気を表す英語の短い説明"}',
      },
    ],
    max_tokens: 300,
    response_format: { type: 'json_object' },
  });
  const res = await req(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${(process.env.GROQ_API_KEY || '').trim()}`,
        'Content-Type': 'application/json',
      },
    },
    body
  );
  const content = res.json?.choices?.[0]?.message?.content;
  const data = JSON.parse(content);
  return {
    scenario: data.scenario || '小さな一歩を大切にする',
    caption: data.caption || '今日も一歩前進できた自分に、ちょっと拍手🐾',
    detail: data.detail || 'happy smiling face',
  };
}

async function generateImage(detail, outDir) {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  const templatePath = path.join(__dirname, '..', 'assets', 'corgi_template.png');
  const prompt = `Keep the same corgi character design (face, colors, watercolor style) from the reference image, but change the pose and scene to: ${SCENE}, ${detail}. Soft pastel watercolor illustration, vertical composition, uplifting and gentle mood.`;
  const outPath = path.join(outDir, 'img1.png');
  execFileSync(
    'curl',
    [
      '-s',
      '--max-time',
      '170',
      '-X',
      'POST',
      'https://api.openai.com/v1/images/edits',
      '-H',
      `Authorization: Bearer ${apiKey}`,
      '-F',
      'model=gpt-image-1',
      '-F',
      `image=@${templatePath}`,
      '-F',
      `prompt=${prompt}`,
      '-F',
      'size=1024x1536',
      '-F',
      'n=1',
      '-o',
      `${outPath}.json`,
    ],
    { timeout: 180000 }
  );
  const data = JSON.parse(fs.readFileSync(`${outPath}.json`, 'utf-8'));
  const b64 = data?.data?.[0]?.b64_json;
  fs.unlinkSync(`${outPath}.json`);
  if (!b64) throw new Error(`image generation failed: ${JSON.stringify(data)}`);
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  return outPath;
}

async function postSinglePhoto(imgPath, caption) {
  const igToken = (process.env.IG_TOKEN_KO_GI_OMOTI || '').trim();

  // URLが「200で image/* を直接返すか」を確認する
  function isDirectImageUrl(url) {
    try {
      const out = execFileSync('curl', ['-s', '-I', '-L', '-o', '/dev/null', '-w', '%{http_code} %{content_type}', url], {
        timeout: 30000,
      })
        .toString()
        .trim();
      const [code, type] = out.split(' ');
      return code === '200' && (type || '').startsWith('image/');
    } catch (e) {
      return false;
    }
  }

  // 複数ホストを順に試し、直リンクとして機能するものだけを採用する
  // (tmpfiles.orgは2026-07に/dl/がHTMLへの302を返す仕様になり、IG側で取得エラーになった)
  function uploadImage(imgPath) {
    const uploaders = [
      {
        name: 'litterbox',
        run: () =>
          execFileSync(
            'curl',
            ['-s', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${imgPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'],
            { timeout: 120000 }
          )
            .toString()
            .trim(),
      },
      {
        name: 'uguu',
        run: () =>
          execFileSync('curl', ['-s', '-F', `files[]=@${imgPath}`, 'https://uguu.se/upload?output=text'], { timeout: 120000 })
            .toString()
            .trim(),
      },
      {
        name: 'tmpfiles',
        run: () => {
          const out = execFileSync('curl', ['-s', '-F', `file=@${imgPath}`, 'https://tmpfiles.org/api/v1/upload'], { timeout: 120000 }).toString();
          return JSON.parse(out).data.url.replace('tmpfiles.org/', 'tmpfiles.org/dl/');
        },
      },
    ];
    for (const up of uploaders) {
      try {
        const url = up.run();
        if (url.startsWith('https://') && isDirectImageUrl(url)) return url;
        console.log(`${up.name} rejected: ${url.slice(0, 120)}`);
      } catch (e) {
        console.log(`${up.name} error:`, e.message.slice(0, 120));
      }
    }
    throw new Error('全アップロードホストが失敗しました');
  }

  function createContainer(imageUrl) {
    const url = `https://graph.facebook.com/v23.0/${IG_USER_ID}/media`;
    const out = execFileSync('curl', [
      '-s',
      '-X',
      'POST',
      url,
      '-d',
      `image_url=${encodeURIComponent(imageUrl)}`,
      '-d',
      `caption=${encodeURIComponent(caption)}`,
      '-d',
      `access_token=${igToken}`,
    ]).toString();
    return JSON.parse(out);
  }

  const publicUrl = uploadImage(imgPath);
  const container = createContainer(publicUrl);
  if (!container.id) throw new Error(`container failed: ${JSON.stringify(container)}`);

  const publishUrl = `https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`;
  const publishRes = JSON.parse(
    execFileSync('curl', ['-s', '-X', 'POST', publishUrl, '-d', `creation_id=${container.id}`, '-d', `access_token=${igToken}`]).toString()
  );
  return publishRes;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const outDir = path.resolve('corgi_media', today);
  fs.mkdirSync(outDir, { recursive: true });

  const scenario = await generateScenario();
  console.log('scenario:', scenario.scenario, '| caption:', scenario.caption);

  const imgPath = await generateImage(scenario.detail, outDir);
  console.log('image generated:', imgPath);

  const result = await postSinglePhoto(imgPath, scenario.caption);
  console.log('posted:', result?.id || result);

  execFileSync('git', ['config', 'user.name', 'corgi-bot']);
  execFileSync('git', ['config', 'user.email', 'corgi-bot@users.noreply.github.com']);
  execFileSync('git', ['add', outDir]);
  execFileSync('git', ['commit', '-m', `chore: WF3コーギー投稿素材 ${today}`]);
  execFileSync('git', ['push']);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
