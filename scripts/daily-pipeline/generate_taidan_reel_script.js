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

// beats内の数字表記(ひらがな化済み)とは別に、図解は画面表示なので算用数字を許可する
function stripForeignCharsAllowDigits(s) {
  return G.stripForeignChars(s || '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function normalizeGraphic(g, maxInsertAfter) {
  if (!g || !['stairs', 'process', 'databadge'].includes(g.type)) return null;
  const insertAfter = Math.max(0, Math.min(maxInsertAfter, Number(g.insertAfterBeatIndex) || 0));
  const graphic = { type: g.type, title: stripForeignCharsAllowDigits(g.title || ''), insertAfter };
  if (g.type === 'stairs') {
    graphic.items = (g.items || []).slice(0, 3).map((it) => ({ t: stripForeignCharsAllowDigits(it.t || ''), s: stripForeignCharsAllowDigits(it.s || '') }));
    graphic.goal = stripForeignCharsAllowDigits(g.goal || '');
  } else if (g.type === 'process') {
    graphic.items = (g.items || []).slice(0, 4).map((it) => ({ t: stripForeignCharsAllowDigits(it.t || '') }));
  } else if (g.type === 'databadge') {
    graphic.from = { v: stripForeignCharsAllowDigits(g.from?.v || ''), label: stripForeignCharsAllowDigits(g.from?.label || '') };
    graphic.to = { v: stripForeignCharsAllowDigits(g.to?.v || ''), label: stripForeignCharsAllowDigits(g.to?.label || '') };
    graphic.badge = stripForeignCharsAllowDigits(g.badge || '');
  }
  return graphic;
}

async function genReel(topic) {
  const system = `あなたはInstagramリール(35〜55秒)の台本作家です。出力は厳密なJSONのみ:
{
  "caption":"投稿キャプション(80〜150文字。最後にハッシュタグ3〜4個)",
  "beats":[6〜8個、各{"text":"画面に大きく出す一言＋読み上げ文(15〜35文字)"}],
  "graphics":[3〜5個、各{
    "type":"stairs か process か databadge のどれか1つ(同じtypeを複数回使ってもよい)",
    "title":"図解の見出し(12〜18文字)",
    "insertAfterBeatIndex": このbeat(0始まり)の直後に挿入する番号(0〜beats数-1の整数。全体にばらけさせる)
  }]
}
最終的な画面の枚数(beats数+graphics数)が必ず10枚以上になるようにすること。

図解タイプごとの追加フィールド:
- stairs(積み上げ努力では届かないことを見せる): "items":[2〜3個、各{"t":"短い見出し(6〜10文字)","s":"補足(6〜12文字)"}], "goal":"到達したい目標(4〜8文字)"
- process(手順・流れを見せる): "items":[3〜4個、各{"t":"①から始まる手順の一言(8〜16文字。①②③④を自分で付ける)"}]
- databadge(数字のビフォーアフターを見せる): "from":{"v":"数字+単位(例:5万円)","label":"時点(例:2020年)"}, "to":{"v":"数字+単位","label":"時点"}, "badge":"一言インパクト(例:1.6倍/2倍に)"

2人の掛け合い(質問役の女性↔先生)。beatsは交互に質問役→先生→質問役...の順で並べる(コード側で自動的にspeakerを振るので、あなたは「聞く側の短い一言」と「答える側の短い一言」を交互に書くだけでよい)。
- 1個目は質問役が視聴者代表として素朴な疑問を投げかける(短いフック。「え、○○って知ってました？」等)
- 最後の1個は先生の一言まとめ(「今日も、いい一日を」等の軽い締め)
- 全体で1つの「知らないと損する」豆知識が伝わるようにする
- graphicsはテーマの数字・手順・構造を複数の角度から見せる(3〜5枚。同じ話の繰り返しにならないよう内容を変える)
- graphicsのinsertAfterBeatIndexは0から最後のbeatまで均等にばらけさせ、beats数+graphics数が10以上になるようにする
- beatsのテキストは数字をひらがな表記。graphics内は算用数字・①②③④を使ってよい
- 英数字・他言語文字は使わない(算用数字と丸数字は除く)
- 誇張・断定しすぎる表現は禁止。短く・テンポよく`;
  const user = `今日のテーマ: ${topic}`;
  const res = await G.callGroq(system, user, 1600, 0.85);
  if (!Array.isArray(res.beats) || res.beats.length < 4) throw new Error('リール台本生成に失敗(beatsが不足)');
  const beats = res.beats.slice(0, 8).map((b) => ({ text: G.stripForeignChars(b.text || '') }));
  stampAlt(beats);

  const rawGraphics = Array.isArray(res.graphics) ? res.graphics : (res.graphic ? [res.graphic] : []);
  let graphics = rawGraphics.slice(0, 6).map((g) => normalizeGraphic(g, beats.length - 1)).filter(Boolean);

  // 不足時は最後のgraphicsを別位置に複製してでも10枚以上を確保する(音沙汰なしの短い動画を避ける)
  if (graphics.length) {
    let idx = 0;
    while (beats.length + graphics.length < 10) {
      const base = graphics[idx % graphics.length];
      const insertAfter = Math.min(beats.length - 1, idx % beats.length);
      graphics.push({ ...base, insertAfter });
      idx++;
    }
  }

  return { caption: G.stripForeignChars(res.caption || ''), beats, graphics };
}

async function main() {
  if (!process.env.GROQ_API_KEY) throw new Error('環境変数GROQ_API_KEYが未設定です');
  const topic = G.nextTopic('okane_taidan_reel');
  console.log(`[okane_taidan_reel] お題: ${topic}`);

  const generated = await genReel(topic);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const id = `taidan_reel_${today}`;
  const script = { id, caption: generated.caption, beats: generated.beats, graphics: generated.graphics };

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
