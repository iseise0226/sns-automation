// editorialテーマ(sessi.life)で使う純粋関数だけを置く。
// I/Oもグローバル状態も持たないので node --test で単体テストできる。

const SCENE_COUNT = 9;
const MIN_BROLL_SECONDS = 6;
const TITLE_EN_MAX = 12;

const DEFAULT_SLOTS = { cover: null, diagram: [0, 2, 4, 6, 8], cut: [1, 3, 5, 7] };
const EDITORIAL_SLOTS = { cover: 0, diagram: [2, 4, 6, 8], cut: [1, 3, 5, 7] };

// テーマごとのスロット配分。合計は必ずSCENE_COUNT(9)になる。
// 呼び出し側が配列を壊しても定数に影響しないよう毎回コピーを返す。
function slotsForTheme(theme) {
  const s = theme === 'editorial' ? EDITORIAL_SLOTS : DEFAULT_SLOTS;
  return { cover: s.cover, diagram: [...s.diagram], cut: [...s.cut] };
}

// 表紙の英語2行の予備。AIが構造を外したときに必ずここへ落ちる。
const TITLE_EN_TABLE = [
  { keys: ['スキンケア', '肌', 'スキン'], value: ['Daily Skin', 'Care Routine'] },
  { keys: ['乾燥', '保湿', 'うるおい'], value: ['Winter Skin', 'Dry Season'] },
  { keys: ['日焼け', '紫外線', 'UV'], value: ['Morning Light', 'Sun Care'] },
  { keys: ['髪', 'ヘア'], value: ['Hair Notes', 'Everyday Care'] },
  { keys: ['睡眠', '夜', '疲れ'], value: ['Night Reset', 'Slow Evening'] },
];
const TITLE_EN_DEFAULT = ['Beauty Notes', "Today's Tip"];

function buildFallbackTitleEn(topicText) {
  const t = String(topicText || '');
  for (const row of TITLE_EN_TABLE) {
    if (row.keys.some((k) => t.includes(k))) return [...row.value];
  }
  return [...TITLE_EN_DEFAULT];
}

// 12文字を超える場合は語の切れ目で落とす。切れ目が先頭付近しかない時だけ直に切る。
function clipTitleEn(s) {
  if (s.length <= TITLE_EN_MAX) return s;
  const cut = s.slice(0, TITLE_EN_MAX);
  const sp = cut.lastIndexOf(' ');
  return (sp > 3 ? cut.slice(0, sp) : cut).trim();
}

function cleanTitleEn(v) {
  const s = String(v == null ? '' : v)
    .replace(/[^A-Za-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clipTitleEn(s);
}

// 必ず2要素の配列を返す。片方でも空ならフォールバック表に落とす。
function normalizeTitleEn(raw, topicText) {
  const arr = Array.isArray(raw) ? raw : [];
  const a = cleanTitleEn(arr[0]);
  const b = cleanTitleEn(arr[1]);
  if (a && b) return [a, b];
  return buildFallbackTitleEn(topicText);
}

// 表紙は3行・実写カットの帯は2行。超えた行は縮小せずに捨てる。
function clampLines(text, max) {
  return String(text || '')
    .split('\n')
    .slice(0, max)
    .join('\n');
}

// テラコッタのベタ箱の上では黄色ベタの強調が使えないので、記号だけ外す。
function stripEmphasis(text) {
  return String(text || '').replace(/\*\*/g, '');
}

// Pexels/Pixabayの候補を合流させた配列から1本選ぶ。
// 6秒未満の足切りとかぶり除外は、合流したあとのこの1か所でかける。
function pickFromCandidates(candidates, excludeIds, rand) {
  const r = typeof rand === 'function' ? rand : Math.random;
  const avail = (candidates || []).filter(
    (c) => c && c.id && c.url && Number(c.duration) >= MIN_BROLL_SECONDS && !excludeIds.has(c.id)
  );
  if (!avail.length) return null;
  return avail[Math.floor(r() * avail.length)];
}

module.exports = {
  SCENE_COUNT,
  MIN_BROLL_SECONDS,
  TITLE_EN_MAX,
  slotsForTheme,
  buildFallbackTitleEn,
  normalizeTitleEn,
  clampLines,
  stripEmphasis,
  pickFromCandidates,
};
