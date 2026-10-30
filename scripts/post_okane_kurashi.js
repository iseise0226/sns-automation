// @oshiete.okane（くらしの確認帳）に、手元で作ったリールを投稿する
// 使い方: node post_okane_kurashi.js <video_url> <cover_url> <caption_file> [--dry]
// 動画と表紙は手元のPCが一時置き場に上げて、そのURLを渡す（インスタはURLから取りに来る）
const fs = require('fs');

const IG_USER_ID = '17841443565092674'; // @oshiete.okane
const GRAPH = 'https://graph.facebook.com/v23.0';

async function api(url, body) {
  const res = await fetch(url, body ? { method: 'POST', body: new URLSearchParams(body) } : undefined);
  const json = await res.json();
  return json;
}

async function main() {
  const [videoUrl, coverUrl, captionFile] = process.argv.slice(2);
  const dry = process.argv.includes('--dry');
  const token = (process.env.IG_TOKEN_OKANE_TAIDAN || '').trim();
  if (!token) throw new Error('IG_TOKEN_OKANE_TAIDANが未設定です');

  // 鍵が使えるかだけ確かめる（投稿しない）
  const me = await api(`${GRAPH}/${IG_USER_ID}?fields=username&access_token=${token}`);
  if (!me.username) throw new Error(`鍵の確認に失敗: ${JSON.stringify(me.error || me)}`);
  console.log(`account: @${me.username}`);
  if (dry) return;

  const caption = fs.readFileSync(captionFile, 'utf8').trim();
  const created = await api(`${GRAPH}/${IG_USER_ID}/media`, {
    media_type: 'REELS', video_url: videoUrl, cover_url: coverUrl, caption, share_to_feed: 'true', access_token: token,
  });
  if (!created.id) throw new Error(`入れ物の作成に失敗: ${JSON.stringify(created.error || created)}`);

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000));
    const s = await api(`${GRAPH}/${created.id}?fields=status_code,status&access_token=${token}`);
    if (s.status_code === 'FINISHED') break;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`処理に失敗: ${JSON.stringify(s)}`);
    if (i === 59) throw new Error('処理が終わりませんでした');
  }

  const pub = await api(`${GRAPH}/${IG_USER_ID}/media_publish`, { creation_id: created.id, access_token: token });
  if (!pub.id) throw new Error(`公開に失敗: ${JSON.stringify(pub.error || pub)}`);
  const info = await api(`${GRAPH}/${pub.id}?fields=permalink&access_token=${token}`);
  console.log(`PERMALINK=${info.permalink || pub.id}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
