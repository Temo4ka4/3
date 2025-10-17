/* Simple SPA + Telegram WebApp support + two adapters (static + API) */
const API_BASE = localStorage.getItem('api_base') || ''; // set to e.g. https://your-domain/api
const useStatic = !API_BASE;

const $ = (sel)=>document.querySelector(sel);
const $$ = (sel)=>document.querySelectorAll(sel);

function setVisible(tabId){
  $$('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tabId));
  $$('.panel').forEach(p=>p.classList.remove('visible'));
  document.querySelector('#tab-'+tabId).classList.add('visible');
}

document.addEventListener('click', (e)=>{
  const b = e.target.closest('.tab');
  if(!b) return;
  setVisible(b.dataset.tab);
});

// Telegram WebApp integration
(function initTG(){
  if(window.Telegram && Telegram.WebApp){
    const tg = Telegram.WebApp;
    tg.ready(); tg.expand();
    const user = tg.initDataUnsafe?.user;
    if(user){
      $('#tg-user').textContent = `@${user.username||''} • ${user.first_name||''}`;
    } else {
      $('#tg-user').textContent = 'Статический режим (не из Telegram)';
    }
  } else {
    $('#tg-user').textContent = 'Статический режим (без Telegram WebApp)';
  }
})();

/* ADAPTERS */
async function apiGet(path){
  if(useStatic) return staticGet(path);
  const r = await fetch(API_BASE + path);
  if(!r.ok) throw new Error('API ' + r.status);
  return await r.json();
}
async function apiPost(path, data){
  if(useStatic) return staticPost(path, data);
  const r = await fetch(API_BASE + path, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data)});
  if(!r.ok) throw new Error('API ' + r.status);
  return await r.json();
}

/* STATIC MOCKS (LocalStorage) */
const mock = JSON.parse(localStorage.getItem('mock_data')||'{}');
function saveMock(){ localStorage.setItem('mock_data', JSON.stringify(mock)); }

async function staticGet(path){
  // /homework?date=YYYY-MM-DD
  if(path.startsWith('/homework')){
    const u = new URL('http://x'+path);
    const date = u.searchParams.get('date');
    return { date, text: (mock.homework?.[date] || '— Записей пока нет.') };
  }
  if(path.startsWith('/schedule/')){
    const kind = path.split('/').pop();
    const arr = mock.schedule?.[kind] || [];
    return { kind, files: arr };
  }
  if(path==='/rebuses'){
    return { items: mock.rebuses || [] };
  }
  if(path==='/rebuses/top'){
    return { top: mock.top || [] };
  }
  if(path==='/users'){
    return { users: mock.users || [] };
  }
  if(path.startsWith('/users/')){
    const id = path.split('/').pop();
    const u = (mock.users||[]).find(x=>String(x.user_id)===String(id));
    return { user: u || null };
  }
  if(path==='/classes'){
    return { classes: mock.classes || [] };
  }
  if(path.startsWith('/classes/')){
    const id = path.split('/').pop();
    const c = (mock.classes||[]).find(x=>String(x.id)===String(id));
    return { cls: c || null };
  }
  if(path==='/modes'){
    return { vacation: !!mock.vacation, maintenance: !!mock.maintenance };
  }
  if(path==='/stats'){
    return mock.stats || { users:0, homework:0, rebuses:0, sessions:0, topClicks: [] };
  }
  return {};
}
async function staticPost(path, data){
  if(path==='/broadcast'){
    return { ok:true, sent:true, preview: data };
  }
  if(path==='/modes'){
    mock.vacation = !!data.vacation; mock.maintenance = !!data.maintenance; saveMock();
    return { ok:true };
  }
  return { ok:true };
}

/* UI bindings */
$('#btn-hw-today').onclick = ()=>{
  const d = new Date(); $('#hw-date').value = d.toISOString().slice(0,10);
};
$('#btn-hw-tomorrow').onclick = ()=>{
  const d = new Date(Date.now()+86400000); $('#hw-date').value = d.toISOString().slice(0,10);
};
$('#btn-hw-load').onclick = async ()=>{
  const d = $('#hw-date').value;
  const res = await apiGet('/homework?date='+encodeURIComponent(d));
  $('#hw-out').textContent = `Домашнее задание на ${res.date}\n\n${res.text}`;
};

$('#btn-sch-load').onclick = async ()=>{
  const kind = $('#sch-kind').value;
  const res = await apiGet('/schedule/'+kind);
  const out = $('#sch-out'); out.innerHTML='';
  (res.files||[]).forEach(url=>{
    const img = document.createElement('img'); img.src = url; img.className='card'; img.style.maxWidth='100%';
    out.appendChild(img);
  });
  if(!res.files || res.files.length===0){ out.textContent = 'Нет расписания для выбранного раздела.'; }
};

$('#btn-reb-list').onclick = async ()=>{
  const res = await apiGet('/rebuses');
  $('#reb-out').textContent = (res.items||[]).map((x,i)=>`${i+1}. [${x.difficulty||'medium'}] ${x.payload} → ${x.answer}`).join('\n') || 'Пока нет ребусов.';
};
$('#btn-reb-top').onclick = async ()=>{
  const res = await apiGet('/rebuses/top');
  $('#reb-out').textContent = (res.top||[]).map((x,i)=>`${i+1}. ${x.username||x.user_id}: ${x.score} очков`).join('\n') || 'Топ пуст.';
};

$('#btn-user-get').onclick = async ()=>{
  const id = $('#user-id').value.trim(); if(!id) return;
  const res = await apiGet('/users/'+id);
  $('#users-out').textContent = res.user ? JSON.stringify(res.user, null, 2) : 'Не найдено';
};
$('#btn-users-all').onclick = async ()=>{
  const res = await apiGet('/users');
  $('#users-out').textContent = JSON.stringify(res.users||[], null, 2);
};

$('#btn-class-get').onclick = async ()=>{
  const id = $('#class-id').value.trim(); if(!id) return;
  const res = await apiGet('/classes/'+id);
  $('#classes-out').textContent = res.cls ? JSON.stringify(res.cls, null, 2) : 'Не найдено';
};
$('#btn-classes-all').onclick = async ()=>{
  const res = await apiGet('/classes');
  $('#classes-out').textContent = JSON.stringify(res.classes||[], null, 2);
};

$('#btn-bc-all').onclick = async ()=>{
  const txt = $('#bc-text').value.trim();
  if(!txt) return $('#bc-out').textContent = 'Введите текст.';
  const res = await apiPost('/broadcast', {scope:'all', text:txt});
  $('#bc-out').textContent = res.ok ? 'Оповещение отправлено (симуляция).' : 'Ошибка';
};
$('#btn-bc-homework').onclick = async ()=>{
  const txt = $('#bc-text').value.trim();
  if(!txt) return $('#bc-out').textContent = 'Введите текст.';
  const res = await apiPost('/broadcast', {scope:'homework', text:txt});
  $('#bc-out').textContent = res.ok ? 'Оповещение отправлено (симуляция).' : 'Ошибка';
};

$('#btn-modes-save').onclick = async ()=>{
  const res = await apiPost('/modes', { vacation: $('#mode-vac').checked, maintenance: $('#mode-maint').checked });
  $('#modes-out').textContent = res.ok ? 'Сохранено.' : 'Ошибка';
};

$('#btn-stats-load').onclick = async ()=>{
  const res = await apiGet('/stats');
  $('#stats-out').textContent = JSON.stringify(res, null, 2);
};

/* Seed some mock data for demo (only once) */
if(!localStorage.getItem('mock_data')){
  mock.homework = {};
  const today = new Date();
  const t = today.toISOString().slice(0,10);
  const z = new Date(Date.now()+86400000).toISOString().slice(0,10);
  mock.homework[t] = 'Алгебра: № 123, 124; Геометрия: № 12.\nРусский: упражнение 85.';
  mock.homework[z] = 'Физика: §5, задачи 1–3.\nИнформатика: проект из воркбука.';
  mock.schedule = { today: [], tomorrow: [], alldays: [], bells: [] };
  mock.rebuses = [{payload:'КИТ + АЙ = ?', answer:'китай', difficulty:'easy'}];
  mock.top = [{user_id:1, username:'temo4ka', score:17}];
  mock.users = [{user_id:1319684624, username:'you', first_name:'Admin', muted_all:0}];
  mock.classes = [{id:1, title:'8А', school:'Гимназия №1', city:'Казань', shift:'1'}];
  mock.vacation=false; mock.maintenance=false;
  mock.stats = { users:1, homework:2, rebuses:1, sessions:5, topClicks:[['/start',10],['ДЗ',7]] };
  saveMock();
}

/* === Admin panel === */
$('#btn-adm-hw-save').onclick = async ()=>{
  const date = $('#adm-hw-date').value; const text = $('#adm-hw-text').value;
  if(!date || !text){ $('#adm-hw-out').textContent='Укажи дату и текст.'; return; }
  const res = await apiPost('/homework', {date, text});
  $('#adm-hw-out').textContent = res.ok ? 'Сохранено.' : 'Ошибка';
};
$('#btn-adm-hw-del').onclick = async ()=>{
  const date = $('#adm-hw-date').value;
  if(!date){ $('#adm-hw-out').textContent='Укажи дату.'; return; }
  const res = await apiPost('/homework/delete', {date});
  $('#adm-hw-out').textContent = res.ok ? 'Удалено.' : 'Ошибка';
};

$('#btn-adm-reb-add').onclick = async ()=>{
  const payload = {
    kind: $('#adm-reb-kind').value || 'word',
    payload: $('#adm-reb-payload').value,
    answer: $('#adm-reb-answer').value,
    hint: $('#adm-reb-hint').value || null,
    difficulty: $('#adm-reb-diff').value || 'medium'
  };
  if(!payload.payload || !payload.answer){ $('#adm-reb-out').textContent='Нужны payload и answer.'; return; }
  const res = await apiPost('/rebuses', payload);
  $('#adm-reb-out').textContent = res.ok ? 'Добавлено (id: '+res.id+').' : 'Ошибка';
};
$('#btn-adm-reb-del').onclick = async ()=>{
  const id = $('#adm-reb-id').value;
  if(!id){ $('#adm-reb-out').textContent='Укажи ID.'; return; }
  const res = await apiPost('/rebuses/delete', {id: Number(id)});
  $('#adm-reb-out').textContent = res.ok ? 'Удалено.' : 'Ошибка';
};
$('#btn-adm-reb-purge').onclick = async ()=>{
  if(!confirm('Удалить ВСЕ ребусы?')) return;
  const res = await apiPost('/rebuses/purge', {});
  $('#adm-reb-out').textContent = res.ok ? 'Все ребусы удалены.' : 'Ошибка';
};
$('#btn-adm-reb-list').onclick = async ()=>{
  const res = await apiGet('/rebuses');
  $('#adm-reb-out').textContent = (res.items||[]).map((x,i)=>`${x.id||'?'} | [${x.difficulty}] ${x.payload} → ${x.answer}`).join('\n') || 'Пусто';
};

$('#btn-adm-user-block').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const res = await apiPost('/users/block', {user_id});
  $('#adm-user-out').textContent = res.ok ? 'Пользователь заблокирован.' : 'Ошибка';
};
$('#btn-adm-user-unblock').onclick = async ()=>{
  const user_id = Number($('#adm-user-id').value);
  if(!user_id){ $('#adm-user-out').textContent='Укажи user_id.'; return; }
  const res = await apiPost('/users/unblock', {user_id});
  $('#adm-user-out').textContent = res.ok ? 'Пользователь разблокирован.' : 'Ошибка';
};

$('#btn-adm-sch-add').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value; const file_id = $('#adm-sch-fileid').value;
  if(!file_id){ $('#adm-sch-out').textContent='Вставь Telegram file_id.'; return; }
  const res = await apiPost('/schedule', {kind, file_id});
  $('#adm-sch-out').textContent = res.ok ? 'Файл добавлен.' : 'Ошибка';
};
$('#btn-adm-sch-clear').onclick = async ()=>{
  const kind = $('#adm-sch-kind').value;
  if(!confirm('Очистить раздел '+kind+'?')) return;
  const res = await apiPost('/schedule/clear', {kind});
  $('#adm-sch-out').textContent = res.ok ? 'Очищено.' : 'Ошибка';
};

// === Classes CRUD ===
$('#btn-cls-save').onclick = async ()=>{
  const id = Number($('#cls-id').value || 0);
  const payload = {
    id: id || null,
    title: $('#cls-title').value,
    school: $('#cls-school').value,
    city: $('#cls-city').value,
    shift: $('#cls-shift').value,
    join_code: $('#cls-joincode').value || null,
    info: $('#cls-info').value || null,
  };
  if(!payload.title){ $('#cls-save-out').textContent='Нужно название класса.'; return; }
  const res = await apiPost('/classes', payload);
  $('#cls-save-out').textContent = res.ok ? (payload.id ? 'Обновлено.' : 'Создано (id '+res.id+').') : 'Ошибка';
};
$('#btn-cls-del').onclick = async ()=>{
  const id = Number($('#cls-id').value || 0);
  if(!id){ $('#cls-save-out').textContent='Укажи ID для удаления.'; return; }
  if(!confirm('Удалить класс '+id+'?')) return;
  const res = await apiPost('/classes/delete', {id});
  $('#cls-save-out').textContent = res.ok ? 'Удалено.' : 'Ошибка';
};
$('#btn-cls-search').onclick = async ()=>{
  const q = $('#cls-q').value.trim();
  const res = await apiGet('/classes/search?q='+encodeURIComponent(q));
  $('#cls-list-out').textContent = JSON.stringify(res.classes||[], null, 2) || 'Не найдено';
};
$('#btn-cls-all').onclick = async ()=>{
  const res = await apiGet('/classes');
  $('#cls-list-out').textContent = JSON.stringify(res.classes||[], null, 2) || 'Пусто';
};

// === Admin Stats ===
$('#btn-adm-stats').onclick = async ()=>{
  const res = await apiGet('/stats');
  $('#adm-stats-out').textContent = JSON.stringify(res, null, 2);
};
