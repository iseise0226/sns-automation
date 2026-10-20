// 素材フォルダの動画を、縦(720x1280)・無音・3秒のクリップに切り出して remotion/assets/clips/<set>/ に置く。
// 使い方: node scripts/prepare-clips.js <素材フォルダ> <set名> [1本あたりの最大数(既定6)]
// GitHub Actions(クラウド)からはPCのフォルダが見えないため、切り出したクリップはリポジトリに入れる。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [src, setName, maxArg] = process.argv.slice(2);
if (!src || !setName) throw new Error('usage: node prepare-clips.js <srcDir> <setName> [maxPerSource]');
const MAX_PER_SOURCE = Number(maxArg) || 6;
const CLIP_SEC = 3;
const out = path.join(__dirname, '..', 'remotion', 'assets', 'clips', setName);
fs.mkdirSync(out, { recursive: true });

const files = fs.readdirSync(src).filter((f) => /\.(mp4|mov|m4v)$/i.test(f)).sort();
let total = 0;
files.forEach((f, i) => {
  const p = path.join(src, f);
  const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p]).toString());
  // 先頭・末尾を少し避け、重ならない3秒を等間隔に取る
  const usable = dur - 0.6;
  const n = Math.min(MAX_PER_SOURCE, Math.floor(usable / CLIP_SEC));
  if (n < 1) return;
  const step = usable / n;
  for (let k = 0; k < n; k++) {
    const start = 0.3 + k * step + Math.max(0, (step - CLIP_SEC) / 2);
    const name = `s${String(i + 1).padStart(2, '0')}_${k + 1}.mp4`;
    execFileSync('ffmpeg', [
      '-y', '-v', 'error', '-ss', start.toFixed(2), '-t', String(CLIP_SEC), '-i', p,
      '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30',
      '-g', '15', '-bf', '0', '-an', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '31', '-movflags', '+faststart',
      path.join(out, name),
    ]);
    total++;
  }
});
const size = fs.readdirSync(out).reduce((a, f) => a + fs.statSync(path.join(out, f)).size, 0);
console.log(`${total}本 → ${out} (${(size / 1e6).toFixed(1)}MB)`);
