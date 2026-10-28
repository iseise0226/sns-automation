// WF4: active accounts only. sessi_life and tabi_life_design are paused during rebranding.
const path = require('path');
const { execFileSync } = require('child_process');

// satoshi_mind_coaching is handled by wf-hitmehard.yml.
// ise_sato_kosodate is handled by wf4-kosodate-quote.yml.
// sessi_life and tabi_life_design are intentionally excluded until their new brand content is ready.
const ACCOUNTS = [
  'satoshi_mindset',
  'ise_kenkou_otaku',
];

// WF4_ONLYが指定されていればそのアカウントだけ実行する（テスト用）
const targets = process.env.WF4_ONLY ? ACCOUNTS.filter((a) => a === process.env.WF4_ONLY) : ACCOUNTS;

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
