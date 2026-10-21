// WF4: 6アカウント分を順番に実行(各アカウントは内部で3日おき判定をしてスキップする)
const path = require('path');
const { execFileSync } = require('child_process');

// satoshi_mind_coachingは2026-08-05から「ハッとしたんだよね」専用ワークフロー(wf-hitmehard.yml)に置き換え済み
// ise_sato_kosodate は2026-10-21から朝7〜8時にランダム投稿する専用ワークフロー(wf4-kosodate-quote.yml)に移したため、ここには入れない
const ACCOUNTS = [
  'satoshi_mindset',
  'sessi_life',
  'ise_kenkou_otaku',
  'tabi_life_design',
];

// WF4_ONLYが指定されていればそのアカウントだけ実行する（テスト用）
const targets = process.env.WF4_ONLY ? ACCOUNTS.filter((a) => a === process.env.WF4_ONLY) : ACCOUNTS;

// "format": "clip-quote" は3秒クリップ+中央字幕+ナレーション(generate-clip-quote.js)。
// "format": "list-slides" のアカウントは「長押しして読む」リスト解説リール(generate-list-reel.js)で作る
const accounts = require('../data/wf4_accounts.json');

for (const account of targets) {
  const fmt = accounts[account]?.format;
  const script = fmt === 'list-slides' ? 'generate-list-reel.js' : fmt === 'clip-quote' ? 'generate-clip-quote.js' : 'generate-reel.js';
  try {
    execFileSync('node', [path.join(__dirname, script), account], { stdio: 'inherit' });
  } catch (e) {
    console.error(`[${account}] failed:`, e.message);
  }
}
