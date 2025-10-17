
// tiny helpers
const $ = (s)=>document.querySelector(s);
const $$ = (s)=>document.querySelectorAll(s);
let API_BASE = localStorage.getItem('api_base') || '';

// Tabs
function setVisible(tab){
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  $$('.panel').forEach(p=>p.classList.toggle('active', p.id === 'tab-' + tab));
}
$$('.tab').forEach(b=>b.addEventListener('click', ()=>{
  const t = b.dataset.tab;
  if(['homework','schedule','rebuses'].includes(t) && !ensureClassSelected()) return;
  setVisible(t);
}));
$('#btn-open-class-from-home')?.addEventListener('click', ()=>$('#class-modal').classList.remove('hidden'));

// theme toggle
(function initTheme(){
  const saved = localStorage.getItem('theme') || 'dark';
  if(saved==='light') document.documentElement.classList.add('light');
  $('#btn-theme').addEventListener('click', ()=>{
    document.documentElement.classList.toggle('light');
    localStorage.setItem('theme', document.documentElement.classList.contains('light') ? 'light' : 'dark');
  });
})();

// Show/hide admin UI depending on is_admin flag (front-only guard)
function applyAdminVisibility(){
  const isAdmin = localStorage.getItem('is_admin') === '1';
  $$('.admin-only').forEach(el => el.style.display = isAdmin ? '' : 'none');
}
applyAdminVisibility();

// ==== Class select modal ====
function ensureClassSelected(){
  const cid = localStorage.getItem('selected_class_id');
  if(!cid){
    $('#class-modal').classList.remove('hidden');
    setVisible('home');
    return false;
  }
  return true;
}
$('#btn-select-class').onclick = ()=>$('#class-modal').classList.remove('hidden');
$('#btn-cls-close').onclick = ()=>$('#class-modal').classList.add('hidden');
$('#btn-open-classes')?.addEventListener('click', ()=>$('#class-modal').classList.remove('hidden'));
$('#btn-open-schedule')?.addEventListener('click', ()=>setVisible('schedule'));

// Class search/list (simple API bindings)
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
  if(!id){ alert('Укажи ID класса.'); return; }
  localStorage.setItem('selected_class_id', id);
  $('#class-modal').classList.add('hidden');
};

// ==== Homework ====
function setDateInput(d){
  const iso = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,10);
  $('#hw-date').value = iso;
}
$('#hw-today').onclick = ()=>setDateInput(new Date());
$('#hw-tomorrow').onclick = ()=>{ const d=new Date(); d.setDate(d.getDate()+1); setDateInput(d); };
$('#btn-hw-load').onclick = async ()=>{
  if(!ensureClassSelected()) return;
  const date = $('#hw-date').value;
  if(!date){ alert('Выбери дату'); return; }
  const res = await apiGet('/homework?date='+encodeURIComponent(date));
  $('#hw-out').textContent = (res && res.text) ? res.text : '— Записей пока нет.';
};

// ==== Schedule ====
async function renderScheduleFiles(files){
  const out = $('#sch-out'); out.innerHTML='';
  (files||[]).forEach(fid=>{
    const img = document.createElement('img');
    img.className='card'; img.style.maxWidth='100%';
    img.src = API_BASE ? (API_BASE + '/file/' + encodeURIComponent(fid)) : '#';
    out.appendChild(img);
  });
  if(!files || files.length===0){ out.textContent = 'Нет расписания для выбранного раздела.'; }
}
$('#btn-sch-load').onclick = async ()=>{
  if(!ensureClassSelected()) return;
  const kind = $('#sch-kind').value;
  const res = await apiGet('/schedule/'+kind);
  await renderScheduleFiles(res.files);
};

// ==== Rebuses (Gift/Rules/Top) ====
$('#btn-gift').onclick = ()=>{
  $('#reb-out').textContent = '🎁 Подарок: +5 очков за активность! (демо)';
};
$('#btn-rules').onclick = ()=>{
  $('#reb-out').textContent = 'Правила: решай ребусы, получай очки. За неверный ответ очки не списываются.';
};
$('#btn-reb-top').onclick = async ()=>{
  if(!ensureClassSelected()) return;
  const res = await apiGet('/rebuses/top');
  const lines = (res.top||[]).map((x,i)=>`${i+1}. ${x.username||x.user_id}: ${x.score}`);
  $('#reb-out').textContent = lines.join('\\n') || 'Пока пусто.';
};

// ==== Admin: Homework save/delete ====
$('#btn-adm-hw-save').onclick = async ()=>{
  const date = $('#adm-hw-date').value, text = $('#adm-hw-text').value;
  if(!date || !text){ $('#adm-hw-out').textContent='Укажи дату и текст.'; return; }
  const r = await apiPost('/homework', {date, text});
  $('#adm-hw-out').textContent = r.ok ? 'Сохранено.' : 'Ошибка';
};
$('#btn-adm-hw-del').onclick = async ()=>{
  const date = $('#adm-hw-date').value;
  if(!date){ $('#adm-hw-out').textContent='Укажи дату.'; return; }
  const r = await apiPost('/homework/delete', {date});
  $('#adm-hw-out').textContent = r.ok ? 'Удалено.' : 'Ошибка';
};

// ==== Admin: Schedule add/clear ====
$('#btn-adm-sch-add').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value; const file_id = $('#adm-sch-fileid').value;
  if(!file_id){ $('#adm-sch-out').textContent='Вставь Telegram file_id.'; return; }
  const r = await apiPost('/schedule', {kind, file_id});
  $('#adm-sch-out').textContent = r.ok ? 'Файл добавлен.' : 'Ошибка';
};
$('#btn-adm-sch-clear').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value;
  if(!confirm('Очистить раздел '+kind+'?')) return;
  const r = await apiPost('/schedule/clear', {kind});
  $('#adm-sch-out').textContent = r.ok ? 'Очищено.' : 'Ошибка';
};

// ==== Admin: Users block/unblock ====
$('#btn-adm-user-block').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const r = await apiPost('/users/block', {user_id});
  $('#adm-user-out').textContent = r.ok ? 'Пользователь заблокирован.' : 'Ошибка';
};
$('#btn-adm-user-unblock').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const r = await apiPost('/users/unblock', {user_id});
  $('#adm-user-out').textContent = r.ok ? 'Пользователь разблокирован.' : 'Ошибка';
};

// ==== Admin: Modes ====
$('#btn-save-modes').onclick = async ()=>{
  const r = await apiPost('/modes', {vacation: $('#mode-vac').checked, maintenance: $('#mode-maint').checked});
  $('#modes-out').textContent = r.ok ? 'Сохранено.' : 'Ошибка';
};
(async ()=>{
  try{
    const m = await apiGet('/modes');
    $('#mode-vac').checked = !!m.vacation;
    $('#mode-maint').checked = !!m.maintenance;
  }catch(e){}
})();

// ==== Admin: Stats (simple pretty) ====
$('#btn-adm-stats').onclick = async ()=>{
  const s = await apiGet('/stats');
  const html = `
    <div><b>Пользователи:</b> ${s.users||0}</div>
    <div><b>ДЗ записей:</b> ${s.homework||0}</div>
    <div><b>Ребусов:</b> ${s.rebuses||0}</div>
    <div><b>Сессий ребусов:</b> ${s.sessions||0}</div>
  ` + ((s.topClicks||[]).map(x=>`<div>• ${x[0]} — ${x[1]}</div>`).join(''));
  $('#adm-stats-out').innerHTML = html;
};

// ==== Broadcast ====
$('#btn-bc-all').onclick = async ()=>{
  const text = $('#bc-text').value || 'Важное сообщение для всех пользователей.';
  const r = await apiPost('/broadcast', {scope:'all', text});
  $('#bc-out').textContent = r.ok ? 'Рассылка принята.' : 'Ошибка';
};
$('#btn-bc-auto-hw').onclick = async ()=>{
  const r = await apiPost('/broadcast', {scope:'auto_homework', text:''});
  $('#bc-out').textContent = r.ok ? 'Отправлен авто‑текст о ДЗ.' : 'Ошибка';
};
$('#btn-bc-auto-hw-sch').onclick = async ()=>{
  const r = await apiPost('/broadcast', {scope:'auto_homework_schedule', text:''});
  $('#bc-out').textContent = r.ok ? 'Отправлен авто‑текст о ДЗ и расписании.' : 'Ошибка';
};

// ==== API helpers ====
async function apiGet(path){
  if(!API_BASE) return mockGet(path);
  const r = await fetch(API_BASE + path); return r.json();
}
async function apiPost(path, data){
  if(!API_BASE) return mockPost(path, data);
  const r = await fetch(API_BASE + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  return r.json();
}

// ==== Mocks for static mode (optional) ====
function mockGet(path){
  if(path.startsWith('/homework')){
    const params = new URLSearchParams(path.split('?')[1]); const d = params.get('date');
    return {date:d, text: 'Математика — параграф 12, задачи 3-5. Русский — упр. 24.'};
  }
  if(path.startsWith('/schedule/')) return {kind:'today', files:[]};
  if(path==='/rebuses/top') return {top:[{user_id:1,username:'user1',score:25},{user_id:2,username:'user2',score:20}]};
  if(path==='/classes') return {classes:[{"id":1,"title":"8А","school":"Школа 1","city":"Город"}]};
  if(path.startsWith('/classes/search')) return {classes:[{"id":1,"title":"8А","school":"Школа 1","city":"Город"}]};
  if(path==='/modes') return {vacation:false, maintenance:false};
  if(path==='/stats') return {users:120, homework:350, rebuses:50, sessions:420, topClicks:[["/start",200],["ДЗ",140]]};
  return {};
}
function mockPost(path, data){ return {ok:true, id: Math.floor(Math.random()*1000)}; }
