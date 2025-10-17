
const $=sel=>document.querySelector(sel);
const $$=sel=>document.querySelectorAll(sel);
let API_BASE=localStorage.getItem('api_base')||'';

// theme toggle
(function initTheme(){
  const saved=localStorage.getItem('theme')||'dark';
  if(saved==='light')document.documentElement.classList.add('light');
  $('#btn-theme').onclick=()=>{
    document.documentElement.classList.toggle('light');
    localStorage.setItem('theme',document.documentElement.classList.contains('light')?'light':'dark');
  };
})();

// Class modal logic
function ensureClassSelected(){
  const cid=localStorage.getItem('selected_class_id');
  if(!cid){$('#class-modal').classList.remove('hidden');return false;}
  return true;
}
$('#btn-select-class').onclick=()=>$('#class-modal').classList.remove('hidden');
$('#btn-cls-close').onclick=()=>$('#class-modal').classList.add('hidden');
$('#btn-open-classes')?.addEventListener('click',()=>$('#class-modal').classList.remove('hidden'));
$('#btn-open-schedule')?.addEventListener('click',()=>setVisible('schedule'));

// search classes demo
$('#btn-cls-all').onclick=async()=>{$('#cls-list-out').textContent='[демо] классы будут тут';};
$('#btn-cls-search').onclick=async()=>{$('#cls-list-out').textContent='[демо] поиск классов';};
$('#btn-cls-join').onclick=()=>{const id=$('#cls-id').value;if(!id)return alert('Укажи ID класса');localStorage.setItem('selected_class_id',id);$('#class-modal').classList.add('hidden');};

// Gate guard
['homework','schedule','rebuses'].forEach(tab=>{
  const orig=$('#tab-'+tab);
  if(!orig)return;
  const wrap=document.createElement('div');wrap.id='gate-'+tab;wrap.className='muted';wrap.innerText='Чтобы пользоваться разделом, выберите класс (кнопка 🏫 в шапке).';
  orig.parentNode.insertBefore(wrap,orig);
});
function guardTab(tab){
  const ok=ensureClassSelected();
  $('#gate-'+tab).style.display=ok?'none':'block';
  $('#tab-'+tab).style.display=ok?'block':'none';
}
$$('.tab').forEach(b=>b.onclick=()=>{setVisible(b.dataset.tab);});
function setVisible(tab){
  $$('.panel').forEach(p=>p.classList.remove('active'));
  const el=$('#tab-'+tab);if(el)el.classList.add('active');
}

// Broadcast auto texts (demo)
$('#btn-bc-auto-hw')?.addEventListener('click',()=>$('#bc-out').textContent='Отправлен авто-текст о ДЗ.');
$('#btn-bc-auto-hw-sch')?.addEventListener('click',()=>$('#bc-out').textContent='Отправлен авто-текст о ДЗ и расписании.');

// Schedule proxy preview demo
$('#btn-sch-load').onclick=async()=>{
  if(!ensureClassSelected())return;
  $('#sch-out').textContent='[демо] расписание загружено';
};
