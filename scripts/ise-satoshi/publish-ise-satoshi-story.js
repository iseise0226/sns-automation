const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const token = (process.env.IG_TOKEN_ISE_SATOSHI || '').trim();
const video = process.argv[2] || path.join(ROOT, 'ise_satoshi_media', 'generated', 'story.mp4');
const igUserId = process.env.IG_USER_ID || '17841401793428016';
if (!token) throw new Error('IG_TOKEN_ISE_SATOSHI secret is missing');
if (!fs.existsSync(video)) throw new Error(`動画がありません: ${video}`);
function curl(args) { return execFileSync('curl', args, { encoding:'utf8', stdio:['ignore','pipe','pipe'] }); }
function direct(url) { try { return curl(['-s','-I','-L','-o','/dev/null','-w','%{http_code} %{content_type}',url]).trim().startsWith('200 video/'); } catch { return false; } }
function upload() {
  const candidates=[['litterbox',['-s','-F','reqtype=fileupload','-F','time=24h','-F',`fileToUpload=@${video}`,'https://litterbox.catbox.moe/resources/internals/api.php']],['uguu',['-s','-F',`files[]=@${video}`,'https://uguu.se/upload?output=text']]];
  for (const [name,args] of candidates) { try { const u=curl(args).trim(); if (u.startsWith('https://')&&direct(u)) { console.log(`upload: ${name}`); return u; } } catch {} }
  throw new Error('公開URLの作成に失敗しました');
}
async function main() {
  const url=upload(), base=`https://graph.facebook.com/v23.0/${igUserId}`;
  const create=JSON.parse(curl(['-s','-X','POST',`${base}/media`,'-d','media_type=STORIES','-d',`video_url=${encodeURIComponent(url)}`,'-d',`access_token=${token}`]));
  if(!create.id) throw new Error(`コンテナ作成失敗: ${JSON.stringify(create)}`);
  let status='IN_PROGRESS';
  for(let i=0;i<20&&status!=='FINISHED';i++){await new Promise(r=>setTimeout(r,6000));const s=JSON.parse(curl(['-s',`https://graph.facebook.com/v23.0/${create.id}?fields=status_code&access_token=${token}`]));status=s.status_code;if(status==='ERROR')throw new Error(`動画処理失敗: ${JSON.stringify(s)}`);}
  if(status!=='FINISHED')throw new Error(`動画処理タイムアウト: ${status}`);
  const result=JSON.parse(curl(['-s','-X','POST',`${base}/media_publish`,'-d',`creation_id=${create.id}`,'-d',`access_token=${token}`]));
  if(!result.id)throw new Error(`公開失敗: ${JSON.stringify(result)}`);
  console.log(`Instagramストーリーズ公開完了: ${result.id}`);
}
main().catch(e=>{console.error(e.message);process.exit(1);});

