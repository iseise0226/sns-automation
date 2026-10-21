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
const STORY_WINDOWS = {
  morning: [9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60],
  afternoon: [14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30, 16 * 60],
  night: [19 * 60, 19 * 60 + 30, 20 * 60, 20 * 60 + 30, 21 * 60],
};

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

function storyDailySchedule(date) {
  return Object.fromEntries(Object.entries(STORY_WINDOWS).map(([slot, candidates]) => [
    slot,
    candidates[hash(`${date}:story:${slot}`) % candidates.length],
  ]));
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

function dueStorySlots(schedule, minutes, postedSlots = []) {
  const posted = new Set(postedSlots);
  return Object.entries(schedule)
    .filter(([slot, selected]) => selected <= minutes && !posted.has(slot))
    .sort((left, right) => left[1] - right[1])
    .map(([slot]) => slot);
}

function jstParts(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    minutes: Number(map.hour) * 60 + Number(map.minute),
  };
}

function storySlotsFromTimestamps(items, date) {
  const slots = new Set();
  for (const item of items) {
    if (!item.timestamp) continue;
    const current = jstParts(new Date(item.timestamp));
    if (current.date !== date) continue;
    if (current.minutes >= 9 * 60 && current.minutes < 14 * 60) slots.add('morning');
    else if (current.minutes >= 14 * 60 && current.minutes < 19 * 60) slots.add('afternoon');
    else if (current.minutes >= 19 * 60) slots.add('night');
  }
  return ['morning', 'afternoon', 'night'].filter((slot) => slots.has(slot));
}

function validateInstagramProfile(profile) {
  if (profile?.id !== IG_USER_ID || profile?.username !== 'seira_noir_ai') {
    throw new Error(`unexpected Instagram account: ${profile?.username || 'unknown'} (${profile?.id || 'no id'})`);
  }
  return profile;
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
  const current = jstParts(new Date());
  const hour = Math.floor(current.minutes / 60);
  return { ...current, slot: hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'night' };
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

async function instagramProfile(token) {
  const fields = new URLSearchParams({ fields: 'id,username', access_token: token });
  const res = await request(`https://graph.instagram.com/v23.0/${IG_USER_ID}?${fields}`);
  const json = JSON.parse(res.body.toString() || '{}');
  if (res.status !== 200) throw new Error(`Instagram profile check failed (${res.status}): ${json.error?.message || ''}`.trim());
  return validateInstagramProfile(json);
}

async function recentStories(token) {
  const fields = new URLSearchParams({ fields: 'id,timestamp', access_token: token });
  const res = await request(`https://graph.instagram.com/v23.0/${IG_USER_ID}/stories?${fields}`);
  const json = JSON.parse(res.body.toString() || '{}');
  if (res.status !== 200) throw new Error(`Instagram Stories check failed (${res.status}): ${json.error?.message || ''}`.trim());
  return json.data || [];
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
  for (let i = 0; i < 6; i += 1) {
    const visible = await recentStories(token);
    if (visible.some((story) => story.id === json.id)) return json.id;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`Story ${json.id} was published by the API but did not appear in the account Stories feed`);
}

async function main() {
  const driveToken = (process.env.GDRIVE_TOKEN || '').trim();
  if (!driveToken) throw new Error('GDRIVE_TOKEN is required');
  const current = jstDateAndSlot();
  const scheduled = process.env.NOIR_STORY_SCHEDULED === '1';
  const dryRun = process.env.NOIR_DRYRUN === '1';
  const token = (process.env.IG_TOKEN_SEIRA_NOIR_AI || '').trim();
  let slots = [process.env.NOIR_SLOT || current.slot];

  if (!dryRun) {
    if (!token) throw new Error('IG_TOKEN_SEIRA_NOIR_AI is required');
    await instagramProfile(token);
  }
  if (scheduled) {
    const schedule = storyDailySchedule(current.date);
    const postedSlots = storySlotsFromTimestamps(await recentStories(token), current.date);
    slots = dueStorySlots(schedule, current.minutes, postedSlots);
    if (!slots.length) {
      console.log(`No overdue Stories. JST ${current.date} schedule=${JSON.stringify(schedule)} posted=${JSON.stringify(postedSlots)}`);
      return;
    }
  }

  const files = await listDriveFiles(driveToken);
  const outDir = path.resolve('noir_story_output');
  fs.mkdirSync(outDir, { recursive: true });
  const source = path.join(outDir, 'source.mp4');
  const finalVideo = path.join(outDir, 'story.mp4');
  let previousId = process.env.NOIR_PREVIOUS_SOURCE_ID || '';
  for (const slot of slots) {
    const selected = chooseStory(files, current.date, slot, previousId);
    await downloadDriveFile(selected.file.id, driveToken, source);
    renderStory(source, finalVideo, selected.caption);
    console.log(`Selected source: ${selected.file.name}`);
    console.log(`Story text: ${selected.caption}`);
    if (dryRun) {
      console.log(`DRYRUN complete: ${finalVideo}`);
      return;
    }
    const id = await publishStory(finalVideo, token);
    console.log(`Story published and verified visible: ${id} (${current.date} ${slot})`);
    previousId = selected.file.id;
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = {
  chooseStory,
  dueStorySlots,
  storyDailySchedule,
  storySlotsFromTimestamps,
  validateInstagramProfile,
  wrapCaption,
};
