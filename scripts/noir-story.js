/* Publish one @seira_noir_ai Story from the private NOIR Google Drive folder.
 * The script deliberately has no token defaults: GitHub Actions supplies both
 * short-lived Drive credentials and the repository secret at runtime. */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const DRIVE_FOLDER_ID = '11fhjTVz2GBSd25TfAtrJ7Wib3HadpQeu';
const IG_USER_ID = '17841459524471370';
const CAPTIONS = [
  '強がって笑った日は、ここでだけ休んでいい。',
  '誰にも必要とされない夜なんて、本当はないよ。',
  '頑張れない自分を、これ以上責めなくていい。',
  '寂しさは弱さじゃない。誰かを大切にできる証拠。',
  '今日を生き抜いた。それだけで、もう十分えらい。',
  '言葉にできない気持ちも、ちゃんとここに置いていける。',
];

function hash(value) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}

function chooseStory(files, date, slot, previousId = '') {
  if (!Array.isArray(files) || !files.length) throw new Error('No MP4 files found in the NOIR Drive folder');
  const pool = files.length > 1 && previousId ? files.filter((file) => file.id !== previousId) : files;
  const file = pool[hash(`${date}:${slot}`) % pool.length];
  const caption = CAPTIONS[hash(`${file.id}:${date}`) % CAPTIONS.length];
  return { file, caption, includeLink: false };
}

function wrapCaption(caption) {
  const characters = [...caption];
  const lineCount = Math.min(3, Math.ceil(characters.length / 10));
  if (lineCount <= 1) return caption;

  const lines = [];
  let offset = 0;
  for (let line = 0; line < lineCount; line += 1) {
    const remaining = characters.length - offset;
    const remainingLines = lineCount - line;
    const length = Math.ceil(remaining / remainingLines);
    lines.push(characters.slice(offset, offset + length).join(''));
    offset += length;
  }
  return lines.join('\n');
}

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({ hostname: target.hostname, path: target.pathname + target.search, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function jstDateAndSlot() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false }).formatToParts(now);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = Number(map.hour);
  return { date: `${map.year}-${map.month}-${map.day}`, slot: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'night' };
}

async function listDriveFiles(token) {
  const q = encodeURIComponent(`'${DRIVE_FOLDER_ID}' in parents and trashed = false and mimeType = 'video/mp4'`);
  const res = await request(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=100&fields=files(id,name,mimeType)`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) throw new Error(`Drive list failed (${res.status}): ${res.body.toString('utf8').slice(0, 500)}`);
  return JSON.parse(res.body.toString()).files || [];
}

async function downloadDriveFile(id, token, destination) {
  const res = await request(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status !== 200) throw new Error(`Drive download failed (${res.status})`);
  fs.writeFileSync(destination, res.body);
}

function renderStory(source, destination, caption) {
  const captionFile = path.join(path.dirname(destination), 'caption.txt');
  fs.writeFileSync(captionFile, wrapCaption(caption), 'utf8');
  execFileSync('ffmpeg', [
    '-y', '-i', source, '-t', '15', '-vf',
    `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc:textfile=${captionFile}:fontcolor=white:fontsize=72:line_spacing=22:bordercolor=black@0.8:borderw=3:shadowcolor=black@0.95:shadowx=6:shadowy=6:x=(w-text_w)/2:y=(h-text_h)/2`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', destination,
  ], { stdio: 'inherit', timeout: 300000 });
}

function uploadPublic(videoPath) {
  const attempts = [
    {
      args: ['-fsS', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'],
      parse: output => output.trim(),
    },
    {
      args: ['-fsS', '-F', `files[]=@${videoPath}`, 'https://uguu.se/upload.php'],
      parse: output => JSON.parse(output).files?.[0]?.url,
    },
    {
      args: ['-fsS', '--upload-file', videoPath, 'https://tmpfiles.org/api/v1/upload'],
      parse: output => {
        const url = JSON.parse(output).data?.url;
        return url ? url.replace('tmpfiles.org/', 'tmpfiles.org/dl/') : undefined;
      },
    },
  ];
  for (const attempt of attempts) {
    try {
      const url = attempt.parse(execFileSync('curl', attempt.args, { encoding: 'utf8', timeout: 300000 }));
      if (typeof url === 'string' && url.startsWith('https://')) return url;
    } catch (_) {
      // Try the next temporary host when a provider is unavailable.
    }
  }
  throw new Error('Temporary video upload failed on all providers');
}

async function publishStory(videoPath, token) {
  const videoUrl = uploadPublic(videoPath);
  const form = new URLSearchParams({ media_type: 'STORIES', video_url: videoUrl, access_token: token });
  const create = await request(`https://graph.instagram.com/v23.0/${IG_USER_ID}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  const container = JSON.parse(create.body.toString());
  if (!container.id) throw new Error(`Story container failed: ${create.status} ${container.error?.message || ''}`.trim());
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const state = await request(`https://graph.instagram.com/v23.0/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const json = JSON.parse(state.body.toString());
    if (json.status_code === 'FINISHED') break;
    if (json.status_code === 'ERROR') throw new Error('Instagram video processing failed');
    if (i === 19) throw new Error('Instagram video processing timed out');
  }
  const publish = await request(`https://graph.instagram.com/v23.0/${IG_USER_ID}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString() });
  const json = JSON.parse(publish.body.toString());
  if (!json.id) throw new Error(`Story publish failed: ${publish.status}`);
  return json.id;
}

async function main() {
  const driveToken = (process.env.GDRIVE_TOKEN || '').trim();
  if (!driveToken) throw new Error('GDRIVE_TOKEN is required');
  const current = jstDateAndSlot();
  const slot = process.env.NOIR_SLOT || current.slot;
  const files = await listDriveFiles(driveToken);
  const selected = chooseStory(files, current.date, slot, process.env.NOIR_PREVIOUS_SOURCE_ID || '');
  const outDir = path.resolve('noir_story_output');
  fs.mkdirSync(outDir, { recursive: true });
  const source = path.join(outDir, 'source.mp4');
  const finalVideo = path.join(outDir, 'story.mp4');
  await downloadDriveFile(selected.file.id, driveToken, source);
  renderStory(source, finalVideo, selected.caption);
  console.log(`Selected source: ${selected.file.name}`);
  console.log(`Story text: ${selected.caption}`);
  if (process.env.NOIR_DRYRUN === '1') { console.log(`DRYRUN complete: ${finalVideo}`); return; }
  const token = (process.env.IG_TOKEN_SEIRA_NOIR_AI || '').trim();
  if (!token) throw new Error('IG_TOKEN_SEIRA_NOIR_AI is required');
  const id = await publishStory(finalVideo, token);
  console.log(`Story published: ${id}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { chooseStory, wrapCaption };
