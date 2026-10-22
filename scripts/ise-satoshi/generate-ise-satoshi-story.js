const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const mediaDir = path.join(ROOT, 'ise_satoshi_media', 'own');
const outDir = path.join(ROOT, 'ise_satoshi_media', 'generated');
// 投稿素材は C:\画像\自分\インスタリール用\動画 から同期した own フォルダだけを使う。
const captions = [
  ['小さなことでも、','積み重なると大きい。'],
  ['今日は今日のペースで、','気持ちよく進もう。'],
  ['比べるより、','自分の変化を見ていたい。'],
  ['いい流れは、','小さな行動から始まる。'],
  ['やってみた分だけ、','見える景色が増えていく。'],
  ['自分のペースで、','ちゃんと前に進んでいる。'],
  ['気持ちを整えると、','やることが見えてくる。'],
  ['今日の一歩が、','明日の自信になる。'],
  ['肩の力を抜いて、','できることから始めよう。'],
  ['目の前を丁寧に、','それだけでも十分いい。'],
];
const date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const day = Math.floor(Date.parse(`${date}T00:00:00Z`)/86400000);
const slot = Number(process.env.STORY_SLOT || 0);
if (![0,1,2].includes(slot)) throw new Error('STORY_SLOT must be 0, 1 or 2');
// GitHub run number makes retries on the same day/slot use a new source and caption.
const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
const sequence = day*3+slot+runNumber;
fs.mkdirSync(outDir,{recursive:true});
const files=fs.readdirSync(mediaDir).filter(f=>/\.(mp4|mov|m4v)$/i.test(f));
if(!files.length) throw new Error('media/own に動画がありません');
const src=path.join(mediaDir,files[sequence%files.length]);
const text=captions[sequence%captions.length];
console.log(`source: own (${path.basename(src)})`);
const stamp=Date.now(), text1=path.join(outDir,`${stamp}-1.txt`), text2=path.join(outDir,`${stamp}-2.txt`), out=path.join(outDir,'story.mp4');
fs.writeFileSync(text1,text[0]); fs.writeFileSync(text2,text[1]);
const font=process.env.FONT_FILE || '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const vf=`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.15:t=fill,drawtext=fontfile=${font}:textfile=${text1}:fontcolor=white:fontsize=82:borderw=5:bordercolor=black:shadowcolor=black:shadowx=5:shadowy=5:x=(w-text_w)/2:y=h/2-100,drawtext=fontfile=${font}:textfile=${text2}:fontcolor=white:fontsize=82:borderw=5:bordercolor=black:shadowcolor=black:shadowx=5:shadowy=5:x=(w-text_w)/2:y=h/2+10`;
const bgm=path.join(ROOT,'ise_satoshi_media','bgm.mp3');
const args=['-y','-ss','0','-t','5','-i',src]; if(fs.existsSync(bgm)) args.push('-stream_loop','-1','-i',bgm);
args.push('-vf',vf,'-map','0:v:0'); if(fs.existsSync(bgm)) args.push('-map','1:a:0','-af','volume=0.22','-shortest'); else args.push('-an');
args.push('-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart'); if(fs.existsSync(bgm)) args.push('-c:a','aac'); args.push(out);
execFileSync('ffmpeg',args,{stdio:'inherit'}); console.log(out);

