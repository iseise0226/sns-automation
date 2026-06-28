// WF1: ise_satoshi向け有料マガジン記事(無料部分+有料部分)を生成
const fs = require('fs');
const path = require('path');
const { groqChat } = require('./note-lib');

const SYSTEM_PROMPT =
  'あなたは聖（さとし）として発信します。美容業界25年以上の経営者・算命学鑑定士として、マインド・プラス思考・人生哲学を発信します。「僕」を使用、誇張表現禁止、です・ます調ではなく口語体。';

async function main() {
  const sourceText = process.argv[2] || '今日のテーマ: マインド・算命学について';

  const factsPath = path.join(__dirname, '..', 'data', 'satoshi_facts.json');
  const usedLogPath = path.join(__dirname, '..', 'data', 'note_magazine_used_facts.json');
  const allFacts = JSON.parse(fs.readFileSync(factsPath, 'utf-8')).facts;
  let usedIds = [];
  if (fs.existsSync(usedLogPath)) {
    try {
      usedIds = JSON.parse(fs.readFileSync(usedLogPath, 'utf-8'));
    } catch (e) {
      usedIds = [];
    }
  }

  let pool = allFacts.filter((f) => !usedIds.includes(f.id));
  if (pool.length < 3) {
    pool = allFacts;
    usedIds = [];
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const picked = pool.slice(0, 3);
  fs.writeFileSync(usedLogPath, JSON.stringify(usedIds.concat(picked.map((f) => f.id))), 'utf-8');

  const factsText = picked.map((f) => `[${f.tag}] ${f.text}`).join('\n\n');

  const freePrompt =
    'note有料マガジン記事の【無料公開部分】を書いてください。読者の悩みへの共感から始め、テーマへの入口を示し、続きが有料エリアにあることを伝えて終える。\n\n' +
    `テーマ素材: ${sourceText}\n\n` +
    '【ルール】\n- 1000字程度\n- 口語体、「僕」を使う、誇張禁止\n- 見出しや絵文字は書かない\n- 最後は「ここから先は、月980円の有料マガジン『聖の算命学ノート〜マインドと運気の磨き方〜』の中で読めます。」という一文に近い形で締める（自然な前後の文をつけてよい）';
  const freeText = await groqChat([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: freePrompt }], 900);

  const paidPrompt =
    'note有料マガジン記事の【有料部分】を書いてください。以下の僕自身の実体験を必ず具体的に使い、一般論やありがちな例え話に逃げないこと。\n\n' +
    `【使う実体験（必ず使う・改変せず実感を活かす）】\n${factsText}\n\n` +
    `【テーマ素材】\n${sourceText}\n\n` +
    `【無料部分（続きを書くので内容を把握）】\n${freeText}\n\n` +
    '【ルール】\n- 2400〜2600字程度\n- 口語体、「僕」を使う、誇張禁止\n- 上記の実体験を最低2つ、具体的なディテール（年齢・金額・状況）を保ったまま使う\n- 一般的な精神論で終わらせず、最後は読者への問いかけで締める\n- 見出しや絵文字は書かない';
  const paidText = await groqChat([{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: paidPrompt }], 1800);

  const today = new Date().toISOString().slice(0, 10);
  const outDir = path.join('note_drafts', 'ise_satoshi_magazine', today);
  fs.mkdirSync(outDir, { recursive: true });
  const fullContent =
    `==================== 無料部分 ====================\n${freeText}\n\n` +
    `==================== 有料部分 ====================\n${paidText}\n\n` +
    `==================== 使用した実体験 ====================\n${picked.map((f) => f.tag).join(', ')}`;
  fs.writeFileSync(path.join(outDir, 'draft.txt'), fullContent, 'utf-8');

  console.log(`[magazine] ok: ${outDir}/draft.txt`);
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
