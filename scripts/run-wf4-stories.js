// WF4 Stories: active accounts only. sessi_life and tabi_life_design are paused during rebranding.
const path = require('path');
const { execFileSync } = require('child_process');

// sessi_life and tabi_life_design are intentionally excluded until their new brand content is ready.
const ACCOUNTS = [
  'satoshi_mindset',
  'satoshi_mind_coaching',
  'ise_sato_kosodate',
  'ise_kenkou_otaku',
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
