// WF1: 文字起こし確認→トレンド検索フォールバック→7アカウント分のNote記事+有料マガジンを生成
const fs = require('fs');
const path = require('path');
const { execFileSync, execFileSync: run } = require('child_process');
const { req, getBraveTrends, getMixedTrends } = require('./note-lib');

const MAIN_ACCOUNT = 'ise_satoshi';
// ise_satoshi以外・マガジンは一時停止中(2026-07-25)
const WEEKLY_ACCOUNTS = [];

const ACCOUNTS = [MAIN_ACCOUNT];

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

  // note/Instagram/Threadsで今ヒットしているテーマ傾向をミックスして渡す
  // (本文は取得しない。タイトルからテーマ・切り口を掴んで新しい記事を書かせるための参考情報)
  const mixed = await getMixedTrends('マインド プラス思考 自己成長');
  if (mixed) {
    return `今note・Instagram/Threadsで話題のテーマ傾向(タイトルのみ・内容はコピーせずここから新しい切り口を考えること): ${mixed}`;
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
    await new Promise((r) => setTimeout(r, 10000));
  }

  execFileSync('git', ['config', 'user.name', 'note-bot']);
  execFileSync('git', ['config', 'user.email', 'note-bot@users.noreply.github.com']);
  execFileSync('git', ['add', 'note_drafts', 'data']);
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
