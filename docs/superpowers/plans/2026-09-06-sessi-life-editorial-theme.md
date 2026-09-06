# sessi.life editorial テーマ 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** WF4 の @sessi.life だけを、実写B-roll＋セリフ体英語＋テラコッタのコピー箱という editorial テーマに切り替える。他5アカウントは1フレームも変えない。

**Architecture:** 配色は CSS カスタムプロパティで差し替える。`MyVideo.tsx` の色定数を `var(--ink)` 等に置き換え、ルートで palette を流し込む。表紙と実写カットは新規コンポーネント2つに分岐させる。台本側の純粋関数は新規モジュールに切り出して `node --test` で単体テストする。

**Tech Stack:** Node.js（CommonJS・`node:test` 組み込み）、React 18、Remotion 4、`@remotion/google-fonts`（ZenMaruGothic / PlayfairDisplay）

**Spec:** `docs/superpowers/specs/2026-09-06-sessi-life-editorial-theme-design.md`

## Global Constraints

- 新しい npm パッケージは追加しない。`@remotion/google-fonts` は導入済みで、PlayfairDisplay はそのサブパス import で使える
- テストは Node 組み込みの `node:test` / `node:assert` のみ。jest / vitest を入れない
- リポジトリのルートは `C:\Users\isesa\sns-automation`。作業ブランチは `main` ではなく新しいブランチを切る
- editorial テーマは `data/wf4_accounts.json` の `sessi_life` にだけ付ける。他5アカウントの出力は変えない
- レンダリング対象のコンポジションは `MyVideo`（1080×1920）。`RichSlideVideo.tsx` は YouTube 用なので触らない
- 配色トークンの正の値は `remotion/src/editorialTheme.ts` にだけ書く。他のファイルに色リテラルを増やさない
- コミットメッセージの末尾には必ず次の行を入れる

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

---

## File Structure

| ファイル | 種別 | 責務 |
|---|---|---|
| `scripts/reel-editorial.js` | 新規 | 台本側の純粋関数のみ。スロット配分・英語タイトル正規化・B-roll候補の選択・行数クランプ・強調記号の除去 |
| `scripts/test/reel-editorial.test.js` | 新規 | 上の単体テスト |
| `remotion/src/editorialTheme.ts` | 新規 | 配色・グレーディングのトークンと palette 定義 |
| `remotion/src/EditorialScenes.tsx` | 新規 | `EditorialCover` と `EditorialCut` の2コンポーネント |
| `remotion/src/MyVideo.tsx` | 変更 | 色定数を CSS 変数化。`cover` 型と theme 分岐を追加 |
| `remotion/src/Root.tsx` | 変更 | 目視確認用の Still を2つ追加 |
| `scripts/generate-reel.js` | 変更 | スロット配分・プロンプト・シーン組み立て・B-roll取得を editorial 対応に |
| `data/wf4_accounts.json` | 変更 | `sessi_life` に `"theme": "editorial"` |

---

### Task 0: ブランチを切る

**Files:**
- なし（git 操作のみ）

**Interfaces:**
- Consumes: なし
- Produces: 作業ブランチ `feat/sessi-editorial-theme`

- [ ] **Step 1: Node のバージョンを確認する**

Run: `node -v`
Expected: `v18.` 以上。`node --test` が使えることの確認。18未満だった場合はここで止めて報告する。

- [ ] **Step 2: 作業ブランチを作る**

```bash
cd /c/Users/isesa/sns-automation
git checkout -b feat/sessi-editorial-theme
```

- [ ] **Step 3: 作業ツリーが汚れていないか確認する**

Run: `cd /c/Users/isesa/sns-automation && git status --porcelain`
Expected: 既存の未追跡ファイル（`tmp_preview/` 等、行頭が `??`）だけ。行頭が ` M` の追跡済み変更が出ていないこと。

---

### Task 1: 台本側の純粋関数モジュール

**Files:**
- Create: `scripts/reel-editorial.js`
- Test: `scripts/test/reel-editorial.test.js`

**Interfaces:**
- Consumes: なし
- Produces:
  - `slotsForTheme(theme: string|undefined) => { cover: number|null, diagram: number[], cut: number[] }`
  - `normalizeTitleEn(raw: unknown, topicText: string) => [string, string]`
  - `buildFallbackTitleEn(topicText: string) => [string, string]`
  - `clampLines(text: string|undefined, max: number) => string`
  - `stripEmphasis(text: string|undefined) => string`
  - `pickFromCandidates(candidates: {id,url,duration}[], excludeIds: Set<string>, rand?: () => number) => {id,url,duration}|null`
  - `MIN_BROLL_SECONDS: number`（値は 6）

- [ ] **Step 1: 失敗するテストを書く**

Create `scripts/test/reel-editorial.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const {
  slotsForTheme,
  normalizeTitleEn,
  buildFallbackTitleEn,
  clampLines,
  stripEmphasis,
  pickFromCandidates,
  MIN_BROLL_SECONDS,
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
```

- [ ] **Step 2: テストを実行して失敗を確認する**

Run: `cd /c/Users/isesa/sns-automation && node --test scripts/test/reel-editorial.test.js`
Expected: FAIL。`Cannot find module '../reel-editorial'` で全テストが落ちる。

- [ ] **Step 3: 実装を書く**

Create `scripts/reel-editorial.js`:

```js
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
```

- [ ] **Step 4: テストを実行して通ることを確認する**

Run: `cd /c/Users/isesa/sns-automation && node --test scripts/test/reel-editorial.test.js`
Expected: PASS。出力に `# fail 0` が出ること。

- [ ] **Step 5: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add scripts/reel-editorial.js scripts/test/reel-editorial.test.js
git commit -m "$(cat <<'MSG'
feat(wf4): editorialテーマ用の純粋関数モジュールを追加

スロット配分・英語タイトルの正規化とフォールバック・行数クランプ・
強調記号の除去・B-roll候補の選択を、I/Oを持たない関数として切り出した。
node:test で単体テスト済み。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 2: B-roll を Pexels と Pixabay の合流方式にする

**Files:**
- Modify: `scripts/generate-reel.js`（`fetchPexelsVideo` / `fetchPixabayVideo` / `fetchBrollVideos`）

**Interfaces:**
- Consumes: `pickFromCandidates`（Task 1）
- Produces:
  - `listPexelsVideos(keyword: string) => Promise<{id,url,duration}[]>`
  - `listPixabayVideos(keyword: string) => Promise<{id,url,duration}[]>`

現行は Pexels を引いて空振りしたときだけ Pixabay を引くフォールバック方式（`scripts/generate-reel.js` 309行目）。
これを、毎回両方を引いて候補を1つの配列に合流させ、そこから選ぶ方式に変える。

- [ ] **Step 1: モジュールを読み込む行を足す**

`scripts/generate-reel.js` の先頭の require 群の最後に、次の1行を足す。

```js
const { slotsForTheme, normalizeTitleEn, clampLines, stripEmphasis, pickFromCandidates } = require('./reel-editorial');
```

- [ ] **Step 2: 取得関数を「1本返す」から「候補配列を返す」に書き換える**

既存の `fetchPexelsVideo` と `fetchPixabayVideo` の2関数を丸ごと削除し、次の2関数に置き換える。

```js
// 候補を配列で返す。6秒未満の足切りとかぶり除外は合流後に pickFromCandidates でかける。
async function listPexelsVideos(keyword) {
  const key = (process.env.PEXELS_API_KEY || '').trim();
  if (!key) return [];
  try {
    const res = await req(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=portrait`,
      { headers: { Authorization: key } }
    );
    return (res.json?.videos || [])
      .map((v) => {
        const files = (v.video_files || [])
          .filter((f) => f.height && f.height <= 1920)
          .sort((a, b) => b.height - a.height);
        const file = files[0] || (v.video_files || [])[0];
        if (!file || !file.link) return null;
        return { id: `px_${v.id}`, url: file.link, duration: Number(v.duration) || 0 };
      })
      .filter(Boolean);
  } catch (e) {
    console.error('Pexels検索に失敗:', e.message);
    return [];
  }
}

async function listPixabayVideos(keyword) {
  const key = (process.env.PIXABAY_API_KEY || '').trim();
  if (!key) return [];
  try {
    const res = await req(`https://pixabay.com/api/videos/?key=${key}&q=${encodeURIComponent(keyword)}&per_page=30`, {});
    return (res.json?.hits || [])
      .map((v) => {
        const f = (v.videos && (v.videos.medium || v.videos.small || v.videos.large)) || null;
        if (!f || !f.url) return null;
        return { id: `pb_${v.id}`, url: f.url, duration: Number(v.duration) || 0 };
      })
      .filter(Boolean);
  } catch (e) {
    console.error('Pixabay検索に失敗:', e.message);
    return [];
  }
}
```

- [ ] **Step 3: `fetchBrollVideos` の中の探索ループを合流方式にする**

`fetchBrollVideos` の中の次のブロックを探す。

```js
    let found = null;
    for (const kw of keywordChain) {
      found = (await fetchPexelsVideo(kw, excludeIds)) || (await fetchPixabayVideo(kw, excludeIds));
      if (found) break;
    }
```

これに置き換える。

```js
    let found = null;
    for (const kw of keywordChain) {
      // 両方を毎回引いて候補を合流させる。片方が失敗しても、もう一方の候補で成立する。
      const [px, pb] = await Promise.all([listPexelsVideos(kw), listPixabayVideos(kw)]);
      found = pickFromCandidates([...px, ...pb], excludeIds);
      if (found) break;
    }
```

- [ ] **Step 4: 旧関数が残っていないことを確認する**

Run: `cd /c/Users/isesa/sns-automation && grep -n "fetchPexelsVideo\|fetchPixabayVideo" scripts/generate-reel.js`
Expected: 何も出力されない。1件でも残っていたら置き換え漏れなので Step 2 に戻る。

- [ ] **Step 5: 構文エラーがないことを確認する**

Run: `cd /c/Users/isesa/sns-automation && node --check scripts/generate-reel.js`
Expected: 何も出力されず終了コード0。

- [ ] **Step 6: API キーが読めることを確認する**

```bash
cd /c/Users/isesa/sns-automation
node -e "
const fs = require('fs');
const pex = (process.env.PEXELS_API_KEY || fs.readFileSync('C:/Users/isesa/n8n_scripts/pexels_key.txt','utf-8')).trim();
const pix = (process.env.PIXABAY_API_KEY || fs.readFileSync('C:/Users/isesa/n8n_scripts/pixabay_key.txt','utf-8')).trim();
console.log('pexels:', pex.length > 0, 'pixabay:', pix.length > 0);
"
```

Expected: `pexels: true pixabay: true`。読めない場合はここで止めて報告する。
実際の合流の動作確認は Task 7 のドライランで行う。

- [ ] **Step 7: 純粋関数のテストが引き続き通ることを確認する**

Run: `cd /c/Users/isesa/sns-automation && node --test scripts/test/reel-editorial.test.js`
Expected: PASS。`# fail 0`。

- [ ] **Step 8: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add scripts/generate-reel.js
git commit -m "$(cat <<'MSG'
feat(wf4): B-rollをPexelsとPixabayの合流方式にする

空振り時だけPixabayを引くフォールバックをやめ、毎回両方を引いて
候補を1つの配列にまとめてから選ぶようにした。6秒未満の足切りと
かぶり除外は合流後の pickFromCandidates 1か所でかける。
素材の母数が増え、色調を統一したときの見え方が安定する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 3: Remotion の配色トークン

**Files:**
- Create: `remotion/src/editorialTheme.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `EDITORIAL`: グレーディング値と editorial 固有色のオブジェクト
  - `PaletteName = "default" | "editorial"`
  - `Palette`: INK / PAPER / DARK / RED / RED_TEXT / NAVY / YELLOW_MARK / YELLOW_SOLID / VEIL を持つ型
  - `PALETTES: Record<PaletteName, Palette>`
  - `paletteVars(theme?: string) => React.CSSProperties`

- [ ] **Step 1: トークンファイルを書く**

Create `remotion/src/editorialTheme.ts`:

```ts
import React from "react";

// editorialテーマ(sessi.life)のデザイン値はこのファイルだけに書く。
// 色を変えたくなったらここを触る。他のファイルに色リテラルを増やさないこと。

export const EDITORIAL = {
  // どんなB-rollが来ても同じ色に着地させるためのグレーディング
  filter: "saturate(0.85) contrast(0.95) sepia(0.18)",
  warm: "rgba(198,161,132,0.34)",
  topFade: "linear-gradient(180deg, rgba(90,66,50,0.42) 0%, rgba(90,66,50,0) 38%)",
  bottomFade: "linear-gradient(180deg, rgba(60,42,32,0) 78%, rgba(60,42,32,0.30) 100%)",
  // 配色
  TERRA: "#c9755c",
  GOLD: "#f0dd8e",
  LINE: "rgba(255,255,255,0.85)",
  CREAM: "#f6efe6",
  CREAM_VEIL: "rgba(246,239,230,0.72)",
  WARM_INK: "#3a2f28",
  WARM_RED: "#b4553c",
  WARM_RED_TEXT: "#a84a34",
  GOLD_SOLID: "#edd06a",
} as const;

export type PaletteName = "default" | "editorial";

export type Palette = {
  INK: string;
  PAPER: string;
  DARK: string;
  RED: string;
  RED_TEXT: string;
  NAVY: string;
  YELLOW_MARK: string;
  YELLOW_SOLID: string;
  VEIL: string;
};

export const PALETTES: Record<PaletteName, Palette> = {
  default: {
    INK: "#1a1a1a",
    PAPER: "#ffffff",
    DARK: "#2b2b2b",
    RED: "#d92b2b",
    RED_TEXT: "#c62222",
    NAVY: "#16202e",
    YELLOW_MARK: "#ffe94d",
    YELLOW_SOLID: "#ffe500",
    VEIL: "rgba(255,255,255,0.7)",
  },
  editorial: {
    INK: EDITORIAL.WARM_INK,
    PAPER: EDITORIAL.CREAM,
    DARK: EDITORIAL.WARM_INK,
    RED: EDITORIAL.WARM_RED,
    RED_TEXT: EDITORIAL.WARM_RED_TEXT,
    NAVY: EDITORIAL.WARM_INK,
    YELLOW_MARK: EDITORIAL.GOLD,
    YELLOW_SOLID: EDITORIAL.GOLD_SOLID,
    VEIL: EDITORIAL.CREAM_VEIL,
  },
};

// MyVideoのルートに流し込むCSS変数。子孫の var(--ink) 等がこれを拾う。
export const paletteVars = (theme?: string): React.CSSProperties => {
  const p = PALETTES[theme === "editorial" ? "editorial" : "default"];
  return {
    ["--ink" as any]: p.INK,
    ["--paper" as any]: p.PAPER,
    ["--dark" as any]: p.DARK,
    ["--red" as any]: p.RED,
    ["--red-text" as any]: p.RED_TEXT,
    ["--navy" as any]: p.NAVY,
    ["--yellow-mark" as any]: p.YELLOW_MARK,
    ["--yellow-solid" as any]: p.YELLOW_SOLID,
    ["--veil" as any]: p.VEIL,
  };
};
```

- [ ] **Step 2: 型エラーがないことを確認する**

Run: `cd /c/Users/isesa/sns-automation/remotion && npx --yes -p typescript@5.6 tsc --noEmit -p . 2>&1 | grep editorialTheme || echo "editorialTheme.ts にエラーなし"`
Expected: `editorialTheme.ts にエラーなし`。

このリポジトリには着手前から型エラーが5件ある（`RichSlideVideo.tsx` に TS1117 が3件、
`Root.tsx` に TS2503 と TS2339 が1件ずつ）。したがって `tsc` 全体の終了コードは0にならない。
確認するのは「自分が触ったファイルにエラーが出ていないこと」だけ。既存のエラーは直さない。
また TypeScript は `npx --yes -p typescript@5.6` で一時的に取得する。
**`npm install typescript` をしてはいけない。** パッケージ追加禁止の制約に反する。

- [ ] **Step 3: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add remotion/src/editorialTheme.ts
git commit -m "$(cat <<'MSG'
feat(wf4): editorialテーマの配色トークンを追加

グレーディング値と配色をこのファイル1か所にまとめ、
既定パレットとeditorialパレットをCSS変数として出せるようにした。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 4: 表紙と実写カットのコンポーネント

**Files:**
- Create: `remotion/src/EditorialScenes.tsx`
- Modify: `remotion/src/Root.tsx`

**Interfaces:**
- Consumes: `EDITORIAL`（Task 3）
- Produces:
  - `EditorialCover: React.FC<{ video?: string; titleEn?: string[]; headline?: string }>`
  - `EditorialCut: React.FC<{ video?: string; titleEn?: string[]; headline?: string }>`

数値は仕様書の「型①」「型②」の通り。位置・色・余白は props にしない。

- [ ] **Step 1: コンポーネントを書く**

Create `remotion/src/EditorialScenes.tsx`:

```tsx
import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadMaru } from "@remotion/google-fonts/ZenMaruGothic";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import { EDITORIAL } from "./editorialTheme";

const { fontFamily: MARU } = loadMaru();
const { fontFamily: SERIF } = loadPlayfair();

// 行数の上限を超えた行は縮小もはみ出しもさせず、単に捨てる
const lines = (text: string | undefined, max: number) =>
  String(text || "")
    .split("\n")
    .slice(0, max);

// B-rollに固定のグレーディングをかける層。どの素材でも同じ色に着地させる
const Graded: React.FC<{ video?: string; zoomTo: number }> = ({ video, zoomTo }) => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 999], [1, zoomTo], { extrapolateRight: "clamp" });
  return (
    <>
      {video ? (
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", transform: `scale(${zoom})` }}>
          <OffthreadVideo
            src={staticFile(video)}
            muted
            loop
            style={{ width: "100%", height: "100%", objectFit: "cover", filter: EDITORIAL.filter }}
          />
        </div>
      ) : null}
      <AbsoluteFill style={{ backgroundColor: EDITORIAL.warm }} />
      <AbsoluteFill style={{ background: EDITORIAL.topFade }} />
      <AbsoluteFill style={{ background: EDITORIAL.bottomFade }} />
    </>
  );
};

// 表紙(0番スロット)。グリッドに並ぶ顔になるので、この型は絶対に崩さない
export const EditorialCover: React.FC<{ video?: string; titleEn?: string[]; headline?: string }> = ({
  video,
  titleEn,
  headline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const en = spring({ frame: frame - 6, fps, config: { damping: 200, stiffness: 100 } });
  const box = spring({ frame: frame - 12, fps, config: { damping: 200, stiffness: 100 } });
  const en1 = (titleEn && titleEn[0]) || "";
  const en2 = (titleEn && titleEn[1]) || "";
  return (
    <>
      <Graded video={video} zoomTo={1.06} />
      <div style={{ position: "absolute", left: 539, top: 0, width: 2, height: 540, background: EDITORIAL.LINE }} />
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 540,
          bottom: 346,
          border: `2px solid ${EDITORIAL.LINE}`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 670,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: 104,
          lineHeight: 1.1,
          color: "#ffffff",
          opacity: en,
          transform: `translateY(${(1 - en) * -18}px)`,
        }}
      >
        {en1}
      </div>
      <div
        style={{
          position: "absolute",
          left: 122,
          right: 122,
          top: 806,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontWeight: 600,
          fontSize: 112,
          lineHeight: 1.1,
          color: EDITORIAL.GOLD,
          opacity: en,
          transform: `translateY(${(1 - en) * -18}px)`,
        }}
      >
        {en2}
      </div>
      <div
        style={{
          position: "absolute",
          left: 223,
          right: 223,
          top: 1066,
          opacity: box,
          transform: `translateY(${(1 - box) * 24}px)`,
        }}
      >
        <div style={{ background: EDITORIAL.TERRA, padding: "54px 36px", textAlign: "center" }}>
          {lines(headline, 3).map((line, i) => (
            <div
              key={i}
              style={{ fontFamily: MARU, fontWeight: 900, fontSize: 54, lineHeight: 1.62, color: "#ffffff" }}
            >
              {line}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 56,
            textAlign: "center",
            fontFamily: SERIF,
            fontSize: 68,
            lineHeight: 1,
            color: "#ffffff",
          }}
        >
          ✳
        </div>
      </div>
    </>
  );
};

// 実写カット。表紙が「中央に箱」なのに対し、こちらは「下三分の一に横帯」
export const EditorialCut: React.FC<{ video?: string; titleEn?: string[]; headline?: string }> = ({
  video,
  titleEn,
  headline,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 150, mass: 0.6 } });
  const label = (titleEn && titleEn[0]) || "";
  return (
    <>
      <Graded video={video} zoomTo={1.08} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 150,
          textAlign: "center",
          fontFamily: SERIF,
          fontStyle: "italic",
          fontSize: 44,
          letterSpacing: "0.18em",
          color: "rgba(255,255,255,0.9)",
          opacity: s,
        }}
      >
        {label}
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1180,
          height: 140,
          background: "linear-gradient(180deg, rgba(40,28,22,0) 0%, rgba(40,28,22,0.35) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 1320,
          height: 300,
          background: EDITORIAL.TERRA,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 90px",
          opacity: s,
          transform: `translateY(${(1 - s) * 24}px)`,
        }}
      >
        <div style={{ textAlign: "center" }}>
          {lines(headline, 2).map((line, i) => (
            <div
              key={i}
              style={{ fontFamily: MARU, fontWeight: 900, fontSize: 76, lineHeight: 1.35, color: "#ffffff" }}
            >
              {line}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};
```

- [ ] **Step 2: 目視確認用のプレビュー用コンポジションを Root.tsx に追加する**

`Still` は使わない。`Still` は `durationInFrames` が1に固定されるため `--frame=45` が
`RangeError` になり、そもそも `spring()` の入りが終わっていないフレームしか描けない。
`Composition` にして、入りが終わったフレームを書き出す。

`remotion/src/Root.tsx` の import 群の最後に足す。

```tsx
import { EditorialCover, EditorialCut } from "./EditorialScenes";
```

`<Still id="Thumbnail" ... />` の閉じタグの直後、`</>` の直前に次を足す。

```tsx
    <Composition
      id="EditorialCoverStill"
      durationInFrames={90}
      fps={30}
      component={EditorialCover}
      width={1080}
      height={1920}
      defaultProps={{
        titleEn: ["Winter Night", "Skin Routine"],
        headline: "乾燥する夜に\nやめた3つのこと",
      }}
    />
    <Composition
      id="EditorialCutStill"
      durationInFrames={90}
      fps={30}
      component={EditorialCut}
      width={1080}
      height={1920}
      defaultProps={{
        titleEn: ["Winter Night", "Skin Routine"],
        headline: "化粧水は\n重ねなくていい",
      }}
    />
```

- [ ] **Step 3: 出力先フォルダを用意する**

Run: `cd /c/Users/isesa/sns-automation && mkdir -p tmp_preview`
Expected: エラーなし。

- [ ] **Step 4: 表紙の静止画を書き出す**

```bash
cd /c/Users/isesa/sns-automation/remotion
npx remotion still src/index.ts EditorialCoverStill ../tmp_preview/editorial_cover.png --frame=45
```

Expected: `tmp_preview/editorial_cover.png` が 1080×1920 で生成される。
`--frame=45` なので入りのアニメーションは終わっていて、文字が完全に出ている。
このプレビューには背景動画を渡していないため、地は暗いままになる。それでよい。
ここで見るのは配置と文字の収まりであって、色の最終確認は Task 7 で実素材を入れてから行う。

- [ ] **Step 5: 実写カットの静止画を書き出す**

```bash
cd /c/Users/isesa/sns-automation/remotion
npx remotion still src/index.ts EditorialCutStill ../tmp_preview/editorial_cut.png --frame=45
```

Expected: `tmp_preview/editorial_cut.png` が生成される。

- [ ] **Step 6: 2枚を目視で確認する**

両方の png を開いて次を確認する。1つでも外れていたら `EditorialScenes.tsx` の数値を直して Step 4 からやり直す。

- 表紙: 縦線が中央にあり、内枠の天辺（top 540）に当たっている
- 表紙: 英語2行が内枠の中に収まり、2行目が金色（`#f0dd8e`）になっている
- 表紙: テラコッタ箱と星が内枠の下辺（1920 - 346 = 1574）を越えていない
- 実写カット: 帯が 1320 から 1620 に収まり、その下に余白が残っている
- 両方: 文字がフレームの左右からはみ出していない
- 両方: 英語が斜体になっている

英語が斜体にならない場合、`loadFont()` が italic の字形を読み込めていない。
`EditorialScenes.tsx` の Playfair の読み込みを次に変えてから Step 4 からやり直す。

```tsx
const { fontFamily: SERIF } = loadPlayfair("normal", { weights: ["500", "600"], subsets: ["latin"] });
```

それでも斜体にならない場合は `fontStyle: "italic"` が効いていないので、
各テキストに `fontSynthesis: "style"` を足す。

- [ ] **Step 7: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add remotion/src/EditorialScenes.tsx remotion/src/Root.tsx
git commit -m "$(cat <<'MSG'
feat(wf4): editorialの表紙と実写カットのコンポーネントを追加

表紙は全面B-roll+白線の内枠+セリフ体英語2行+テラコッタ箱+星。
実写カットは下三分の一のテラコッタ帯。どちらも位置と色をpropsにせず、
受け取るのは背景動画・英語2行・日本語だけにした。
目視確認用のStillを2つRoot.tsxに追加。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 5: MyVideo.tsx にテーマを通す

**Files:**
- Modify: `remotion/src/MyVideo.tsx`

**Interfaces:**
- Consumes: `paletteVars`（Task 3）、`EditorialCover` / `EditorialCut`（Task 4）
- Produces: `Scene` に `type: "cover"` と `titleEn?: string[]`、`Props` に `theme?: string`

配色は CSS 変数で差し替える。各ヘルパーコンポーネントに palette を引数で配って回らない。

- [ ] **Step 1: 色定数を CSS 変数に置き換える**

`remotion/src/MyVideo.tsx` の21〜28行目にある8つの定数を、次の9行に置き換える。

```ts
// 実際の値は editorialTheme.ts の PALETTES にあり、MyVideoのルートで流し込む
const INK = "var(--ink)";
const PAPER = "var(--paper)";
const DARK = "var(--dark)";
const RED = "var(--red)";
const RED_TEXT = "var(--red-text)";
const NAVY = "var(--navy)";
const YELLOW_MARK = "var(--yellow-mark)";
const YELLOW_SOLID = "var(--yellow-solid)";
const VEIL = "var(--veil)";
```

- [ ] **Step 2: import を足す**

`import { LineIcon } from "./LineIcons";` の下に足す。

```ts
import { paletteVars } from "./editorialTheme";
import { EditorialCover, EditorialCut } from "./EditorialScenes";
```

- [ ] **Step 3: 型を広げる**

`Scene` 型と `Props` 型を次のように書き換える。

```ts
export type Scene = {
  type: "diagram" | "cut" | "cover";
  layout?: "flow3" | "iconsteps" | "reject"; // diagram型のみ
  title?: string; // diagram型の大見出し(**強調**可)
  points?: Point[]; // diagram型の中身
  headline?: string; // cut/cover型の大きな一文(**強調**可)
  titleEn?: string[]; // cover/cut型の英語2行(editorialテーマのみ)
  narration: string; // 字幕バーの文言(=音声原稿)
  video?: string; // 実写(public相対)
  audio: string;
  durationInSeconds: number;
  pose?: string;
  se?: string;
};

type Props = {
  scenes: Scene[];
  chibi?: boolean;
  theme?: string; // "editorial" のとき配色と表紙/実写カットの型が変わる
};
```

- [ ] **Step 4: 図解シーンの白ベールを変数にする**

`DiagramSceneView` の中の次の行を探す。

```tsx
          <AbsoluteFill style={{ backgroundColor: "rgba(255,255,255,0.7)" }} />
```

これに置き換える。

```tsx
          <AbsoluteFill style={{ backgroundColor: VEIL }} />
```

- [ ] **Step 5: SceneView にテーマ分岐を入れる**

`SceneView` を丸ごと次に置き換える。

```tsx
const SceneView: React.FC<{ scene: Scene; durationInFrames: number; chibi?: boolean; theme?: string }> = ({
  scene,
  durationInFrames,
  chibi,
  theme,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, durationInFrames - FADE_FRAMES, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  const subOpacity = interpolate(frame, [10, 18], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const editorial = theme === "editorial";
  const onPhoto = scene.type === "cut" || scene.type === "cover";

  return (
    <AbsoluteFill style={{ opacity, backgroundColor: onPhoto ? "#000" : PAPER }}>
      {scene.audio ? <Audio src={staticFile(scene.audio)} /> : null}
      {scene.se ? <Audio src={staticFile(`se/${scene.se}.mp3`)} volume={0.55} /> : null}

      {scene.type === "cover" ? (
        <>
          <EditorialCover video={scene.video} titleEn={scene.titleEn} headline={scene.headline} />
          <CaptionBar text={scene.narration} opacity={subOpacity} />
        </>
      ) : scene.type === "cut" ? (
        editorial ? (
          <>
            <EditorialCut video={scene.video} titleEn={scene.titleEn} headline={scene.headline} />
            <CaptionBar text={scene.narration} opacity={subOpacity} />
          </>
        ) : (
          <CutSceneView scene={scene} frame={frame} fps={fps} subOpacity={subOpacity} />
        )
      ) : (
        <DiagramSceneView scene={scene} frame={frame} fps={fps} subOpacity={subOpacity} />
      )}

      {chibi && scene.audio ? <ChibiOverlay audioSrc={scene.audio} pose={scene.pose as ChibiPose | undefined} /> : null}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 6: MyVideo 本体で palette を流し込む**

`MyVideo` を丸ごと次に置き換える。

```tsx
export const MyVideo: React.FC<Props> = ({ scenes, chibi, theme }) => {
  let startFrame = 0;
  const items = scenes.map((scene, i) => {
    const durationInFrames = Math.round(scene.durationInSeconds * FPS);
    const from = startFrame;
    startFrame += durationInFrames;
    return (
      <Sequence key={i} from={from} durationInFrames={durationInFrames}>
        <SceneView scene={scene} durationInFrames={durationInFrames} chibi={chibi} theme={theme} />
      </Sequence>
    );
  });

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER, ...paletteVars(theme) }}>
      <Audio src={staticFile("bgm.mp3")} loop volume={0.12} />
      {items}
    </AbsoluteFill>
  );
};
```

- [ ] **Step 7: 型エラーがないことを確認する**

Run: `cd /c/Users/isesa/sns-automation/remotion && npx --yes -p typescript@5.6 tsc --noEmit -p . 2>&1 | grep MyVideo || echo "MyVideo.tsx にエラーなし"`
Expected: `MyVideo.tsx にエラーなし`。

このリポジトリには着手前から型エラーが5件ある（`RichSlideVideo.tsx` に TS1117 が3件、
`Root.tsx` に TS2503 と TS2339 が1件ずつ）。`tsc` 全体の終了コードは0にならない。
確認するのは自分が触ったファイルだけ。既存のエラーは直さない。
TypeScript は `npx --yes -p typescript@5.6` で一時的に取得する。
**`npm install typescript` をしてはいけない。**

- [ ] **Step 8: 既定テーマが今までと同じ見た目のままかを確認する**

Create `tmp_preview/props_default.json`:

```json
{
  "scenes": [
    {
      "type": "diagram",
      "layout": "iconsteps",
      "title": "夜のケアを**3つ**に絞る",
      "points": [
        { "text": "落とす", "icon": "check_circle" },
        { "text": "うるおす", "icon": "lightbulb" },
        { "text": "ふたをする", "icon": "target" }
      ],
      "narration": "夜のケアを三つに絞ってから、肌の調子が安定しました。",
      "audio": "",
      "durationInSeconds": 5
    }
  ]
}
```

```bash
cd /c/Users/isesa/sns-automation/remotion
npx remotion still src/index.ts MyVideo ../tmp_preview/check_default.png --props=../tmp_preview/props_default.json --frame=40
```

Expected: 白背景・黒文字・黄色マーカー・ネイビーの字幕バー。従来と同じ見た目。
背景がクリームになっていたら CSS 変数の流し込みが間違っているので Step 6 に戻る。

- [ ] **Step 9: editorial テーマの3種類を確認する**

Create `tmp_preview/props_editorial.json`:

```json
{
  "theme": "editorial",
  "scenes": [
    {
      "type": "cover",
      "headline": "乾燥する夜に\nやめた3つのこと",
      "titleEn": ["Winter Night", "Skin Routine"],
      "narration": "乾燥がつらい夜に、やめたことが三つあります。",
      "audio": "",
      "durationInSeconds": 4.5
    },
    {
      "type": "cut",
      "headline": "化粧水は\n重ねなくていい",
      "titleEn": ["Winter Night", "Skin Routine"],
      "narration": "化粧水は重ねなくていいんです。",
      "audio": "",
      "durationInSeconds": 4
    },
    {
      "type": "diagram",
      "layout": "iconsteps",
      "title": "夜のケアを**3つ**に絞る",
      "points": [
        { "text": "落とす", "icon": "check_circle" },
        { "text": "うるおす", "icon": "lightbulb" },
        { "text": "ふたをする", "icon": "target" }
      ],
      "narration": "夜のケアを三つに絞ってから、肌の調子が安定しました。",
      "audio": "",
      "durationInSeconds": 5
    }
  ]
}
```

シーン境界は 4.5秒＝135フレーム、次が 4秒＝120フレーム。よって表紙は 0〜134、
実写カットは 135〜254、図解は 255〜404。

```bash
cd /c/Users/isesa/sns-automation/remotion
npx remotion still src/index.ts MyVideo ../tmp_preview/check_ed_cover.png --props=../tmp_preview/props_editorial.json --frame=60
npx remotion still src/index.ts MyVideo ../tmp_preview/check_ed_cut.png --props=../tmp_preview/props_editorial.json --frame=200
npx remotion still src/index.ts MyVideo ../tmp_preview/check_ed_diagram.png --props=../tmp_preview/props_editorial.json --frame=330
```

Expected: 1枚目が表紙、2枚目が実写カット、3枚目が図解。図解の地色がクリーム（`#f6efe6`）、
線と文字が暖色の濃茶（`#3a2f28`）、字幕バーも同じ濃茶になっていること。3枚の色調が地続きに見えること。

- [ ] **Step 10: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add remotion/src/MyVideo.tsx
git commit -m "$(cat <<'MSG'
feat(wf4): MyVideoにeditorialテーマを通す

色定数をCSS変数に置き換え、ルートでパレットを流し込む方式にした。
cover型を追加し、editorialのときだけ表紙と実写カットを新しい型に分岐させる。
図解のベールも変数化したので、クリーム地とB-rollの色が揃う。
既定テーマの出力は変わらない。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 6: generate-reel.js を editorial 対応にする

**Files:**
- Modify: `scripts/generate-reel.js`

**Interfaces:**
- Consumes: `slotsForTheme`, `normalizeTitleEn`, `clampLines`, `stripEmphasis`（Task 2 で require 済み）
- Produces: `remotion_props.json` に `theme` と、cover / cut シーンの `titleEn` が載る

- [ ] **Step 1: `assignDiagramLayouts` を枠数引数に変える**

既存の `assignDiagramLayouts()` を丸ごと次に置き換える。

```js
// diagramスロットのlayoutと必要ポイント数を、枠数ぶん偏りなく事前に割り当てる(直前と同じlayoutは避ける)
function assignDiagramLayouts(slotCount) {
  const options = [
    { layout: 'iconsteps', pointCount: 4 },
    { layout: 'flow3', pointCount: 3 },
    { layout: 'reject', pointCount: 2 },
    { layout: 'iconsteps', pointCount: 3 },
    { layout: 'flow3', pointCount: 2 },
  ];
  const result = [];
  let prev = null;
  const pool = [...options];
  for (let i = 0; i < slotCount; i++) {
    const candidates = pool.filter((o) => o.layout !== prev);
    const list = candidates.length ? candidates : pool;
    const idx = Math.floor(Math.random() * list.length);
    const chosen = list[idx];
    pool.splice(pool.indexOf(chosen), 1);
    result.push(chosen);
    prev = chosen.layout;
  }
  return result;
}
```

- [ ] **Step 2: `buildStructureDoc` をスロット配分から組むようにする**

既存の `buildStructureDoc(diagramLayouts)` を丸ごと次に置き換える。
表紙がある場合は directives の先頭を表紙が担い、図解は2番目以降を使う。

```js
function buildStructureDoc(diagramLayouts, slots) {
  // 「フェーズ名」のような名詞ラベルを渡すとAIがそれをそのままtitleにコピーしてしまうため、
  // 必ず具体的な指示文(動詞で終わる文)にする
  const directives = [
    '今日のテーマに関する、具体的でリアルな悩みの一場面(いつ・どこで・何をしていた時か)を提示する内容にする',
    'その悩みは自分だけじゃないと気づかせる、共感できる具体的な視点を書く',
    '考え方が変わった瞬間・気づきのきっかけを具体的に書く',
    '今日から実践できる具体的な手順・行動を書く',
    '内容全体を踏まえた前向きな一言と、保存・フォローへの自然な誘いを書く',
  ];
  const hasCover = slots.cover !== null;
  const coverDoc = hasCover
    ? `- coverシーン(scenes[${slots.cover}]): ${directives[0]}。これは動画の表紙で、グリッドに並ぶ顔になる。` +
      `日本語の見出し(headline)は必ず2行か3行、1行10〜14字、**強調**は使わない。` +
      `英語2行(title_en)は2要素の配列で、各要素は英字とスペースのみ12文字以内。内容の飾りなので雰囲気が合っていれば十分。` +
      `ナレーション(narration)は必ず25〜40文字。実写検索キーワード(stockQuery、英語2〜4語)も付ける\n`
    : '';
  const diagramDirectives = hasCover ? directives.slice(1) : directives;
  const diagramDocs = diagramLayouts
    .map((d, i) => {
      const slot = slots.diagram[i];
      const directive = diagramDirectives[i] || diagramDirectives[diagramDirectives.length - 1];
      if (d.layout === 'reject') {
        return `- diagramシーン(scenes[${slot}]): ${directive}。points2個。1個目は「これは○○の話ではありません」という否定+icon+note、2個目は本当に伝えたいこと(**強調**1箇所)+icon。ナレーション(narration)は必ず35〜50文字。背景にうっすら流す実写のstockQuery(英語2〜4語)も付ける`;
      }
      return `- diagramシーン(scenes[${slot}]): ${directive}。points${d.pointCount}個。各pointは{text(2行以内・具体的な一言), icon}${d.layout === 'flow3' ? '、note(補足1行、最後のpointは**強調**可)' : ''}。ナレーション(narration)は必ず35〜50文字、単語だけの短い一言にしない。背景にうっすら流す実写のstockQuery(英語2〜4語)も付ける`;
    })
    .join('\n');
  // 表紙があるときだけ「直前のシーン」に一般化する。表紙が無い5アカウントは
  // 直前が必ずdiagramなので、元の文言をそのまま使ってプロンプトを変えない。
  const cutLead = hasCover ? '直前のシーンの内容' : '直前のdiagramの内容';
  const cutDocs = slots.cut
    .map(
      (slot) =>
        `- cutシーン(scenes[${slot}]): ${cutLead}を一言で言い切る強い見出し(headline、改行可、**強調**1箇所)+ナレーション(narration、必ず20〜30文字。単語だけの短い一言にしない)+実写検索キーワード(stockQuery、英語2〜4語)`
    )
    .join('\n');
  return `${coverDoc}${diagramDocs}\n${cutDocs}\n\n各diagramのtitleは、上の指示内容そのもの・カテゴリ名(「導入」「まとめ」等)ではなく、そのシーンで実際に話す具体的な内容を表す8〜16字の見出し(体言止めや短い断言)にすること。`;
}
```

- [ ] **Step 3: `generateScenario` の冒頭をテーマ対応にする**

`async function generateScenario(systemPrompt) {` から `const structureDoc = ...` までの3行を、次に置き換える。

```js
async function generateScenario(systemPrompt, theme) {
  const slots = slotsForTheme(theme);
  const diagramLayouts = assignDiagramLayouts(slots.diagram.length);
  const structureDoc = buildStructureDoc(diagramLayouts, slots);
  const coverShape =
    slots.cover === null
      ? ''
      : `coverは{"headline":"...","title_en":["...","..."],"narration":"...","stockQuery":"..."}、`;
  const jsonShape = `{"caption":"投稿文","scenes":[9個。${coverShape}diagramは{"title":"...","narration":"...","points":[{"text":"...","icon":"...","note":"..."(任意)}],"stockQuery":"..."}、cutは{"headline":"...","narration":"...","stockQuery":"..."}],"chibi_poses":[9個の文字列],"se":[9個の「文字列またはnull」]}`;
```

- [ ] **Step 4: プロンプトの JSON 形の行を差し替える**

`messages` の `content` の末尾にある、`{"caption":"投稿文","scenes":[9個。diagramは` で始まる文字列リテラルの行を、次の1行に置き換える。

```js
        jsonShape,
```

- [ ] **Step 5: シーン組み立てで cover を作る**

`const scenes = Array.from({ length: SCENE_COUNT }, (_, i) => {` から、対応する `});` までを丸ごと次に置き換える。

```js
  const scenes = Array.from({ length: SCENE_COUNT }, (_, i) => {
    const raw = rawScenes[i] || {};
    if (slots.cover !== null && i === slots.cover) {
      const headline = clampLines(stripEmphasis(String(raw.headline || '').trim()), 3) || 'きょうの話';
      const narration = String(raw.narration || '').trim() || '今日はこんな話をします。';
      return {
        type: 'cover',
        headline,
        titleEn: normalizeTitleEn(raw.title_en, `${headline} ${narration}`),
        narration,
        stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
      };
    }
    if (slots.diagram.includes(i)) {
      const layoutInfo = diagramLayouts[slots.diagram.indexOf(i)];
      const points = (Array.isArray(raw.points) ? raw.points : [])
        .map((p) => ({
          text: String((p && p.text) || '').trim(),
          icon: ICON_NAMES.includes(p && p.icon) ? p.icon : 'check_circle',
          note: p && p.note ? String(p.note).trim() : undefined,
        }))
        .filter((p) => p.text)
        .slice(0, layoutInfo.layout === 'iconsteps' ? 4 : layoutInfo.pointCount);
      return {
        type: 'diagram',
        layout: layoutInfo.layout,
        title: String(raw.title || '').trim() || 'きょうの話',
        points,
        narration: String(raw.narration || '').trim() || '今日はこんな話をします。',
        stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
      };
    }
    const cutHeadline = String(raw.headline || '').trim() || 'きょうのポイント';
    return {
      type: 'cut',
      // editorialの帯は黄色ベタの強調が使えないので記号を外し、2行に収める
      headline: theme === 'editorial' ? clampLines(stripEmphasis(cutHeadline), 2) : cutHeadline,
      narration: String(raw.narration || '').trim() || 'きょうのポイントです。',
      stockQuery: String(raw.stockQuery || '').trim() || 'japan lifestyle',
    };
  });

  // 実写カットの上部ラベルは表紙の英語1行目を使い回す。1本の中で英語がぶれないようにする
  const coverScene = slots.cover === null ? null : scenes[slots.cover];
  if (coverScene) {
    for (const sc of scenes) {
      if (sc.type === 'cut') sc.titleEn = coverScene.titleEn;
    }
  }
```

- [ ] **Step 6: renderVideo にテーマと titleEn を渡す**

`renderVideo` の宣言から `fs.writeFileSync(propsPath, ...)` の行までを、次に置き換える。
それ以降（BGM・効果音・ちびキャラのコピーとレンダリング呼び出し）はそのまま残す。

```js
function renderVideo(scenarioScenes, videoBySlot, audioPaths, outDir, useChibi, chibiPoses, seChoices, theme) {
  const scenes = scenarioScenes.map((sc, i) => {
    const audio = audioPaths[i] && fs.existsSync(audioPaths[i]) ? path.basename(audioPaths[i]) : '';
    const audioDur = audio ? getAudioDuration(audioPaths[i]) : null;
    // coverは4.5秒、cutは4秒に寄せる。diagramは音声長+図解を読む余白
    const minDuration =
      sc.type === 'cover' ? 4.5 : sc.type === 'cut' ? 4.0 : (sc.points || []).length >= 3 ? 7.0 : 5.5;
    return {
      type: sc.type,
      layout: sc.layout,
      title: sc.title,
      points: sc.points,
      headline: sc.headline,
      titleEn: sc.titleEn,
      narration: sc.narration || '',
      video: videoBySlot[i] || undefined,
      audio,
      durationInSeconds: Math.max(minDuration, audioDur || minDuration),
      pose: (chibiPoses && chibiPoses[i]) || 'default',
      se: (seChoices && seChoices[i]) || null,
    };
  });
  const propsPath = path.join(outDir, 'remotion_props.json');
  fs.writeFileSync(propsPath, JSON.stringify({ scenes, chibi: Boolean(useChibi), theme: theme || undefined }), 'utf-8');
```

- [ ] **Step 7: 呼び出し側を直す**

`generateScenario(systemPrompt)` の呼び出しを次に変える。

```js
  const scenario = await generateScenario(systemPrompt, persona.theme);
```

`renderVideo(...)` の呼び出し（656行目付近）を次に変える。

```js
  const videoPath = renderVideo(
    scenario.scenes,
    videoBySlot,
    audioPaths,
    outDir,
    persona.chibi,
    scenario.chibiPoses,
    scenario.seChoices,
    persona.theme
  );
```

- [ ] **Step 8: 構文エラーがないことを確認する**

Run: `cd /c/Users/isesa/sns-automation && node --check scripts/generate-reel.js`
Expected: 何も出力されず終了コード0。

- [ ] **Step 9: 旧シグネチャの呼び出しが残っていないことを確認する**

Run: `cd /c/Users/isesa/sns-automation && grep -n "generateScenario(systemPrompt)\|assignDiagramLayouts()\|buildStructureDoc(diagramLayouts)" scripts/generate-reel.js`
Expected: 何も出力されない。残っていたら Step 3 と Step 7 に戻る。

- [ ] **Step 10: 純粋関数のテストが引き続き通ることを確認する**

Run: `cd /c/Users/isesa/sns-automation && node --test scripts/test/reel-editorial.test.js`
Expected: PASS。`# fail 0`。

- [ ] **Step 11: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add scripts/generate-reel.js
git commit -m "$(cat <<'MSG'
feat(wf4): 台本生成をeditorialテーマに対応させる

editorialのとき0番スロットを表紙(cover)にし、図解を4枠に減らす。
シーン総数は9のまま。Groqに英語2行を出させ、外れたら固定表に落とす。
表紙の英語1行目は実写カットにも配り、1本の中で英語をぶらさない。
remotion_props.jsonにthemeとtitleEnを載せる。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

### Task 7: sessi.life を有効にして通しで確認する

**Files:**
- Modify: `data/wf4_accounts.json`

**Interfaces:**
- Consumes: Task 1〜6 のすべて
- Produces: なし（最終確認）

- [ ] **Step 1: sessi_life にテーマを付ける**

`data/wf4_accounts.json` の `sessi_life` の `"gender": "female"` の行を、次の2行に変える。

```json
    "gender": "female",
    "theme": "editorial"
```

- [ ] **Step 2: JSON が壊れていないことを確認する**

Run: `cd /c/Users/isesa/sns-automation && node -e "const a=require('./data/wf4_accounts.json'); console.log(a.sessi_life.theme, Object.keys(a).length, Object.entries(a).filter(([k,v])=>v.theme).map(([k])=>k).join(','))"`
Expected: `editorial 6 sessi_life`。テーマが付いているのが sessi_life だけであること。

- [ ] **Step 3: 投稿せずに1本作る**

VOICEVOX エンジンを起動した状態で実行する。`generate-reel.js` は投稿まで進むため、
投稿呼び出しの直前に一時的に `process.exit(0);` を入れてから実行する。この一時変更は Step 8 で必ず戻す。

```bash
cd /c/Users/isesa/sns-automation
node scripts/generate-reel.js sessi_life
```

Expected: 標準出力に `video rendered:` とパスが出て mp4 が生成される。
失敗した場合はエラーを読み、該当タスクに戻る。

- [ ] **Step 4: 生成された props を確認する**

`video rendered:` に出たパスと同じフォルダの `remotion_props.json` を指定して実行する。

```bash
cd /c/Users/isesa/sns-automation
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync(process.argv[1], 'utf-8'));
console.log('theme:', j.theme);
console.log(j.scenes.map((s, i) => i + ':' + s.type).join(' '));
console.log('titleEn:', JSON.stringify(j.scenes[0].titleEn));
console.log('cover headline lines:', String(j.scenes[0].headline).split(String.fromCharCode(10)).length);
" <remotion_props.jsonのパス>
```

Expected:
- `theme: editorial`
- `0:cover 1:cut 2:diagram 3:cut 4:diagram 5:cut 6:diagram 7:cut 8:diagram`
- `titleEn` が2要素の英字配列
- `cover headline lines` が 3 以下

- [ ] **Step 5: 動画を目視で確認する**

生成された mp4 を開いて次を確認する。

- 1シーン目が表紙の型になっていて、先頭フレームがグリッドの顔として成立している
- 実写カットのテラコッタ帯が字幕バーと重なっていない
- 図解シーンがクリーム地で、実写シーンと色が地続きに見える
- キャラクターが出ていない
- 全編を通して色がベージュ〜テラコッタに揃っている

- [ ] **Step 6: tatsu.insta_ai と並べて見比べて詰める**

表紙のフレームを書き出し、tatsu.insta_ai のグリッドと並べて次を比べる。
合わない場合は `remotion/src/editorialTheme.ts` の値だけを触って Step 3 からやり直す。他のファイルは触らない。

- 暖色の濃さ（`EDITORIAL.warm` の不透明度 0.34）
- 内枠の余白（`left/right 122`、`top 540`、`bottom 346`）
- 英語と日本語の文字サイズ（104 / 112 / 54）

**ここで聖さんの承認を取る。承認が出るまで本番投稿しない。**

- [ ] **Step 7: 他の5アカウントが変わっていないことを確認する**

```bash
cd /c/Users/isesa/sns-automation
node scripts/generate-reel.js satoshi_mindset
```

Expected: 生成された `remotion_props.json` に `theme` が無く、0番シーンが `diagram` であること。
動画が白背景・黒文字・黄色マーカー・ネイビーの字幕バー・ちびキャラ付きで、従来と同じ見た目であること。

- [ ] **Step 8: 一時的に入れた `process.exit(0)` を戻す**

Run: `cd /c/Users/isesa/sns-automation && git diff scripts/generate-reel.js`
Expected: 差分なし。Step 3 で入れた一時変更が残っていないこと。残っていたら消してから再度確認する。

- [ ] **Step 9: コミットする**

```bash
cd /c/Users/isesa/sns-automation
git add data/wf4_accounts.json
git commit -m "$(cat <<'MSG'
feat(wf4): sessi_lifeにeditorialテーマを有効化する

このアカウントだけ表紙と実写カットが新しい型になり、配色が暖色に揃う。
他5アカウントはtheme無指定なので出力は変わらない。
やめるときはこの1行を消せば元に戻る。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
MSG
)"
```

---

## ロールバック手順

`data/wf4_accounts.json` の `sessi_life` から `"theme": "editorial"` の1行を消す。
コードは残るが選ばれなくなり、6アカウント全部が従来の見た目に戻る。

## 仕様書との対応

| 仕様書の節 | 対応するタスク |
|---|---|
| トークン | Task 3 |
| 型①: カバー | Task 4・Task 5 |
| 型②: 実写カット | Task 4・Task 5 |
| 図解シーンの調整 | Task 3（パレット）・Task 5 Step 4（ベール） |
| キャラクター（出さない） | 実装なし。`chibi` を付けないため。Task 7 Step 5 で不在を確認する |
| スロット配分 | Task 1・Task 6 Step 1-3 |
| 英語タイトルの生成 | Task 1（フォールバック）・Task 6 Step 2-5（プロンプトと正規化） |
| B-roll の取得 | Task 2 |
| 切り替えとロールバック | Task 7 Step 1・ロールバック手順 |
| 検証 | Task 4 Step 6・Task 5 Step 8-9・Task 7 Step 4-7 |
