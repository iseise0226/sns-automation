// 動画ファイルをYouTubeにアップロードするスクリプト
// 使い方: node youtube-upload.js <動画パス> <タイトル> <説明文パス> <サムネイルパス(任意)>
const fs = require('fs');
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN });

const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

async function main() {
  const [videoPath, title, descriptionPath, thumbnailPath] = process.argv.slice(2);
  if (!videoPath || !title || !descriptionPath) {
    console.error('使い方: node youtube-upload.js <動画パス> <タイトル> <説明文パス> [サムネイルパス]');
    process.exit(1);
  }

  const description = fs.readFileSync(descriptionPath, 'utf-8');

  console.log('アップロード開始:', title);
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description,
        categoryId: '22', // People & Blogs
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false,
      },
    },
    media: {
      body: fs.createReadStream(videoPath),
    },
  });

  const videoId = res.data.id;
  console.log('アップロード完了: https://youtu.be/' + videoId);

  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    await youtube.thumbnails.set({
      videoId,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
    console.log('サムネイル設定完了');
  }
}

main().catch((e) => {
  console.error('エラー:', e.message);
  process.exit(1);
});
