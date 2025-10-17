
// helpers
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
// Allow passing API base via query (?api=https://host) so that TG webview has it
const __qp = new URLSearchParams(location.search);
const __apiFromQ = __qp.get('api');
if(__apiFromQ){ localStorage.setItem('api_base', __apiFromQ); }
let API_BASE = localStorage.getItem('api_base') || '';

// Telegram initData (for admin)
let TG_INIT = '';
if(window.Telegram && Telegram.WebApp){
  Telegram.WebApp.ready();
  TG_INIT = Telegram.WebApp.initData || '';
  localStorage.setItem('tg_init', TG_INIT || '');
} else {
  TG_INIT = localStorage.getItem('tg_init') || '';
}

// Tabs
function setVisible(tab){
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-' + tab));
  if(['homework','schedule'].includes(tab) && !ensureClassSelected()) setVisible('home');
}
$$('.tab').forEach(b=>b.addEventListener('click', ()=>setVisible(b.dataset.tab)));
$('#btn-open-class-from-home')?.addEventListener('click', ()=>$('#class-modal').classList.remove('hidden'));
$('#btn-open-hw-from-home')?.addEventListener('click', ()=>{ if(ensureClassSelected()) setVisible('homework'); });

// theme toggle
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'dark';
  if(saved==='light') document.documentElement.classList.add('light');
  $('#btn-theme').addEventListener('click', ()=>{
    document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
  });
})();

// Admin: server-side auth
(async function initAdmin(){
  try{
    const me = await apiGet('/auth/me?init=' + encodeURIComponent(TG_INIT));
    const isAdmin = !!me.is_admin;
    const elTab = document.querySelector('button[data-tab="admin"]');
    const elPanel = $('#tab-admin');
    if(isAdmin){ elTab.style.display=''; elPanel.style.display=''; } else { elTab.style.display='none'; elPanel.style.display='none'; }
    document.getElementById('tg-user').title = 'API=' + (API_BASE||'-');
    $('#tg-user').textContent = me.username ? ('@'+me.username) : (me.user_id || '');
  }catch(e){}
})();

// ==== Class select modal ====
function ensureClassSelected(){
  const cid = localStorage.getItem('selected_class_id');
  if(!cid){
    $('#class-modal').classList.remove('hidden');
    return false;
  }
  return true;
}
$('#btn-select-class').onclick = ()=>$('#class-modal').classList.remove('hidden');
$('#btn-cls-close').onclick = ()=>$('#class-modal').classList.add('hidden');

$('#btn-cls-all').onclick = async ()=>{
  const res = await apiGet('/classes');
  $('#cls-list-out').textContent = JSON.stringify(res.classes||[], null, 2) || 'Пусто';
};
$('#btn-cls-search').onclick = async ()=>{
  const q = $('#cls-q').value.trim();
  const res = await apiGet('/classes/search?q='+encodeURIComponent(q));
  $('#cls-list-out').textContent = JSON.stringify(res.classes||[], null, 2) || 'Не найдено';
};
$('#btn-cls-join').onclick = async ()=>{
  const id = $('#cls-id').value.trim();
  const join_code = $('#cls-joincode').value.trim();
  if(!id){ alert('Укажи ID класса.'); return; }
  const res = await apiPost('/classes/join?init=' + encodeURIComponent(TG_INIT), {class_id:Number(id), join_code});
  if(res.ok){
    localStorage.setItem('selected_class_id', String(id));
    $('#class-modal').classList.add('hidden');
  }else{
    alert(res.error || 'Ошибка вступления.');
  }
};

// ==== Homework ====
function setDateInput(d){
  const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $('#hw-date').value = iso;
}
$('#hw-today').onclick = ()=>setDateInput(new Date());
$('#hw-tomorrow').onclick = ()=>{ const d=new Date(); d.setDate(d.getDate()+1); setDateInput(d); };

function renderHomeworkCard(date, text){
  const card = document.createElement('div');
  card.className='hw-card';
  const head = document.createElement('div');
  head.className='hw-head';
  head.innerHTML = `<div class="sticker">📌</div><div><b>${date}</b></div>`;
  const body = document.createElement('div');
  body.innerHTML = (text||'—').replace(/\\n/g,'<br>');
  card.appendChild(head); card.appendChild(body);
  return card;
}
$('#btn-hw-load').onclick = async ()=>{
  if(!ensureClassSelected()) return;
  const date = $('#hw-date').value;
  if(!date){ alert('Выбери дату'); return; }
  const res = await apiGet('/homework?date='+encodeURIComponent(date));
  const wrap = $('#hw-cards'); wrap.innerHTML='';
  wrap.appendChild(renderHomeworkCard(res.date || date, res.text || '— Записей пока нет.'));
};

// ==== Schedule ====
async function renderScheduleFiles(files){
  const out = $('#sch-list'); out.innerHTML='';
  (files||[]).forEach(fid=>{
    const img = document.createElement('img');
    img.className='card'; img.style.maxWidth='100%';
    img.src = API_BASE ? (API_BASE + '/file/' + encodeURIComponent(fid)) : '#';
    out.appendChild(img);
  });
  if(!files || files.length===0){ out.innerHTML = '<div class="muted">Нет расписания для выбранного раздела.</div>'; }
}
$('#btn-sch-load').onclick = async ()=>{
  if(!ensureClassSelected()) return;
  const kind = $('#sch-kind').value;
  const res = await apiGet('/schedule/'+kind);
  await renderScheduleFiles(res.files);
};

// ==== Admin: Homework save/delete ====
$('#btn-adm-hw-save').onclick = async ()=>{
  const date = $('#adm-hw-date').value, text = $('#adm-hw-text').value;
  if(!date || !text){ $('#adm-hw-out').textContent='Укажи дату и текст.'; return; }
  const r = await apiPost('/homework?init='+encodeURIComponent(TG_INIT), {date, text});
  $('#adm-hw-out').textContent = r.ok ? 'Сохранено.' : (r.error||'Ошибка');
};
$('#btn-adm-hw-del').onclick = async ()=>{
  const date = $('#adm-hw-date').value;
  if(!date){ $('#adm-hw-out').textContent='Укажи дату.'; return; }
  const r = await apiPost('/homework/delete?init='+encodeURIComponent(TG_INIT), {date});
  $('#adm-hw-out').textContent = r.ok ? 'Удалено.' : (r.error||'Ошибка');
};

// ==== Admin: Schedule add/clear/list ====
$('#btn-adm-sch-add').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value; const file_id = $('#adm-sch-fileid').value;
  if(!file_id){ $('#adm-sch-out').textContent='Вставь Telegram file_id.'; return; }
  const r = await apiPost('/schedule?init='+encodeURIComponent(TG_INIT), {kind, file_id});
  $('#adm-sch-out').textContent = r.ok ? 'Файл добавлен.' : (r.error||'Ошибка');
};
$('#btn-adm-sch-clear').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value;
  if(!confirm('Очистить раздел '+kind+'?')) return;
  const r = await apiPost('/schedule/clear?init='+encodeURIComponent(TG_INIT), {kind});
  $('#adm-sch-out').textContent = r.ok ? 'Очищено.' : (r.error||'Ошибка');
};
$('#btn-adm-sch-list').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value;
  const res = await apiGet('/schedule/'+kind+'?init='+encodeURIComponent(TG_INIT));
  $('#adm-sch-out').textContent = JSON.stringify(res.files||[], null, 2) || 'Пусто';
};

// ==== Admin: Users block/unblock ====
$('#btn-adm-user-block').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const r = await apiPost('/users/block?init='+encodeURIComponent(TG_INIT), {user_id});
  $('#adm-user-out').textContent = r.ok ? 'Пользователь заблокирован.' : (r.error||'Ошибка');
};
$('#btn-adm-user-unblock').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const r = await apiPost('/users/unblock?init='+encodeURIComponent(TG_INIT), {user_id});
  $('#adm-user-out').textContent = r.ok ? 'Пользователь разблокирован.' : (r.error||'Ошибка');
};

// ==== Admin: Modes ====
$('#btn-save-modes').onclick = async ()=>{
  const r = await apiPost('/modes?init='+encodeURIComponent(TG_INIT), {vacation: $('#mode-vac').checked, maintenance: $('#mode-maint').checked});
  $('#modes-out').textContent = r.ok ? 'Сохранено.' : (r.error||'Ошибка');
};
(async ()=>{
  try{
    const m = await apiGet('/modes');
    $('#mode-vac').checked = !!m.vacation;
    $('#mode-maint').checked = !!m.maintenance;
  }catch(e){}
})();

// ==== Admin: Stats (tables + chart) ====
let statsChart;
$('#btn-adm-stats').onclick = async ()=>{
  const s = await apiGet('/stats?init='+encodeURIComponent(TG_INIT));
  // table
  const tbody = $('#stats-main tbody'); tbody.innerHTML='';
  const rows = [
    ['Пользователи', s.users||0],
    ['ДЗ записей', s.homework||0],
    ['Ребусов', s.rebuses||0],
    ['Сессий ребусов', s.sessions||0],
  ];
  rows.forEach(r=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${r[0]}</td><td><b>${r[1]}</b></td>`;
    tbody.appendChild(tr);
  });
  // chart by topClicks
  const labels = (s.topClicks||[]).map(x=>x[0]);
  const values = (s.topClicks||[]).map(x=>x[1]);
  const ctx = document.getElementById('stats-chart');
  if(statsChart) statsChart.destroy();
  statsChart = new Chart(ctx, {
    type:'bar',
    data:{labels, datasets:[{label:'События (14д)', data:values}]},
    options:{responsive:true, maintainAspectRatio:false}
  });
};

// ==== Broadcast ====
$('#btn-bc-all').onclick = async ()=>{
  const text = $('#bc-text').value || 'Важное сообщение для всех пользователей.';
  const r = await apiPost('/broadcast?init='+encodeURIComponent(TG_INIT), {scope:'all', text});
  $('#bc-out').textContent = r.ok ? 'Рассылка принята.' : (r.error||'Ошибка');
};
$('#btn-bc-auto-hw').onclick = async ()=>{
  const r = await apiPost('/broadcast?init='+encodeURIComponent(TG_INIT), {scope:'auto_homework'});
  $('#bc-out').textContent = r.ok ? 'Отправлен авто‑текст о ДЗ.' : (r.error||'Ошибка');
};
$('#btn-bc-auto-hw-sch').onclick = async ()=>{
  const r = await apiPost('/broadcast?init='+encodeURIComponent(TG_INIT), {scope:'auto_homework_schedule'});
  $('#bc-out').textContent = r.ok ? 'Отправлен авто‑текст о ДЗ и расписании.' : (r.error||'Ошибка');
};

// ==== API helpers ====
async function apiGet(path){
  if(!API_BASE) return mockGet(path);
  const r = await fetch(API_BASE + path, {headers:{'X-Requested-With':'webapp'}}); 
  return r.json();
}
async function apiPost(path, data){
  if(!API_BASE) return mockPost(path, data);
  const r = await fetch(API_BASE + path, {method:'POST', headers:{'Content-Type':'application/json','X-Requested-With':'webapp'}, body:JSON.stringify(data||{})});
  return r.json();
}

// ==== Mocks for static mode ====
function mockGet(path){
  if(path.startsWith('/auth/me')) return {is_admin:false, user_id:0};
  if(path.startsWith('/homework')) return {date:'2025-10-17', text:'Демо: Математика — п.12 №3-5\\nРусский — упр.24'};
  if(path.startsWith('/schedule/')) return {kind:'today', files:[]};
  if(path.startsWith('/classes/search') || path==='/classes') return {classes:[{id:1,title:'8А',school:'Школа 1',city:'Москва'}]};
  if(path.startsWith('/stats')) return {users:120, homework:350, rebuses:50, sessions:420, topClicks:[['/start',200],['ДЗ',140]]};
  if(path.startsWith('/modes')) return {vacation:false, maintenance:false};
  return {};
}
function mockPost(path, data){ return {ok:true}; }
