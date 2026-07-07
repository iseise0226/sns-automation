// WF4: 6アカウント分を順番に実行(各アカウントは内部で3日おき判定をしてスキップする)
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

// WF4_ONLYが指定されていればそのアカウントだけ実行する（テスト用）
const targets = process.env.WF4_ONLY ? ACCOUNTS.filter((a) => a === process.env.WF4_ONLY) : ACCOUNTS;

for (const account of targets) {
  try {
    execFileSync('node', [path.join(__dirname, 'generate-reel.js'), account], { stdio: 'inherit' });
  } catch (e) {
    console.error(`[${account}] failed:`, e.message);
  }
}
