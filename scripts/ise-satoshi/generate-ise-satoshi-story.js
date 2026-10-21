const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const mediaDir = path.join(ROOT, 'ise_satoshi_media', 'own');
const outDir = path.join(ROOT, 'ise_satoshi_media', 'generated');
const beginnings = ['迷ってるなら、','止まりそうなら、','不安があるなら、','自信がなくても、','今日がつらくても、','失敗したって、','遠回りしても、','比べなくていい。','焦る日こそ、','答えがなくても、','続かないなら、','怖くなったら、','悩みが深いなら、','まだ間に合う。','変わりたいなら、','疲れた日には、','小さな挑戦も、','昨日より少し、','弱さを見せても、','自分の歩幅で、'];
const endings = ['まず動こう。','一歩だけ進もう。','小さく始めよう。','今日を大切に。','また立ち上がろう。','自分を信じよう。','焦らず進もう。','休んで、また行こう。','今できることを。','ここから始めよう。','昨日を越えよう。','自分を認めよう。','少しずつでいい。','次の一歩を選ぼう。','可能性を信じよう。','今日を変えよう。','前だけ見よう。','続けることから。','自分らしく行こう。','まだ進めるよ。'];
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
let src=path.join(mediaDir,files[(day*3+slot+runNumber)%files.length]);
const stock=(day+slot)%3===0;
if(stock){
  const key=process.env.PEXELS_API_KEY;
  if(!key) throw new Error('PEXELS_API_KEY secret is missing');
  const query=['hair salon','barber','hair washing'][day%3];
  const api=`https://api.pexels.com/v1/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=15&page=${day%5+1}`;
  let response;
  try { response=JSON.parse(execFileSync('curl',['-fsSL','-H',`Authorization: ${key}`,api],{encoding:'utf8',stdio:['ignore','pipe','pipe']})); }
  catch { throw new Error('Pexels動画の検索に失敗しました'); }
  const candidates=(response.videos||[]).filter(v=>v.duration>=5).flatMap(v=>(v.video_files||[]).filter(f=>f.file_type==='video/mp4'&&f.link&&f.height>=720&&f.width<=1080));
  if(!candidates.length) throw new Error('Pexelsに使える縦動画がありません');
  src=path.join(outDir,'pexels-source.mp4');
  try { execFileSync('curl',['-fsSL','--max-time','90','-o',src,candidates[sequence%candidates.length].link],{stdio:['ignore','pipe','pipe']}); }
  catch { throw new Error('Pexels動画の取得に失敗しました'); }
}
const text=[beginnings[sequence%beginnings.length],endings[Math.floor(sequence/beginnings.length)%endings.length]];
console.log(`source: ${stock?'Pexels':'own'}`);
const stamp=Date.now(), text1=path.join(outDir,`${stamp}-1.txt`), text2=path.join(outDir,`${stamp}-2.txt`), out=path.join(outDir,'story.mp4');
fs.writeFileSync(text1,text[0]); fs.writeFileSync(text2,text[1]);
const font=process.env.FONT_FILE || '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc';
const credit=path.join(outDir,'pexels-credit.txt');
if(stock) fs.writeFileSync(credit,'Video: pexels.com');
const vf=`scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.15:t=fill,drawtext=fontfile=${font}:textfile=${text1}:fontcolor=white:fontsize=82:borderw=5:bordercolor=black:shadowcolor=black:shadowx=5:shadowy=5:x=(w-text_w)/2:y=h/2-100,drawtext=fontfile=${font}:textfile=${text2}:fontcolor=white:fontsize=82:borderw=5:bordercolor=black:shadowcolor=black:shadowx=5:shadowy=5:x=(w-text_w)/2:y=h/2+10${stock?`,drawtext=fontfile=${font}:textfile=${credit}:fontcolor=white:fontsize=28:shadowcolor=black:shadowx=2:shadowy=2:x=(w-text_w)/2:y=h-380`:''}`;
const bgm=path.join(ROOT,'ise_satoshi_media','bgm.mp3');
const args=['-y','-ss','0','-t','5','-i',src]; if(fs.existsSync(bgm)) args.push('-stream_loop','-1','-i',bgm);
args.push('-vf',vf,'-map','0:v:0'); if(fs.existsSync(bgm)) args.push('-map','1:a:0','-af','volume=0.22','-shortest'); else args.push('-an');
args.push('-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart'); if(fs.existsSync(bgm)) args.push('-c:a','aac'); args.push(out);
execFileSync('ffmpeg',args,{stdio:'inherit'}); console.log(out);

