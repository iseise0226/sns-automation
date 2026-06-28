// WF1: 文字起こし確認→トレンド検索フォールバック→7アカウント分のNote記事+有料マガジンを生成
const fs = require('fs');
const path = require('path');
const { execFileSync, execFileSync: run } = require('child_process');
const { req, getBraveTrends } = require('./note-lib');

const ACCOUNTS = [
  'ise_satoshi',
  'satoshi_mindset',
  'satoshi_mind_coaching',
  'ise_sato_kosodate',
  'sessi_life',
  'ise_kenkou_otaku',
  'tabi_life_design40',
];

const TRANSCRIPT_CACHE = path.join(__dirname, '..', 'data', 'last_transcript.txt');
const TRANSCRIPT_DOC_URL =
  'https://docs.google.com/document/d/12WYZk_wuvOZZwL8nL547gLXpnOSzEVtAYAdmpYhuNuQ/export?format=txt';

async function decideSourceText() {
  const res = await req(TRANSCRIPT_DOC_URL, {});
  const content = (res.raw || '').toString().trim();
  let lastContent = '';
  try {
    lastContent = fs.readFileSync(TRANSCRIPT_CACHE, 'utf-8');
  } catch (e) {}

  if (content && content !== lastContent) {
    fs.writeFileSync(TRANSCRIPT_CACHE, content, 'utf-8');
    return `今日の文字起こし内容: ${content}`;
  }

  const titles = await getBraveTrends();
  return `今日のトレンド: ${titles}`;
}

async function main() {
  const sourceText = await decideSourceText();
  console.log('sourceText:', sourceText.slice(0, 100));

  for (const account of ACCOUNTS) {
    try {
      run('node', [path.join(__dirname, 'generate-note.js'), account, sourceText], { stdio: 'inherit' });
    } catch (e) {
      console.error(`[${account}] failed:`, e.message);
    }
  }

  try {
    run('node', [path.join(__dirname, 'generate-magazine.js'), sourceText], { stdio: 'inherit' });
  } catch (e) {
    console.error('[magazine] failed:', e.message);
  }

  execFileSync('git', ['config', 'user.name', 'note-bot']);
  execFileSync('git', ['config', 'user.email', 'note-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'note_drafts', 'data/last_transcript.txt', 'data/note_magazine_used_facts.json']);
  try {
    execFileSync('git', ['commit', '-m', `chore: WF1 note draft ${new Date().toISOString().slice(0, 10)}`]);
    execFileSync('git', ['push']);
  } catch (e) {
    console.log('no changes to commit, or push failed:', e.message);
  }
}

main().catch((e) => {
  console.error('error:', e.message);
  process.exit(1);
});
