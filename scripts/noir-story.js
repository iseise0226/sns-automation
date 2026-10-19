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
  '少しだけ、肩の力を抜こう。',
  '今日もおつかれさま。ここでひと息。',
  '誰にも言わなくていい夜も、あるよね。',
  'がんばったあなたに、静かなご褒美を。',
  '今夜は、気を張らなくて大丈夫。',
  'ひとりの時間も、悪くないよ。',
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
  return { file, caption, includeLink: slot === 'night' };
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

function renderStory(source, destination, caption, includeLink) {
  const captionFile = path.join(path.dirname(destination), 'caption.txt');
  fs.writeFileSync(captionFile, includeLink ? `${caption}\nnoir-lounge.com` : caption, 'utf8');
  execFileSync('ffmpeg', [
    '-y', '-i', source, '-t', '15', '-vf',
    `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,drawbox=x=40:y=1440:w=1000:h=300:color=black@0.42:t=fill,drawtext=fontfile=/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc:textfile=${captionFile}:fontcolor=white:fontsize=46:line_spacing=18:x=(w-text_w)/2:y=1510`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', destination,
  ], { stdio: 'inherit', timeout: 300000 });
}

function uploadPublic(videoPath) {
  const output = execFileSync('curl', ['-fsS', '-F', 'reqtype=fileupload', '-F', 'time=24h', '-F', `fileToUpload=@${videoPath}`, 'https://litterbox.catbox.moe/resources/internals/api.php'], { encoding: 'utf8', timeout: 300000 }).trim();
  if (!output.startsWith('https://')) throw new Error('Temporary video upload failed');
  return output;
}

async function publishStory(videoPath, token) {
  const videoUrl = uploadPublic(videoPath);
  const form = new URLSearchParams({ media_type: 'STORIES', video_url: videoUrl, access_token: token });
  const create = await request(`https://graph.facebook.com/v23.0/${IG_USER_ID}/media`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form.toString() });
  const container = JSON.parse(create.body.toString());
  if (!container.id) throw new Error(`Story container failed: ${create.status}`);
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    const state = await request(`https://graph.facebook.com/v23.0/${container.id}?fields=status_code&access_token=${encodeURIComponent(token)}`);
    const json = JSON.parse(state.body.toString());
    if (json.status_code === 'FINISHED') break;
    if (json.status_code === 'ERROR') throw new Error('Instagram video processing failed');
    if (i === 19) throw new Error('Instagram video processing timed out');
  }
  const publish = await request(`https://graph.facebook.com/v23.0/${IG_USER_ID}/media_publish`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ creation_id: container.id, access_token: token }).toString() });
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
  renderStory(source, finalVideo, selected.caption, selected.includeLink);
  console.log(`Selected source: ${selected.file.name}`);
  console.log(`Story text: ${selected.caption}${selected.includeLink ? ' / noir-lounge.com' : ''}`);
  if (process.env.NOIR_DRYRUN === '1') { console.log(`DRYRUN complete: ${finalVideo}`); return; }
  const token = (process.env.IG_TOKEN_SEIRA_NOIR_AI || '').trim();
  if (!token) throw new Error('IG_TOKEN_SEIRA_NOIR_AI is required');
  const id = await publishStory(finalVideo, token);
  console.log(`Story published: ${id}`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { chooseStory };
