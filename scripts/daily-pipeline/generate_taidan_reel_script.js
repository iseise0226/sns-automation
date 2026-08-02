// Instagramリール用・対談形式(質問役あかり↔先生いせ)の短い台本(20〜35秒・5〜7ビート)をAIで生成する。
// YouTube対談(generate_taidan_script.js)と同じお題プール(okane_taidan)を使うが、進行位置は別管理(okane_taidan_reel)。
const fs = require('fs');
const path = require('path');
const G = require('./generate_script');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOPICS_PATH = path.join(DATA_DIR, 'daily_topics.json');
const OUT_DIR = path.join(__dirname, 'generated');

function stampAlt(beats) {
  beats.forEach((b, i) => { b.speaker = i % 2 === 0 ? 'q' : 's'; });
}

async function genReel(topic) {
  const system = `あなたはInstagramリール(20〜35秒の短尺)の台本作家です。出力は厳密なJSONのみ:
{"caption":"投稿キャプション(80〜150文字。最後にハッシュタグ3〜4個)","beats":[5〜7個、各{"text":"画面に大きく出す一言＋読み上げ文(15〜35文字)"}]}

2人の掛け合い(質問役の女性↔先生)。beatsは交互に質問役→先生→質問役...の順で並べる(コード側で自動的にspeakerを振るので、あなたは「聞く側の短い一言」と「答える側の短い一言」を交互に書くだけでよい)。
- 1個目は質問役が視聴者代表として素朴な疑問を投げかける(短いフック。「え、○○って知ってました？」等)
- 最後の1個は先生の一言まとめ(「今日も、いい一日を」等の軽い締め)
- 全体で1つの「知らないと損する」豆知識が伝わるようにする
- 数字はひらがな表記。英数字・他言語文字は使わない
- 誇張・断定しすぎる表現は禁止。短く・テンポよく`;
  const user = `今日のテーマ: ${topic}`;
  const res = await G.callGroq(system, user, 900, 0.85);
  if (!Array.isArray(res.beats) || res.beats.length < 4) throw new Error('リール台本生成に失敗(beatsが不足)');
  const beats = res.beats.slice(0, 7).map((b) => ({ text: G.stripForeignChars(b.text || '') }));
  stampAlt(beats);
  return { caption: G.stripForeignChars(res.caption || ''), beats };
}

async function main() {
  if (!process.env.GROQ_API_KEY) throw new Error('環境変数GROQ_API_KEYが未設定です');
  const topic = G.nextTopic('okane_taidan_reel');
  console.log(`[okane_taidan_reel] お題: ${topic}`);

  const generated = await genReel(topic);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `taidan_reel_${today}`;
  const script = { id, caption: generated.caption, beats: generated.beats };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `${id}.json`);
  fs.writeFileSync(outPath, JSON.stringify(script, null, 2));
  console.log(`対談リール台本 生成完了: ${outPath}`);
  return outPath;
}

if (require.main === module) {
  main().catch((e) => { console.error('失敗:', e.message); process.exit(1); });
}

module.exports = { main, genReel };
