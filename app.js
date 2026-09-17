// Student view of the KUSU mindreader course, running entirely in the browser.
import {STEPS,CARDS,HEART,CHAPS,problems,optionOrder,hintLimit} from './content.js';
import * as course from './engine.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let record=null,tickTimer=null;
const byteTools={},trickReady={};
let returnTo=null;
const errors={COURSE_REVISION_CONFLICT:'另一個分頁已經更新了進度。請重新載入這一頁再繼續。',
COURSE_STEP_CONFLICT:'目前步驟已在另一個分頁變更，請重新載入這一頁。',
COURSE_NOT_STARTED:'找不到這台電腦上的進度，請重新載入這一頁。',
COURSE_STEP_LOCKED:'請先完成目前這一步（重刷需先完成一次活動）。'};
function status(text){$('#sync').textContent=text;}
function savedStatus(){
 status(record.persisted===false?'這個瀏覽器不允許儲存資料：可以繼續玩，但關閉頁面後進度會消失。':'進度已存在這台電腦的瀏覽器 · '+new Date(record.updatedMs).toLocaleTimeString('zh-TW'));
}
function send(kind,value=null,step=record?.state?.step||0){
 try{record=course.event({revision:record?.revision||0,kind,step,value});savedStatus();renderStudent();}
 catch(e){
  status((errors[e.code]||'這一步沒有完成，請重新載入這一頁再試。')+' ');
  $('#sync').insertAdjacentHTML('beforeend','<button id="reload" class="plain">重新載入</button>');
  $('#reload').onclick=()=>location.reload();
 }
}
function startScreen(){
 clearInterval(tickTimer);
 $('#app').innerHTML='<div id="cover"><img class="cover-art" src="./images/karl-cover.webp" alt="讀心術師卡爾在後台的聚光燈下拿著五張卡片"><div class="ticket"><p class="eyebrow">今夜 · 特別場</p><h1>讀心術師卡爾</h1><p class="story">後台只剩一盞燈。卡爾握著五張卡片。想一個數字，看看你能不能拆穿他的讀心把戲。</p><button id="start" class="btn">進入後台</button><p class="note">不用登入 · 進度只存在這台電腦的瀏覽器<br>訂正不扣分 · 同一題提示全部用完才扣 1 分</p></div></div>';
 $('#start').onclick=()=>send('start');
}
const fmt=ms=>{const t=Math.max(0,Math.round((ms||0)/1000)),h=Math.floor(t/3600),m=Math.floor(t%3600/60),x=t%60;return (h?h+':'+String(m).padStart(2,'0'):m)+':'+String(x).padStart(2,'0');};
const timedStep=s=>['opt','text','conv','build'].includes(s.t);
const liveMs=(r,s)=>{const q=r.q[s.id]||{};return (q.activeMs||0)+(q.ok||!Number.isFinite(r.sinceMs)?0:Math.min(Math.max(0,Date.now()-r.sinceMs),record?.segmentCapMs||300000));};
function scorePanel(v){
 const m=v.metrics,f=v.feedback,attempt=v.state?.attempt||1;
 if(!m)return '';
 return '<div class="panel"><h3>我的學習紀錄</h3><p class="grade">'+(v.first?'第一次完成的分數':'暫計已取得')+' '+v.finalScore+'／100</p><p>'+(attempt>1?'本次重刷分數 ':'活動原分 ')+m.score+'／100 · 計時題用時 '+fmt(m.timeMs)+(attempt>1?' · 第 '+attempt+' 次作答':'')+'</p>'+(v.best?'<p>最佳紀錄：'+v.best.score+' 分 · 用時 '+fmt(v.best.timeMs)+'（第 '+v.best.attempt+' 次）</p>':'')+'<p>概念 '+m.concepts+'/18 · 位元組合 '+m.binary+'/5 · 操作活動 '+m.activities+'/3'+(m.hintPenalty?' · 提示扣分 '+m.hintPenalty+' 分':'')+'</p><p>實際完成 '+m.done+'/'+m.totalSteps+' 步（'+m.progress+'%） · 到達第 '+m.reached+' 步 · 跳過 '+m.skipped+' 題</p><details><summary>分數依據與診斷紀錄</summary><p>概念 70 分；五題位元組合 15 分；讀心、點陣、取樣各 5 分。訂正不扣分；同一題的提示全部用完，該題扣 1 分（沒用完不扣）。選擇題與練習題會計時，時間只用來和自己的紀錄比較，不影響分數；離開超過 5 分鐘只算 5 分鐘。</p><p>正式提交 '+m.submissions+' 次 · 錯答後訂正 '+m.corrected+' 題 · 提示 '+m.hints+' 次</p><p>這是可提示與訂正的活動成績，不等同獨立測驗。</p></details><div class="report"><b>依活動證據產生的回饋（規則範本）</b><p>'+esc(f.strength)+'</p><p>'+esc(f.advice)+'</p><p>'+esc(f.comment)+'</p></div></div>';
}
const isAction=s=>['text','opt','conv','build','trick','pixel','wave'].includes(s.t);
const fill=(text,p)=>String(text||'').replace(/\{(letter|code|bits|word|value|parts)\}/g,(_,k)=>k==='parts'?[...(p?.bits||'')].map((b,i,a)=>b==='1'?2**(a.length-1-i):0).filter(Boolean).join(' + '):p?.[k]??'');
const cardsHtml=(highFirst=false)=>'<div class="cardgrid">'+(highFirst?[...CARDS].reverse():CARDS).map(c=>card(c)).join('')+'</div>';
const CN=['零','一','二','三','四','五','六','七','八'];
const glyph=n=>n>=33&&n<=126?String.fromCharCode(n):n===32?'空白':'—';
function byteTool(id){
 const bits=byteTools[id]||'00000000',value=parseInt(bits,2);
 return '<div class="bytetool" data-tool="'+esc(id)+'"><p class="meta">8 格工具：點格子切換 0 和 1（這裡只是計算用，不會送出）</p><div class="bits">'+[...bits].map((b,k)=>'<button type="button" data-tbit="'+k+'" aria-pressed="'+(b==='1')+'" class="'+(b==='1'?'on':'')+'"><small>'+2**(7-k)+'</small><b>'+b+'</b></button>').join('')+'</div><p class="tally">數字 = <b id="tool-value">'+value+'</b> · 對應符號：<b id="tool-glyph">'+esc(glyph(value))+'</b></p></div>';
}
function letterTable(){
 const row=(from,to)=>{let h='';for(let n=from;n<=to;n++)h+='<span><b>'+String.fromCharCode(n)+'</b><small>'+n+'</small></span>';return h;};
 return '<div class="lettertable"><p class="meta">字母編號表（大寫 A=65 起，小寫 a=97 起）</p><div class="letters">'+row(65,90)+'</div><div class="letters">'+row(97,122)+'</div></div>';
}
function renderStudent(){
 clearInterval(tickTimer);
 if(!record?.state)return startScreen();
 const r=record.state,s=STEPS[r.step],q=r.q[s.id]||{},m=record.metrics,all=problems(r.attemptId),p=all[s.id];
 let html='<div class="top"><div class="toprow"><b>第 '+(s.ch+1)+' 章 · '+CHAPS[s.ch]+'</b><span>第 '+(r.step+1)+'／'+STEPS.length+' 步</span><span class="pc">'+m.progress+'%</span>'+(r.attempt>1?'<span class="badge">重刷第 '+(r.attempt-1)+' 次</span>':'')+'</div><div class="track"><div class="fill" style="width:'+m.progress+'%"></div></div></div><div class="toolbar"><label for="step-select">回顧已到達步驟</label><select id="step-select">'+STEPS.slice(0,r.maxStep+1).map((x,k)=>'<option value="'+k+'" '+(k===r.step?'selected':'')+'>'+(k+1)+' · '+esc(x.h||'五張卡讀心')+'</option>').join('')+'</select></div>';
 if(returnTo!==null&&(r.step>=returnTo||returnTo>r.maxStep))returnTo=null;
 if(returnTo!==null)html+='<p class="reviewback"><button type="button" id="review-return" class="btn">看完了，回到第 '+(returnTo+1)+' 步「'+esc(STEPS[returnTo].h||'')+'」繼續作答</button></p>';
 html+='<section class="panel"><h2 tabindex="-1" id="step-heading">'+esc(s.h||'想一個 0 到 31 的數字')+'</h2>'+(timedStep(s)?'<p class="timer">本題用時 <b id="qtime">'+fmt(liveMs(r,s))+'</b>'+(q.ok?'（已完成）':'')+'</p>':'')+(s.art?'<img class="banner" src="./images/'+esc(s.art)+'.webp" alt="" width="1024" height="572">':'');
 if(s.t==='final')html+='<img class="finale-art" src="./images/karl-finale.webp" alt="卡爾舉起帽子，帽子裡飛出金色的齒輪和開關；學生拿著五張卡片恍然大悟">';
 if(s.karl)html+=s.t==='final'?'<p class="karl"><b>卡爾：</b>'+esc(s.karl)+'</p>':'<div class="karlrow"><img class="karl-face" src="./images/karl-portrait.webp" alt="" width="72" height="72"><p class="karl"><b>卡爾：</b>'+esc(s.karl)+'</p></div>';
 if(s.t==='story'&&!s.steps)html+='<p class="meta">準備好就繼續。</p>';
 if(s.t==='cards')html+=cardsHtml();
 if(s.t==='mile')html+='<div class="learned"><h3>你剛剛學會的</h3><ul>'+s.learned.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ul></div>'+(s.why?'<p>電腦電路用容易區分的兩種狀態表示 0 與 1，讓資料更容易可靠地保存與處理。</p>':'')+(s.cards?'<h3>對照五張卡</h3><p class="meta">邊看說明邊對照：每張卡的金色數字就是它的位值。</p>'+cardsHtml():'');
 if(s.recap){
  const rounds=[['第一次','trick'],['第二次','trick2']].map(([label,id])=>[label,r.q[id]?.answer]).filter(([,a])=>Array.isArray(a)&&a.length===5);
  if(rounds.length)html+='<div class="recap"><h3>你的回答和卡爾說出的數字</h3>'+rounds.map(([label,a])=>'<p><b>'+label+'</b>：卡爾說出 <b>'+a.reduce((n,x,k)=>n+(x?2**k:0),0)+'</b></p><div class="bits">'+a.map((x,k)=>'<div class="'+(x?'on':'')+'"><small class="cardname">卡片 '+(k+1)+'</small><b>'+(x?'在':'不在')+'</b></div>').join('')+'</div>').join('')+'</div>';
 }
 if(s.steps)html+='<ol class="ladder">'+s.steps.map(t=>'<li>'+esc(t)+'</li>').join('')+'</ol>';
 if(s.ask)html+='<p class="ask">'+esc(fill(s.ask,p))+'</p>';
 if(s.review&&!q.ok){
  const targets=s.review.map(v=>STEPS.findIndex(x=>x.id===v||x.t===v)).filter(k=>k>=0&&k<r.step);
  if(targets.length)html+='<div class="reviewlinks">'+targets.map(k=>'<button type="button" class="plain" data-review="'+k+'">回到第 '+(k+1)+' 步「'+esc(STEPS[k].h||'')+'」看看</button>').join('')+'</div>';
 }
 if(s.t==='text'||s.t==='conv'){
  if(s.t==='conv'){
   const bits=[...p.bits].map(Number),n=bits.length;
   if(s.raw)html+='<p>把這排二進位換成十進位（速記寫法：('+p.bits+')₂）：</p>';
   else html+='<p class="ask">換你當讀心師。這位顧客心裡想了一個數字，對'+CN[n]+'張卡一張一張回答「在不在」，答案記成下面這排 1 和 0：<b>1 代表顧客的數字「在」這張卡上</b>，<b>0 代表「不在」</b>。</p><p>每一格下面的小數字，就是那張卡的金色數字（位值）。把寫著 1 的格子的金色數字全部加起來，就是顧客心裡想的數字；寫著 0 的跳過。</p>';
   html+='<div class="bits">'+bits.map((b,k)=>'<div class="'+(b?'on':'')+'">'+(s.raw?'':'<small class="cardname">卡片 '+(n-k)+'</small>')+'<b>'+b+'</b><small>'+2**(n-1-k)+'</small>'+(s.raw?'':'<em class="inout">'+(b?'在':'不在')+'</em>')+'</div>').join('')+'</div>';
   if(p.n===5)html+='<details class="cardref"><summary>打開五張卡對照（由左到右是卡片 5 到卡片 1，和上面的格子對齊）</summary>'+cardsHtml(true)+'</details>';
  }
  if(s.tool)html+=byteTool(s.id)+(s.id==='d2'&&!q.ok?'<button type="button" id="tool-copy" class="plain">把 8 格結果填入答案</button>':'');
  if(s.table)html+=letterTable();
  html+='<form id="answer-form" class="ansrow"><input id="answer" aria-label="你的答案" maxlength="160" '+(s.ph?'placeholder="'+esc(s.ph)+'"':'')+' value="'+esc(q.answer||'')+'" '+(q.ok?'disabled':'')+'><button '+(q.ok?'disabled':'')+'>確認答案</button></form>';
 }
 if(s.t==='opt')html+='<div class="opts">'+optionOrder(r.attemptId,s.id,s.opts.length).map(k=>'<button data-opt="'+k+'" class="'+(q.answer===k?'sel':'')+'" '+(q.ok?'disabled':'')+'>'+esc(s.opts[k])+'</button>').join('')+'</div><p class="meta">點選選項即提交答案。每次作答的選項順序不同。</p>';
 if(s.t==='build'){
  const bits=q.answer||'0'.repeat(p.n);
  html+='<p class="ask">要表示 <b>'+p.value+'</b>，應選哪些位置？完成後按「確認答案」。</p><p class="meta">提醒：每個數字的二進位組合只有一種（唯一性）。從最大的位值開始想，就不會選錯。</p><div class="bits">'+[...bits].map((b,k)=>'<button data-bit="'+k+'" aria-pressed="'+(b==='1')+'" class="'+(b==='1'?'on':'')+'" '+(q.ok?'disabled':'')+'><b>'+b+'</b><small>'+2**(p.n-k-1)+'</small></button>').join('')+'</div><p class="tally">目前合計 '+parseInt(bits,2)+'</p><button id="confirm-build" class="plain" '+(q.ok?'disabled':'')+'>確認答案</button>';
 }
 if(s.t==='trick'){
  const a=q.answer||[];
  if(!a.length&&!trickReady[s.id])html+='<p class="ask">'+(s.practice?'換一個和剛才不一樣的數字。':'卡爾把五張卡攤在桌上。')+'先看看這五張卡，再在心裡想好一個 0 到 31 的數字，不要說出來。</p>'+cardsHtml()+'<button id="trick-ready" class="btn">想好了，一張一張問我</button>';
  else if(a.length<5){html+='<p>心裡的數字在這張卡上嗎？（第 '+(a.length+1)+' 張）</p>'+card(CARDS[a.length])+'<div class="yn"><button id="yes">在上面</button><button id="no">不在上面</button></div>';}
  else html+='<div class="bigreveal"><p>卡爾猜的是</p><div class="n">'+a.reduce((n,x,k)=>n+(x?2**k:0),0)+'</div></div>'+(!q.ok?'<button id="confirm-trick" class="btn">我看過結果了</button>':'<p class="fb yes">讀心活動完成。</p>');
 }
 if(s.t==='pixel'){
  const bits=q.answer||'0'.repeat(64);
  html+='<p>按照資料還原圖案：<b>1 是白色（這格亮）</b>，<b>0 是黑色（這格暗）</b>。每一格一開始都是 0（黑色），點一下變成 1（白色）。可點選、拖曳，或用 Tab 與空白鍵操作。</p><div class="binrows">'+HEART.join('<br>')+'</div><div class="pix" id="grid">'+[...bits].map((b,k)=>'<button data-pixel="'+k+'" class="'+(b==='1'?'lit':'')+'" aria-label="第 '+(Math.floor(k/8)+1)+' 列第 '+(k%8+1)+' 格：'+(b==='1'?'1 白色':'0 黑色')+'" aria-pressed="'+(b==='1')+'" '+(q.ok?'disabled':'')+'></button>').join('')+'</div><button id="confirm-pixel" class="plain" '+(q.ok?'disabled':'')+'>確認圖案</button>';
 }
 if(s.t==='wave')html+='<p>灰色是原始聲音曲線，金色是電腦取樣後連起來的折線。</p><ol class="ladder"><li>把滑桿<b>拉到最左邊</b>（取樣最少，3～5 點），看金色折線和灰色曲線差多少。</li><li>再把滑桿<b>拉到最右邊</b>（取樣最多，60～64 點），再比較一次。</li><li>兩種都看過後，按「確認觀察完成」。</li></ol><canvas id="wave" width="900" height="250" aria-label="取樣曲線比較"></canvas><label for="sample">取樣點數：<b id="sample-value">'+(q.answer||16)+'</b></label><input id="sample" type="range" min="3" max="64" value="'+(q.answer||16)+'" '+(q.ok?'disabled':'')+'><p>最少取樣 '+(q.low?'✔ 已觀察':'✘ 還沒拉到最左邊')+' · 最多取樣 '+(q.high?'✔ 已觀察':'✘ 還沒拉到最右邊')+'</p><button id="confirm-wave" class="plain" '+(q.ok?'disabled':'')+'>確認觀察完成</button>';
 if(isAction(s)&&s.t!=='trick'){
  if(q.ok)html+='<p class="fb yes">完成！'+esc(fill(s.ok,p)||'結果正確。')+'</p>';
  else if(q.submissions)html+='<p class="fb no">還沒完成，對照題目再試一次。訂正不扣分。</p>';
  let hints=s.hints||[];
  if(s.t==='conv')hints=['只加寫著 1（在）的格子下面的小數字；寫著 0（不在）的跳過。','由右往左的位置值是 1、2、4、8、16、32、64、128。'];
  if(s.t==='build')hints=['從最大的位值開始，放得下就選，剩下的數再往下分。','也可以一直除以 2，將餘數由下往上讀。'];
  const used=q.hints||0,limit=hintLimit(s);
  if(hints.length)html+='<button id="hint" class="hintbtn" data-last="'+(used===limit-1)+'" '+(q.ok||used>=limit?'disabled':'')+'>'+(used>=limit?'提示已全部用完（本題扣 1 分）':used===limit-1?'看最後一個提示（'+used+'／'+limit+'，看了本題扣 1 分）':'提示 '+used+'／'+limit+'（全部用完才扣 1 分）')+'</button>'+hints.slice(0,used).map(h=>'<div class="hintout">'+esc(h)+'</div>').join('');
 }
 if(s.t==='final')html+='<p>你用一連串「有或沒有」，認識了數字、文字、圖片與聲音的表示方式。</p><button id="finish" class="btn" '+(r.completed?'disabled':'')+'>'+(r.completed?'已完成本次活動':'完成本次活動')+'</button>'+(r.completed?'<div class="retrybox"><p><b>想挑戰更快嗎？</b>重刷會換新的數字和選項順序，只重做選擇題和練習題並重新計時。第一次完成的分數會保留，另外記下你的最佳紀錄。</p><button id="retry-course" class="btn">重刷練習</button></div>':'');
 html+='<div class="nav"><button id="back" '+(r.step===0?'disabled':'')+'>上一步</button>'+(s.skip&&!q.ok?'<button id="skip">先跳過（不算答對）</button>':'')+(r.step<STEPS.length-1?'<button id="next" class="go" '+(isAction(s)&&!q.ok&&!q.skipped?'disabled':'')+'>'+esc(s.go||'繼續 →')+'</button>':'')+'</div></section>'+scorePanel(record);
 $('#app').innerHTML=html;
 $('#step-select').onchange=e=>send('navigate',null,+e.target.value);
 $('#back').onclick=()=>send('navigate',null,r.step-1);
 if($('#next'))$('#next').onclick=()=>send('next');
 if($('#skip'))$('#skip').onclick=()=>send('skip');
 if($('#hint'))$('#hint').onclick=()=>{if($('#hint').dataset.last==='true'&&!confirm('這是最後一個提示。看完後，這題答對時會扣 1 分。確定要看嗎？'))return;send('hint');};
 if($('#finish'))$('#finish').onclick=()=>send('finish');
 if($('#retry-course'))$('#retry-course').onclick=()=>{if(!confirm('開始重刷練習？會換新題目並重新計時；第一次完成的分數會保留，另外記下最佳紀錄。'))return;send('retry');};
 if($('#qtime')&&!q.ok)tickTimer=setInterval(()=>{const el=$('#qtime'),st=record?.state;if(el&&st)el.textContent=fmt(liveMs(st,STEPS[st.step]));},1000);
 if($('#answer-form'))$('#answer-form').onsubmit=e=>{e.preventDefault();send('submit',$('#answer').value);};
 document.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>send('submit',+b.dataset.opt));
 document.querySelectorAll('[data-bit]').forEach(b=>b.onclick=()=>{const v=[...(q.answer||'0'.repeat(p.n))];v[+b.dataset.bit]=v[+b.dataset.bit]==='1'?'0':'1';send('draft',v.join(''));});
 if($('#confirm-build'))$('#confirm-build').onclick=()=>send('submit',q.answer||'0'.repeat(p.n));
 document.querySelectorAll('[data-tbit]').forEach(b=>b.onclick=()=>{
  const v=[...(byteTools[s.id]||'00000000')],k=+b.dataset.tbit;v[k]=v[k]==='1'?'0':'1';byteTools[s.id]=v.join('');
  b.classList.toggle('on',v[k]==='1');b.setAttribute('aria-pressed',v[k]==='1');b.querySelector('b').textContent=v[k];
  const n=parseInt(byteTools[s.id],2);$('#tool-value').textContent=n;$('#tool-glyph').textContent=glyph(n);
 });
 if($('#tool-copy'))$('#tool-copy').onclick=()=>{$('#answer').value=byteTools[s.id]||'00000000';$('#answer').focus();};
 if($('#yes')){$('#yes').onclick=()=>send('draft',[...(q.answer||[]),true]);$('#no').onclick=()=>send('draft',[...(q.answer||[]),false]);}
 if($('#trick-ready'))$('#trick-ready').onclick=()=>{trickReady[s.id]=true;renderStudent();};
 document.querySelectorAll('[data-review]').forEach(b=>b.onclick=()=>{returnTo=r.step;send('navigate',null,+b.dataset.review);});
 if($('#review-return'))$('#review-return').onclick=()=>send('navigate',null,returnTo);
 if($('#confirm-trick'))$('#confirm-trick').onclick=()=>send('submit',q.answer);
 if($('#grid')){
  let bits=[...(q.answer||'0'.repeat(64))],painting=false,mode='1',dirty=false;
  const paint=b=>{if(!b||q.ok)return;const k=+b.dataset.pixel;if(bits[k]===mode)return;bits[k]=mode;dirty=true;b.classList.toggle('lit',mode==='1');b.setAttribute('aria-pressed',mode==='1');b.setAttribute('aria-label',b.getAttribute('aria-label').replace(/：.*$/,'：'+(mode==='1'?'1 白色':'0 黑色')));};
  $('#grid').onpointerdown=e=>{const b=e.target.closest('[data-pixel]');if(!b||q.ok)return;painting=true;mode=bits[+b.dataset.pixel]==='1'?'0':'1';paint(b);e.preventDefault();};
  $('#grid').onpointermove=e=>{if(!painting)return;const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-pixel]');if(b)paint(b);};
  const end=()=>{if(!painting)return;painting=false;if(dirty){dirty=false;send('draft',bits.join(''));}};
  document.onpointerup=end;document.onpointercancel=end;
  document.querySelectorAll('[data-pixel]').forEach(b=>b.onclick=e=>{if(e.detail===0&&!q.ok){mode=bits[+b.dataset.pixel]==='1'?'0':'1';paint(b);send('draft',bits.join(''));}});
  $('#confirm-pixel').onclick=()=>send('submit',bits.join(''));
 }else{document.onpointerup=null;document.onpointercancel=null;}
 if($('#sample')){$('#sample').oninput=e=>{$('#sample-value').textContent=e.target.value;drawWave(+e.target.value);};$('#sample').onchange=e=>send('draft',+e.target.value);$('#confirm-wave').onclick=()=>send('submit',+(q.answer||16));drawWave(q.answer||16);}
}
function card(c){return '<div class="cardbox"><div class="hd">卡片 '+(c.i+1)+'</div><div class="nums">'+c.list.map(n=>'<span class="'+(n===c.value?'key':'')+'">'+n+'</span>').join('')+'</div></div>';}
function drawWave(n){
 const c=$('#wave'),g=c.getContext('2d'),w=c.width,h=c.height,f=x=>h/2-Math.sin(x/w*Math.PI*4)*h*.3-Math.sin(x/w*Math.PI*9)*h*.09;
 g.clearRect(0,0,w,h);g.lineWidth=3;g.strokeStyle='#888';g.beginPath();for(let x=0;x<=w;x+=2)x?g.lineTo(x,f(x)):g.moveTo(x,f(x));g.stroke();
 g.strokeStyle='#b88b36';g.beginPath();for(let k=0;k<=n;k++){const x=k/n*w;k?g.lineTo(x,f(x)):g.moveTo(x,f(x));}g.stroke();
}
$('#reset').onclick=()=>{
 if(!confirm('清除這台電腦上的課程進度，從頭開始？'))return;
 course.reset();record=null;startScreen();status('進度已清除。');
};
record=course.mine();
if(record.state){status('已讀取這台電腦上的進度 · '+new Date(record.updatedMs).toLocaleString('zh-TW'));renderStudent();}
else{status('不用登入。進度只會存在這台電腦的瀏覽器，不會上傳。');startScreen();}
