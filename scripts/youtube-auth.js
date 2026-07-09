// YouTube API用OAuth認証トークンを1回だけ取得するスクリプト
// 実行するとブラウザが開き、ise.satoshi0226@gmail.comで許可すると
// refresh tokenがコンソールに表示される(GitHub Secretsに保存する用)
const { google } = require('googleapis');
const http = require('http');
const { execFile } = require('child_process');

// 実行時に環境変数で渡す（このファイルに直接キーを書かない）
// 例: YOUTUBE_CLIENT_ID=xxx YOUTUBE_CLIENT_SECRET=yyy node youtube-auth.js
const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET;
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET を環境変数で指定してください');
  process.exit(1);
}
const REDIRECT_URI = 'http://localhost:8459/oauth2callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/youtube.upload'],
});

const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/oauth2callback')) return;
  const url = new URL(req.url, REDIRECT_URI);
  const code = url.searchParams.get('code');
  if (!code) {
    res.end('コードが取得できませんでした。');
    return;
  }
  try {
    const { tokens } = await oauth2Client.getToken(code);
    res.end('認証成功！このタブは閉じて、ターミナルに戻ってください。');
    console.log('\n=== 以下をGitHub Secretsに保存してください ===');
    console.log('YOUTUBE_REFRESH_TOKEN:', tokens.refresh_token);
    console.log('===============================================\n');
  } catch (e) {
    res.end('エラー: ' + e.message);
    console.error(e);
  } finally {
    server.close();
    process.exit(0);
  }
});

server.listen(8459, () => {
  console.log('ブラウザでこのURLを開いて、ise.satoshi0226@gmail.comで許可してください:\n');
  console.log(authUrl);
  console.log('');
  execFile('cmd', ['/c', 'start', '', authUrl]);
});
