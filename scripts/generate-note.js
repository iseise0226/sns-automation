// WF1: 指定アカウントのNote記事(章立て+本文+画像)を生成し、note_drafts/<account>/<date>/に保存
const fs = require('fs');
const path = require('path');
const { groqChat, fetchStockImage } = require('./note-lib');

const EMOJIS = ['👇🏻', '💬', '✨', '👉', '🕰️', '🌱'];

async function generateChapters(systemPrompt, sourceText) {
  const outlineRaw = await groqChat(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content:
          '以下の内容をもとに、Note記事の章立てを考えてください。第1章〜第5章＋あとがきの6パートで、各パートの見出しと、何を書くかの要約（50文字程度）をJSONで返してください。\n' +
          '{"chapters":[{"title":"見出し","summary":"何を書くか"}, ...6個]}\n\n' +
          `内容: ${sourceText}`,
      },
    ],
    600,
    true
  );
  const outline = JSON.parse(outlineRaw).chapters;

  const bodyOnly = [];
  const chaptersText = [];
  for (let i = 0; i < outline.length; i++) {
    const ch = outline[i];
    const already = bodyOnly.length ? bodyOnly.join('\n\n').slice(0, 2000) : '（まだ無し）';
    const chapterPrompt =
      'Note記事の1パートを書いてください。全体は複数パートに分かれていて、これはその一部です。\n\n' +
      `見出し: ${ch.title}\nこのパートで書く内容: ${ch.summary}\n` +
      `元の文字起こし（参考、全体のテーマ把握用）: ${sourceText.slice(0, 1500)}\n\n` +
      `【すでに他のパートで書いた内容（絶対に同じエピソード・同じ言い回しを繰り返さないこと）】\n${already}\n\n` +
      '【ルール】\n- 800〜1000文字程度\n- 口語体\n- このパートのテーマに合った、まだ使っていない具体的なエピソード・情景描写・例え話を入れる（上記で使った話の再利用は禁止）\n- 見出しや絵文字は書かず、本文だけを書く\n- 文字がぎっしり詰まって見えないよう、2〜4文ごとに改行（空行）を入れて読みやすい段落に分ける。1段落が5文以上にならないようにする';

    const bodyText = (
      await groqChat([{ role: 'system', content: systemPrompt }, { role: 'user', content: chapterPrompt }], 900, false)
    ).trim();

    bodyOnly.push(bodyText);
    chaptersText.push(`${ch.title}\n${EMOJIS[i % EMOJIS.length]}\n${bodyText}`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  return chaptersText.join('\n\n');
}

async function attachImages(content, outDir) {
  let keywords;
  try {
    const raw = await groqChat(
      [
        { role: 'system', content: 'You generate English stock-photo search keywords for article illustrations.' },
        {
          role: 'user',
          content:
            '以下は有料note記事の冒頭（無料公開部分）です。読者が「続きを読みたい／買いたい」と感じるような、雰囲気の良い写真を5枚選びたいです。' +
            '記事の世界観に合う、英語の検索キーワードを5個（2〜3語、ストックフォト検索用）JSON配列で返してください。' +
            '温かみ・希望・成長・丁寧な暮らしを感じさせるような画像が合います。{"keywords":["k1","k2","k3","k4","k5"]}\n\n記事:\n' +
            content.slice(0, 1000),
        },
      ],
      300,
      true
    );
    keywords = JSON.parse(raw).keywords || [];
  } catch (e) {
    keywords = ['calm lifestyle', 'warm sunlight room', 'quiet morning coffee', 'peaceful nature walk', 'cozy home moment'];
  }

  const imgFilenames = [];
  for (let i = 0; i < Math.min(5, keywords.length); i++) {
    try {
      const buf = await fetchStockImage(keywords[i]);
      if (buf) {
        const fname = `image${i + 1}.jpg`;
        fs.writeFileSync(path.join(outDir, fname), buf);
        imgFilenames.push(fname);
      }
    } catch (e) {
      // この1枚はスキップ
    }
  }
  if (!imgFilenames.length) return content;

  const parts = content.split('\n\n');

  // 1枚目は冒頭直後（無料部分の一番目立つ位置）に固定で置き、続きを読みたくなるフックにする
  let offset = 0;
  parts.splice(1, 0, `📷【ここに画像1を挿入: ${imgFilenames[0]}】`);
  offset += 1;

  // 残りはランダムな段落間に分散
  const remaining = imgFilenames.slice(1);
  if (remaining.length) {
    const candidateIdx = [];
    for (let i = 2 + offset; i < parts.length; i++) candidateIdx.push(i);
    for (let i = candidateIdx.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidateIdx[i], candidateIdx[j]] = [candidateIdx[j], candidateIdx[i]];
    }
    const positions = candidateIdx.slice(0, remaining.length).sort((a, b) => a - b);
    let extraOffset = 0;
    for (let i = 0; i < positions.length; i++) {
      parts.splice(positions[i] + extraOffset, 0, `📷【ここに画像${i + 2}を挿入: ${remaining[i]}】`);
      extraOffset += 1;
    }
  }

  return parts.join('\n\n');
}

async function main() {
  const account = process.argv[2];
  const sourceText = process.argv[3];
  if (!account || !sourceText) {
    console.error('usage: node generate-note.js <account> <sourceText>');
    process.exit(1);
  }
  const persona = require('../data/note_personas.json')[account];
  if (!persona) throw new Error(`unknown account: ${account}`);

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join('note_drafts', account, today);
  fs.mkdirSync(outDir, { recursive: true });

  const content = await generateChapters(persona.system, sourceText);
  const finalContent = await attachImages(content, outDir);
  fs.writeFileSync(path.join(outDir, 'draft.txt'), finalContent, 'utf-8');

  console.log(`[${account}] ok: ${outDir}/draft.txt (${finalContent.length}文字)`);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
