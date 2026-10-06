const test = require('node:test');
const assert = require('node:assert');
const {
  slotsForTheme,
  normalizeTitleEn,
  buildFallbackTitleEn,
  clampLines,
  clampLineChars,
  stripEmphasis,
  pickFromCandidates,
  MIN_BROLL_SECONDS,
  COVER_MAX_CHARS,
  CUT_MAX_CHARS,
} = require('../reel-editorial');

test('slotsForTheme: 既定は0番も図解', () => {
  const s = slotsForTheme(undefined);
  assert.strictEqual(s.cover, null);
  assert.deepStrictEqual(s.diagram, [0, 2, 4, 6, 8]);
  assert.deepStrictEqual(s.cut, [1, 3, 5, 7]);
});

test('slotsForTheme: editorialは0番が表紙で図解は4枠', () => {
  const s = slotsForTheme('editorial');
  assert.strictEqual(s.cover, 0);
  assert.deepStrictEqual(s.diagram, [2, 4, 6, 8]);
  assert.deepStrictEqual(s.cut, [1, 3, 5, 7]);
});

test('slotsForTheme: 合計は常に9シーン', () => {
  for (const t of [undefined, 'editorial']) {
    const s = slotsForTheme(t);
    const total = s.diagram.length + s.cut.length + (s.cover === null ? 0 : 1);
    assert.strictEqual(total, 9);
  }
});

test('slotsForTheme: 返す配列は呼び出し側で壊せない', () => {
  const a = slotsForTheme('editorial');
  a.diagram.push(99);
  assert.deepStrictEqual(slotsForTheme('editorial').diagram, [2, 4, 6, 8]);
});

test('buildFallbackTitleEn: テーマ語から2行を引く', () => {
  assert.deepStrictEqual(buildFallbackTitleEn('冬のスキンケアの話'), ['Daily Skin', 'Care Routine']);
  assert.deepStrictEqual(buildFallbackTitleEn('乾燥がつらい話'), ['Winter Skin', 'Dry Season']);
  assert.deepStrictEqual(buildFallbackTitleEn('日焼け止めの順番'), ['Morning Light', 'Sun Care']);
});

test('buildFallbackTitleEn: 表にない語は既定値', () => {
  assert.deepStrictEqual(buildFallbackTitleEn('まったく関係のない話'), ['Beauty Notes', "Today's Tip"]);
});

test('normalizeTitleEn: 正しい2要素はそのまま通す', () => {
  assert.deepStrictEqual(normalizeTitleEn(['Night Reset', 'Slow Evening'], 'x'), ['Night Reset', 'Slow Evening']);
});

test('normalizeTitleEn: 要素が足りなければフォールバック', () => {
  assert.deepStrictEqual(normalizeTitleEn(['Only One'], '乾燥の話'), ['Winter Skin', 'Dry Season']);
  assert.deepStrictEqual(normalizeTitleEn(null, '乾燥の話'), ['Winter Skin', 'Dry Season']);
  assert.deepStrictEqual(normalizeTitleEn(['', ''], '乾燥の話'), ['Winter Skin', 'Dry Season']);
});

test('normalizeTitleEn: 英字以外を落とす', () => {
  assert.deepStrictEqual(normalizeTitleEn(['夜の Skin', 'Care 習慣'], 'x'), ['Skin', 'Care']);
});

test('normalizeTitleEn: 12文字を超えたら語の切れ目で詰める', () => {
  const out = normalizeTitleEn(['Extraordinary Routine', 'Beautiful Morning'], 'x');
  assert.strictEqual(out[0], 'Extraordinar');
  assert.strictEqual(out[1], 'Beautiful');
});

test('clampLines: 上限を超えた行を捨てる', () => {
  assert.strictEqual(clampLines('a\nb\nc\nd', 3), 'a\nb\nc');
  assert.strictEqual(clampLines('a\nb', 3), 'a\nb');
  assert.strictEqual(clampLines(undefined, 3), '');
});

test('stripEmphasis: 強調記号だけ外して中身は残す', () => {
  assert.strictEqual(stripEmphasis('夜に**やめた**こと'), '夜にやめたこと');
  assert.strictEqual(stripEmphasis(undefined), '');
});

test('pickFromCandidates: 6秒未満と除外IDを落とす', () => {
  const cands = [
    { id: 'px_1', url: 'u1', duration: 3 },
    { id: 'px_2', url: 'u2', duration: 10 },
    { id: 'pb_3', url: 'u3', duration: 12 },
  ];
  const picked = pickFromCandidates(cands, new Set(['pb_3']), () => 0);
  assert.deepStrictEqual(picked, { id: 'px_2', url: 'u2', duration: 10 });
});

test('pickFromCandidates: 候補が全部落ちたらnull', () => {
  assert.strictEqual(pickFromCandidates([{ id: 'px_1', url: 'u1', duration: 2 }], new Set(), () => 0), null);
  assert.strictEqual(pickFromCandidates([], new Set(), () => 0), null);
  assert.strictEqual(pickFromCandidates(undefined, new Set(), () => 0), null);
});

test('pickFromCandidates: 両ソースが混ざった配列から選べる', () => {
  const cands = [
    { id: 'px_9', url: 'a', duration: 8 },
    { id: 'pb_9', url: 'b', duration: 8 },
  ];
  assert.strictEqual(pickFromCandidates(cands, new Set(), () => 0).id, 'px_9');
  assert.strictEqual(pickFromCandidates(cands, new Set(), () => 0.99).id, 'pb_9');
});

test('MIN_BROLL_SECONDSは6', () => {
  assert.strictEqual(MIN_BROLL_SECONDS, 6);
});

test('clampLineChars: 上限を超えた行は切り捨てる', () => {
  assert.strictEqual(clampLineChars('あいうえおかきくけこさし', 10), 'あいうえおかきくけこ');
});

test('clampLineChars: 短い行はそのまま', () => {
  assert.strictEqual(clampLineChars('あいうえお', 10), 'あいうえお');
});

test('clampLineChars: 複数行はそれぞれ独立に切り詰める', () => {
  assert.strictEqual(
    clampLineChars('あいうえおかきくけこさし\nかきくけこ\nたちつてとなにぬねのはひふへほ', 10),
    'あいうえおかきくけこ\nかきくけこ\nたちつてとなにぬねの'
  );
});

test('clampLineChars: undefinedは空文字', () => {
  assert.strictEqual(clampLineChars(undefined, 10), '');
});

test('COVER_MAX_CHARSは10、CUT_MAX_CHARSは11', () => {
  assert.strictEqual(COVER_MAX_CHARS, 10);
  assert.strictEqual(CUT_MAX_CHARS, 11);
});

test('slotsForTheme: editorial-navyはeditorialと同じ配分', () => {
  assert.deepStrictEqual(slotsForTheme('editorial-navy'), slotsForTheme('editorial'));
});

test('slotsForTheme: editorial-inkは表紙+カット8枠で図解なし・合計9', () => {
  const s = slotsForTheme('editorial-ink');
  assert.strictEqual(s.cover, 0);
  assert.deepStrictEqual(s.diagram, []);
  assert.deepStrictEqual(s.cut, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(s.diagram.length + s.cut.length + 1, 9);
});

test('clampMarkedLines: 強調を1箇所残して2行・字数に収める', () => {
  const { clampMarkedLines } = require('../reel-editorial');
  assert.strictEqual(clampMarkedLines('頑張りすぎは\n**才能**の裏返し\n三行目', 2, 10), '頑張りすぎは\n才能の裏返し'.replace('才能', '**才能**'));
  assert.strictEqual(clampMarkedLines('あいうえおかきくけこさしすせそ', 2, 10), 'あいうえおかきくけこ');
});

test('clampMarkedLines: 強調語が切り捨てられたら強調は外す', () => {
  const { clampMarkedLines } = require('../reel-editorial');
  assert.strictEqual(clampMarkedLines('あいうえおかきくけこ**さし**', 2, 10), 'あいうえおかきくけこ');
});

test('clampVertical: 句読点と改行を除き8字に収める', () => {
  const { clampVertical, VERTICAL_MAX } = require('../reel-editorial');
  assert.strictEqual(VERTICAL_MAX, 8);
  assert.strictEqual(clampVertical('静かに、\n整える時間を。'), '静かに整える時間');
  assert.strictEqual(clampVertical(undefined), '');
});

test('isCardTheme: card/leaf only', () => {
  const { isCardTheme } = require('../reel-editorial');
  assert.equal(isCardTheme('editorial-card'), true);
  assert.equal(isCardTheme('editorial-leaf'), true);
  assert.equal(isCardTheme('editorial'), false);
  assert.equal(isCardTheme(undefined), false);
});
