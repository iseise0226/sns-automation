// WF4 Stories: 6アカウント分のストーリーズを順番に生成(・投稿)する
// run-wf4.js(Reels)と同じパターン。各アカウントはgenerate-story.js側で
// 個別のIG_TOKEN_<ACCOUNT>環境変数とペルソナ(data/wf4_accounts.json)を見る。
const path = require('path');
const { execFileSync } = require('child_process');

const ACCOUNTS = [
  'satoshi_mindset',
  'satoshi_mind_coaching',
  'ise_sato_kosodate',
  'sessi_life',
  'ise_kenkou_otaku',
  'tabi_life_design',
];

// WF4_ONLYが指定されていればそのアカウントだけ実行する(テスト用)
const targets = process.env.WF4_ONLY ? ACCOUNTS.filter((a) => a === process.env.WF4_ONLY) : ACCOUNTS;

for (const account of targets) {
  try {
    execFileSync('node', [path.join(__dirname, 'generate-story.js'), account], { stdio: 'inherit' });
  } catch (e) {
    console.error(`[${account}] failed:`, e.message);
  }
}
