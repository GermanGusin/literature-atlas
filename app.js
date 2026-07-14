/*
  ИТОГОВАЯ ВЕРСИЯ APP.JS
  Дата фиксации: 2026-07-14

  Состояние материалов:
  - сохранена действующая функциональность сайта;
  - вручную встроенные полные ответы: билеты 1–30;
  - индивидуальные тезисные планы и доказательства встроены для билетов 4–48 и 54–100;
  - билеты 31–100 в этой промежуточной сборке пока используют имеющийся механизм формирования материалов;
  - вопросы 101–105 (Томас Вулф) остаются дополнительным блоком и требуют отдельного наполнения;
  - по итогам критической проверки обязательной редакции требуют билеты 54, 55, 72, 77, 86, 87, 92;
  - желательно усилить билеты 64, 69, 76, 80, 85, 98, 99.

  В этой версии вручную закреплены индивидуальные пары «тезис — доказательство»
  для билетов 4–48 и 54–100. Для билетов 49–53 сохранён прежний механизм.
*/


const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const AUTHOR_ITEMS = ITEMS.filter(x=>x.kind==='author');
const WORK_ITEMS = ITEMS.filter(x=>x.kind==='work');
const MAP_W=1200, MAP_H=600, TIMELINE_START=800, TIMELINE_END=2026;
const LS={studied:'litAtlasStudied',qStatus:'litAtlasQStatus',best:'litAtlasBest',xp:'litAtlasXP',xpCategories:'litAtlasXPCategories',awardedQuiz:'litAtlasAwardedQuiz'};
const safeGet=(k,d='')=>{try{return localStorage.getItem(k)??d}catch{return d}};
const safeSet=(k,v)=>{try{localStorage.setItem(k,v)}catch{}};
const readJSON=(k,d)=>{try{return JSON.parse(safeGet(k,''))??d}catch{return d}};
const studied=new Set(readJSON(LS.studied,[]));
let qStatus=readJSON(LS.qStatus,{});
let best=Number(safeGet(LS.best,'0')||0);
let xp=Number(safeGet(LS.xp,'0')||0);
let xpCategories=readJSON(LS.xpCategories,{});
if(!Object.keys(xpCategories).length&&xp>0)xpCategories={'Ранее накоплено':xp};
let filters={search:'',country:'all',period:'all',movement:'all'};
let selectedId=null;
let timelineSelected=null;
let mapState={scale:1,tx:0,ty:0,drag:false,lastX:0,lastY:0};
let quiz=null;
const awardedQuiz=new Set(readJSON(LS.awardedQuiz,[]));
let currentTicket=[];

function uniq(arr){return [...new Set(arr)].sort((a,b)=>a.localeCompare(b,'ru'))}
function esc(s){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function sourceLink(url,label='Источник'){return url?`<a class="source-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:''}
function saveStudied(){safeSet(LS.studied,JSON.stringify([...studied]));updateProgress();}
function itemById(id){return ITEMS.find(x=>x.id===id)}
function project(lon,lat){return [(lon+180)/360*MAP_W,(90-lat)/180*MAP_H]}
function seededJitter(item,index,count){
  if(count<=1) return [0,0];
  const angle=index*2.399963229728653;
  const ring=Math.sqrt(index+1);
  const base=(item.country==='США'?3.8:item.country==='Великобритания'||item.country==='Франция'||item.country==='Германия'?1.8:2.4);
  return [Math.cos(angle)*base*ring,Math.sin(angle)*base*.65*ring];
}
function activeItems(){
  const term=filters.search.trim().toLowerCase();
  return ITEMS.filter(x=>{
    const hay=[x.name,x.country,x.tradition,x.movement,x.work,x.period,x.problems,x.researcher].join(' ').toLowerCase();
    return (!term||hay.includes(term)) && (filters.country==='all'||x.country===filters.country) &&
      (filters.period==='all'||x.period===filters.period) && (filters.movement==='all'||x.movement===filters.movement);
  });
}
function optionHTML(values,current){return '<option value="all">Все</option>'+values.map(v=>`<option ${v===current?'selected':''}>${esc(v)}</option>`).join('')}
function bindTabs(){
  $$('.tab-btn').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
}
function switchView(view){
  $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'-view'));
  if(view==='timeline') renderTimeline();
  if(view==='questions') renderQuestions();
  if(view==='wolfe') renderWolfePage();
  if(view==='theory') renderTheory();
  window.scrollTo({top:$('.tabs-wrap').offsetTop,behavior:'smooth'});
}
function fillFilters(){
  const countries=uniq(ITEMS.map(x=>x.country));
  const periods=uniq(ITEMS.map(x=>x.period));
  const movements=uniq(ITEMS.map(x=>x.movement));
  ['map','timeline'].forEach(prefix=>{
    const c=$(`#${prefix}-country`),p=$(`#${prefix}-period`),m=$(`#${prefix}-movement`);
    if(c)c.innerHTML=optionHTML(countries,filters.country);
    if(p)p.innerHTML=optionHTML(periods,filters.period);
    if(m)m.innerHTML=optionHTML(movements,filters.movement);
  });
}
function bindFilter(prefix){
  const search=$(`#${prefix}-search`), country=$(`#${prefix}-country`),period=$(`#${prefix}-period`),movement=$(`#${prefix}-movement`),reset=$(`#${prefix}-reset`);
  const refresh=()=>{filters={search:search.value,country:country.value,period:period.value,movement:movement.value}; syncFilters(prefix); renderMapMarkers(); renderTimeline();};
  search.addEventListener('input',refresh);country.addEventListener('change',refresh);period.addEventListener('change',refresh);movement.addEventListener('change',refresh);
  reset.addEventListener('click',()=>{filters={search:'',country:'all',period:'all',movement:'all'};syncFilters();renderMapMarkers();renderTimeline();});
}
function syncFilters(source){
  ['map','timeline'].forEach(prefix=>{
    if(prefix===source)return;
    const s=$(`#${prefix}-search`),c=$(`#${prefix}-country`),p=$(`#${prefix}-period`),m=$(`#${prefix}-movement`);
    if(s)s.value=filters.search;if(c)c.value=filters.country;if(p)p.value=filters.period;if(m)m.value=filters.movement;
  });
}
function initMap(){
  const svg=$('#world-map');
  const viewport=$('#map-viewport');
  $('#zoom-in').onclick=()=>zoomMap(1.35,MAP_W/2,MAP_H/2);
  $('#zoom-out').onclick=()=>zoomMap(1/1.35,MAP_W/2,MAP_H/2);
  $('#zoom-reset').onclick=()=>{mapState={...mapState,scale:1,tx:0,ty:0};applyMapTransform();};
  svg.addEventListener('wheel',e=>{e.preventDefault();const r=svg.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*MAP_W;const y=(e.clientY-r.top)/r.height*MAP_H;zoomMap(e.deltaY<0?1.18:1/1.18,x,y);},{passive:false});
  svg.addEventListener('pointerdown',e=>{if(e.target.closest('.cluster,.author-marker,.work-marker'))return;mapState.drag=true;mapState.lastX=e.clientX;mapState.lastY=e.clientY;svg.setPointerCapture(e.pointerId)});
  svg.addEventListener('pointermove',e=>{if(!mapState.drag)return;const r=svg.getBoundingClientRect();mapState.tx+=(e.clientX-mapState.lastX)/r.width*MAP_W;mapState.ty+=(e.clientY-mapState.lastY)/r.height*MAP_H;mapState.lastX=e.clientX;mapState.lastY=e.clientY;applyMapTransform();});
  svg.addEventListener('pointerup',()=>mapState.drag=false);svg.addEventListener('pointercancel',()=>mapState.drag=false);
  applyMapTransform();renderMapMarkers();
}
function zoomMap(factor,cx,cy){
  const old=mapState.scale;const next=Math.min(8,Math.max(1,old*factor));
  const wx=(cx-mapState.tx)/old, wy=(cy-mapState.ty)/old;
  mapState.scale=next;mapState.tx=cx-wx*next;mapState.ty=cy-wy*next;applyMapTransform();
}
function focusCountry(country){
  const xs=ITEMS.filter(x=>x.country===country);if(!xs.length)return;
  const lon=xs.reduce((s,x)=>s+x.lon,0)/xs.length,lat=xs.reduce((s,x)=>s+x.lat,0)/xs.length;
  const [x,y]=project(lon,lat);mapState.scale=country==='США'?2.8:4.2;mapState.tx=MAP_W/2-x*mapState.scale;mapState.ty=MAP_H/2-y*mapState.scale;applyMapTransform();
}
function applyMapTransform(){
  $('#map-viewport').setAttribute('transform',`translate(${mapState.tx} ${mapState.ty}) scale(${mapState.scale})`);
  $('#map-scale').textContent=`${mapState.scale.toFixed(1)}×`;
  const showAuthors=mapState.scale>=1.75;
  $('#author-layer').style.display=showAuthors?'':'none';
  $('#cluster-layer').style.display=showAuthors?'none':'';
  $$('.marker-label').forEach(n=>n.style.display=mapState.scale>=4.4?'':'none');
}
function renderMapMarkers(){
  const visible=activeItems();
  const byCountry={}; visible.forEach(x=>(byCountry[x.country]??=[]).push(x));
  const authorLayer=$('#author-layer'),clusterLayer=$('#cluster-layer');authorLayer.innerHTML='';clusterLayer.innerHTML='';
  Object.entries(byCountry).forEach(([country,arr])=>{
    const lon=arr.reduce((s,x)=>s+x.lon,0)/arr.length, lat=arr.reduce((s,x)=>s+x.lat,0)/arr.length;const [cx,cy]=project(lon,lat);
    const cg=document.createElementNS('http://www.w3.org/2000/svg','g');cg.setAttribute('class','cluster');cg.setAttribute('transform',`translate(${cx} ${cy})`);cg.innerHTML=`<circle r="16"></circle><text>${arr.length}</text><title>${esc(country)}: ${arr.length}</title>`;cg.onclick=e=>{e.stopPropagation();focusCountry(country)};clusterLayer.appendChild(cg);
    arr.forEach((item,i)=>{
      const [jx,jy]=seededJitter(item,i,arr.length);const [x,y]=project(item.lon+jx,item.lat+jy);
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      const marker=document.createElementNS('http://www.w3.org/2000/svg',item.kind==='work'?'rect':'circle');
      marker.setAttribute('class',`${item.kind==='work'?'work-marker':'author-marker'} ${studied.has(item.id)?'studied':''}`);
      if(item.kind==='work'){marker.setAttribute('x',x-4);marker.setAttribute('y',y-4);marker.setAttribute('width',8);marker.setAttribute('height',8);marker.setAttribute('transform',`rotate(45 ${x} ${y})`)} else {marker.setAttribute('cx',x);marker.setAttribute('cy',y);marker.setAttribute('r',5)}
      marker.innerHTML=`<title>${esc(item.name)} — ${esc(item.years)}</title>`;marker.addEventListener('click',e=>{e.stopPropagation();selectItem(item.id)});g.appendChild(marker);
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('class','marker-label');label.setAttribute('x',x+7);label.setAttribute('y',y-6);label.textContent=item.name.split(' ').slice(-1)[0];g.appendChild(label);authorLayer.appendChild(g);
    });
  });
  $('#map-result-count').textContent=`Показано: ${visible.length}`;applyMapTransform();renderDetail();
}
function selectItem(id){selectedId=id;renderDetail();}
function renderDetail(){
  const host=$('#detail-card'),item=itemById(selectedId);
  if(!item){
    const countries=Object.entries(ITEMS.reduce((a,x)=>(a[x.country]=(a[x.country]||0)+1,a),{})).sort((a,b)=>b[1]-a[1]);
    host.innerHTML=`<div class="detail-empty"><strong>Выберите точку</strong><p>Нажмите на страну. Затем увеличьте карту и выберите автора.</p><div class="country-list">${countries.slice(0,10).map(([c,n])=>`<button class="country-pill" data-country="${esc(c)}">${esc(c)} · ${n}</button>`).join('')}</div></div>`;
    $$('.country-pill',host).forEach(b=>b.onclick=()=>focusCountry(b.dataset.country));return;
  }
  const isStudied=studied.has(item.id);
  const researcherSource=item.researcherSource?`<div class="research-source">${sourceLink(item.researcherSource.url,item.researcherSource.label)}</div>`:'';
  host.innerHTML=`
    <div class="kind-label">${item.kind==='work'?'Литературный памятник':'Автор'}</div>
    <h3>${esc(item.name)}</h3><div class="years">${esc(item.years)}</div>
    <div class="badge-row"><span class="badge">${esc(item.country)}</span><span class="badge">${esc(item.period)}</span><span class="badge">${esc(item.movement)}</span></div>
    <div class="work-box"><small>${item.kind==='work'?'Основной текст':'Ключевое произведение'}</small><b>${esc(item.work)}</b></div>
    <p>${esc(item.extra)}</p>
    <div class="info-block"><small>Проблематика</small><p>${esc(item.problems)}</p></div>
    <div class="info-block researcher-block"><small>Русский исследователь</small><p><b>${esc(item.researcher)}</b></p>${researcherSource}</div>
    <p><b>Литературная традиция:</b> ${esc(item.tradition)}</p>
    <div><b>Связанные вопросы:</b><div class="q-chips">${item.questions.map(n=>`<button class="q-chip" data-q="${n}">№ ${n}</button>`).join('')}</div></div>
    <div class="detail-actions">
      ${item.kind==='author'?`<button id="study-toggle" class="btn ${isStudied?'btn-ok':'btn-primary'}">${isStudied?'Изучено':'Отметить как изученное'}</button><button id="show-contemporaries" class="btn btn-secondary">Показать современников</button>${item.id==='wolfe_thomas'?'<button id="open-wolfe" class="btn btn-ghost">Открыть страницу Томаса Вулфа</button>':''}`:''}
    </div>`;
  $$('.q-chip',host).forEach(b=>b.onclick=()=>{switchView('questions');setTimeout(()=>document.querySelector(`[data-question="${b.dataset.q}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),50)});
  if(item.kind==='author'){
    $('#study-toggle').onclick=()=>{studied.has(item.id)?studied.delete(item.id):studied.add(item.id);saveStudied();renderMapMarkers();renderDetail();};
    $('#show-contemporaries').onclick=()=>{timelineSelected=item.id;switchView('timeline');renderTimeline();};
    if(item.id==='wolfe_thomas')$('#open-wolfe').onclick=()=>switchView('wolfe');
  }
}
function timelineFilterItems(){return activeItems().slice().sort((a,b)=>(a.birthYear??9999)-(b.birthYear??9999)||a.name.localeCompare(b.name,'ru'))}
function pct(year){return (year-TIMELINE_START)/(TIMELINE_END-TIMELINE_START)*100}
function overlap(a,b){const ae=a.deathYear??TIMELINE_END,be=b.deathYear??TIMELINE_END;return a.birthYear<=be&&b.birthYear<=ae}
function renderTimeline(){
  const items=timelineFilterItems();const host=$('#timeline-body');if(!host)return;
  const selected=itemById(timelineSelected);const contemporaries=selected?items.filter(x=>x.id!==selected.id&&overlap(selected,x)):[];
  $('#timeline-callout').innerHTML=selected?`<div><b>${esc(selected.name)}</b><br><span>${esc(selected.years)} · современников в выбранной выборке: ${contemporaries.length}</span></div><button class="btn btn-ghost" id="clear-timeline">Снять выделение</button>`:`<div><b>Сравнение современников</b><br><span>Нажмите на полосу автора. Золотая рамка покажет пересечение жизней.</span></div>`;
  if(selected)$('#clear-timeline').onclick=()=>{timelineSelected=null;renderTimeline()};
  const axis=$('#timeline-axis');axis.innerHTML='';for(let y=800;y<=2000;y+=100){const t=document.createElement('div');t.className='tick';t.style.left=pct(y)+'%';t.textContent=y;axis.appendChild(t)}
  host.innerHTML=items.map(item=>{
    const start=Math.max(TIMELINE_START,item.birthYear),end=Math.min(TIMELINE_END,item.deathYear??(item.kind==='work'?item.birthYear:TIMELINE_END));
    const left=Math.max(0,pct(start)),width=Math.max(item.kind==='work'?.55:1.3,pct(end)-pct(start));
    const cls=['life-bar',item.kind==='work'?'work':'',selected&&selected.id===item.id?'selected':'',selected&&selected.id!==item.id&&overlap(selected,item)?'contemporary':''].join(' ');
    return `<div class="timeline-row"><div class="timeline-label"><b>${esc(item.name)}</b><span>${esc(item.years)} · ${esc(item.country)}</span></div><div class="timeline-track"><button class="${cls}" style="left:${left}%;width:${width}%" data-id="${item.id}" title="${esc(item.name)} — ${esc(item.years)}"></button></div></div>`
  }).join('');
  $$('.life-bar',host).forEach(b=>b.onclick=()=>{timelineSelected=b.dataset.id;selectedId=b.dataset.id;renderTimeline();renderDetail()});
  $('#timeline-result-count').textContent=`Показано: ${items.length}`;
}
function randomOne(arr){return arr[Math.floor(Math.random()*arr.length)]}
function shuffle(arr){return [...arr].sort(()=>Math.random()-.5)}
function uniqueOptions(correct,pool,count=4){const vals=shuffle(uniq(pool).filter(x=>x!==correct)).slice(0,count-1);return shuffle([correct,...vals])}
function focusKey(){return $('#quiz-focus')?.value||'all'}
function focusAuthors(key=focusKey()){
  if(key==='manns')return AUTHOR_ITEMS.filter(a=>['mann_h','mann_t'].includes(a.id));
  if(key==='vonnegut')return AUTHOR_ITEMS.filter(a=>a.id==='vonnegut');
  if(key==='wolfe')return AUTHOR_ITEMS.filter(a=>a.id==='wolfe_thomas');
  if(key==='realism')return AUTHOR_ITEMS.filter(a=>/реализм|натурализм/i.test(a.movement));
  if(key==='weak')return AUTHOR_ITEMS.filter(a=>['mann_h','mann_t','vonnegut','wolfe_thomas'].includes(a.id)||/реализм|натурализм/i.test(a.movement));
  return AUTHOR_ITEMS;
}
function focusQuotes(key=focusKey()){
  if(key==='all')return QUOTES;
  const tag=key==='weak'?'weak':key;
  const found=QUOTES.filter(q=>q.tags.includes(tag));
  return found.length?found:QUOTES;
}
function focusedRandomAuthor(){const pool=focusAuthors();return randomOne(pool.length?pool:AUTHOR_ITEMS)}

const THEORY_FOUNDATION=[
 {id:'core-romanticism-dual-world',difficulty:1,ticketNumbers:[23,24],prompt:'Что лежит в основе романтического двоемирия?',correct:'Противопоставление идеала и действительности',options:['Противопоставление идеала и действительности','Точное копирование быта','Единство места и времени','Отказ от авторской позиции'],explain:'Романтический герой ощущает разрыв между желаемым миром и повседневной реальностью.'},
 {id:'core-realism-typical',difficulty:1,ticketNumbers:[39,40],prompt:'Что является главным принципом реализма XIX века?',correct:'Типический характер в типических обстоятельствах',options:['Типический характер в типических обстоятельствах','Культ исключительного героя','Система аллегорических масок','Отказ от причинности'],explain:'Реализм объясняет личность через общество, историю и среду.'},
 {id:'core-naturalism',difficulty:1,ticketNumbers:[53],prompt:'Чем натурализм отличается от классического реализма?',correct:'Усиленным вниманием к среде, наследственности и физиологии',options:['Усиленным вниманием к среде, наследственности и физиологии','Полным отказом от социальных тем','Обязательной фантастикой','Возвращением к античным правилам'],explain:'Натуралисты показывают человека как часть природной и социальной среды.'},
 {id:'core-romantic-irony',difficulty:2,ticketNumbers:[24,25,28],prompt:'Что означает романтическая ирония?',correct:'Авторская игра, разрушающая созданную иллюзию',options:['Авторская игра, разрушающая созданную иллюзию','Только насмешка над отрицательным героем','Бытовая сатира','Запрет на авторские отступления'],explain:'Романтик одновременно создаёт художественный мир и показывает его условность.'},
 {id:'core-modernism',difficulty:1,ticketNumbers:[71],prompt:'Какой признак характерен для модернизма?',correct:'Поиск новых способов передать сознание и кризис личности',options:['Поиск новых способов передать сознание и кризис личности','Обязательное соблюдение трёх единств','Отказ от психологизма','Только исторические сюжеты'],explain:'Модернисты меняли композицию, время, повествование и язык.'},
 {id:'core-realism-common',difficulty:2,ticketNumbers:[39,40],prompt:'Что объединяет критический реализм разных стран?',correct:'Анализ общественных отношений через судьбу личности',options:['Анализ общественных отношений через судьбу личности','Культ Средневековья','Отказ от конкретной истории','Господство мифологического эпоса'],explain:'Национальные варианты различаются, но везде важна связь характера и общества.'},
 {id:'core-detail',difficulty:2,ticketNumbers:[39,40,45,46],prompt:'Какова функция детали в реалистическом произведении?',correct:'Она раскрывает характер и социальную среду',options:['Она раскрывает характер и социальную среду','Она нужна только для украшения','Она скрывает время действия','Она заменяет сюжет'],explain:'Предмет, одежда, интерьер и речь получают социальный смысл.'},
 {id:'core-scott',difficulty:2,ticketNumbers:[32],prompt:'В чём новаторство исторического романа Вальтера Скотта?',correct:'Частный герой включён в крупный исторический конфликт',options:['Частный герой включён в крупный исторический конфликт','История заменена фантастикой','Действуют только реальные правители','Сюжет исключает бытовые детали'],explain:'Скотт связывает вымышленную судьбу с переломом эпохи.'},
 {id:'core-postmodernism',difficulty:1,ticketNumbers:[86,92,98],prompt:'Что отличает постмодернизм?',correct:'Игра с чужими текстами и множественность истин',options:['Игра с чужими текстами и множественность истин','Единый обязательный стиль','Запрет на цитаты','Возвращение к строгому классицизму'],explain:'Постмодернистский текст строится как диалог с культурной памятью.'},
 {id:'compare-romanticism-england-germany-1',difficulty:1,ticketNumbers:[25,29],prompt:'Чем английский романтизм чаще отличается от немецкого?',correct:'Английский сильнее связан с природой и личной свободой, немецкий — с философией и мифом',options:['Английский сильнее связан с природой и личной свободой, немецкий — с философией и мифом','Английский отвергает лирику, немецкий отвергает философию','Английский строится только на классицизме, немецкий — только на реализме','Между ними нет заметных различий'],explain:'В Англии важны природа, свобода и лирический опыт. В Германии — философский идеализм, миф, сказка и романтическая ирония.'},
 {id:'compare-romanticism-england-germany-2',difficulty:3,ticketNumbers:[25,29,30],prompt:'Какое сопоставление национальных вариантов романтизма верно?',correct:'Йенцы стремятся к синтезу искусства и философии, английские поэты исследуют природу и внутреннюю свободу',options:['Йенцы стремятся к синтезу искусства и философии, английские поэты исследуют природу и внутреннюю свободу','Йенцы создают социальный роман, английские поэты соблюдают три единства','Немецкие романтики отвергают символ, английские отвергают лирику','Обе традиции полностью подчинены натурализму'],explain:'Это различие помогает связать йенскую школу с Новалисом, а английскую линию — с Вордсвортом, Кольриджем и Байроном.'},
 {id:'compare-romanticism-france-germany',difficulty:2,ticketNumbers:[25,33,35],prompt:'Чем французский романтизм отличается от немецкого?',correct:'Французский сильнее связан с историей и общественной борьбой, немецкий — с философией и мифом',options:['Французский сильнее связан с историей и общественной борьбой, немецкий — с философией и мифом','Французский исключает драму, немецкий исключает поэзию','Французский основан на натурализме, немецкий — на классицизме','Французский не знает исторического романа'],explain:'У Гюго романтический конфликт часто получает исторический и политический масштаб.'},
 {id:'compare-realism-france-england',difficulty:2,ticketNumbers:[41,42,45,46,47],prompt:'Какое различие французского и английского реализма наиболее точное?',correct:'Французский чаще строит системный анализ общества, английский соединяет социальную критику с моральной проблематикой',options:['Французский чаще строит системный анализ общества, английский соединяет социальную критику с моральной проблематикой','Французский исключает типизацию, английский исключает сюжет','Французский обращается только к деревне, английский только к античности','Обе традиции полностью совпадают'],explain:'Бальзак и Флобер анализируют социальный механизм. Диккенс и Теккерей сильнее подчёркивают нравственный выбор и общественное лицемерие.'},
 {id:'compare-realism-usa-europe',difficulty:3,ticketNumbers:[49,66,79,80,81],prompt:'Что особенно важно для американского реализма по сравнению с европейским?',correct:'Осмысление демократии, успеха, денег и американской мечты',options:['Осмысление демократии, успеха, денег и американской мечты','Отказ от национальной истории','Обязательное действие при королевском дворе','Полное отсутствие социального конфликта'],explain:'Американский реализм исследует самоопределение личности внутри мифа о равных возможностях.'},
 {id:'compare-symbolism-realism',difficulty:2,ticketNumbers:[44,50,51,54],prompt:'Чем символизм принципиально отличается от реализма?',correct:'Символизм ищет скрытые соответствия мира, реализм объясняет человека через конкретную среду',options:['Символизм ищет скрытые соответствия мира, реализм объясняет человека через конкретную среду','Символизм запрещает образность, реализм запрещает детали','Символизм основан только на сатире, реализм только на мифе','Различий нет'],explain:'Символ открывает многозначный смысл. Реалистическая деталь связывает характер с социальной действительностью.'},
 {id:'compare-modernism-realism',difficulty:3,ticketNumbers:[50,71,74,77,83],prompt:'Как меняется изображение человека при переходе от реализма к модернизму?',correct:'Внешняя причинность уступает место фрагментарному сознанию и субъективному времени',options:['Внешняя причинность уступает место фрагментарному сознанию и субъективному времени','Психология полностью исчезает','Герой всегда становится историческим правителем','Сюжет обязательно превращается в эпос'],explain:'Модернизм переносит центр тяжести с социальной биографии на работу сознания, памяти и языка.'},
 {id:'compare-absurd-existentialism',difficulty:3,ticketNumbers:[87,88],prompt:'Как связаны экзистенциализм и театр абсурда?',correct:'Они показывают кризис смысла, но театр абсурда делает это через разрушение языка и действия',options:['Они показывают кризис смысла, но театр абсурда делает это через разрушение языка и действия','Они требуют счастливой развязки','Они исключают философскую проблематику','Они восстанавливают правила классицизма'],explain:'Сартр и Камю формулируют философскую проблему выбора. Ионеско и Беккет воплощают кризис в самой форме пьесы.'}
];

function theoryDistractorsFor(q,field){
  const same=EXAM_QUESTIONS.filter(x=>x.number!==q.number&&x.section===q.section);
  const others=(same.length?same:EXAM_QUESTIONS.filter(x=>x.number!==q.number)).map(answerMaterials);
  return uniq(others.map(m=>field==='thesis'?m.thesis:(m.plan[0]||m.thesis))).filter(Boolean);
}
function buildTheoryQuestionBank(){
  const generated=[];
  EXAM_QUESTIONS.forEach(q=>{
    const m=answerMaterials(q);
    generated.push({
      id:`ticket-${q.number}-thesis`,difficulty:1,ticketNumbers:[q.number],
      prompt:`Какой главный тезис точнее раскрывает билет № ${q.number}: «${q.text}»?`,
      correct:m.thesis,
      options:uniqueOptions(m.thesis,theoryDistractorsFor(q,'thesis')),
      explain:`Этот тезис задаёт основу ответа на билет № ${q.number}. После него нужно перейти к признакам явления и примерам.`,
      xpCategory:'Теория'
    });
    const point=m.plan[0]||'Назвать историко-литературный контекст.';
    generated.push({
      id:`ticket-${q.number}-plan`,difficulty:2,ticketNumbers:[q.number],
      prompt:`Какой шаг обязательно включить в ответ на билет № ${q.number}?`,
      correct:point,
      options:uniqueOptions(point,theoryDistractorsFor(q,'plan')),
      explain:`Этот пункт помогает не подменять анализ пересказом. Он связывает билет с литературной теорией.`,
      xpCategory:'Теория'
    });
  });
  return [...THEORY_FOUNDATION,...generated];
}
let THEORY_QUESTIONS=[];
function refreshTheoryQuestions(){THEORY_QUESTIONS=buildTheoryQuestionBank();}
function theoryQueue(total=10){
  refreshTheoryQuestions();
  const uncredited=THEORY_QUESTIONS.filter(q=>!awardedQuiz.has(q.id));
  const source=uncredited.length>=total?uncredited:THEORY_QUESTIONS;
  const buckets={1:shuffle(source.filter(q=>q.difficulty===1)),2:shuffle(source.filter(q=>q.difficulty===2)),3:shuffle(source.filter(q=>q.difficulty===3))};
  const pattern=[1,1,2,1,2,2,3,2,3,3];
  const picked=[];
  for(const d of pattern){
    let q=buckets[d].shift();
    if(!q){q=shuffle(source.filter(x=>!picked.some(p=>p.id===x.id)))[0];}
    if(q&&!picked.some(p=>p.id===q.id))picked.push(q);
  }
  while(picked.length<total){const q=shuffle(source.filter(x=>!picked.some(p=>p.id===x.id)))[0];if(!q)break;picked.push(q)}
  return picked.slice(0,total);
}
function xpCountry(item){
  if(!item)return 'Теория';
  const c=item.country;
  if(c==='Великобритания')return 'Англия';
  if(c==='Франция')return 'Франция';
  if(c==='Германия')return 'Германия';
  if(c==='США')return 'США';
  if(c==='Италия')return 'Италия';
  if(c==='Испания')return 'Испания';
  if(c==='Ирландия')return 'Ирландия';
  if(['Колумбия','Аргентина'].includes(c))return 'Латинская Америка';
  return c||'Другие литературы';
}
function makeQuizQuestion(mode){
  if(mode==='work'){
    const a=focusedRandomAuthor();return {id:`work-${a.id}`,prompt:`Кто написал произведение ${a.work}?`,correct:a.name,options:uniqueOptions(a.name,AUTHOR_ITEMS.map(x=>x.name)),explain:`${a.name} — ${a.years}. Направление: ${a.movement}. Проблематика: ${a.problems}.`,xpCategory:xpCountry(a)};
  }
  if(mode==='country'){
    const a=focusedRandomAuthor();return {id:`country-${a.id}`,prompt:`К какой литературной традиции относится ${a.name}?`,correct:a.tradition,options:uniqueOptions(a.tradition,AUTHOR_ITEMS.map(x=>x.tradition)),explain:`На карте: ${a.country}. Период: ${a.period}.`,xpCategory:xpCountry(a)};
  }
  if(mode==='movement'){
    const a=focusedRandomAuthor();return {id:`movement-${a.id}`,prompt:`С каким направлением связан ${a.name}?`,correct:a.movement,options:uniqueOptions(a.movement,AUTHOR_ITEMS.map(x=>x.movement)),explain:`Ключевое произведение: ${a.work}. Проблематика: ${a.problems}.`,xpCategory:'Теория'};
  }
  if(mode==='problematic'){
    const a=focusedRandomAuthor();return {id:`problematic-${a.id}`,prompt:`Какому произведению соответствует проблематика: ${a.problems}?`,correct:a.work,options:uniqueOptions(a.work,AUTHOR_ITEMS.map(x=>x.work)),explain:`${a.work} — ${a.name}. Направление: ${a.movement}.`,xpCategory:xpCountry(a)};
  }
  if(mode==='researcher'){
    const a=focusedRandomAuthor();return {id:`researcher-${a.id}`,prompt:`Кто из русских исследователей занимался творчеством автора: ${a.name}?`,correct:a.researcher,options:uniqueOptions(a.researcher,AUTHOR_ITEMS.map(x=>x.researcher)),explain:`Для подготовки можно обратиться к работам ${a.researcher}.`,source:a.researcherSource,xpCategory:xpCountry(a)};
  }
  if(mode==='quoteTarget'){
    const q=randomOne(focusQuotes());return {id:`quote-target-${q.id||q.text}`,prompt:q.text,quote:true,question:'О ком или о чём сказано в этой цитате?',correct:q.target,options:uniqueOptions(q.target,QUOTES.map(x=>x.target)),explain:`Автор высказывания: ${q.speaker}. ${q.context}`,source:{url:q.sourceUrl,label:q.sourceLabel},xpCategory:xpCountry(itemById(q.targetId))};
  }
  if(mode==='quoteSpeaker'){
    const q=randomOne(focusQuotes());return {id:`quote-speaker-${q.id||q.text}`,prompt:q.text,quote:true,question:`Кто сказал это о ${q.target}?`,correct:q.speaker,options:uniqueOptions(q.speaker,QUOTES.map(x=>x.speaker)),explain:q.context,source:{url:q.sourceUrl,label:q.sourceLabel},xpCategory:xpCountry(itemById(q.targetId))};
  }
  if(mode==='theory'){const t=quiz?.theoryQueue?.[quiz.index]||randomOne(THEORY_QUESTIONS);return {...t,options:shuffle(t.options),xpCategory:'Теория'};}
  const focused=focusAuthors();let sample;
  if(focused.length>=4)sample=shuffle(focused).slice(0,4);
  else {const anchor=randomOne(focused.length?focused:AUTHOR_ITEMS);sample=[anchor,...shuffle(AUTHOR_ITEMS.filter(x=>x.id!==anchor.id)).slice(0,3)];}
  sample=sample.sort((a,b)=>a.birthYear-b.birthYear);const a=sample[0];
  return {id:`chronology-${sample.map(x=>x.id).sort().join('-')}`,prompt:'Кто родился раньше остальных?',correct:a.name,options:shuffle(sample.map(x=>x.name)),explain:`${sample.map(x=>`${x.name}: ${x.birthYear}`).join(' · ')}`,xpCategory:'Теория'};
}
function startQuiz(){
  const mode=$('#quiz-mode').value;
  quiz={mode,index:0,total:10,score:0,streak:0,answered:false,current:null,categoryScores:{},seenIds:new Set(),theoryQueue:mode==='theory'?theoryQueue(10):null};
  nextQuizQuestion();
}
function nextQuizQuestion(){
  if(quiz.index>=quiz.total){finishQuiz();return}
  let candidate=null;
  for(let i=0;i<80;i++){
    candidate=makeQuizQuestion(quiz.mode);
    const id=candidate.id||`${candidate.prompt}|${candidate.correct}`;
    candidate.id=id;
    if(!quiz.seenIds.has(id))break;
    candidate=null;
  }
  if(!candidate){finishQuiz();return}
  quiz.current=candidate;quiz.seenIds.add(candidate.id);quiz.answered=false;renderQuiz();
}
function renderQuiz(){
  const host=$('#quiz-main');const q=quiz.current;const progress=quiz.index/quiz.total*100;const difficulty=q.difficulty?` · Уровень ${q.difficulty} из 3`:'';
  const prompt=q.quote?`<blockquote class="quiz-quote">${esc(q.prompt)}</blockquote><div class="quote-question">${esc(q.question)}</div>`:`<div class="quiz-question">${esc(q.prompt)}</div>`;
  host.innerHTML=`<div class="quiz-meta"><span>Вопрос ${quiz.index+1} из ${quiz.total}${difficulty}</span><span>Баллы: <b>${quiz.score}</b> · Серия: <b>${quiz.streak}</b></span></div><div class="meter"><span style="width:${progress}%"></span></div>${prompt}<div class="answers">${q.options.map(o=>`<button class="answer" data-answer="${esc(o)}">${esc(o)}</button>`).join('')}</div><div id="quiz-feedback"></div><div class="quiz-footer"><button id="quiz-next" class="btn btn-primary hidden">Следующий вопрос</button></div>`;
  $$('.answer',host).forEach(b=>b.onclick=()=>answerQuiz(b));$('#quiz-next').onclick=()=>{quiz.index++;nextQuizQuestion()};
}
function answerQuiz(btn){
  if(quiz.answered)return;quiz.answered=true;const answer=btn.dataset.answer,correct=answer===quiz.current.correct;
  let earned=0,alreadyCredited=false;
  if(correct){
    quiz.streak++;
    alreadyCredited=awardedQuiz.has(quiz.current.id);
    if(!alreadyCredited){
      earned=10+Math.min(10,quiz.streak*2);quiz.score+=earned;
      const cat=quiz.current.xpCategory||'Теория';quiz.categoryScores[cat]=(quiz.categoryScores[cat]||0)+earned;
      awardedQuiz.add(quiz.current.id);safeSet(LS.awardedQuiz,JSON.stringify([...awardedQuiz]));
    }
  }else{quiz.streak=0}
  $$('.answer',$('#quiz-main')).forEach(b=>{if(b.dataset.answer===quiz.current.correct)b.classList.add('correct');else if(b===btn)b.classList.add('wrong');else b.classList.add('dim');b.disabled=true});
  const src=quiz.current.source?`<div class="feedback-source">${sourceLink(quiz.current.source.url,quiz.current.source.label||'Источник')}</div>`:'';
  $('#quiz-feedback').innerHTML=`<div class="feedback"><b>${correct?'Верно.':'Неверно.'}</b> ${correct&&alreadyCredited?'Этот вопрос уже был засчитан раньше, поэтому новые баллы не начислены. ':correct?`Начислено ${earned} баллов. `:''}${esc(quiz.current.explain)}${src}</div>`;$('#quiz-next').classList.remove('hidden');
}
function finishQuiz(){
  best=Math.max(best,quiz.score);Object.entries(quiz.categoryScores).forEach(([cat,val])=>xpCategories[cat]=(xpCategories[cat]||0)+val);xp=Object.values(xpCategories).reduce((a,b)=>a+Number(b||0),0);safeSet(LS.best,String(best));safeSet(LS.xp,String(xp));safeSet(LS.xpCategories,JSON.stringify(xpCategories));updateProgress();
  const gained=Object.entries(quiz.categoryScores).map(([k,v])=>`${esc(k)}: +${v} XP`).join(' · ');$('#quiz-main').innerHTML=`<div class="quiz-placeholder"><div class="score-big">${quiz.score}</div><strong>Тренировка завершена</strong><p>${gained||'Опыт не начислен.'}</p><p>Лучший результат: ${best}. Общий опыт: ${xp} XP.</p><button class="btn btn-primary" id="quiz-again">Пройти ещё раз</button></div>`;$('#quiz-again').onclick=startQuiz;
}
function initQuiz(){
  $('#quiz-start').onclick=startQuiz;
  $('#quiz-main').innerHTML=`<div class="quiz-placeholder"><strong>Выберите режим</strong><p>В режиме теории каждому экзаменационному билету соответствуют минимум два задания. Вопросы идут от базовых к сравнительным и не повторяются внутри одного теста.</p></div>`;
}
function questionAuthors(n){return AUTHOR_ITEMS.filter(a=>a.questions.includes(n))}
function normalizeOldStatuses(){let changed=false;Object.keys(qStatus).forEach(k=>{if(qStatus[k]==='repeat'){qStatus[k]='dont';changed=true}});if(changed)safeSet(LS.qStatus,JSON.stringify(qStatus))}
function statusControls(number,compact=false){const st=qStatus[number]||'';return `<div class="status-controls ${compact?'compact':''}"><button class="status-choice know ${st==='know'?'selected':''}" data-qstatus="${number}" data-value="know">Знаю</button><button class="status-choice dont ${st==='dont'?'selected':''}" data-qstatus="${number}" data-value="dont">Не знаю</button></div>`}
function setQuestionStatus(number,value){
  qStatus[number]=qStatus[number]===value?'':value;if(!qStatus[number])delete qStatus[number];safeSet(LS.qStatus,JSON.stringify(qStatus));renderQuestions();renderTicket();renderWolfePage();renderTheory();updateProgress();
}
function bindStatusButtons(root=document){$$('[data-qstatus]',root).forEach(b=>b.onclick=()=>setQuestionStatus(Number(b.dataset.qstatus),b.dataset.value))}
function renderQuestions(){
  const term=($('#question-search')?.value||'').trim().toLowerCase();const host=$('#question-list');if(!host)return;
  const groups={};EXAM_QUESTIONS.filter(q=>!term||(`${q.number} ${q.text} ${q.section}`).toLowerCase().includes(term)).forEach(q=>(groups[q.section]??=[]).push(q));
  host.innerHTML=Object.entries(groups).map(([section,qs])=>`<div class="q-section">${esc(section)}</div>${qs.map(q=>{const authors=questionAuthors(q.number);return `<div class="question-card card" data-question="${q.number}"><div class="q-number">${q.number}</div><div><p>${esc(q.text)}</p>${authors.length?`<div class="question-authors">${authors.map(a=>`<button class="mini-chip" data-author="${a.id}">${esc(a.name)}</button>`).join('')}</div>`:''}</div>${statusControls(q.number)}</div>`}).join('')}`).join('')||'<p>Ничего не найдено.</p>';
  bindStatusButtons(host);
  $$('[data-author]',host).forEach(b=>b.onclick=()=>{selectedId=b.dataset.author;switchView('map');renderDetail()});
}
function weightForQuestion(q){const s=qStatus[q.number]||'';return s==='dont'?9:s==='know'?1:3}
function weightedOne(arr){
  const total=arr.reduce((sum,q)=>sum+weightForQuestion(q),0);let r=Math.random()*total;
  for(const q of arr){r-=weightForQuestion(q);if(r<=0)return q}return arr[arr.length-1];
}
function generateTicket(){
  const first=weightedOne(EXAM_QUESTIONS);const rest=EXAM_QUESTIONS.filter(q=>q.number!==first.number&&q.section!==first.section);const second=weightedOne(rest.length?rest:EXAM_QUESTIONS.filter(q=>q.number!==first.number));currentTicket=[first,second];renderTicket();
}
function renderTicket(){
  const host=$('#ticket-paper');if(!host||!currentTicket.length)return;
  host.innerHTML=`<div class="eyebrow" style="color:#657085;text-align:center">Литературы народов мира · 5.9.2</div><h3>Тренировочный экзаменационный билет</h3><div class="ticket-questions">${currentTicket.map((q,i)=>`<div class="ticket-question"><div class="ticket-q-head"><b>${i+1}.</b><span>${esc(q.text)}</span></div>${statusControls(q.number,true)}</div>`).join('')}</div><p class="tiny-note">Вопросы со статусом «Не знаю» имеют повышенный шанс появления. Каждый вопрос отмечается отдельно.</p>`;
  bindStatusButtons(host);
}
function initQuestions(){
  normalizeOldStatuses();$('#ticket-generate').onclick=generateTicket;$('#ticket-print').onclick=()=>window.print();$('#question-search').addEventListener('input',renderQuestions);generateTicket();renderQuestions();
}
function renderWolfePage(){
  const host=$('#wolfe-content');if(!host)return;const w=itemById('wolfe_thomas');const quotes=QUOTES.filter(q=>q.targetId==='wolfe_thomas');const qs=EXAM_QUESTIONS.filter(q=>w.questions.includes(q.number));
  host.innerHTML=`
    <div class="wolfe-hero card"><div><div class="eyebrow">Специальный учебный блок</div><h2>Томас Вулф</h2><p class="wolfe-years">1900–1938 · американский реализм · автобиографический роман</p><div class="work-box"><small>Главное произведение блока</small><b>«Взгляни на дом свой, Ангел»</b></div></div><div class="wolfe-thesis"><b>Формула для ответа</b><p>Дом даёт герою память и язык. Одновременно дом ограничивает свободу. Взросление Юджина Ганта строится на уходе. Однако прошлое невозможно оставить полностью.</p></div></div>
    <div class="wolfe-grid">
      <article class="study-card card"><h3>Что происходит в романе</h3><p>Юджин Гант растёт в семье, похожей на семью Вулфа. Он наблюдает родителей, братьев и город Алтамонт. Герой переживает смерти, любовь и одиночество. Затем он покидает дом ради учёбы.</p></article>
      <article class="study-card card"><h3>Главный конфликт</h3><p>Юджину нужен дом и близость. Но домашний мир подавляет его. Поэтому дорога означает свободу. Память превращает уход в постоянное возвращение.</p></article>
      <article class="study-card card"><h3>Проблематика</h3><p>${esc(w.problems)}.</p></article>
      <article class="study-card card"><h3>Жанр и композиция</h3><p>Это автобиографический роман воспитания. Семейная хроника соединяется с лирической прозой. Сюжет движется эпизодами памяти. Большую роль играют повторы и длинные перечисления.</p></article>
      <article class="study-card card"><h3>Система образов</h3><p>Юджин связан с поиском призвания. Оливер воплощает неосуществлённую мечту. Элиза выражает власть дома и собственности. Бен становится образом утраты и братской близости.</p></article>
      <article class="study-card card"><h3>Символы</h3><p>Каменный ангел связан с искусством и смертью. Дом хранит память семьи. Поезд и дорога обозначают уход. Свет и тьма передают смену надежды и утраты.</p></article>
    </div>
    <section class="wolfe-section"><div class="section-head"><div><h2>Цитаты о Томасе Вулфе</h2><p>Текст цитат сохранён. Источник открывается отдельной ссылкой.</p></div></div><div class="quote-gallery">${quotes.map(q=>`<article class="quote-card card"><blockquote>${esc(q.text)}</blockquote><p><b>${esc(q.speaker)}</b></p><p class="tiny-note">${esc(q.context)}</p>${sourceLink(q.sourceUrl,q.sourceLabel)}</article>`).join('')}</div></section>
    <section class="wolfe-section"><div class="research-callout card"><div><small>Русский исследователь</small><h3>${esc(w.researcher)}</h3><p>Анастасьев исследовал Вулфа в контексте американского реализма 1930-х годов. Он также публиковал и комментировал письма писателя.</p></div>${sourceLink(w.researcherSource.url,w.researcherSource.label)}</div></section>
    <section class="wolfe-section"><div class="section-head"><div><h2>Вопросы для подготовки</h2><p>Они добавлены как отдельный учебный блок. Статусы работают так же, как в билетах.</p></div></div><div class="wolfe-questions">${qs.map(q=>`<div class="question-card card" data-question="${q.number}"><div class="q-number">${q.number}</div><div><p>${esc(q.text)}</p></div>${statusControls(q.number)}</div>`).join('')}</div></section>`;
  bindStatusButtons(host);
}

const GENERAL_THEORY=[
 {title:'Средневековье',text:'Литература связана с религиозной картиной мира и сословным обществом. Главные формы: героический эпос, житие, рыцарский роман. Герой выражает ценности рода, веры или рыцарского служения.',authors:'«Беовульф», «Песнь о Роланде», Кретьен де Труа, Данте.'},
 {title:'Возрождение',text:'В центре находится человек, его земная жизнь и право на развитие. Гуманизм соединяет интерес к Античности с критикой средневековых ограничений. Смех, трагедия и новый роман показывают сложность личности.',authors:'Петрарка, Боккаччо, Рабле, Сервантес, Шекспир.'},
 {title:'Барокко и классицизм',text:'Барокко показывает мир как изменчивый и противоречивый. Классицизм ищет порядок, разум и ясную систему жанров. Главный конфликт классицизма часто строится между долгом и чувством.',authors:'Кальдерон, Мильтон, Корнель, Мольер.'},
 {title:'Просвещение',text:'Литература проверяет общество разумом. Писатели обсуждают воспитание, свободу и устройство государства. Сатира и философская повесть превращаются в инструменты критики.',authors:'Свифт, Вольтер, Дидро, Стерн.'},
 {title:'Романтизм',text:'Романтики чувствуют разрыв между идеалом и реальностью. Их герой одинок, свободолюбив и часто исключителен. Важны двоемирие, символ, фантастика, история и народная культура.',authors:'Новалис, Гофман, Байрон, Вальтер Скотт, Гюго, Эдгар По.'},
 {title:'Реализм',text:'Реалисты исследуют связь личности и общества. Характер объясняется историей, средой, профессией, деньгами и семейными отношениями. Деталь и типизация помогают раскрыть социальные законы.',authors:'Стендаль, Бальзак, Флобер, Диккенс, Теккерей, Драйзер.'},
 {title:'Модернизм',text:'Модернизм меняет способы изображения сознания. Линейное время распадается. Внутренний монолог, поток сознания, миф и монтаж помогают показать кризис человека.',authors:'Пруст, Кафка, Джойс, Вулф, Томас Манн.'},
 {title:'Послевоенная литература',text:'После 1945 года литература осмысляет травму войны и кризис прежних ценностей. Возникают экзистенциализм, театр абсурда, новый роман и постмодернизм.',authors:'Сартр, Камю, Беккет, Ионеско, Роб-Грийе, Фаулз, Воннегут.'}
];
const COUNTRY_THEORY=[
 {country:'Англия',phases:[['Возрождение','Шекспир'],['XVII–XVIII века','Мильтон, Свифт, Стерн'],['XIX век','романтики, Диккенс, Теккерей'],['XX век','Вулф, Оруэлл, Фаулз']],rom:'Английский романтизм тесно связан с природой, свободой личности и лирикой. Озёрная школа видит в природе духовную силу. Байрон создаёт бунтующего героя. Вальтер Скотт формирует исторический роман.',real:'Английский реализм особенно внимателен к морали, семье, воспитанию и социальным институтам. Диккенс соединяет критику общества с гротеском и нравственным идеалом. Теккерей усиливает сатиру и показывает мир без идеального героя.'},
 {country:'Франция',phases:[['Возрождение','Рабле'],['XVII–XVIII века','Корнель, Мольер, Вольтер'],['XIX век','Гюго, Стендаль, Бальзак, Флобер'],['XX век','Пруст, Сартр, Камю']],rom:'Французский романтизм развивается в борьбе с классицизмом. Он сильнее связан с историей, политикой и общественным конфликтом. Гюго соединяет гротеск, контраст и масштабную историческую картину.',real:'Французский реализм строит системный анализ общества. Стендаль изучает энергию личности после революционной эпохи. Бальзак создаёт панораму социальных типов. Флобер переносит внимание на стиль, пошлость и язык готовых мнений.'},
 {country:'Германия',phases:[['XVIII век','Гёте, Шиллер'],['Романтизм','Новалис, Клейст, Гофман'],['Рубеж веков','Гауптман, Генрих Манн'],['XX век','Томас Манн, Ремарк, Бёлль, Грасс']],rom:'Немецкий романтизм наиболее философичен. Йенцы обсуждают бесконечность, творчество и романтическую иронию. Гейдельбергская школа обращается к фольклору. Гофман соединяет фантастику с критикой мещанского мира.',real:'Немецкий реализм долго сохраняет связь с романтической традицией и философской проблематикой. На рубеже веков усиливается социальная критика. Генрих Манн разоблачает авторитаризм. Томас Манн исследует культуру, болезнь и кризис Европы.'},
 {country:'США',phases:[['Романтизм','По, Готорн, Мелвилл'],['XIX век','Уитмен, Твен'],['Рубеж веков','Лондон, Драйзер'],['XX век','Фицджеральд, Хемингуэй, Фолкнер, Воннегут']],rom:'Американский романтизм связан с освоением пространства, национальной самостоятельностью и конфликтом личности с цивилизацией. В нём сильны готика, символика и тема тайны. Эдгар По развивает новеллу и теорию единства эффекта.',real:'Американский реализм изучает демократию, деньги, успех и расовые конфликты. Твен соединяет разговорную речь с сатирой. Драйзер показывает давление среды. Реалисты XX века исследуют американскую мечту, войну и региональную память.'},
 {country:'Италия',phases:[['Средневековье','Данте'],['Возрождение','Петрарка, Боккаччо'],['Поздние эпохи','развитие гуманистической традиции'],['XX век','модернизм и неореализм']],rom:'Итальянский романтизм связан с национальным освобождением и исторической тематикой. Литература участвует в формировании национального единства.',real:'Итальянский реализм развивается через веризм. Он показывает региональную жизнь, бедность и зависимость человека от среды. Позднее неореализм обращается к войне и повседневности.'},
 {country:'Испания',phases:[['Средневековье','эпос'],['Возрождение','Сервантес'],['Барокко','Кальдерон'],['XX век','модернизм и литература гражданской войны']],rom:'Испанский романтизм ярко выражает свободу, честь, страсть и конфликт личности с нормой. Он часто обращается к национальной истории.',real:'Испанский реализм показывает провинциальное общество, религию и социальные противоречия. Большую роль играет связь с национальной повествовательной традицией.'}
];
function renderTheory(){
 const g=$('#theory-general'),c=$('#theory-countries');if(!g||!c)return;
 g.innerHTML=`<article class="theory-intro card"><b>Как пользоваться разделом</b><p>Сначала найдите направление. Затем сравните его национальные варианты. После этого вернитесь в тренажёр и выберите режим «Теория литературы».</p></article><div class="theory-grid">${GENERAL_THEORY.map(x=>`<article class="theory-card card"><h3>${x.title}</h3><p>${x.text}</p><h4>Представители</h4><p>${x.authors}</p></article>`).join('')}</div><article class="theory-card card"><h3>Романтизм и реализм: главное различие</h3><table class="compare-table"><tr><th>Признак</th><th>Романтизм</th><th>Реализм</th></tr><tr><td>Герой</td><td>Исключительный, одинокий, стремящийся к идеалу</td><td>Типический, связанный со средой и обществом</td></tr><tr><td>Мир</td><td>Двоемирие, контраст мечты и действительности</td><td>Исторически конкретная социальная реальность</td></tr><tr><td>Главный вопрос</td><td>Как сохранить свободу и идеал</td><td>Как общество формирует человека</td></tr><tr><td>Форма</td><td>Символ, фантастика, лиризм, контраст</td><td>Деталь, типизация, причинность, социальный анализ</td></tr></table></article>`;
 c.innerHTML=COUNTRY_THEORY.map(x=>`<article class="country-theory card"><h3>${x.country}</h3><div class="country-phases">${x.phases.map(p=>`<div class="phase"><b>${p[0]}</b>${p[1]}</div>`).join('')}</div><div class="rom-real"><div><h4>Романтизм</h4><p>${x.rom}</p></div><div><h4>Реализм</h4><p>${x.real}</p></div></div></article>`).join('');
 $$('.theory-switch-btn').forEach(b=>b.onclick=()=>{$$('.theory-switch-btn').forEach(x=>{x.classList.toggle('active',x===b);x.classList.toggle('btn-primary',x===b);x.classList.toggle('btn-ghost',x!==b)});g.classList.toggle('hidden',b.dataset.theoryPane!=='general');c.classList.toggle('hidden',b.dataset.theoryPane!=='countries')});
}
function renderXPBreakdown(){const host=$('#xp-breakdown');if(!host)return;const ordered=Object.entries(xpCategories).sort((a,b)=>b[1]-a[1]);host.innerHTML=(ordered.length?ordered:[['Теория',0],['Англия',0],['Франция',0],['Германия',0],['США',0]]).map(([k,v])=>`<div class="xp-chip"><b>${Number(v)||0} XP</b>${esc(k)}</div>`).join('')}
function updateProgress(){
  const known=Object.values(qStatus).filter(x=>x==='know').length;
  xp=Object.values(xpCategories).reduce((a,b)=>a+Number(b||0),0);$('#stat-authors').textContent=`${AUTHOR_ITEMS.length}`;$('#stat-questions').textContent=EXAM_QUESTIONS.length;$('#stat-studied').textContent=studied.size;$('#stat-known').textContent=known;$('#stat-best').textContent=best;$('#stat-xp').textContent=xp;renderXPBreakdown();
}
function init(){bindTabs();fillFilters();bindFilter('map');bindFilter('timeline');initMap();initQuiz();initQuestions();renderWolfePage();renderTheory();updateProgress();}
document.addEventListener('DOMContentLoaded',()=>init());

// ===== v3 additions: plans, quotations, self-check, Wolfe research gaps =====
function answerPlan(q){
  const t=q.text;
  const points=[];
  if(/общая характеристика|литературный процесс|основные тенденции|этапы/i.test(t)){
    points.push('Обозначить исторические границы и культурный контекст.','Назвать ведущие направления, жанры и эстетические споры.','Распределить основных авторов по направлениям.','Показать национальную специфику на двух примерах.','Сделать вывод о переходе к следующему этапу.');
  } else if(/понятия|направление, течение, стиль|как направление|метод/i.test(t)){
    points.push('Дать точное определение ключевого понятия.','Назвать исторические и философские предпосылки.','Перечислить главные признаки поэтики.','Показать признаки на авторах и произведениях.','Сопоставить с соседним направлением или методом.');
  } else if(/романтизм/i.test(t)){
    points.push('Обозначить происхождение и этап развития романтизма.','Раскрыть двоемирие, идеал и тип романтического героя.','Назвать национальные особенности и представителей.','Разобрать один текст через образ, конфликт и символ.','Показать вклад темы в развитие европейской литературы.');
  } else if(/реализм|реалист/i.test(t)){
    points.push('Определить реализм как направление и метод.','Раскрыть историзм, типизацию и связь героя со средой.','Показать национальную модель реализма.','Разобрать социальный конфликт и художественную деталь.','Сделать вывод о новаторстве писателя или произведения.');
  } else if(/творчество|творческий путь|эстетика|вклад|роль|новаторство/i.test(t)){
    points.push('Кратко обозначить этапы творческого пути.','Сформулировать эстетические взгляды и художественный метод.','Назвать главные жанры и произведения.','Разобрать ключевой конфликт, образ или приём.','Оценить новаторство и влияние автора.');
  } else if(/роман|поэм|трагед|комед|повест|новел|драматург|поэтика|художественный мир/i.test(t)){
    points.push('Указать место произведения в творчестве и эпохе.','Определить жанр и особенности композиции.','Сформулировать конфликт и основную проблематику.','Разобрать систему образов и ключевые приёмы.','Подвести итог о значении произведения.');
  } else {
    points.push('Дать определение теме и установить её границы.','Назвать историко-культурные предпосылки.','Выделить основные признаки и понятия.','Привести два точных литературных примера.','Сформулировать итоговый тезис.');
  }
  return points.slice(0,5);
}
function planHTML(q){return `<div class="answer-plan"><h4>Тезисный план ответа</h4><ol>${answerPlan(q).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>`}
function selfCheckHTML(q,prefix='q'){
  return `<div class="self-check"><h4>Проверка своего ответа</h4><textarea id="${prefix}-answer-${q.number}" placeholder="Запишите тезисы ответа. Затем нажмите «Проверить». Ваш текст хранится только в этом окне."></textarea><div class="verify-controls"><button class="btn btn-secondary" data-check-answer="${q.number}" data-prefix="${prefix}">Проверить по плану</button><button class="btn btn-ghost" data-show-plan="${q.number}">Показать план</button></div><div id="${prefix}-result-${q.number}" class="check-result hidden"></div></div>`;
}
function bindAnswerChecks(root=document){
  $$('[data-show-plan]',root).forEach(b=>b.onclick=()=>{const q=EXAM_QUESTIONS.find(x=>x.number===Number(b.dataset.showPlan));const box=b.closest('.ticket-question,.question-card');const p=$('.answer-plan',box);if(p)p.classList.toggle('hidden')});
  $$('[data-check-answer]',root).forEach(b=>b.onclick=()=>{
    const n=Number(b.dataset.checkAnswer),pre=b.dataset.prefix,q=EXAM_QUESTIONS.find(x=>x.number===n);const text=$(`#${pre}-answer-${n}`)?.value.trim()||'';const res=$(`#${pre}-result-${n}`);if(!res)return;
    if(text.length<40){res.classList.remove('hidden');res.innerHTML='<b>Ответ пока слишком короткий.</b><br>Добавьте определения, примеры и вывод.';return;}
    const words=text.toLowerCase();const markers=['эпох','направлен','жанр','геро','конфликт','проблем','образ','композ','стиль','метод','произвед','вывод'];const hits=markers.filter(x=>words.includes(x));const score=Math.min(100,35+hits.length*5+Math.min(25,Math.floor(text.length/80)*5));
    res.classList.remove('hidden');res.innerHTML=`<b>Ориентировочная полнота: ${score}%.</b><br>Найдены опорные элементы: ${hits.length?hits.join(', '):'пока мало терминов'}.<br>Сверьте ответ с планом. Автоматическая проверка оценивает структуру, а не научную точность.`;
  });
}
function russianQuotes(){
  const base=QUOTES.filter(q=>/[А-Яа-яЁё]/.test(q.text)&&!(/^[^А-Яа-яЁё]+$/.test(q.text)));
  return [...base,...ACADEMIC_QUOTES];
}
function quoteQuestions(q){return q.questions||((q.targetId&&itemById(q.targetId))?itemById(q.targetId).questions:[])||[]}
function renderQuotesPage(){
  const host=$('#quotes-page'),sel=$('#quote-question-filter');if(!host||!sel)return;
  if(!sel.dataset.ready){sel.innerHTML='<option value="all">Все экзаменационные вопросы</option>'+EXAM_QUESTIONS.map(q=>`<option value="${q.number}">№ ${q.number}. ${esc(q.text)}</option>`).join('');sel.dataset.ready='1';sel.onchange=renderQuotesPage;$('#quote-search').oninput=renderQuotesPage;}
  const n=sel.value,term=($('#quote-search').value||'').trim().toLowerCase();
  const rows=russianQuotes().filter(q=>(n==='all'||quoteQuestions(q).includes(Number(n)))&&(!term||`${q.speaker} ${q.target} ${q.text} ${q.context}`.toLowerCase().includes(term)));
  host.innerHTML=rows.length?rows.map(q=>`<article class="quote-study-card card"><blockquote>«${esc(q.text.replace(/^«|»$/g,''))}»</blockquote><div><b>${esc(q.speaker)}</b> — о ${esc(q.target)}</div><p class="quote-meta">${esc(q.context||'')}</p>${sourceLink(q.sourceUrl,q.sourceLabel)}<div class="quote-question-tags">${quoteQuestions(q).map(x=>`<span>Вопрос № ${x}</span>`).join('')}</div></article>`).join(''):'<article class="card" style="padding:18px">Для выбранного вопроса цитаты пока не добавлены.</article>';
}
function renderQuestions(){
  const term=($('#question-search')?.value||'').trim().toLowerCase();const host=$('#question-list');if(!host)return;
  const groups={};EXAM_QUESTIONS.filter(q=>!term||(`${q.number} ${q.text} ${q.section}`).toLowerCase().includes(term)).forEach(q=>(groups[q.section]??=[]).push(q));
  host.innerHTML=Object.entries(groups).map(([section,qs])=>`<div class="q-section">${esc(section)}</div>${qs.map(q=>{const authors=questionAuthors(q.number);return `<div class="question-card card" data-question="${q.number}"><div class="q-number">${q.number}</div><div><p>${esc(q.text)}</p>${authors.length?`<div class="question-authors">${authors.map(a=>`<button class="mini-chip" data-author="${a.id}">${esc(a.name)}</button>`).join('')}</div>`:''}${planHTML(q)}${selfCheckHTML(q,'list')}</div>${statusControls(q.number)}</div>`}).join('')}`).join('')||'<p>Ничего не найдено.</p>';
  bindStatusButtons(host);bindAnswerChecks(host);$$('[data-author]',host).forEach(b=>b.onclick=()=>{selectedId=b.dataset.author;switchView('map');renderDetail()});
}
function renderTicket(){
  const host=$('#ticket-paper');if(!host||!currentTicket.length)return;
  host.innerHTML=`<div class="eyebrow" style="color:#657085;text-align:center">Литературы народов мира · 5.9.2</div><h3>Тренировочный экзаменационный билет</h3><div class="ticket-questions">${currentTicket.map((q,i)=>`<div class="ticket-question"><div class="ticket-q-head"><b>${i+1}.</b><span>${esc(q.text)}</span></div>${statusControls(q.number,true)}${planHTML(q)}${selfCheckHTML(q,'ticket')}</div>`).join('')}</div><p class="tiny-note">Каждый ответ можно проверить отдельно. Вопросы со статусом «Не знаю» появляются чаще.</p>`;
  bindStatusButtons(host);bindAnswerChecks(host);
}
function renderWolfePage(){
  const host=$('#wolfe-content');if(!host)return;const w=itemById('wolfe_thomas');const quotes=russianQuotes().filter(q=>q.targetId==='wolfe_thomas'||quoteQuestions(q).some(n=>w.questions.includes(n)));const qs=EXAM_QUESTIONS.filter(q=>w.questions.includes(q.number));
  host.innerHTML=`<div class="wolfe-hero card"><div><div class="eyebrow">Специальный учебный блок</div><h2>Томас Вулф</h2><p class="wolfe-years">1900–1938 · американский реализм · автобиографический роман</p><div class="work-box"><small>Главное произведение блока</small><b>«Взгляни на дом свой, Ангел»</b></div></div><div class="wolfe-thesis"><b>Формула для ответа</b><p>Дом даёт герою память и язык. Одновременно дом ограничивает свободу. Взросление Юджина Ганта строится на уходе. Однако прошлое невозможно оставить полностью.</p></div></div>
  <div class="wolfe-grid"><article class="study-card card"><h3>Что происходит</h3><p>Юджин Гант растёт в семье, похожей на семью Вулфа. Герой переживает любовь, утраты и одиночество. Затем он покидает дом ради учёбы.</p></article><article class="study-card card"><h3>Главный конфликт</h3><p>Дом даёт принадлежность, но ограничивает свободу. Дорога означает уход. Память превращает уход в возвращение.</p></article><article class="study-card card"><h3>Проблематика</h3><p>${esc(w.problems)}.</p></article><article class="study-card card"><h3>Поэтика</h3><p>Автобиографический роман воспитания соединён с семейной хроникой. Сюжет строится как поток эпизодов памяти.</p></article></div>
  <section class="wolfe-section research-gaps card"><h2>Недостаточно исследованные вопросы романа</h2><p>Эти направления подходят для доклада, статьи или исследовательского ответа.</p><ul><li>Граница между документальной семейной памятью и художественным мифом.</li><li>Дом как одновременно материальное пространство и модель сознания.</li><li>Телесность, болезнь и смерть в формировании личности Юджина.</li><li>Звуковая организация длинной фразы и её связь с памятью.</li><li>Образ матери-собственницы и экономика семейных отношений.</li><li>Региональная идентичность Юга вне привычной модели «южной готики».</li><li>Фигура Бена как этический центр романа.</li><li>Соотношение американской мечты и невозможности возвращения домой.</li></ul></section>
  <section class="wolfe-section"><div class="section-head"><div><h2>Цитаты о Томасе Вулфе</h2><p>На странице оставлены только русскоязычные цитаты.</p></div></div><div class="quote-gallery">${quotes.map(q=>`<article class="quote-card card"><blockquote>${esc(q.text)}</blockquote><p><b>${esc(q.speaker)}</b></p><p class="tiny-note">${esc(q.context)}</p>${sourceLink(q.sourceUrl,q.sourceLabel)}</article>`).join('')}</div></section>
  <section class="wolfe-section"><div class="research-callout card"><div><small>Русский исследователь</small><h3>${esc(w.researcher)}</h3><p>Н. А. Анастасьев рассматривал Вулфа в истории американской прозы и анализировал автобиографическую основу романа.</p></div>${sourceLink(w.researcherSource.url,w.researcherSource.label)}</div></section>
  <section class="wolfe-section"><div class="section-head"><div><h2>Вопросы для подготовки</h2><p>К каждому вопросу добавлены план и самопроверка.</p></div></div><div class="wolfe-questions">${qs.map(q=>`<div class="question-card card" data-question="${q.number}"><div class="q-number">${q.number}</div><div><p>${esc(q.text)}</p>${planHTML(q)}${selfCheckHTML(q,'wolfe')}</div>${statusControls(q.number)}</div>`).join('')}</div></section>`;
  bindStatusButtons(host);bindAnswerChecks(host);
}
function switchView(view){
  $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'-view'));
  if(view==='timeline')renderTimeline();if(view==='questions')renderQuestions();if(view==='wolfe')renderWolfePage();if(view==='theory')renderTheory();if(view==='quotes')renderQuotesPage();window.scrollTo({top:$('.tabs-wrap').offsetTop,behavior:'smooth'});
}
function init(){bindTabs();fillFilters();bindFilter('map');bindFilter('timeline');initMap();initQuiz();initQuestions();renderWolfePage();renderTheory();renderQuotesPage();updateProgress();}

// ===== v4: отдельный раздел готовых ответов по билетам =====
const USER_READING_PROFILE = {
  known: [
    'Песнь о Роланде','Божественная комедия','Канцоньере','Декамерон','Гамлет','Комедия ошибок',
    'Генрих фон Офтердинген','Золотой жук','Чёрный кот','Падение дома Ашеров','Лигейя','Кармен',
    'Госпожа Бовари','Цветы зла','Песнь о Гайавате','Жерминаль','Человек-зверь','Кукольный дом',
    'Гедда Габлер','Остров доктора Моро','Дом, где разбиваются сердца','Пигмалион','Клуб самоубийц',
    'Странная история доктора Джекила и мистера Хайда','Упадок лжи','Портрет Дориана Грея',
    'Баллада Редингской тюрьмы','Лиспет','Приключения Тома Сойера','Кошка под дождём','Ночь в Лиссабоне',
    'Превращение','Добрый человек из Сезуана','Мамаша Кураж и её дети','Упадок и разрушение','Орландо',
    'О дивный новый мир','Любовник леди Чаттерлей','Скотный двор','1984','Уайнсбург, Огайо',
    'Великий Гэтсби','Американская трагедия','Шум и ярость','Ставок больше нет','Посторонний','Чума',
    'Лысая певица','Носороги','Коллекционер','Женщина французского лейтенанта','Над пропастью во ржи',
    'Девять рассказов','Хорошо ловится рыбка-бананка','Колыбель для кошки','Бильярд в половине десятого',
    'Кошки-мышки','Парфюмер','Сто лет одиночества','Дом Астерия'
  ],
  partial: [
    'Ярмарка тщеславия','Волшебная гора','Фиеста','Портрет художника в юности','Дублинцы',
    'Сердце тьмы','Тошнота'
  ],
  unknown: [
    'Марсель Пруст','В поисках утраченного времени','Генрих Манн','Учитель Гнус, или Конец одного тирана',
    'Верноподданный','Томас Манн','Ричард Олдингтон','Смерть героя','Томас Вулф',
    'Взгляни на дом свой, Ангел'
  ]
};

const ANSWER_OVERRIDES = {
  1:{works:['Похищение быка из Куальнге','Песнь о Хильдебранде','Беовульф','Старшая Эдда'],level:'unknown',thesis:'Ранний средневековый героический эпос отражает родовое сознание, воинскую этику и трагическое принятие судьбы. Кельтская традиция подчёркивает магию и гейсы, германская — дружинную верность, древнескандинавская — фатализм и мужество перед неизбежным.',points:['Устное происхождение и общие признаки раннего эпоса.','Кельтский эпос: Уладский цикл и Кухулин.','Германский эпос: Хильдебранд и Беовульф.','Древнескандинавский эпос: «Старшая Эдда» и Сигурд.','Сходства, национальные различия и общий вывод.'],episodes:['В «Похищении быка из Куальнге» Кухулин один защищает Улад. Бой с другом Фердиадом показывает конфликт личной привязанности и воинского долга.','В «Песни о Хильдебранде» отец и сын не узнают друг друга и вступают в бой. Родственная связь оказывается бессильной перед законом воинской чести.','В «Беовульфе» старый правитель выходит против дракона ради народа. Только Виглаф остаётся рядом, а победа оплачивается смертью героя.','В песнях «Старшей Эдды» Сигурд побеждает Фафнира, но не может избежать предательства и проклятия клада.'],fullAnswer:["Ранний средневековый героический эпос возник из устных преданий. Его создавали и передавали певцы-сказители. В текстах сохранялась память о переселениях, войнах и родовых конфликтах. В центре находится не частная жизнь человека, а судьба героя, рода и народа.", "Такой эпос называют архаическим героическим эпосом. Его основные признаки — устное происхождение, коллективное авторство, соединение истории и мифа, родовое сознание, культ воинской славы и трагическое понимание судьбы. Повторы и устойчивые формулы помогали исполнителю запоминать текст. Реальные войны дополнялись фантастическими мотивами, а поступок героя оценивался по тому, служит ли он роду и народу.", "Кельтская традиция лучше всего представлена ирландскими сагами, или скелами. Главный памятник Уладского цикла — «Похищение быка из Куальнге». Его центральный герой Кухулин защищает Улад, когда остальные воины поражены магической слабостью. Он один сдерживает войско противников и вступает с ними в поединки.", "Особенно важен бой Кухулина с Фердиадом. Герои были друзьями и учились вместе, но воинский долг заставляет их сражаться. Кухулин побеждает, однако воспринимает победу как личную трагедию. Этот эпизод показывает, что подвиг в кельтском эпосе связан не только со славой, но и с нравственной потерей.", "Кельтский эпос отличается близостью земного и потустороннего миров. В нём действуют друиды, пророчицы и магические существа. Важную роль играют гейсы — личные запреты и обязательства героя. Нарушение гейса ведёт к гибели, поэтому судьба раскрывается через систему магических ограничений.", "Германский эпос связан с эпохой Великого переселения народов. В памяти народов сохранились войны, гибель королевств и судьбы правителей. В «Песни о Хильдебранде» отец и сын встречаются на поле боя. Хадубранд не узнаёт отца и принимает его объяснения за обман. Воинская честь делает поединок неизбежным и превращает долг в семейную трагедию.", "В англосаксонской поэме «Беовульф» герой сначала побеждает Гренделя и его мать, а затем, уже в старости, сражается с драконом. Он понимает опасность, но обязан защитить народ. В решающий момент большинство воинов отступает, и рядом остаётся только Виглаф. Беовульф убивает дракона, но получает смертельную рану. Финал показывает главный германский идеал: жизнь конечна, а верность долгу и посмертная слава переживают человека.", "Германская традиция строится вокруг союза правителя и дружины. Конунг награждает воинов оружием и сокровищами, а они обязаны хранить верность. Бегство с поля боя считается тяжелейшим позором. Поэтому герой выбирает риск, поскольку утрата чести страшнее смерти.", "Древнескандинавская традиция сохранилась прежде всего в «Старшей Эдде». Её героические песни рассказывают о Сигурде, Брюнхильд и проклятом кладе Нифлунгов. Сигурд побеждает дракона Фафнира, получает золото и вместе с ним принимает будущую гибель. Он способен победить чудовище, но не может избежать предательства и судьбы.", "Скандинавский эпос особенно последовательно выражает фатализм. Даже боги знают о будущем Рагнарёке, но продолжают бороться. Ценность имеет не обязательная победа, а мужество перед неизбежным концом. Эддические песни отличаются сжатостью, напряжёнными диалогами, пророчествами и кеннингами — сложными образными заменами обычных слов.", "Три традиции имеют общую основу, но расставляют разные акценты. Кельтский эпос сильнее связан с магией, гейсами и подвижной границей миров. Германский сосредоточен на дружинной верности, чести и отношениях воина с правителем. Древнескандинавский подчёркивает неизбежность судьбы и достоинство сопротивления ей.", "Таким образом, ранний средневековый эпос отражает переход от родового мира к ранним государствам и воинским союзам. Его герой защищает род, народ или правителя, ставит долг выше личного благополучия и принимает смерть ради славы. Кельтская традиция раскрывает этот идеал через магию и запреты, германская — через верность дружине, а скандинавская — через борьбу с неизбежной судьбой."]},
  2:{works:['Песнь о Роланде'],level:'known',thesis:'«Песнь о Роланде» показывает идеал вассальной верности. Но героизм Роланда одновременно велик и опасен, потому что гордость мешает ему вовремя затрубить в рог.',points:['Назвать признаки зрелого героического эпоса.','Показать связь подвига с христианской картиной мира.','Разобрать конфликт доблести и разумной меры.','Сопоставить Роланда и Оливье.','Объяснить роль гиперболы и повторов.'],episodes:['Роланд долго отказывается трубить в Олифант. Он боится потерять честь. Поздний сигнал превращает победу в трагедию.','Перед смертью Роланд поднимает перчатку к небу. Эпизод соединяет воинскую честь и христианское смирение.']},
  4:{works:['Божественная комедия. Ад'],level:'known',thesis:'Поэма Данте переходна. Она завершает Средневековье, но уже показывает личность как ответственного автора собственной судьбы.',points:['Объяснить устройство загробного мира.','Показать роль числа три и терцины.','Раскрыть образ Данте-путника.','Назвать Вергилия проводником разума.','Показать связь личной биографии и всемирной истории.'],episodes:['Надпись у врат Ада задаёт закон воздаяния. Каждое наказание соответствует земному выбору грешника.','Паоло и Франческа вызывают сострадание. Но Данте не отменяет нравственной ответственности героев.']},
  5:{works:['Сонеты Петрарки'],level:'known',thesis:'Петраркизм строится на идеализации возлюбленной, внутренней раздвоенности героя и точной риторике любовного переживания.',points:['Назвать образ Лауры.','Показать конфликт земного чувства и духовного идеала.','Объяснить роль антитез и оксюморонов.','Назвать сонет основной формой.','Показать влияние на европейскую лирику.'],episodes:['Лирический герой одновременно благословляет и проклинает любовь. Противоречие становится главным способом показать чувство.']},
  6:{works:['Декамерон'],level:'known',thesis:'«Декамерон» соединяет рамочную композицию и сто самостоятельных новелл. Мир текста строится на столкновении случая, ума, любви и социальной нормы.',points:['Объяснить рамку чумы и загородного общества.','Назвать роль рассказчиков и десяти дней.','Раскрыть жанр новеллы.','Показать типы комического.','Сделать вывод о гуманистическом взгляде на человека.'],episodes:['История о Сер Чаппеллетто показывает разрыв между репутацией и истиной. Ложная исповедь создаёт святого из мошенника.','Новеллы о находчивых героях показывают, что ум часто сильнее сословного положения.']},
  9:{works:['Комедия ошибок'],level:'known',thesis:'Комедии Шекспира утверждают энергию жизни. Ошибки, переодевания и двойники временно разрушают порядок, а финал восстанавливает связи между людьми.',points:['Назвать гуманистическую основу комедий.','Показать роль путаницы и двойников.','Объяснить ускоренный темп действия.','Раскрыть счастливую развязку как восстановление порядка.','Привести пример из «Комедии ошибок».'],episodes:['Две пары близнецов создают цепь ложных узнаваний. Комизм рождается из разрыва между знанием зрителя и заблуждением персонажей.']},
  10:{works:['Гамлет'],level:'known',thesis:'В трагедии гуманистический идеал сталкивается с миром насилия и лжи. Гамлет медлит не из слабости, а потому что ищет нравственно оправданное действие.',points:['Определить конфликт личности и государства.','Показать функцию призрака.','Раскрыть мотив театра.','Объяснить трагедию рефлексии.','Сделать вывод о кризисе гуманизма.'],episodes:['«Мышеловка» превращает театр в средство проверки истины. Реакция Клавдия подтверждает вину.','Сцена на кладбище соединяет философию смерти и бытовой юмор. Череп Йорика разрушает иллюзию земного величия.']},
  26:{works:['Генрих фон Офтердинген'],level:'known',thesis:'Роман Новалиса строится как духовное становление поэта. Голубой цветок становится символом недостижимого единства мира, любви и творчества.',points:['Назвать жанр романа воспитания художника.','Объяснить символ голубого цветка.','Показать путь как форму познания.','Раскрыть слияние сна, мифа и действительности.','Сопоставить с просветительским романом воспитания.'],episodes:['Сон о голубом цветке задаёт направление всего сюжета. Герой ищет не предмет, а полноту бытия.']},
  38:{works:['Золотой жук','Чёрный кот','Падение дома Ашеров','Лигейя'],level:'known',thesis:'Эдгар По соединяет аналитическую новеллу, готический рассказ и теорию единства эффекта. Каждый элемент текста работает на одно эмоциональное воздействие.',points:['Назвать По теоретиком новеллы.','Разделить аналитические и готические тексты.','Показать ненадёжного рассказчика.','Объяснить роль замкнутого пространства.','Привести два контрастных примера.'],episodes:['В «Золотом жуке» разгадка шифра строится логически. Читатель проходит путь от тайны к объяснению.','В «Падении дома Ашеров» дом отражает распад рода и сознания. Финальное разрушение здания буквально завершает метафору.']},
  43:{works:['Кармен'],level:'known',thesis:'Новеллистика Мериме строится на сжатости, документальной манере и столкновении культур. «Кармен» показывает конфликт свободы и желания обладать человеком.',points:['Назвать лаконизм и объективность повествования.','Показать рамку рассказчика-путешественника.','Раскрыть образ Кармен.','Объяснить трагедию Хосе.','Показать роль этнографических деталей.'],episodes:['Кармен прямо говорит, что родилась свободной и умрёт свободной. Хосе не принимает эту свободу и превращает любовь в насилие.']},
  44:{works:['Цветы зла'],level:'known',thesis:'Бодлер находится между романтизмом и символизмом. Он превращает современный город, порок и скуку в материал высокой поэзии.',points:['Объяснить понятие сплина.','Показать конфликт идеала и падения.','Назвать принцип соответствий.','Раскрыть образ города.','Показать влияние на символизм.'],episodes:['В стихотворении «Альбатрос» поэт велик в стихии творчества. На палубе обыденности он становится беспомощным и смешным.']},
  45:{works:['Госпожа Бовари'],level:'known',thesis:'Флобер показывает разрыв между романтическими клише и реальностью. Эмма читает жизнь как плохой роман и разрушает себя попыткой жить по готовым формулам.',points:['Назвать принцип объективного письма.','Раскрыть боваризм.','Показать роль несобственно-прямой речи.','Разобрать вещную деталь.','Объяснить финал и социальную среду.'],episodes:['Сельскохозяйственная выставка соединяет любовное признание Родольфа и речи о хозяйстве. Монтаж разоблачает шаблонность обоих дискурсов.','Сцена бала даёт Эмме образ иной жизни. Позже память о нём становится источником неудовлетворённости.']},
  48:{works:['Ярмарка тщеславия'],level:'partial',thesis:'Роман Теккерея — панорама общества без положительного героя. Ярмарка становится метафорой мира, где отношения превращены в обмен выгодами.',points:['Объяснить подзаголовок «роман без героя».','Сопоставить Бекки Шарп и Эмилию Седли.','Показать роль автора-кукольника.','Назвать сатирические приёмы.','Раскрыть социально-психологический анализ.'],episodes:['Бекки бросает словарь из окна сразу после отъезда из пансиона. Деталь показывает её отказ от навязанных правил.','Во время войны общество продолжает жить карьерой и расчётом. История усиливает сатиру на частные интересы.']},
  49:{works:['Песнь о Гайавате'],level:'known',thesis:'Литература США середины XIX века создаёт национальные мифы. Лонгфелло обращается к индейским преданиям, Уитмен — к демократическому голосу личности, Стоу — к нравственной проблеме рабства.',points:['Назвать поиск национальной темы.','Показать индейский материал Лонгфелло.','Объяснить новаторство свободного стиха Уитмена.','Раскрыть аболиционизм Стоу.','Сделать вывод о самоопределении литературы США.'],episodes:['Гайавата выступает культурным героем. Его деяния объясняют устройство мира и утверждают идею согласия человека с природой.']},
  53:{works:['Жерминаль','Человек-зверь'],level:'known',thesis:'Метод Золя соединяет реалистическое наблюдение и натуралистический эксперимент. Среда и наследственность важны, но персонажи не сводятся к биологии.',points:['Объяснить теорию экспериментального романа.','Назвать роль среды и наследственности.','Показать документальность.','Разобрать символику массы и машины.','Указать противоречие между схемой и художественной силой.'],episodes:['В «Жерминале» шахта Ворё изображена как живое чудовище. Она поглощает людей и делает эксплуатацию зримой.','В «Человеке-звере» локомотив становится символом технической энергии и разрушительного импульса.']},
  56:{works:['Учитель Гнус','Верноподданный'],level:'unknown',thesis:'Генрих Манн развивает политическую и социальную сатиру. Он показывает, как авторитарная система воспроизводится в школе, семье и повседневной психологии.',points:['Назвать демократическую позицию писателя.','Объяснить сатирический гротеск.','Разобрать «Учителя Гнуса».','Связать роман с темой верноподданничества.','Показать общественную направленность прозы.'],correction:'Речь идёт не о новелле, а о романе «Учитель Гнус» («Профессор Унрат», 1905). Учителя зовут Раат. Ученики переделывают фамилию в Unrat — «грязь», «нечистоты», «мусор». Говорящая кличка выражает нравственное разложение героя.',summary:'Учитель Раат деспотично преследует учеников. Он начинает следить за артисткой Розой Фрёлих, затем сам оказывается зависим от неё. Дом педанта превращается в место азартных игр и скандалов. Падение героя разоблачает не только личную слабость, но и авторитарную мораль общества.',episodes:['Раат требует абсолютного подчинения в классе. Школьная дисциплина показана моделью государства.','Пытаясь уничтожить Розу Фрёлих, герой попадает под её власть. Сатира строится на переворачивании ролей преследователя и жертвы.']},
  57:{works:['Волшебная гора'],level:'partial',thesis:'Томас Манн создаёт интеллектуальный роман. Санаторий становится моделью Европы перед Первой мировой войной, а болезнь — способом говорить о кризисе культуры.',points:['Назвать романом воспитания и идей.','Объяснить замкнутое пространство санатория.','Сопоставить Сеттембрини и Нафту.','Показать особое течение времени.','Связать финал с войной.'],summary:'Ганс Касторп приезжает к двоюродному брату на три недели. Он остаётся в санатории на семь лет. Здесь герой попадает между спорящими идеологиями, переживает любовь и учится воспринимать смерть.',episodes:['Рентгеновский снимок превращает тело в знак смертности. Научная процедура становится философским переживанием.','Споры Сеттембрини и Нафты показывают борьбу гуманизма, радикализма и религиозного авторитаризма.','В финале Касторп выходит из санатория на войну. Частное воспитание сталкивается с катастрофой истории.']},
  59:{works:['Кукольный дом','Гедда Габлер'],level:'known',thesis:'Ибсен создаёт аналитическую драму. Событие начинается задолго до поднятия занавеса, а настоящее постепенно раскрывает скрытое прошлое.',points:['Определить «новую драму».','Показать ретроспективную композицию.','Раскрыть роль подтекста.','Объяснить открытый финал.','Привести примеры женских образов.'],episodes:['В «Кукольном доме» письмо Крогстада раскрывает тайну займа. Бытовая деталь запускает разрушение семейной роли Норы.','В «Гедде Габлер» рукопись Лёвборга становится символом творчества. Её сожжение показывает жажду власти над чужой судьбой.']},
  61:{works:['Остров доктора Моро'],level:'known',thesis:'Поздний английский реализм соединяется с научной фантастикой. Уэллс проверяет идеи прогресса через эксперимент, который открывает хрупкость человеческой природы.',points:['Назвать кризис викторианской модели.','Показать научную фантастику как социальный эксперимент.','Раскрыть конфликт науки и этики.','Объяснить образ зверолюдей.','Связать текст с развитием реализма.'],episodes:['«Закон» зверолюдей удерживает их в человеческой форме. После смерти Моро запреты распадаются, и культура оказывается непрочной оболочкой.']},
  62:{works:['Пигмалион','Дом, где разбиваются сердца'],level:'known',thesis:'Шоу превращает пьесу в спор идей. Парадокс, дискуссия и открытый финал важнее традиционной интриги.',points:['Назвать драму-дискуссию.','Объяснить роль парадокса.','Показать социальную функцию языка.','Раскрыть открытые финалы.','Привести примеры из двух пьес.'],episodes:['В «Пигмалионе» произношение меняет социальное восприятие Элизы. Но внутреннюю свободу нельзя создать одним уроком фонетики.','«Дом, где разбиваются сердца» показывает образованную элиту, неспособную действовать перед катастрофой.']},
  63:{works:['Клуб самоубийц','Странная история доктора Джекила и мистера Хайда','Сердце тьмы'],level:'partial',thesis:'Неоромантизм возвращает приключение, тайну и сильный характер. Но внешний сюжет часто раскрывает кризис личности и империи.',points:['Определить неоромантизм.','Назвать приключенческий сюжет.','Показать нравственное испытание героя.','Сопоставить Стивенсона и Конрада.','Объяснить двусмысленность экзотики.'],episodes:['Джекил пытается отделить добро от зла. Эксперимент показывает, что зло не внешняя маска, а часть личности.','В «Сердце тьмы» путешествие вглубь Африки становится движением к тёмной стороне европейской цивилизации.']},
  64:{works:['Лиспет'],level:'known',thesis:'Киплинг соединяет точный рассказ, балладность и колониальную проблематику. «Лиспет» показывает, как власть империи проявляется в частной лжи.',points:['Назвать жанровое разнообразие.','Показать роль колониального пространства.','Раскрыть повествовательную иронию.','Разобрать конфликт культур.','Не сводить автора к простой апологии империи.'],episodes:['Лиспет верит обещанию англичанина вернуться. Миссионеры скрывают правду, и частная ложь разрушает её доверие к чужой культуре.']},
  65:{works:['Упадок лжи','Портрет Дориана Грея','Баллада Редингской тюрьмы'],level:'known',thesis:'Эстетизм Уайльда утверждает автономию искусства. Но художественная форма у него постоянно сталкивается с нравственной ответственностью человека.',points:['Объяснить принцип искусства ради искусства.','Назвать парадокс и декоративность.','Разобрать двойничество Дориана и портрета.','Показать критику викторианской морали.','Связать позднюю поэзию с опытом страдания.'],episodes:['Портрет стареет вместо Дориана. Фантастический мотив делает видимой скрытую нравственную историю героя.','В трактате «Упадок лжи» искусство не копирует жизнь, а создаёт формы, через которые мы её видим.']},
  67:{works:['Приключения Тома Сойера'],level:'known',thesis:'Юмор Твена строится на столкновении детского взгляда и взрослой нормы. Сатира показывает лицемерие школы, церкви и «приличного» общества.',points:['Различить юмор и сатиру.','Показать роль рассказчика.','Объяснить детскую точку зрения.','Назвать речевую комику.','Разобрать один эпизод.'],episodes:['Том превращает покраску забора из наказания в привилегию. Эпизод показывает понимание желания и социальной игры.','Сцены в воскресной школе разоблачают формальность религиозного воспитания.']},
  70:{works:['Кошка под дождём','Фиеста','Ночь в Лиссабоне'],level:'known',thesis:'«Потерянное поколение» переживает войну как разрушение языка, ценностей и будущего. Герои продолжают жить, но не могут вернуться к довоенной цельности.',points:['Объяснить происхождение термина.','Назвать общую травму войны.','Сопоставить Хемингуэя, Ремарка и Олдингтона.','Показать лаконизм и недосказанность.','Сделать вывод о поколенческом опыте.'],summary:'Ричард Олдингтон в романе «Смерть героя» показывает молодого художника Джорджа Уинтерборна. Его гибель на войне подготовлена лицемерием общества, семейным кризисом и бессмысленностью фронта.',episodes:['В «Кошке под дождём» желание спасти кошку выражает потребность героини в тепле, доме и заботе. Муж слышит слова, но не понимает потребность.','«Ночь в Лиссабоне» строится как ночной рассказ беженца. Частная любовь оказывается внутри европейской катастрофы.','В «Смерти героя» Олдингтона фронтовая гибель показана не как героический финал, а как итог разрушенной цивилизации.']},
  71:{works:['Превращение','Портрет художника в юности','Дублинцы'],level:'known',thesis:'Модернизм переносит центр тяжести с внешнего события на сознание. Кафка, Джойс и Пруст по-разному показывают разрыв между человеком и привычной реальностью.',points:['Назвать кризис классического реализма.','Показать субъективное время.','Объяснить миф и символ.','Сопоставить Кафку, Джойса и Пруста.','Привести знакомые тексты.'],summary:'У Пруста роман «В поисках утраченного времени» строится на непроизвольной памяти. Вкус печенья мадлен возвращает герою целый мир прошлого. Память создаёт не копию события, а новую художественную реальность.',episodes:['В «Превращении» чудесное событие описано бытовым тоном. Это делает отчуждение Грегора пугающе обычным.','В «Дублинцах» эпифания открывает скрытый смысл повседневности.','Эпизод с мадлен у Пруста показывает, как ощущение восстанавливает утраченное время.']},
  73:{works:['Добрый человек из Сезуана','Мамаша Кураж и её дети'],level:'known',thesis:'Эпический театр Брехта мешает зрителю забыться в сопереживании. Он заставляет анализировать причины поведения и общественные условия.',points:['Объяснить эффект очуждения.','Назвать песни, надписи и монтаж сцен.','Показать роль рассказчика и комментария.','Разобрать противоречивого героя.','Объяснить открытый вывод.'],episodes:['Шен Те создаёт образ Шуи Та, чтобы выжить. Двойная роль показывает несовместимость доброты и экономических условий.','Мамаша Кураж теряет детей, но продолжает тянуть фургон. Финал не даёт утешения и требует анализа причин войны.']},
  74:{works:['Превращение'],level:'known',thesis:'Мир Кафки соединяет точность бытовой детали и необъяснимую катастрофу. Человек оказывается виноватым и отчуждённым без ясной причины.',points:['Назвать параболичность.','Показать абсурд как норму.','Объяснить отчуждение героя.','Раскрыть бюрократический мир.','Разобрать повествовательный тон.'],episodes:['Грегор думает о работе раньше, чем о природе превращения. Система уже превратила его в функцию до физической метаморфозы.','Семья убирает мебель из комнаты. Забота постепенно становится лишением человеческого пространства.']},
  75:{works:['Волшебная гора'],level:'partial',thesis:'«Волшебная гора» — роман становления, где воспитание происходит через болезнь, спор идей, любовь и опыт смерти.',points:['Назвать исходную наивность Касторпа.','Показать изменение времени.','Раскрыть учителей-антагонистов.','Разобрать тему смерти.','Объяснить открытый итог воспитания.'],episodes:['«Снег» даёт герою видение человечности. Он приходит к мысли, что любовь должна быть сильнее смерти, но не удерживает её как постоянную истину.']},
  76:{works:['Упадок и разрушение'],level:'known',thesis:'Ивлин Во строит сатиру на невозмутимом повествовании и цепи абсурдных событий. Общество выглядит безумным именно потому, что рассказчик говорит спокойно.',points:['Назвать комический роман нравов.','Показать сухой тон.','Объяснить повторяемость социальных ролей.','Разобрать героя-наблюдателя.','Привести эпизод.'],episodes:['Пола Пеннифезера исключают из Оксфорда после чужой выходки. Институт наказывает невиновного, сохраняя внешнее приличие.']},
  77:{works:['Орландо','О дивный новый мир','Любовник леди Чаттерлей'],level:'known',thesis:'Английская проза 1920-х годов ищет новые формы для опыта личности. Вулф исследует время и идентичность, Хаксли — технологическое общество, Лоуренс — конфликт тела и цивилизации.',points:['Назвать кризис викторианской нормы.','Показать формальные эксперименты.','Сопоставить три модели человека.','Привести по одному эпизоду.','Сделать вывод о модернистском поиске.'],episodes:['Орландо меняет пол, но сохраняет непрерывность личности. Биография превращается в игру с историей и гендером.','В «О дивном новом мире» младенцев распределяют по кастам. Наука используется не для свободы, а для производства послушания.','У Лоуренса телесная близость противопоставлена механизированной жизни и классовой изоляции.']},
  78:{works:['1984','Скотный двор','О дивный новый мир'],level:'known',thesis:'Антиутопия Оруэлла показывает власть над языком, памятью и телом. Тоталитаризм стремится не только запретить действие, но и сделать мысль невозможной.',points:['Определить антиутопию.','Показать новояз.','Раскрыть контроль прошлого.','Объяснить роль любви и предательства.','Сопоставить с «Скотным двором».'],episodes:['Министерство правды ежедневно переписывает прошлое. Истина становится функцией текущей власти.','В комнате 101 страх разрушает последнюю личную связь Уинстона.','В «Скотном дворе» заповеди постепенно меняются, а язык скрывает возврат угнетения.']},
  79:{works:['Уайнсбург, Огайо','Великий Гэтсби'],level:'known',thesis:'Американский реализм 1920-х годов показывает одиночество внутри массового общества. Частные мечты сталкиваются с провинциальной замкнутостью и культом успеха.',points:['Назвать послевоенный контекст.','Показать цикл Андерсона.','Раскрыть американскую мечту у Фицджеральда.','Объяснить роль рассказчика.','Сделать вывод о кризисе сообщества.'],episodes:['В «Уайнсбурге» отдельные рассказы складываются в карту одиночества. Герои живут рядом, но не умеют выразить себя.','Зелёный огонёк у Гэтсби становится символом желания, которое всегда отступает в будущее.']},
  80:{works:['Американская трагедия'],level:'known',thesis:'Драйзер показывает американскую мечту как социальную ловушку. Клайд стремится к успеху, но усваивает ценности общества, где человек измеряется деньгами и статусом.',points:['Назвать натуралистическую основу.','Показать социальную детерминацию.','Раскрыть образ Клайда.','Объяснить роль случая и выбора.','Разобрать судебную часть.'],episodes:['Клайд скрывает отношения с Робертой ради брака с богатой девушкой. Личная слабость совпадает с социальным культом успеха.','Сцена на лодке оставляет нравственную двусмысленность. Герой колеблется, но его прежние решения уже сделали катастрофу вероятной.']},
  82:{works:['Кошка под дождём','Фиеста'],level:'known',thesis:'Принцип айсберга означает, что текст сообщает меньше, чем знает автор. Главный конфликт скрыт в паузах, повторах и бытовых деталях.',points:['Дать определение принципа.','Показать лаконичный синтаксис.','Объяснить подтекст диалога.','Разобрать символическую деталь.','Привести пример из рассказа.'],episodes:['В «Кошке под дождём» героиня перечисляет простые желания. За ними скрыта неудовлетворённость браком и потребность в устойчивой жизни.','В «Фиесте» травма Джейка редко называется прямо. Она определяет отношения с Брет и весь эмоциональный строй романа.']},
  83:{works:['Шум и ярость'],level:'known',thesis:'Фолкнер разрушает линейное повествование, чтобы показать распад семьи Компсонов изнутри разных сознаний.',points:['Назвать четыре части и рассказчиков.','Показать субъективное время.','Объяснить поток сознания.','Раскрыть тему Юга и семьи.','Показать роль Дилси.'],episodes:['В сознании Бенджи прошлое и настоящее существуют одновременно. Переходы запускаются запахом, звуком или словом.','Квентин пытается остановить время, разбивая часы. Но внутреннее время продолжает разрушать его.','Дилси видит начало и конец семьи. Её устойчивость противопоставлена распаду Компсонов.']},
  86:{works:['Женщина французского лейтенанта','Колыбель для кошки','Парфюмер','Сто лет одиночества'],level:'known',thesis:'Постмодернизм показывает условность любого рассказа. Он соединяет игру с жанрами, цитатность, несколько версий истины и активного читателя.',points:['Назвать метаповествование.','Объяснить интертекстуальность.','Показать жанровую игру.','Разобрать множественный финал.','Привести разные национальные примеры.'],episodes:['Фаулз предлагает несколько финалов «Женщины французского лейтенанта». Автор демонстрирует власть над сюжетом и одновременно ограничивает её.','В «Колыбели для кошки» вымышленная религия Боконона прямо признаёт свои истины «безобидной ложью».','«Парфюмер» соединяет исторический роман, житие антигероя и пародию на гения.']},
  87:{works:['Ставок больше нет','Тошнота','Посторонний','Чума'],level:'known',thesis:'Экзистенциализм показывает человека в мире без готового смысла. Свобода становится не привилегией, а тяжёлой ответственностью.',points:['Назвать абсурд и свободу.','Сопоставить Сартра и Камю.','Показать отчуждение героя.','Объяснить выбор и ответственность.','Привести эпизоды.'],episodes:['Мерсо отказывается изображать ожидаемые чувства. Судят не только убийство, но и его несоответствие общественному ритуалу.','В «Чуме» Риэ действует без надежды на окончательную победу. Смысл возникает в солидарности и работе.','В «Тошноте» привычные вещи теряют устойчивые значения. Герой переживает избыточность существования.']},
  88:{works:['Лысая певица','Носорог'],level:'known',thesis:'Драма абсурда разрушает причинный сюжет и нормальный диалог. Язык перестаёт соединять людей и показывает пустоту социальных автоматизмов.',points:['Назвать кризис коммуникации.','Показать повторы и клише.','Объяснить циклическую композицию.','Разобрать превращение как метафору.','Упомянуть Беккета как иной тип абсурда.'],summary:'В пьесе Беккета «В ожидании Годо» Владимир и Эстрагон ждут человека, который не приходит. Повторяемость действий превращает ожидание в модель человеческого существования.',episodes:['В «Лысой певице» бытовой разговор распадается на бессмысленные фразы. Чем больше герои говорят, тем меньше общаются.','В «Носороге» массовое превращение показывает соблазн конформизма. Беранже остаётся человеком не потому, что силён, а потому что не может принять коллективное безумие.']},
  91:{works:['Коллекционер','Женщина французского лейтенанта'],level:'known',thesis:'Фаулз исследует свободу, власть и ответственность читателя. Его романы соединяют психологический анализ и игру с формой.',points:['Показать тему обладания.','Сопоставить два голоса «Коллекционера».','Объяснить метаповествование.','Разобрать множественные финалы.','Сделать вывод о свободе.'],episodes:['Фредерик называет похищение заботой. Его язык превращает насилие в коллекционирование.','Во второй части дневник Миранды разрушает монополию рассказчика и показывает иной смысл тех же событий.','В «Женщине французского лейтенанта» автор входит в текст и предлагает варианты судьбы героев.']},
  93:{works:['Хорошо ловится рыбка-бананка','Над пропастью во ржи'],level:'known',thesis:'Сэлинджер показывает травму и одиночество через разговорную речь, детский взгляд и недосказанность.',points:['Назвать психологизм.','Показать разговорную речь.','Раскрыть тему отчуждения.','Объяснить образ ребёнка.','Разобрать финальную деталь.'],episodes:['Симор рассказывает Сибилле о рыбке-бананке. Детская сказка скрывает тему ненасытности и невозможности вернуться к нормальной жизни.','Холден мечтает ловить детей над пропастью. Фантазия выражает желание защитить невинность и собственный страх взросления.']},
  94:{works:['Колыбель для кошки'],level:'known',thesis:'Воннегут соединяет научную фантастику, чёрный юмор и притчу. Сатира направлена против безответственной науки, идеологии и человеческой уверенности в контроле.',points:['Назвать фрагментарную композицию.','Показать роль Бокононизма.','Объяснить чёрный юмор.','Разобрать лёд-девять.','Связать смех и катастрофу.'],episodes:['Учёный создаёт лёд-девять как удобное техническое решение. Маленькое изобретение получает способность уничтожить мир.','Бокононизм открыто называет свои догмы ложью. Парадокс показывает потребность человека в утешительном рассказе.','Финальный образ Боконона с книгой у разрушенного мира соединяет фарс и апокалипсис.']},
  95:{works:[],level:'unknown',thesis:'Битники противопоставили послевоенному потребительскому порядку дорогу, импровизацию и поиск предельного опыта.',points:['Назвать исторический контекст 1950-х.','Показать культ дороги и спонтанности.','Раскрыть джазовую поэтику.','Сопоставить Керуака, Гинсберга и Берроуза.','Указать внутренние противоречия движения.'],summary:'В романе Керуака «В дороге» путешествия Сэла Парадайза и Дина Мориарти строятся как поиск свободы. Поэма Гинсберга «Вопль» превращает частный протест в голос поколения. Берроуз показывает разрушение личности зависимостью и системой контроля.',episodes:['У Керуака дорога постоянно обещает обновление, но герои возвращаются к одиночеству.','В «Вопле» длинная строка имитирует дыхание и джазовую импровизацию.']},
  96:{works:['Бильярд в половине десятого'],level:'known',thesis:'Бёлль показывает, что прошлое продолжает действовать в семейной памяти и общественных привычках. Послевоенная Германия не может обновиться без нравственного суда над собой.',points:['Объяснить «непреодолённое прошлое».','Показать семейную хронику.','Раскрыть символы причастия буйвола и агнца.','Объяснить нелинейное время.','Сделать вывод об ответственности.'],episodes:['Разрушение аббатства связывает военную логику и семейную историю. Один и тот же поступок получает разные нравственные оценки.','Бильярдная становится пространством воспоминания. Настоящее постоянно открывает скрытые слои прошлого.']},
  97:{works:['Кошки-мышки'],level:'known',thesis:'Грасс соединяет гротеск, ненадёжное повествование и тему вины. Частная история Мальке становится моделью поколения, воспитанного на культе силы.',points:['Назвать Данцигскую трилогию.','Показать ненадёжного рассказчика.','Раскрыть образ кадыка.','Объяснить гротеск.','Связать частную вину и историю.'],episodes:['Необычный кадык Мальке делает его объектом насмешки и знаком исключительности. Герой пытается превратить уязвимость в подвиг.','Рассказчик обращается к исчезнувшему Мальке. Сам акт рассказа становится попыткой оправдаться.']},
  98:{works:['Парфюмер'],level:'known',thesis:'Зюскинд создаёт постмодернистскую версию романа о гении. Гренуй обладает абсолютным даром, но лишён человеческой связи и нравственного содержания.',points:['Назвать жанровую смесь.','Показать мир запахов.','Раскрыть пародию на гения.','Объяснить иронию рассказчика.','Разобрать финал.'],episodes:['Гренуй создаёт аромат, заставляющий толпу видеть в нём ангела. Искусство превращается в технологию массовой иллюзии.','В финале люди разрывают героя из любви. Абсолютное признание оказывается формой уничтожения.']},
  99:{works:['Дом Астерия'],level:'known',thesis:'Интеллектуальная проза Латинской Америки превращает философскую проблему в лабиринт, парадокс или фантастическую модель.',points:['Назвать интеллектуальную фантастику.','Показать лабиринт и двойника у Борхеса.','Объяснить игру с читателем.','Упомянуть Кортасара.','Связать форму и философский вопрос.'],episodes:['В «Доме Астерия» рассказ ведёт Минотавр. Последняя фраза меняет смысл всего текста и заставляет перечитать образ чудовища.']},
  100:{works:['Сто лет одиночества'],level:'known',thesis:'Роман Маркеса соединяет семейную хронику, миф и историю Латинской Америки. Повторение имён и судеб показывает циклическое время одиночества.',points:['Определить магический реализм.','Показать историю рода Буэндиа.','Объяснить циклическое время.','Раскрыть мотив одиночества.','Разобрать финал рукописей.'],episodes:['Вознесение Ремедиос Прекрасной описано как бытовое событие. Чудо включено в повседневность без объяснения.','Расстрел бастующих и последующее отрицание события показывают насилие над исторической памятью.','В финале Аурелиано читает рукописи о собственной жизни. Чтение и уничтожение Макондо совпадают.']}
};

function answerMaterials(q){
  const o=ANSWER_OVERRIDES[q.number]||{};
  const authors=questionAuthors(q.number);
  const works=o.works||authors.map(a=>a.work).filter(Boolean);
  let level=o.level;
  if(!level){
    const joined=works.join(' ').toLowerCase();
    level=USER_READING_PROFILE.known.some(w=>joined.includes(w.toLowerCase()))?'known':USER_READING_PROFILE.partial.some(w=>joined.includes(w.toLowerCase()))?'partial':'unknown';
  }
  const manualEvidence=MANUAL_THESIS_EVIDENCE[q.number];
  const plan=manualEvidence?manualEvidence.map(x=>x.title):(o.points||answerPlan(q));
  const mainAuthor=authors[0];
  const thesis=o.thesis||`${q.text} следует раскрывать через эпоху, художественный метод и точный анализ произведения. В ответе важно назвать не только признаки явления, но и показать их на конкретном эпизоде.`;
  const summary=o.summary||((level==='unknown'&&mainAuthor)?`${mainAuthor.work}: ${mainAuthor.extra}`:'');
  const episodes=o.episodes||((mainAuthor)?[`Используйте ${mainAuthor.work} как основной пример. Сначала назовите конфликт, затем покажите один образ или художественную деталь.`]:[]);
  return {q,works,level,plan,thesis,summary,episodes,correction:o.correction||'',fullAnswer:o.fullAnswer||null};
}
function familiarityLabel(level){return level==='known'?'Опора на прочитанное':level==='partial'?'Читала частично':'Нужно изучить'}
function renderTicketAnswers(){
  const host=$('#ticket-answers');if(!host)return;
  const term=($('#answer-search')?.value||'').trim().toLowerCase();
  const fam=$('#answer-familiarity')?.value||'all';
  const sec=$('#answer-section')?.value||'all';
  const rows=EXAM_QUESTIONS.map(answerMaterials).filter(m=>{
    const hay=`${m.q.number} ${m.q.text} ${m.q.section} ${m.works.join(' ')} ${m.thesis}`.toLowerCase();
    return (!term||hay.includes(term))&&(fam==='all'||m.level===fam)&&(sec==='all'||m.q.section===sec);
  });
  host.innerHTML=rows.map(m=>`<article class="ticket-answer-card card" data-answer-card="${m.q.number}">
    <div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div>
    <div class="ticket-answer-body">
      ${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}
      <div class="answer-columns"><div>
        <div class="answer-block"><h4>Главный тезис</h4><div class="ready-answer">${esc(m.thesis)}</div></div>
        <div class="answer-block" style="margin-top:12px"><h4>План устного ответа</h4><ol>${m.plan.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div>
      </div><div>
        <div class="answer-block"><h4>Произведения для аргументации</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Подберите пример из обзора эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Краткая сводка.</b> ${esc(m.summary)}</p>`:''}</div>
        <div class="answer-block" style="margin-top:12px"><h4>Эпизоды и точные опоры</h4>${m.episodes.length?m.episodes.map(e=>`<div class="episode-card">${esc(e)}</div>`).join(''):'<p>Для этого обзорного вопроса важнее сопоставление авторов и направлений.</p>'}</div>
      </div></div>
      <div class="answer-status-row"><span class="tiny-note">После проговаривания ответа отметьте результат.</span>${statusControls(m.q.number,true)}</div>
    </div></article>`).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
  $$('[data-toggle-answer]',host).forEach(b=>b.onclick=()=>{const card=$(`[data-answer-card="${b.dataset.toggleAnswer}"]`,host);card.classList.toggle('open');b.textContent=card.classList.contains('open')?'Свернуть':'Открыть ответ'});
  bindStatusButtons(host);
}
function initTicketAnswers(){
  const sec=$('#answer-section');if(!sec)return;
  sec.innerHTML='<option value="all">Все разделы</option>'+[...new Set(EXAM_QUESTIONS.map(q=>q.section))].map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  $('#answer-search').oninput=renderTicketAnswers;$('#answer-familiarity').onchange=renderTicketAnswers;sec.onchange=renderTicketAnswers;renderTicketAnswers();
}
const _switchViewV4=switchView;
switchView=function(view){_switchViewV4(view);if(view==='answers')renderTicketAnswers();};
const _initV4=init;
init=function(){_initV4();initTicketAnswers();};

// ===== v6: ответы от общего к частному, контекст, биография и подробные эпизоды =====
const HISTORICAL_CONTEXT = {
  'Средние века и Возрождение':'Формирование сословного общества, укрепление христианской картины мира и рост городов определили переход от эпоса к индивидуальному авторству. Возрождение усилило интерес к человеку, земной жизни и античному наследию.',
  'Литература XVII–XVIII веков':'Религиозные войны, становление абсолютных монархий, научная революция и идеи Просвещения изменили представление о человеке. Барокко выразило кризис устойчивого мира, классицизм искал порядок, а просветители связывали литературу с общественной критикой.',
  'Литература XIX века: романтизм и реализм':'Французская революция, наполеоновские войны и промышленный переворот изменили европейское общество. Романтизм возник как реакция на рационализм и разочарование в итогах революции. На него повлияли немецкий идеализм, идеи братьев Шлегелей, интерес к фольклору и национальной истории. Реализм усилился вместе с ростом городов, буржуазных отношений и социальной мобильности.',
  'Литература рубежа XIX–XX веков':'Урбанизация, массовое общество, кризис позитивизма и новые открытия в психологии усилили сомнение в прежних моделях человека. Реализм усложняется, возникают натурализм, символизм, эстетизм и неоромантизм.',
  'Литература XX века: 1918–1945':'Первая мировая война, революции, экономический кризис и рост тоталитарных режимов разрушили доверие к прогрессу. Литература ищет новые формы для травмы, распада опыта и нестабильного сознания.',
  'Литература после 1945 года':'Вторая мировая война, Холокост, атомная угроза, холодная война и общество потребления заставили литературу заново обсуждать ответственность, память и границы языка. Постмодернизм усилил игру с формой и недоверие к единой истине.'
};

const AUTHOR_BIO_FACTS = {
  2:'Автор «Песни о Роланде» неизвестен. Текст складывался в устной среде жонглёров и был записан около XI века. Историческая основа — поход Карла Великого в Испанию 778 года, но баски в поэме заменены сарацинами.',
  4:'Данте участвовал в политической жизни Флоренции и оказался в изгнании. Личный опыт изгнанника усилил тему суда над современностью. Беатриче стала для него не только земной возлюбленной, но и духовным проводником.',
  5:'Петрарка служил при церковных дворах, много путешествовал и собирал античные рукописи. Его внутренняя раздвоенность между земной славой и христианским идеалом стала основой «Канцоньере».',
  6:'Боккаччо был связан с торговой средой Неаполя и хорошо знал городские типы. Чума 1348 года стала реальным историческим фоном рамочной композиции «Декамерона».',
  10:'Шекспир работал актёром, драматургом и совладельцем театра. Театральный опыт объясняет роль сцены, игры и двойного действия в «Гамлете».',
  26:'Новалис изучал право, философию и горное дело. Его интерес к естественным наукам соединялся с мистикой. Ранняя смерть невесты Софи фон Кюн повлияла на образ любви как пути к духовному единству.',
  38:'Эдгар По работал журналистом и редактором. Он зависел от журнального рынка, поэтому развивал короткую форму и теорию «единства эффекта». Ранние утраты и нестабильная жизнь усилили темы смерти, памяти и распада сознания.',
  43:'Мериме был инспектором исторических памятников и много путешествовал. Его интерес к документу, археологии и чужим культурам определил сухую, почти научную манеру новелл.',
  45:'Флобер жил как профессиональный писатель и годами шлифовал фразы. Суд над «Госпожой Бовари» в 1857 году показал, насколько остро современники восприняли его беспристрастное изображение адюльтера и провинциальной среды.',
  53:'Золя работал в издательстве и журналистике. Он создавал цикл «Ругон-Маккары» как исследование семьи в условиях Второй империи. На его метод повлияли позитивизм, физиология и теория наследственности.',
  56:'Генрих Манн был политически активным писателем и противником авторитаризма. Он рано увидел связь между культом власти, национализмом и обывательским конформизмом. Это определило сатиру «Верноподданного» и «Учителя Гнуса».',
  57:'Томас Манн происходил из любекской купеческой семьи. Опыт распада семейного уклада вошёл в «Будденброков». Жизнь в санатории его жены Кати дала материал для «Волшебной горы».',
  59:'Ибсен работал в театре режиссёром и драматургом. Долгая жизнь вне Норвегии помогла ему увидеть национальное общество со стороны. В поздних пьесах он переносит конфликт из внешнего действия во внутреннюю драму личности.',
  62:'Шоу был театральным критиком и участником Фабианского общества. Его пьесы соединяют комедию, общественную полемику и спор идей. Он сознательно разрушал привычную «хорошо сделанную пьесу».',
  65:'Уайльд был критиком, драматургом и публичным эстетистом. Суд и заключение изменили его позднюю прозу и поэзию. «Баллада Редингской тюрьмы» выросла из личного тюремного опыта.',
  67:'Марк Твен работал наборщиком, лоцманом на Миссисипи и журналистом. Опыт провинциальной Америки и устной речи стал основой его юмора и образа детства.',
  70:'Хемингуэй был санитаром на итальянском фронте. Ремарк участвовал в войне солдатом. Олдингтон служил на Западном фронте. Их биографии объясняют недоверие к героической риторике и интерес к травме поколения.',
  71:'Кафка работал в страховом ведомстве, Джойс жил в эмиграции, Пруст создавал роман в условиях болезни и изоляции. Разные биографии сходятся в одном: привычный внешний сюжет уступает анализу сознания, памяти и отчуждения.',
  73:'Брехт пережил Первую мировую войну, эмиграцию и борьбу с нацизмом. Марксистская теория помогла ему создать театр, который не погружает зрителя в иллюзию, а заставляет анализировать общественные причины действия.',
  74:'Кафка работал с бюрократическими документами и делами о производственных травмах. Опыт безличной административной машины отразился в мире, где герой сталкивается с непонятной властью и виной.',
  75:'Томас Манн начал роман после визита в швейцарский санаторий. Первая мировая война изменила замысел: история молодого человека превратилась в модель духовного кризиса Европы перед катастрофой.',
  76:'Ивлин Во работал журналистом и участвовал в военных кампаниях. Его знание британских институтов и высшего общества стало материалом для холодной сатиры на образование, карьеру и социальные ритуалы.',
  77:'Вулф участвовала в группе Блумсбери, Хаксли происходил из семьи учёных, Лоуренс вырос в шахтёрской семье. Эти различия определили их темы: сознание и пол, технократическое общество, конфликт тела и индустриальной цивилизации.',
  78:'Оруэлл служил в колониальной полиции, жил среди бедняков и участвовал в гражданской войне в Испании. Опыт пропаганды и политического насилия напрямую связан с «Скотным двором» и «1984».',
  79:'Фицджеральд стал хроникёром «века джаза». Андерсон работал в рекламе и бизнесе, но ушёл в литературу. Оба показывают одиночество внутри общества внешнего успеха.',
  80:'Драйзер вырос в бедной многодетной семье и работал журналистом. Он видел, как деньги и социальный статус определяют судьбу человека. Поэтому «Американская трагедия» строится вокруг давления мечты об успехе.',
  82:'Хемингуэй начинал как репортёр. Журналистская школа научила его точности и сокращению. Военный опыт сделал недосказанность способом говорить о травме без прямого объяснения.',
  83:'Фолкнер вырос на американском Юге. История рабства, Гражданской войны и распада старых семей стала основой вымышленного округа Йокнапатофа.',
  87:'Сартр пережил плен и Сопротивление. Камю вырос в бедной семье в Алжире и работал журналистом. Война и оккупация превратили свободу, абсурд и солидарность в практические нравственные вопросы.',
  88:'Ионеско наблюдал рост фашизма в Румынии. Беккет участвовал во французском Сопротивлении. Их театр показывает, как готовые слова и ритуалы перестают выражать живой опыт.',
  91:'Фаулз преподавал и долго интересовался экзистенциализмом. В романах он проверяет свободу героя и читателя, разрушая власть единственного рассказчика.',
  93:'Сэлинджер участвовал во Второй мировой войне и освобождении концлагеря. Опыт травмы помогает понять его героев, которые скрывают внутренний кризис за разговорной речью и иронией.',
  94:'Воннегут пережил бомбардировку Дрездена как военнопленный. Работа в корпорации усилила его недоверие к безответственной науке. Поэтому фантастический сюжет у него связан с личной памятью и социальной сатирой.',
  96:'Бёлль был солдатом вермахта и после войны вернулся в разрушенную Германию. Его проза исследует молчание, вину и сохранение нацистских привычек в мирной жизни.',
  97:'Грасс вырос в Данциге и признал службу в войсках СС. Его тексты постоянно возвращаются к личной и коллективной вине, ненадёжной памяти и попыткам самооправдания.',
  98:'Зюскинд изучал историю и работал сценаристом. В «Парфюмере» он соединяет историческую реконструкцию XVIII века с пародией на роман о гении.',
  100:'Маркес работал журналистом и вырос среди семейных рассказов о гражданских войнах и чудесах. История Колумбии и устная память семьи стали основой Макондо.'
};

const DETAILED_EPISODES = {
  'Песнь о Роланде':[{'loc':'тирада 87–89','text':'Оливье трижды просит Роланда затрубить в Олифант. Роланд отказывается, потому что боится бесчестия. Повтор подчёркивает его героическую гордость. Когда он всё-таки трубит, помощь уже запаздывает.'},{'loc':'финальные тирады о смерти Роланда','text':'Роланд ложится лицом к Испании, поднимает перчатку к Богу и вспоминает завоевания. Воинская поза соединяется с исповедальным жестом. Так эпос связывает вассальную честь и христианское спасение.'}],
  'Божественная комедия. Ад':[{'loc':'Ад, песнь III','text':'Над вратами Ада написано, что входящие должны оставить надежду. Затем Данте видит безразличных, которые при жизни не выбрали ни добра, ни зла. Их бесконечный бег показывает наказание за нравственную пассивность.'},{'loc':'Ад, песнь V','text':'Франческа рассказывает о чтении истории Ланселота. Книга становится посредником соблазна. Данте сочувствует героине, но композиция помещает её рассказ внутри круга сладострастных.'}],
  'Декамерон':[{'loc':'День I, новелла 1','text':'Сер Чаппеллетто на смертном одре произносит ложную исповедь. Священник принимает его за святого, а люди начинают поклоняться мошеннику. Новелла показывает разрыв между фактом, речью и общественной репутацией.'},{'loc':'рамка, Введение','text':'Семь женщин и трое мужчин покидают охваченную чумой Флоренцию. Они создают временное общество с правилами рассказа. Рамка противопоставляет хаосу города порядок слова и человеческого общения.'}],
  'Гамлет':[{'loc':'акт III, сцена 2','text':'Гамлет ставит перед Клавдием пьесу об убийстве короля. Он наблюдает не за словами, а за телесной реакцией зрителя. Побег Клавдия превращает театр в способ проверки истины.'},{'loc':'акт V, сцена 1','text':'На кладбище Гамлет держит череп Йорика. Воспоминание о шуте переходит в размышление о судьбе Александра Македонского. Бытовая вещь разрушает иллюзию земного величия.'}],
  'Генрих фон Офтердинген':[{'loc':'часть I, глава 1','text':'Генрих видит во сне голубой цветок. Цветок склоняется к нему и приобретает черты лица. Эпизод задаёт связь природы, любви и поэзии, которую герой будет искать в дальнейшем пути.'},{'loc':'часть I, главы о путешествии','text':'Рассказы купцов, рыцарей и отшельника превращают дорогу в обучение. Герой получает не готовые правила, а разные символические версии мира. Так роман воспитания становится романом становления поэта.'}],
  'Падение дома Ашеров':[{'loc':'финал рассказа','text':'Мэдлин выходит из склепа и падает на брата. Рассказчик выбегает наружу и видит, как трещина раскалывает дом. Гибель людей и здания совпадает, поэтому дом становится образом рода и разрушенного сознания.'}],
  'Госпожа Бовари':[{'loc':'часть II, глава 8','text':'На сельскохозяйственной выставке Родольф признаётся Эмме в любви. Его шаблонные слова чередуются с речами о скоте и удобрениях. Монтаж показывает одинаковую пустоту романтических клише и официальной риторики.'},{'loc':'часть I, главы о бале в Вобьесаре','text':'Эмма впервые видит аристократический праздник. Позже она хранит футляр от сигары и вспоминает бал как знак иной жизни. Предметная деталь показывает, как мечта закрепляется в вещи.'}],
  'Кармен':[{'loc':'часть IV, финал','text':'Хосе предлагает Кармен бежать и начать новую жизнь. Она отвечает, что больше его не любит и не станет лгать. Кармен заранее принимает смерть, но не отказывается от свободы. Хосе превращает любовь в право собственности.'}],
  'Ярмарка тщеславия':[{'loc':'глава 2','text':'После отъезда из пансиона Бекки выбрасывает из окна словарь, подаренный мисс Пинкертон. Жест комичен, но точно выражает её отказ играть роль благодарной воспитанницы.'},{'loc':'главы о Брюсселе и Ватерлоо','text':'Пока рядом идёт война, герои заняты браками, деньгами и карьерой. Историческая катастрофа не делает общество нравственнее. Она лишь ускоряет расчёты и перемены положения.'}],
  'Жерминаль':[{'loc':'часть I, главы о спуске в шахту','text':'Этьен впервые спускается в Ворё. Теснота, жара и темнота описаны как работа огромного живого организма. Шахта становится образом системы, которая поглощает человеческие тела.'},{'loc':'часть VII, финал','text':'После поражения стачки Этьен уезжает. Под землёй будто прорастают семена будущего восстания. Название месяца превращается в символ социального обновления.'}],
  'Человек-зверь':[{'loc':'главы о поезде и убийстве','text':'Жак Лантье чувствует приступы убийственного желания. Движение локомотива и ритм железной дороги сопровождают нарастающую страсть. Техника не отменяет звериное, а усиливает его.'}],
  'Кукольный дом':[{'loc':'действие III','text':'Нора понимает, что Торвальд заботится не о ней, а о своей репутации. После угрозы Крогстада он обвиняет жену, а после спасения пытается вернуть прежний порядок. Нора уходит, потому что видит себя куклой в доме отца и мужа.'}],
  'Гедда Габлер':[{'loc':'действия III–IV','text':'Гедда сжигает рукопись Лёвборга и говорит, что сжигает его ребёнка. Она уничтожает чужое творчество, потому что сама не умеет создать свободную жизнь. Позже её мечта о «красивой смерти» оборачивается пошлым скандалом.'}],
  'Пигмалион':[{'loc':'акт II','text':'Хиггинс спорит, что сможет выдать цветочницу за герцогиню, изменив её речь. Обучение показывает социальную условность класса. Однако Элиза становится самостоятельной личностью и перестаёт быть материалом эксперимента.'}],
  'Дом, где разбиваются сердца':[{'loc':'акт III','text':'Герои продолжают разговоры и любовные игры даже во время воздушного налёта. Дом капитана Шотовера становится моделью Европы, которая понимает опасность, но не способна действовать.'}],
  'Странная история доктора Джекила и мистера Хайда':[{'loc':'глава 10, исповедь Джекила','text':'Джекил объясняет, что хотел разделить добро и зло. Опыт освобождает Хайда, но не создаёт нравственно нейтральную часть личности. Подавленное желание получает отдельное тело и постепенно захватывает хозяина.'}],
  'Портрет Дориана Грея':[{'loc':'глава 20','text':'Дориан пытается уничтожить портрет ножом. Слуги находят мёртвого старика, а портрет снова молод. Финал показывает невозможность отделить внешнюю красоту от нравственного выбора.'}],
  'Приключения Тома Сойера':[{'loc':'глава 2','text':'Том превращает наказание покраской забора в редкую привилегию. Другие мальчики отдают ему вещи за право работать. Эпизод показывает, как желание создаётся запретом и престижем.'}],
  'Кошка под дождём':[{'loc':'середина рассказа','text':'Американка видит под дождём кошку и хочет спасти её. Муж продолжает читать и почти не реагирует. Перечень её желаний — длинные волосы, столовое серебро, ребёнок — раскрывает скрытую неудовлетворённость браком.'}],
  'Превращение':[{'loc':'часть I','text':'Грегор просыпается насекомым и первым делом думает, как не опоздать на поезд. Семья и управляющий ждут от него трудовой функции. Фантастическое событие подаётся деловым тоном, что усиливает отчуждение.'},{'loc':'часть III, финал','text':'После смерти Грегора семья едет за город и строит планы на будущее. Родители замечают, что Грета стала взрослой. Освобождение семьи достигается ценой исключения бесполезного человека.'}],
  'Мамаша Кураж и её дети':[{'loc':'сцена 3','text':'Кураж торгуется за жизнь Швейцеркаса и слишком долго снижает цену. Пока она считает деньги, сына казнят. Экономический расчёт и материнство оказываются неразделимы.'},{'loc':'сцена 11','text':'Немая Катрин барабанит, предупреждая город о нападении. Она погибает, но спасает людей. Эпизод показывает возможность нравственного действия внутри мира войны.'}],
  'Добрый человек из Сезуана':[{'loc':'сцены появления Шуи Та','text':'Шен Те создаёт образ жёсткого двоюродного брата, чтобы защитить лавку. Добро без силы оказывается беспомощным. Раздвоение героини показывает социальную невозможность оставаться доброй.'}],
  'Упадок и разрушение':[{'loc':'начальные главы','text':'Пола Пеннифезера исключают из Оксфорда после чужой выходки. Администрация наказывает невиновного, потому что важнее сохранить форму приличия. Спокойный тон делает абсурд ещё заметнее.'}],
  'О дивный новый мир':[{'loc':'глава 1','text':'Экскурсия по инкубаторию показывает искусственное выращивание людей и деление на касты. Объяснение звучит как производственная инструкция. Наука используется для заранее заданного социального неравенства.'}],
  '1984':[{'loc':'часть I, глава 1','text':'Уинстон начинает дневник словами «Долой Старшего Брата». Частный жест письма становится преступлением мысли. В мире тотального контроля внутренняя речь уже является формой сопротивления.'},{'loc':'часть III, комната 101','text':'О’Брайен использует страх крыс. Уинстон просит сделать это с Джулией. Власть побеждает не телом, а разрушением последней личной связи.'}],
  'Скотный двор':[{'loc':'глава 10','text':'Свиньи начинают ходить на двух ногах, а заповедь меняется. Животные смотрят на свиней и людей и уже не различают их. Финал показывает превращение революционной элиты в прежних хозяев.'}],
  'Великий Гэтсби':[{'loc':'глава 5','text':'Гэтсби встречается с Дейзи и показывает ей рубашки. Дейзи плачет над их множеством. Вещи заменяют утраченное время, а богатство становится языком любви.'},{'loc':'глава 9, финал','text':'Зелёный огонёк связывается с мечтой, которая всё время отступает. Частная история Гэтсби превращается в образ американской надежды и невозможности вернуть прошлое.'}],
  'Американская трагедия':[{'loc':'книга II, главы о поездках Клайда и Роберты','text':'Клайд скрывает отношения с Робертой, потому что мечтает войти в мир богатых. Беременность превращает личную ложь в социальную ловушку.'},{'loc':'книга II, эпизод на озере','text':'Клайд не решается сознательно ударить Роберту, но и не спасает её после падения. Драйзер показывает преступление как цепь слабости, страха и социального желания.'}],
  'Шум и ярость':[{'loc':'часть 1, 7 апреля 1928 года','text':'Запах деревьев и звук имени Кэдди мгновенно переносят Бенджи в прошлое. Переходы не объясняются. Читатель должен собрать историю семьи из ассоциаций сознания.'}],
  'Посторонний':[{'loc':'часть I, глава 1','text':'Мерсо сообщает о смерти матери короткими нейтральными фразами. Он фиксирует жару, дорогу и усталость. Общество позже истолкует отсутствие привычной скорби как нравственное преступление.'},{'loc':'часть II, суд','text':'Прокурор говорит больше о похоронах матери, чем об убийстве. Суд превращается в наказание за несоответствие общественным ожиданиям.'}],
  'Чума':[{'loc':'часть II','text':'Доктор Риэ организует санитарные отряды, хотя понимает, что победа временная. Он выбирает работу и солидарность вместо красивой идеи героизма.'}],
  'Лысая певица':[{'loc':'финал пьесы','text':'Персонажи выкрикивают обрывки слов, а диалог распадается. Затем пьеса начинается снова, но семьи меняются местами. Повтор показывает пустоту автоматической речи.'}],
  'Носорог':[{'loc':'акт III','text':'Беранже остаётся один, когда все превращаются в носорогов. Он называет себя последним человеком. Фантастическое превращение показывает соблазн массового подчинения.'}],
  'Коллекционер':[{'loc':'часть I','text':'Фредерик описывает похищение Миранды как заботу и создание удобных условий. Его спокойный язык скрывает насилие. Коллекционирование бабочек становится моделью отношения к человеку.'}],
  'Над пропастью во ржи':[{'loc':'глава 22','text':'Холден объясняет Фиби фантазию о ловце во ржи. Он хочет спасать детей от падения. Образ выражает страх взросления и желание защитить невинность.'}],
  'Хорошо ловится рыбка-бананка':[{'loc':'сцена на пляже','text':'Симор рассказывает Сибилле о рыбках, которые набивают рот бананами и не могут выбраться. Сказка скрывает тему ненасытности и невозможности вернуться к обычной жизни после войны.'}],
  'Колыбель для кошки':[{'loc':'главы о льде-девять','text':'Изобретение создаётся как удобный способ замораживать грязь. После попадания в океан оно превращает всю воду в кристалл. Катастрофа вырастает из технической задачи, оторванной от ответственности.'}],
  'Бильярд в половине десятого':[{'loc':'сцены воспоминаний Роберта Фемеля','text':'Бильярдная становится местом, где настоящее раскрывает прошлое семьи. Разрушение аббатства связывает личный поступок, войну и невозможность простого примирения.'}],
  'Кошки-мышки':[{'loc':'эпизоды на затонувшем корабле','text':'Мальке ныряет к кораблю и превращает физическую особенность в подвиг. Общество сначала высмеивает его, затем требует героической нормы. Рассказчик постоянно обращается к исчезнувшему Мальке, будто оправдывается.'}],
  'Парфюмер':[{'loc':'часть IV, сцена казни','text':'Гренуй использует совершенный аромат, и толпа видит в нём невинного ангела. Массовая эмоция полностью управляется запахом. Искусство превращается в технологию власти.'}],
  'Сто лет одиночества':[{'loc':'эпизод расстрела бастующих','text':'Хосе Аркадио Второй видит расстрел рабочих банановой компании. После возвращения власти утверждают, что ничего не произошло. Историческое насилие продолжается как уничтожение памяти.'},{'loc':'финал','text':'Аурелиано читает рукописи Мелькиадеса и понимает, что в них записана его жизнь. Чтение совпадает с гибелью Макондо. Время романа замыкается в тексте.'}],
  'Дом Астерия':[{'loc':'финальная фраза рассказа','text':'До финала читатель слышит голос одинокого хозяина бесконечного дома. Последняя реплика Тесея открывает, что рассказчиком был Минотавр. Поворот заставляет заново оценить чудовище как одинокое существо.'}]
};

const MANUAL_THESIS_EVIDENCE = {
  "4": [
    {
      "title": "Устройство загробного мира выражает идею нравственного воздаяния",
      "proof": "Ад Данте построен как строго организованная система кругов, в которой место и наказание грешника соответствуют характеру совершённого им греха. В III песне над вратами Ада написано, что входящие должны оставить надежду. Затем Данте видит людей, которые при жизни не выбрали ни добра, ни зла. Их бесконечный бег показывает наказание за нравственную пассивность."
    },
    {
      "title": "Число три и терцина выражают христианскую гармонию мироздания",
      "proof": "«Божественная комедия» состоит из трёх частей: «Ад», «Чистилище» и «Рай». Каждая часть включает тридцать три песни, а вместе со вступительной песнью их число достигает ста. Поэма написана терцинами — строфами из трёх строк. Повторение числа три связано с христианской идеей Троицы и подчёркивает упорядоченность созданного Богом мира."
    },
    {
      "title": "Данте-путник является не отвлечённым наблюдателем, а развивающейся личностью",
      "proof": "В начале поэмы герой оказывается в тёмном лесу, потому что утратил верный жизненный путь. Путешествие по загробному миру становится не только знакомством с судьбами умерших, но и процессом нравственного самопознания. Данте испытывает страх, сострадание, гнев и сомнение, постепенно учась соотносить личное чувство с высшим законом справедливости."
    },
    {
      "title": "Вергилий воплощает человеческий разум и античную мудрость",
      "proof": "Вергилий выводит Данте из тёмного леса и сопровождает его через Ад и Чистилище. Он объясняет устройство загробного мира, поддерживает героя и помогает ему правильно понимать увиденное. Однако Вергилий не может войти в Рай, поскольку одного человеческого разума недостаточно для достижения высшей истины: далее Данте должна вести Беатриче, воплощающая веру и божественную любовь."
    },
    {
      "title": "Эпизод Паоло и Франчески показывает конфликт сострадания и нравственного суда",
      "proof": "В V песне Франческа рассказывает, что любовь возникла во время совместного чтения истории Ланселота. Данте глубоко сочувствует влюблённым и падает без чувств после её рассказа. Однако композиция поэмы помещает Паоло и Франческу в круг сладострастных: человеческое сострадание не отменяет их нравственной ответственности за сделанный выбор."
    },
    {
      "title": "Поэма соединяет личную биографию Данте со всемирной историей",
      "proof": "Данте помещает в загробный мир своих современников, политических противников, исторических деятелей, античных героев и церковных служителей. Он оценивает их не по земному положению, а по нравственным поступкам. Личный опыт изгнания и политической борьбы превращается в универсальный суд над эпохой."
    },
    {
      "title": "Средневековая христианская картина мира сочетается с новым интересом к личности",
      "proof": "Общее устройство поэмы подчинено христианскому представлению о грехе, воздаянии и спасении. Но каждый персонаж сохраняет индивидуальную речь, биографию и характер. Данте интересуется не только категорией греха, но и неповторимой человеческой судьбой, что сближает поэму с будущей культурой Возрождения."
    }
  ],
  "5": [
    {
      "title": "Петрарка делает внутреннюю жизнь личности главным предметом лирики",
      "proof": "В «Канцоньере» центральным событием становится не внешний поступок, а движение чувства. Лирический герой анализирует любовь, память, надежду, вину и раскаяние. Это соответствует гуманистическому интересу Возрождения к индивидуальному сознанию."
    },
    {
      "title": "Образ Лауры соединяет земную конкретность и идеализацию",
      "proof": "Лаура изображается через взгляд, голос, жесты, светлые волосы и присутствие в природе. Одновременно она остаётся недоступной и постепенно превращается в нравственный и духовный идеал. Такая двойственность позволяет говорить и о земной любви, и о стремлении героя к внутреннему совершенствованию."
    },
    {
      "title": "Любовное переживание строится на внутреннем противоречии",
      "proof": "Герой стремится к Лауре и одновременно осуждает собственную привязанность. Он переживает любовь как счастье и страдание, свободу и плен, жизнь и смерть. Антитезы и оксюмороны передают не риторическую игру, а раздвоенность сознания."
    },
    {
      "title": "Сонетная форма организует развитие мысли",
      "proof": "Итальянский сонет состоит из двух катренов и двух терцетов. В катренах обычно формулируется ситуация или противоречие, а в терцетах происходит смысловой поворот, углубление или вывод. Благодаря этому чувство получает логическую композицию и становится актом самопознания."
    },
    {
      "title": "Точный поэтический приём раскрывает сложность чувства",
      "proof": "Для Петрарки характерно соединение противоположных состояний: герой одновременно «горит» и «леденеет», надеется и отчаивается, чувствует себя свободным и пленённым. Повторяющиеся контрасты создают устойчивую модель любовного сознания, которое не может прийти к внутреннему покою."
    },
    {
      "title": "Время и память превращают любовную лирику в историю личности",
      "proof": "Стихотворения делятся на написанные при жизни Лауры и после её смерти. После утраты любовь меняет форму: соединяется с памятью, размышлением о быстротечности жизни и духовным раскаянием. Цикл показывает развитие внутреннего опыта, а не одно неизменное состояние."
    },
    {
      "title": "Петраркизм закрепил европейскую модель любовной поэзии",
      "proof": "К признакам петраркизма относятся идеализированная возлюбленная, неразделённая любовь, культ внутреннего страдания, антитезы, оксюмороны, природная символика и строгая сонетная форма. Эта система получила развитие во французской, испанской и английской поэзии Возрождения."
    }
  ],
  "6": [
    {
      "title": "«Декамерон» выражает гуманистическое представление о человеке",
      "proof": "Герои Боккаччо действуют в земном, изменчивом мире и стремятся к любви, благополучию и свободе. Автор ценит ум, находчивость, жизненную энергию и способность принимать самостоятельные решения. Человек изображается не только как носитель греха, но и как деятельная личность."
    },
    {
      "title": "Рамочная композиция противопоставляет хаосу порядок культуры",
      "proof": "Десять молодых людей покидают охваченную чумой Флоренцию и в течение десяти дней рассказывают сто новелл. Чума разрушает общественные связи и нравственные нормы, а загородное сообщество создаёт собственный порядок: участники выбирают правителя дня, определяют темы и соблюдают правила общения. Рассказы становятся способом сохранить человечность перед лицом смерти."
    },
    {
      "title": "Система рассказчиков создаёт многоголосную картину мира",
      "proof": "Участники рамки отличаются характером, темпераментом и отношением к любви, морали и удаче. Благодаря этому сходные ситуации получают разные оценки. Автор не навязывает единственную позицию, а позволяет читателю сравнивать взгляды."
    },
    {
      "title": "Новелла строится вокруг одного события и резкого поворота",
      "proof": "Для новеллы характерны краткость, небольшое число персонажей, быстрое развитие действия и неожиданная развязка. Судьба героя часто меняется из-за случая, обмана, остроумной реплики или находчивого поступка. Композиция подчинена одному конфликту, который раскрывает характер человека."
    },
    {
      "title": "Фортуна и человеческий ум образуют главный конфликт книги",
      "proof": "Случай способен разрушить планы героя или поставить его в опасное положение. Однако человек не полностью зависит от обстоятельств. В новеллах ум, красноречие и быстрота реакции позволяют противостоять фортуне и менять собственную судьбу."
    },
    {
      "title": "Комизм разоблачает общественное лицемерие",
      "proof": "В новелле о Сер Чаппеллетто мошенник произносит ложную исповедь и после смерти становится почитаемым святым. История показывает разрыв между истинной сущностью человека и созданной обществом репутацией. Смех направлен не только против обманщика, но и против формальности религиозных институтов."
    },
    {
      "title": "Любовь раскрывается как естественная, но нравственно неоднозначная сила",
      "proof": "В «Декамероне» любовь может быть трагической, телесной, возвышенной или комической. Автор защищает естественное чувство от сословных и церковных запретов, но оценивает героев по их способности уважать свободу другого и сохранять достоинство."
    }
  ],
  "7": [
    {
      "title": "Роман Рабле выражает гуманистический идеал Возрождения",
      "proof": "Рабле утверждает ценность знания, физической силы, свободной мысли и полноты земной жизни. Он выступает против схоластики, аскетизма и слепого подчинения авторитету. Идеальный человек должен быть образованным, деятельным и способным самостоятельно мыслить."
    },
    {
      "title": "Гротескное тело разрушает средневековую систему запретов",
      "proof": "Гаргантюа и Пантагрюэль обладают огромным телом, аппетитом и жизненной энергией. Телесность связана с едой, рождением, ростом и обновлением. Она не унижает человека, а подчёркивает его природную силу. Высокое и низкое намеренно соединяются."
    },
    {
      "title": "Смех становится способом критики официального мира",
      "proof": "Рабле высмеивает церковных догматиков, педантов, судей, военных и самодовольных учёных. Смех лишает власть ореола неприкосновенности и позволяет увидеть нелепость социальных институтов. Комическое выполняет освобождающую и критическую функцию."
    },
    {
      "title": "Контраст старого и нового образования раскрывает педагогический идеал автора",
      "proof": "Первые наставники Гаргантюа заставляют его механически заучивать тексты, не развивая мысль. Понократ соединяет чтение, физические упражнения, наблюдение природы, беседы и практическую деятельность. Образование становится способом гармонического развития тела и разума."
    },
    {
      "title": "Телемское аббатство воплощает утопию свободной личности",
      "proof": "В Телеме отсутствуют обязательный распорядок, монастырские запреты и принуждение. Девиз «Делай что хочешь» предполагает, что воспитанный и благородный человек способен действовать нравственно без внешнего давления. Утопия выражает веру гуманистов во внутреннюю свободу."
    },
    {
      "title": "Сатира на войну разоблачает тщеславие власти",
      "proof": "Война с Пикрохолом начинается из-за мелкого конфликта, но правитель быстро воображает себя всемирным завоевателем. Его советники строят нелепые планы и не думают о человеческих жертвах. Рабле показывает, как жажда славы превращает ничтожный повод в катастрофу."
    },
    {
      "title": "Образ Панурга показывает противоречивость свободы",
      "proof": "Панург умён, изобретателен и красноречив, но часто использует способности для обмана и личной выгоды. Через него автор показывает, что освобождение разума само по себе не гарантирует нравственности. Свобода требует внутренней ответственности."
    }
  ],
  "8": [
    {
      "title": "«Дон Кихот» начинается как пародия на рыцарские романы",
      "proof": "Герой воспринимает действительность через литературные шаблоны: постоялый двор кажется ему замком, мельницы — великанами, а случайные люди — участниками рыцарских приключений. Комизм возникает из несовпадения воображаемого мира с реальностью."
    },
    {
      "title": "Образ Дон Кихота соединяет смешное и возвышенное",
      "proof": "Герой ошибается в оценке мира, но сохраняет верность справедливости, защите слабых и бескорыстному служению идеалу. Его действия часто приводят к нелепым последствиям, однако нравственно он оказывается выше прагматичных окружающих."
    },
    {
      "title": "Санчо Панса воплощает практическое, народное сознание",
      "proof": "Санчо думает о пище, выгоде, безопасности и обещанном острове. Его речь насыщена пословицами, а решения основаны на жизненном опыте. Во время мнимого губернаторства он неожиданно проявляет здравый смысл и способность справедливо судить людей."
    },
    {
      "title": "Главные герои взаимно изменяют друг друга",
      "proof": "Дон Кихот постепенно становится внимательнее к реальности, а Санчо начинает усваивать язык и ценности своего господина. Практичность и идеализм вступают в диалог. Благодаря этому герои развиваются в ходе сюжета."
    },
    {
      "title": "Роман исследует конфликт литературы и действительности",
      "proof": "Дон Кихот пытается подчинить жизнь правилам прочитанных книг, но реальность сопротивляется готовому сюжету. При этом воображение героя не только искажает мир, но и придаёт ему нравственный смысл. Поэтому проблема чтения становится одной из центральных."
    },
    {
      "title": "Многоголосие и игра с авторством создают новую форму повествования",
      "proof": "В текст включены вставные истории, рассказы разных персонажей, литературные споры и противоречащие друг другу версии событий. Сервантес представляет роман как перевод рукописи Сида Ахмета Бененхели. Читатель вынужден оценивать достоверность рассказа и замечать условность авторской власти."
    },
    {
      "title": "Точные эпизоды раскрывают двойственность героя",
      "proof": "Сражение с ветряными мельницами показывает неспособность Дон Кихота отличить литературный образ от действительности, но одновременно его готовность действовать ради убеждений. Освобождение каторжников раскрывает тот же конфликт: стремясь восстановить справедливость, герой не понимает реальных последствий своего поступка."
    },
    {
      "title": "Финал превращает комическое повествование в трагическое",
      "proof": "Перед смертью Дон Кихот отказывается от рыцарских книг и возвращается к имени Алонсо Кихано. Формально он выздоравливает, но вместе с безумием исчезают его энергия и вера в идеал. Мир становится разумнее, но духовно беднее."
    },
    {
      "title": "Роман подготовил основные свойства жанра Нового времени",
      "proof": "В произведении соединяются приключенческий сюжет, психологическое развитие, социальная панорама, многоголосие и авторская рефлексия. Герой раскрывается через столкновение с реальностью и меняется в ходе повествования. Роман не только рассказывает историю, но и размышляет о способах её создания."
    }
  ],
  "9": [
    {
      "title": "Комедии Шекспира выражают гуманистическую веру в человека и полноту жизни",
      "proof": "В центре шекспировской комедии находится деятельная личность, стремящаяся к любви, свободе и счастью. Герои сопротивляются сословным условностям, семейным запретам, ревности и ложным представлениям друг о друге. Комический мир допускает ошибки и заблуждения, но сохраняет возможность их преодоления."
    },
    {
      "title": "Основой композиции становится нарушение привычного порядка",
      "proof": "Действие обычно начинается с конфликта: разлуки, запрета на брак, путаницы, изгнания, ревности или ложного узнавания. Этот первоначальный разлад запускает цепь событий. Финал восстанавливает связи между людьми, но возвращение к порядку происходит уже после испытания героев."
    },
    {
      "title": "Путаница и ошибочное узнавание создают комическое действие",
      "proof": "В «Комедии ошибок» две пары близнецов становятся причиной непрерывной череды недоразумений. Один герой получает деньги, предназначенные другому, другого не пускают в собственный дом, а окружающие принимают естественное удивление персонажей за безумие. Зритель знает причину путаницы, поэтому комизм строится на превосходстве его знания над знанием героев."
    },
    {
      "title": "Переодевание позволяет исследовать условность социальных и гендерных ролей",
      "proof": "В комедиях Шекспира героиня, переодетая мужчиной, получает свободу действий, недоступную ей в обычном положении. Переодевание создаёт любовные недоразумения, но одновременно показывает, насколько поведение человека зависит от внешнего облика и общественного ожидания."
    },
    {
      "title": "Женские образы часто оказываются активнее и разумнее мужских",
      "proof": "Шекспировские героини способны самостоятельно выбирать возлюбленного, строить план, распознавать ложь и восстанавливать справедливость. Они не только становятся предметом любви, но и направляют действие. Через такие образы комедия утверждает право личности на самостоятельный выбор."
    },
    {
      "title": "Комизм соединяет разные уровни: словесный, ситуационный и характерологический",
      "proof": "Смешное возникает из каламбуров, несовпадения значений, повторов, ложных выводов и столкновения характеров. В «Комедии ошибок» быстрый темп усиливается тем, что каждое объяснение рождает новое недоразумение. Комизм не прерывает действие, а становится его движущей силой."
    },
    {
      "title": "Финал утверждает возможность гармонии",
      "proof": "В финале «Комедии ошибок» раскрывается тайна происхождения близнецов, семья воссоединяется, а ложные обвинения снимаются. Узнавание не просто прекращает путаницу, а восстанавливает родственные связи, разрушенные много лет назад. Комедия завершается праздником возвращённой целостности."
    }
  ],
  "10": [
    {
      "title": "Трагедии Шекспира отражают кризис гуманистического идеала",
      "proof": "Герои верят в разум, достоинство и свободу личности, но сталкиваются с миром насилия, политического расчёта и нравственного распада. Их трагедия возникает не только из личной ошибки, но и из несовместимости высокого представления о человеке с устройством окружающего общества."
    },
    {
      "title": "Время в трагедиях воспринимается как нарушенное и исторически кризисное",
      "proof": "В «Гамлете» герой говорит, что время «вышло из суставов». Дания изображается как государство, где преступление скрывается под внешним порядком, а законная власть основана на убийстве. Личное дело мести поэтому превращается в столкновение с болезнью целой эпохи."
    },
    {
      "title": "Гамлет — герой рефлексии и нравственного выбора",
      "proof": "Гамлет не отказывается действовать, но стремится убедиться в истине и понять моральный смысл поступка. Он не хочет стать обычным убийцей, даже если месть кажется справедливой. Его медлительность связана с ответственностью сознания, которое не принимает простого решения."
    },
    {
      "title": "Призрак запускает действие, но не даёт окончательной истины",
      "proof": "Призрак сообщает Гамлету об убийстве отца и требует мести. Однако герой не уверен, можно ли доверять сверхъестественному свидетельству. Поэтому он ищет дополнительное подтверждение и устраивает спектакль. Призрак становится источником действия, но одновременно углубляет сомнение."
    },
    {
      "title": "Театр в трагедии выступает способом познания",
      "proof": "В сцене «Мышеловки» актёры разыгрывают убийство, напоминающее преступление Клавдия. Реакция короля подтверждает его вину. Театр оказывается не уходом от действительности, а инструментом раскрытия скрытой правды."
    },
    {
      "title": "Система образов показывает разные способы приспособления к злу",
      "proof": "Клавдий соединяет политическую эффективность и нравственное преступление. Полоний живёт формулами придворного поведения. Розенкранц и Гильденстерн принимают роль исполнителей чужой воли. Лаэрт действует быстро, но становится орудием интриги. На их фоне Гамлет представляет сознание, которое отказывается жить по готовым правилам."
    },
    {
      "title": "Образ Офелии раскрывает разрушительное действие придворного мира",
      "proof": "Офелия подчиняется отцу и королю, оказывается втянутой в слежку за Гамлетом и лишается возможности действовать самостоятельно. После смерти Полония её речь распадается на песни и обрывки. Безумие Офелии показывает, как политическая ложь разрушает личность, не способную защитить внутреннюю свободу."
    },
    {
      "title": "Финал трагедии соединяет возмездие и катастрофу",
      "proof": "Гамлет убивает Клавдия, но восстановление справедливости происходит ценой гибели почти всех главных героев. Месть не возвращает прежний порядок. Власть переходит к Фортинбрасу, и трагедия завершается не гармонией, а сменой исторической силы."
    }
  ],
  "11": [
    {
      "title": "Следует различать литературное направление, течение и стиль",
      "proof": "Литературное направление объединяет писателей общими представлениями о мире, человеке и задачах искусства. Течение является более узкой разновидностью внутри направления и выражает особую эстетическую позицию группы авторов. Стиль — это система конкретных художественных приёмов, проявляющаяся в языке, композиции, образах и жанровых предпочтениях."
    },
    {
      "title": "Литература XVII века формируется в условиях кризиса ренессансной гармонии",
      "proof": "Религиозные войны, укрепление абсолютных монархий, научные открытия и политические конфликты разрушили уверенность в естественной гармонии человека и мира. Литература обращается к противоречию между свободой и долгом, телом и духом, хаосом и порядком."
    },
    {
      "title": "Барокко выражает ощущение изменчивого и противоречивого мира",
      "proof": "Для барокко характерны контрасты, метафорическая сложность, ощущение театральности жизни, мотивы сна, смерти и непостоянства. Мир воспринимается как загадка, где внешность обманчива, а человек не способен обрести устойчивую опору."
    },
    {
      "title": "Классицизм стремится противопоставить хаосу разумный порядок",
      "proof": "Классицизм ориентируется на античные образцы, иерархию жанров и ясность формы. В драме важны единство действия, высокая нравственная проблема и конфликт между личным чувством и общественным долгом. Литература должна не только изображать жизнь, но и воспитывать гражданина."
    },
    {
      "title": "Барокко и классицизм не исключают друг друга полностью",
      "proof": "В творчестве одного автора могут сочетаться барочная напряжённость и классицистическая организация формы. Например, в «Потерянном рае» Мильтона масштабные контрасты, космические образы и драматизм барокко соединяются с эпической стройностью и высокой нравственной проблематикой."
    },
    {
      "title": "Национальные варианты XVII века различаются",
      "proof": "Во Франции ведущим становится классицизм, связанный с централизованным государством и придворной культурой. В Испании сильнее развивается барокко с его религиозностью и мотивом иллюзорности мира. В Англии литература соединяет барокко, пуританскую традицию, политическую публицистику и эпическую поэзию."
    },
    {
      "title": "Понятие стиля позволяет увидеть индивидуальность автора внутри направления",
      "proof": "Корнель и Мольер связаны с классицизмом, но их художественные системы различны. Корнель строит высокий конфликт чести и долга, а Мольер соединяет типический характер, живую сценическую речь и социальную сатиру. Общее направление не отменяет авторской неповторимости."
    }
  ],
  "12": [
    {
      "title": "Барокко возникает как искусство кризисной эпохи",
      "proof": "Религиозные конфликты, войны, политическая нестабильность и новые научные представления разрушили прежнюю картину мира. Человек ощущает себя между земным и вечным, свободой и предопределением, величием и ничтожностью. Барокко делает это противоречие основой художественного мышления."
    },
    {
      "title": "Главный принцип барокко — соединение противоположностей",
      "proof": "В барочном произведении высокое соседствует с низким, духовное — с телесным, прекрасное — с ужасным, реальность — с иллюзией. Контраст не устраняется, а подчёркивается. Мир изображается как пространство постоянного превращения."
    },
    {
      "title": "Метафора и эмблема становятся важнейшими средствами барочной поэтики",
      "proof": "Барочный автор стремится не назвать предмет прямо, а раскрыть его через сложное уподобление. Метафора соединяет далёкие явления, а эмблема превращает образ в загадку, требующую толкования. Читатель должен не просто воспринимать текст, а разгадывать скрытый смысл."
    },
    {
      "title": "Мотивы сна, театра и маски выражают недоверие к видимой реальности",
      "proof": "В пьесе Кальдерона «Жизнь есть сон» Сехисмундо не может сразу понять, где действительность, а где иллюзия. Сюжет показывает, что внешнее положение человека изменчиво, а нравственная свобода определяется его внутренним выбором."
    },
    {
      "title": "Испанское барокко отличается религиозно-философской напряжённостью",
      "proof": "В Испании ведущими фигурами становятся Педро Кальдерон и Луис де Гонгора. Кальдерон исследует свободу, предопределение и иллюзорность земного существования. Гонгора создаёт сложный поэтический язык, насыщенный метафорами, мифологическими аллюзиями и необычным синтаксисом."
    },
    {
      "title": "Французское барокко развивается рядом с классицизмом",
      "proof": "Во Франции барочные черты проявляются в прециозной литературе, пасторальном романе, религиозной поэзии и драме первой половины века. Для них характерны изысканность, контраст и усложнённая образность. Позднее классицизм становится ведущей системой, но полностью барочное наследие не исчезает."
    },
    {
      "title": "Немецкое барокко связано с опытом Тридцатилетней войны",
      "proof": "Разорение страны усилило мотивы бренности, смерти и разрушения. В поэзии Андреаса Грифиуса земная слава и богатство изображаются как временные и ненадёжные. Одновременно религиозная вера становится попыткой найти опору в мире исторической катастрофы."
    },
    {
      "title": "Барокко оказало длительное влияние на европейскую культуру",
      "proof": "Барочная поэтика подготовила интерес к сложной метафоре, двойственному миру, театральности и ненадёжной реальности. Эти черты позднее будут востребованы романтизмом, модернизмом и постмодернизмом."
    }
  ],
  "13": [
    {
      "title": "«Сид» занимает переходное положение между барочной драмой и классицизмом",
      "proof": "Пьеса сохраняет напряжённость, резкие повороты и эмоциональные контрасты барокко, но стремится к ясной композиции, высокому конфликту и нравственной проблематике классицизма. Именно это сочетание объясняет жанровое определение трагикомедии."
    },
    {
      "title": "Основной конфликт строится между любовью и долгом",
      "proof": "Родриго любит Химену, но обязан отомстить её отцу за оскорбление собственного отца. Химена продолжает любить Родриго, однако требует наказания за убийство. Оба героя оказываются в ситуации, где личное чувство не может быть свободно от требований чести."
    },
    {
      "title": "Категория чести организует поступки персонажей",
      "proof": "Дон Диего воспринимает пощёчину как уничтожение достоинства рода. Родриго понимает, что отказ от мести сделает его недостойным любви Химены. Честь поэтому выступает не внешней условностью, а внутренним законом, определяющим личность."
    },
    {
      "title": "Герои сохраняют свободу внутри жёсткой системы долга",
      "proof": "Родриго не действует автоматически: он переживает мучительный выбор между любовью и обязанностью перед отцом. Химена также не отказывается от чувства, но не может пренебречь памятью об отце. Их величие состоит в осознанном принятии тяжёлого решения."
    },
    {
      "title": "Воинский подвиг меняет общественное положение Родриго",
      "proof": "После победы над маврами Родриго получает имя Сид и становится спасителем государства. Частный конфликт включается в национальную историю. Герой, обвиняемый в убийстве, одновременно оказывается необходимым стране."
    },
    {
      "title": "Жанр трагикомедии позволяет избежать окончательной катастрофы",
      "proof": "В трагедии конфликт обычно приводит к гибели героя, но в «Сиде» сохраняется возможность будущего брака. Король откладывает решение, предоставляя времени примирить долг и чувство. Финал не устраняет противоречие полностью, но открывает путь к его разрешению."
    },
    {
      "title": "Пьеса вызвала спор о нормах классицистической драмы",
      "proof": "Современники критиковали Корнеля за неправдоподобие событий, перегруженность действия и нарушение строгого понимания единств. Спор вокруг «Сида» показал, как живая драматическая сила вступила в конфликт с формирующейся системой нормативной поэтики."
    }
  ],
  "14": [
    {
      "title": "Комедии Мольера соединяют универсальную нравственную проблематику с конкретной французской действительностью XVII века",
      "proof": "Мольер обращается к общечеловеческим порокам: лицемерию, жадности, тщеславию, самодовольству и стремлению подчинять других. Однако эти качества раскрываются внутри французского общества эпохи Людовика XIV — в семье, салоне, церковной среде, системе брака и сословных отношений. Благодаря этому персонаж одновременно представляет определённую эпоху и узнаваемый человеческий тип."
    },
    {
      "title": "Общечеловеческая ценность разума противопоставляется власти страсти и предрассудка",
      "proof": "Герои Мольера часто подчиняют всю жизнь одной преувеличенной идее. Гарпагон видит в людях прежде всего угрозу своему богатству, Арган превращает заботу о здоровье в манию, Оргон отказывается замечать очевидное ради слепой веры в Тартюфа. Комизм показывает утрату меры, а разумные персонажи возвращают происходящему нормальный масштаб."
    },
    {
      "title": "Национальная специфика проявляется в изображении французского быта и социальных институтов",
      "proof": "Мольер показывает устройство буржуазной и дворянской семьи, зависимость брака от воли отца, моду на светскую образованность, влияние духовенства и стремление разбогатевшей буржуазии подражать аристократии. В «Мещанине во дворянстве» господин Журден становится смешон потому, что пытается купить социальную идентичность, не понимая её культурного содержания."
    },
    {
      "title": "Индивидуальный характер создаётся через господствующую страсть, но не исчерпывается ею",
      "proof": "Персонажи Мольера близки к классицистическому типу: в каждом выделена одна ведущая черта. Однако сценическая речь, бытовые реакции, отношения с близкими и конкретные поступки делают их живыми. Гарпагон не просто отвлечённый скупец: его страсть к деньгам разрушает отношения с детьми и превращает семейную жизнь в систему подозрений."
    },
    {
      "title": "«Тартюф» раскрывает конфликт истинной нравственности и религиозного лицемерия",
      "proof": "Тартюф использует язык благочестия как средство власти и обогащения. Оргон принимает внешнюю набожность за доказательство добродетели и перестаёт доверять собственной семье. Мольер критикует не веру, а подмену нравственности ритуалом и демонстративной праведностью."
    },
    {
      "title": "Семья становится пространством проверки личной свободы и ответственности",
      "proof": "В комедиях молодые герои защищают право самостоятельно выбирать любовь и будущую жизнь. Старшее поколение нередко пытается распорядиться их судьбой ради денег, положения или собственных убеждений. Конфликт поколений получает общечеловеческий смысл: личность должна быть освобождена от произвола, но её свобода не должна разрушать разумный общественный порядок."
    },
    {
      "title": "Смех у Мольера выполняет нравственную и общественную функцию",
      "proof": "Комизм рождается из повторов, несоответствия слов и поступков, речевых автоматизмов и ситуаций разоблачения. Зритель смеётся не только над отдельным героем, но и над моделью поведения, которая нарушает человеческую меру. Смех становится способом общественного самопознания."
    }
  ],
  "15": [
    {
      "title": "«Потерянный рай» соединяет библейский сюжет с формой героического эпоса",
      "proof": "Основой поэмы становится история падения Сатаны и грехопадения Адама и Евы. Мильтон придаёт библейскому материалу масштаб эпоса: вводит космическое пространство, великие сражения, торжественные речи и судьбу всего человечества. При этом главным событием оказывается не военная победа, а нравственный выбор."
    },
    {
      "title": "Центральная идея поэмы — свобода и ответственность человека",
      "proof": "Адам и Ева созданы свободными, поэтому их послушание имеет ценность только как сознательный выбор. Бог не лишает человека возможности нарушить запрет, но предупреждает о последствиях. Грехопадение объясняется не внешним принуждением, а неправильным использованием свободы."
    },
    {
      "title": "Образ Сатаны отличается масштабом и внутренней противоречивостью",
      "proof": "Сатана сохраняет волю, красноречие и способность сопротивляться поражению. Его решимость придаёт ему черты трагического героя. Однако стремление к свободе постепенно превращается в жажду власти и разрушения. Чем сильнее он утверждает независимость, тем больше становится рабом гордости и ненависти."
    },
    {
      "title": "Ад изображается не только как пространство, но и как состояние сознания",
      "proof": "Сатана переносит Ад внутри себя. Даже покинув место наказания, он не освобождается от зависти, гнева и гордости. Тем самым Мильтон показывает, что духовное падение определяется внутренним выбором, а не только внешней карой."
    },
    {
      "title": "Образы Адама и Евы раскрывают разные стороны человеческой природы",
      "proof": "Ева стремится к самостоятельности и знанию, но оказывается уязвимой для лести. Адам понимает последствия её поступка, однако разделяет вину из любви и страха потерять её. Их грехопадение связано не только с нарушением запрета, но и с искажением любви, свободы и разумного порядка."
    },
    {
      "title": "Семейная история становится моделью всемирной драмы",
      "proof": "Конфликт разворачивается между двумя людьми, но его последствия распространяются на всё человечество. Потеря Рая означает появление смерти, труда, страдания и истории. Частное решение героев получает космический масштаб."
    },
    {
      "title": "Поэма сочетает барочную образность и строгую идейную композицию",
      "proof": "Мильтон использует грандиозные контрасты света и тьмы, Неба и Ада, свободы и подчинения. Развёрнутые сравнения, торжественный синтаксис и масштабные картины создают барочную величественность. Одновременно композиция подчинена последовательному раскрытию причин и последствий нравственного выбора."
    },
    {
      "title": "Финал утверждает возможность духовного восстановления",
      "proof": "Адам и Ева покидают Рай, но не остаются без надежды. Они получают знание о будущем искуплении и начинают человеческую историю. Потеря первоначальной гармонии становится началом пути, на котором свобода должна соединиться с ответственностью."
    }
  ],
  "16": [
    {
      "title": "«Путь паломника» построен как религиозная аллегория человеческой жизни",
      "proof": "Главный герой по имени Христианин покидает Город Гибели и отправляется к Небесному Граду. Его путь изображает духовное движение человека от сознания греха к спасению. Пространства, персонажи и препятствия получают символическое значение."
    },
    {
      "title": "Отправной точкой пути становится осознание внутреннего кризиса",
      "proof": "Христианин читает книгу и понимает, что город обречён, а на его спине лежит тяжёлое бремя. Этот груз символизирует грех и чувство нравственной ответственности. Пока герой не осознаёт своё положение, движение к спасению невозможно."
    },
    {
      "title": "Путь героя состоит из испытаний, которые раскрывают слабость человеческой воли",
      "proof": "Христианин попадает в Трясину Уныния, сталкивается со страхом, сомнением и ложными советчиками. Он неоднократно оказывается на грани отказа от пути. Спасение поэтому не изображается как прямое восхождение: вера требует постоянного выбора и преодоления внутренней слабости."
    },
    {
      "title": "Встречные персонажи представляют нравственные состояния и жизненные стратегии",
      "proof": "Упрямец отказывается покидать привычный мир, Сговорчивый быстро загорается идеей пути, но отступает при первой трудности, Мирской Мудрец предлагает удобный обходной способ избавиться от бремени. Их говорящие имена превращают абстрактные качества в участников действия."
    },
    {
      "title": "Освобождение от бремени связано не с усилием героя, а с духовным обращением",
      "proof": "Христианин теряет груз у Креста. До этого он пытался избавиться от него самостоятельно, но не мог. Эпизод подчёркивает протестантскую идею спасения через веру и благодать, а не только через внешние дела."
    },
    {
      "title": "Ярмарка Тщеславия показывает конфликт духовного пути и общества",
      "proof": "На ярмарке продаются власть, богатство, удовольствия и репутация. Христианин и Верный отказываются участвовать в торговле и становятся объектами преследования. Мир воспринимает отказ от его ценностей как угрозу, поэтому духовный выбор приводит героя к одиночеству и страданию."
    },
    {
      "title": "Трагизм поэмы связан с постоянной возможностью падения",
      "proof": "Даже человек, вступивший на путь спасения, не защищён от отчаяния, страха и самообмана. Замок Сомнения и великан Отчаяние показывают, что духовная гибель может возникнуть внутри сознания. Герой спасается, вспомнив о ключе Обетования, который всё время находился при нём."
    },
    {
      "title": "Конечный смысл пути раскрывается через верность, а не через отсутствие страданий",
      "proof": "Христианин достигает Небесного Града после множества испытаний и перехода через реку смерти. Его победа состоит не в земном успехе, а в сохранении направления пути. Смысл жизни определяется верностью высшей цели."
    }
  ],
  "17": [
    {
      "title": "Дидро рассматривает литературу как средство познания и общественного преобразования",
      "proof": "Как просветитель, он связывает развитие человека с разумом, образованием и свободой исследования. Литература должна разоблачать предрассудки, показывать зависимость личности от среды и побуждать читателя к самостоятельному суждению."
    },
    {
      "title": "Работа над «Энциклопедией» выражает просветительскую программу писателя",
      "proof": "Дидро был одним из главных редакторов «Энциклопедии наук, искусств и ремёсел». Издание объединяло знания и распространяло критическое отношение к авторитетам. Для него систематизация наук была не только справочным проектом, но и формой борьбы с невежеством и социальной несвободой."
    },
    {
      "title": "Дидро отвергает представление о неизменной человеческой природе",
      "proof": "Он показывает, что характер формируется воспитанием, социальным положением и обстоятельствами. Поэтому нравственная оценка человека должна учитывать среду. Эта идея сближает его философию с будущим реализмом и материалистическим пониманием личности."
    },
    {
      "title": "Диалог становится основной формой философского поиска",
      "proof": "В «Племяннике Рамо» сталкиваются позиции повествователя и циничного героя. Ни один голос не получает полного превосходства. Диалог позволяет обнаружить противоречия в общественной морали и показать, что истина рождается через спор, а не через готовое наставление."
    },
    {
      "title": "Образ племянника Рамо раскрывает связь порока и общественного устройства",
      "proof": "Герой откровенно признаёт зависимость от богатых покровителей, готовность льстить и превращать талант в средство выживания. Его цинизм отвратителен, но логичен внутри общества, где успех зависит от денег и связей. Персонаж становится одновременно объектом сатиры и доказательством испорченности среды."
    },
    {
      "title": "Дидро стремится реформировать драму",
      "proof": "Он предлагает жанр «серьёзной комедии» и мещанской драмы, где в центре находится частная жизнь обычного человека. Театр должен изображать семейные и нравственные конфликты, понятные широкому зрителю. Значение получает не исключительный герой, а повседневная ситуация выбора."
    },
    {
      "title": "Художественная форма Дидро соединяет философию, иронию и эксперимент",
      "proof": "В «Жаке-фаталисте» повествователь вмешивается в рассказ, спорит с читателем, прерывает сюжет и предлагает разные варианты продолжения. Такая форма ставит под сомнение линейную причинность и проверяет философские идеи непосредственно устройством текста."
    },
    {
      "title": "Центральное противоречие творчества Дидро связано со свободой и детерминизмом",
      "proof": "Писатель признаёт зависимость человека от природы и среды, но одновременно защищает нравственную ответственность и возможность воспитания. Его произведения не дают простого решения: они показывают человека как обусловленного обстоятельствами, но способного осмыслять их и сопротивляться им."
    }
  ],
  "18": [
    {
      "title": "Философская повесть соединяет занимательный сюжет и проверку идеи",
      "proof": "Вольтер строит произведение как цепь быстрых приключений, путешествий и неожиданных поворотов. Однако каждое событие служит мысленному эксперименту: философская теория сталкивается с реальной жизнью и обнаруживает свою ограниченность."
    },
    {
      "title": "Главным художественным принципом становится ирония",
      "proof": "Рассказчик часто говорит спокойным или одобрительным тоном о жестоких и нелепых событиях. Несоответствие интонации и содержания заставляет читателя самостоятельно увидеть абсурд. Авторская оценка выражается не прямым комментарием, а устройством повествования."
    },
    {
      "title": "«Кандид» опровергает отвлечённый оптимизм",
      "proof": "Панглосс повторяет, что всё происходит к лучшему в наилучшем из миров. Между тем герои сталкиваются с войной, землетрясением, насилием, рабством и религиозными преследованиями. Повторение формулы на фоне катастроф превращает философскую систему в объект сатиры."
    },
    {
      "title": "Быстрый темп препятствует сентиментальному погружению в страдание",
      "proof": "Катастрофы следуют одна за другой, персонажи исчезают и неожиданно возвращаются, география постоянно меняется. Такая динамика не позволяет воспринимать отдельное несчастье как исключение. Мир предстает системой повторяющегося насилия и безумия."
    },
    {
      "title": "Условное пространство позволяет создать модель разных обществ",
      "proof": "Путешествие Кандида проходит через Европу, Америку и фантастическое Эльдорадо. Каждая страна становится примером определённого общественного устройства. География не стремится к документальной точности: она нужна для сравнения религий, политических систем и нравов."
    },
    {
      "title": "Эльдорадо выполняет функцию утопического контраста",
      "proof": "В Эльдорадо отсутствуют религиозные преследования, суды и борьба за золото. То, что в Европе считается высшей ценностью, здесь лежит под ногами. Однако Кандид покидает идеальное общество ради личного желания и богатства, что показывает устойчивость человеческих иллюзий."
    },
    {
      "title": "Персонажи часто строятся как носители определённой идеи",
      "proof": "Панглосс представляет догматический оптимизм, Мартен — последовательный пессимизм, Кандид — неопытное сознание, которое проходит проверку опытом. Однако движение героя показывает, что жизнь не сводится ни к одной готовой философской формуле."
    },
    {
      "title": "Финальная формула предлагает практическую, а не отвлечённую мудрость",
      "proof": "Слова о необходимости «возделывать свой сад» означают отказ от бесплодных споров и обращение к труду, ответственности и ограниченному человеческому делу. Это не бегство от мира, а признание того, что смысл создаётся конкретным действием."
    }
  ],
  "19": [
    {
      "title": "Роман Свифта использует форму путешествия как средство сатирического исследования общества",
      "proof": "Гулливер последовательно попадает в несколько фантастических стран, каждая из которых превращается в модель определённого общественного устройства. Изменение пространства позволяет автору посмотреть на привычные институты со стороны. Путешествие поэтому служит не поиску экзотики, а проверке политики, науки, морали и представлений человека о самом себе."
    },
    {
      "title": "Приём изменения масштаба разрушает человеческое самодовольство",
      "proof": "В Лилипутии Гулливер оказывается великаном, а в стране великанов — ничтожно малым существом. Один и тот же человек воспринимается то как могущественная сила, то как беспомощное тело. Смена масштаба показывает относительность представлений о величии и заставляет усомниться в естественности социальной иерархии."
    },
    {
      "title": "Лилипутия сатирически изображает политическую борьбу и придворную систему",
      "proof": "Государственные должности получают те, кто лучше прыгает на канате перед правителем. Политические партии различаются высотой каблуков, а война с Блефуску начинается из-за спора о том, с какого конца разбивать яйцо. Незначительные различия превращаются в основание для карьеры, преследований и войн, что разоблачает абсурд политической жизни."
    },
    {
      "title": "Страна великанов предлагает внешнюю нравственную оценку европейской цивилизации",
      "proof": "Когда Гулливер рассказывает королю Бробдингнега об английской политике, войнах и оружии, он ожидает восхищения. Король же воспринимает европейцев как жестоких и мелочных существ. Особенно показателен отказ от секрета пороха: то, что Гулливер считает достижением, правитель оценивает как средство массового убийства."
    },
    {
      "title": "Лапута и Академия прожектёров критикуют науку, утратившую связь с жизнью",
      "proof": "Учёные заняты извлечением солнечного света из огурцов, превращением экскрементов в пищу и другими бесполезными опытами. Свифт высмеивает не знание как таковое, а исследование, которое не учитывает практический смысл и человеческую потребность. Разум без здравого смысла становится новой формой безумия."
    },
    {
      "title": "Гуигнгнмы и еху образуют предельно жёсткую модель человеческой природы",
      "proof": "Разумные лошади гуигнгнмы живут в мире порядка, а человекоподобные еху воплощают алчность, агрессию и телесную грубость. Гулливер постепенно начинает считать людей разновидностью еху. Этот вывод показывает силу сатирического прозрения, но одновременно раскрывает опасность полного разочарования в человечестве."
    },
    {
      "title": "Образ Гулливера усложняет авторскую позицию",
      "proof": "В начале герой выглядит здравомыслящим наблюдателем, но постепенно теряет способность к критической дистанции. После возвращения он не переносит человеческого общества и предпочитает общение с лошадьми. Поэтому его суждения нельзя полностью отождествлять с мнением Свифта: автор показывает, как ненависть к человеческим порокам может превратиться в отрицание самого человека."
    },
    {
      "title": "Художественное прозрение романа состоит в раскрытии относительности цивилизации",
      "proof": "Свифт показывает, что разум, политика, наука и культура не гарантируют нравственного прогресса. Высокие идеи легко становятся прикрытием для насилия, честолюбия и корысти. Фантастический мир позволяет увидеть эти противоречия яснее, чем прямое реалистическое описание."
    }
  ],
  "20": [
    {
      "title": "Стерн разрушает представление о романе как о последовательном рассказе событий",
      "proof": "В «Жизни и мнениях Тристрама Шенди» герой долго не может перейти к собственному рождению, поскольку повествование постоянно отклоняется в сторону. Рассказ о жизни превращается в рассказ о невозможности рассказать жизнь линейно. Отступление становится не нарушением формы, а её основным принципом."
    },
    {
      "title": "Время повествования отделяется от времени события",
      "proof": "Незначительный эпизод может занимать десятки страниц, тогда как большие промежутки жизни остаются за пределами текста. Автор показывает, что сознание движется не по календарю, а по ассоциациям, воспоминаниям и случайным связям. Это предвосхищает модернистский интерес к субъективному времени."
    },
    {
      "title": "Рассказчик открыто взаимодействует с читателем",
      "proof": "Тристрам обращается к читателю, спорит с ним, предупреждает о будущих отступлениях и признаётся в затруднениях. Роман перестаёт скрывать процесс собственного создания. Читатель становится участником игры и вынужден замечать условность любого повествования."
    },
    {
      "title": "Графическое оформление превращается в часть художественного смысла",
      "proof": "Стерн использует чёрную страницу в знак траура, пустую страницу для воображаемого портрета, необычные линии и разрывы текста. Книга показывает, что смысл создаётся не только словами, но и внешней организацией страницы. Такой эксперимент расширяет возможности романной формы."
    },
    {
      "title": "Характеры раскрываются через навязчивые идеи и речевые привычки",
      "proof": "Уолтер Шенди стремится объяснять жизнь с помощью систем и теорий, дядя Тоби постоянно возвращается к военным укреплениям, другие персонажи также живут внутри своих «коньков». Комизм возникает из несовпадения личной логики героя с реальностью, но автор относится к персонажам с сочувствием."
    },
    {
      "title": "Стерн соединяет иронию и сентиментальность",
      "proof": "Роман высмеивает учёность, риторику и претензии на рациональный порядок, но одновременно ценит мягкость, сострадание и душевную деликатность. Образ дяди Тоби особенно важен: его простодушие и доброта противопоставлены холодной рассудочности."
    },
    {
      "title": "Новаторство Стерна повлияло на дальнейшее развитие европейской прозы",
      "proof": "Его свободная композиция, авторские вмешательства, игра с читателем и фрагментарность получили продолжение в романтизме, модернизме и постмодернизме. Стерн показал, что роман может рассказывать не только о событиях, но и о самом процессе повествования."
    }
  ],
  "21": [
    {
      "title": "Творческий путь Гёте соединяет несколько этапов немецкой и европейской культуры",
      "proof": "Гёте начинал в эпоху «Бури и натиска», затем участвовал в формировании веймарского классицизма и продолжал работать в период романтизма. Его творчество не принадлежит одной школе: оно отражает развитие немецкой литературы от эмоционального бунта к поиску гармонии и универсального культурного синтеза."
    },
    {
      "title": "Ранний Гёте утверждает право личности на сильное и непосредственное чувство",
      "proof": "В романе «Страдания юного Вертера» герой переживает конфликт между внутренней свободой и общественными нормами. Его чувство изображено как подлинное, но неспособность установить границу между эмоцией и реальностью приводит к гибели. Роман выразил кризис молодого поколения и стал важнейшим произведением «Бури и натиска»."
    },
    {
      "title": "Веймарский классицизм связан с идеей гармонического развития личности",
      "proof": "Совместно с Шиллером Гёте стремился соединить свободу и форму, чувство и разум, индивидуальность и общественный долг. Античная культура воспринималась не как набор правил, а как образец внутренней цельности. Литература должна была воспитывать человека через красоту и самоограничение."
    },
    {
      "title": "«Фауст» становится центральным произведением о европейском человеке",
      "proof": "Фауст стремится выйти за границы книжного знания и пережить полноту бытия. Его договор с Мефистофелем строится не на простом желании удовольствия, а на готовности признать себя побеждённым, если он удовлетворится достигнутым. Герой воплощает беспокойство, деятельность и бесконечность человеческого стремления."
    },
    {
      "title": "Образ Мефистофеля выражает силу отрицания",
      "proof": "Мефистофель разоблачает иллюзии, высмеивает возвышенные слова и показывает слабости человека. Однако его отрицание не способно самостоятельно создать смысл. Парадоксально, разрушительная сила становится частью движения Фауста и помогает герою проходить новые испытания."
    },
    {
      "title": "История Маргариты раскрывает нравственную цену стремления Фауста",
      "proof": "Любовь Фауста приводит к гибели матери и брата Маргариты, смерти ребёнка и заключению героини. Частная трагедия показывает, что поиск личной полноты не освобождает от ответственности за другого человека. Спасение Маргариты противопоставлено нравственной неустойчивости Фауста."
    },
    {
      "title": "Позднее творчество Гёте утверждает идею мировой литературы",
      "proof": "Гёте интересовался античной, восточной и современной европейской культурами и рассматривал литературу как диалог народов. «Западно-восточный диван» показывает возможность творческого соединения разных традиций. Эта позиция расширила границы национальной литературы."
    },
    {
      "title": "Влияние Гёте определяется универсальностью его художественного мышления",
      "proof": "Он развивал лирику, роман, драму, философскую поэму и автобиографическую прозу. Его произведения соединяют психологизм, миф, философию, историзм и научный интерес. Благодаря этому Гёте стал центральной фигурой немецкой классики и одним из создателей европейской литературной современности."
    }
  ],
  "22": [
    {
      "title": "Драматургия Шиллера исследует свободу личности внутри исторической необходимости",
      "proof": "Его герои стремятся действовать свободно, но сталкиваются с государством, сословным порядком, политическим насилием и последствиями собственных решений. История у Шиллера не служит фоном: она становится силой, которая проверяет нравственное достоинство человека."
    },
    {
      "title": "Ранние драмы выражают протест против деспотизма и социальной несправедливости",
      "proof": "В «Разбойниках» Карл Моор восстаёт против лицемерного общества и стремится восстановить справедливость. Однако созданная им группа превращает протест в насилие. Шиллер показывает, что благородная цель не оправдывает преступных средств."
    },
    {
      "title": "Конфликт личности и сословного общества раскрывается в «Коварстве и любви»",
      "proof": "Любовь дворянина Фердинанда и мещанки Луизы оказывается несовместимой с придворной системой. Интрига президента и Вурма превращает личное чувство в жертву политического расчёта. Трагедия показывает, как сословное государство разрушает естественные человеческие связи."
    },
    {
      "title": "Историческая драма позволяет исследовать ответственность политического деятеля",
      "proof": "В трилогии о Валленштейне герой обладает масштабом, волей и политическим умом, но оказывается между личными амбициями, долгом и изменчивой исторической ситуацией. Его гибель связана не с одной ошибкой, а с невозможностью полностью контролировать созданную им систему союзов и противоречий."
    },
    {
      "title": "Герой Шиллера познаётся через выбор в предельной ситуации",
      "proof": "Персонаж раскрывает себя не в спокойной повседневности, а в момент столкновения любви, долга, власти и свободы. Высокое напряжение действия позволяет показать внутренний конфликт личности и цену нравственного решения."
    },
    {
      "title": "Риторическая речь выражает идейный масштаб драмы",
      "proof": "Герои Шиллера часто формулируют собственную позицию в монологах и спорах. Речь становится ареной борьбы идей, а не только средством бытового общения. Такая приподнятая форма соответствует стремлению драматурга показать человека как сознательного участника истории."
    },
    {
      "title": "Шиллер постепенно переходит от бунта к идее нравственной свободы",
      "proof": "В ранних пьесах свобода часто понимается как сопротивление внешнему принуждению. В зрелой драматургии она всё больше связывается с внутренней дисциплиной, ответственностью и способностью подчинить страсть нравственному закону. Это сближает его с программой веймарского классицизма."
    },
    {
      "title": "Историзм Шиллера сочетает точность эпохи и философское обобщение",
      "proof": "Драматург обращается к реальным событиям и персонажам, но не стремится к простому документальному воспроизведению. История позволяет ему исследовать универсальные конфликты: свободу и власть, личность и государство, идеал и политическую необходимость."
    }
  ],
  "23": [
    {
      "title": "Романтизм возникает как реакция на кризис просветительской картины мира",
      "proof": "Просвещение связывало прогресс с разумом, воспитанием и общественными реформами. Однако Французская революция, террор, наполеоновские войны и реставрация показали, что рациональные проекты не устраняют насилие и противоречия. Романтики ощущают разрыв между идеалом свободы и реальной историей."
    },
    {
      "title": "Социальной основой романтизма становится опыт личности в изменившемся обществе",
      "proof": "Разрушение сословного порядка, рост городов, развитие буржуазных отношений и промышленный переворот усиливают чувство нестабильности. Человек получает больше свободы, но одновременно переживает одиночество, отчуждение и зависимость от безличных общественных сил."
    },
    {
      "title": "Немецкая идеалистическая философия формирует представление о творческом сознании",
      "proof": "Романтики воспринимают человека не как пассивного наблюдателя, а как создателя смысла. Искусство способно преображать действительность и открывать её скрытую духовную основу. Отсюда особая роль воображения, символа и фигуры художника."
    },
    {
      "title": "Главным конфликтом романтизма становится противопоставление идеала и действительности",
      "proof": "Романтический герой не принимает ограниченность повседневного мира и стремится к свободе, абсолютной любви, искусству или духовной полноте. Этот разрыв создаёт двоемирие: реальность воспринимается как неполная, а иной мир может открываться в мечте, природе, фантастике, прошлом или творчестве."
    },
    {
      "title": "Интерес к истории и фольклору связан с поиском национальной идентичности",
      "proof": "Романтики собирают народные песни, сказки и легенды, обращаются к Средневековью и национальному прошлому. Фольклор воспринимается как выражение коллективного духа народа, противопоставленного искусственной универсальности классицизма."
    },
    {
      "title": "Ранний романтизм формируется прежде всего в Германии",
      "proof": "Йенские романтики — братья Шлегели, Новалис, Тик — разрабатывают идеи универсальной поэзии, романтической иронии и синтеза искусств. Они стремятся соединить философию, литературу, религию и миф в едином творческом пространстве."
    },
    {
      "title": "Зрелый романтизм получает национальные формы",
      "proof": "В Англии ведущими становятся природа, личная свобода и образ бунтующего героя; это проявляется у Вордсворта, Кольриджа и Байрона. Во Франции романтизм теснее связан с историей и общественной борьбой, особенно у Гюго. В США он обращается к национальному пространству, тайне и конфликту личности с цивилизацией."
    },
    {
      "title": "Поздний романтизм взаимодействует с реализмом и другими направлениями",
      "proof": "Романтическая фантастика, символика и исключительный герой сохраняются, но всё чаще соединяются с социальным анализом и исторической конкретностью. У Гофмана романтическое двоемирие включает сатиру на мещанство, у Мериме сильная страсть изображается в сдержанной почти реалистической манере."
    },
    {
      "title": "Значение романтизма выходит за пределы одной эпохи",
      "proof": "Романтизм утвердил ценность индивидуальности, внутреннего мира, национальной культуры и художественного воображения. Его открытия повлияли на символизм, модернизм, исторический роман, фантастику и современное представление о творческой личности."
    }
  ],
  "24": [
    {
      "title": "Романтический идеал выражает стремление к высшей полноте бытия",
      "proof": "Романтики не принимают действительность как окончательную и самодостаточную. Они ищут мир, где человек может обрести свободу, любовь, духовную цельность и единство с природой. Такой идеал обычно не существует в готовом виде: он открывается в мечте, творчестве, прошлом, природе или духовном поиске."
    },
    {
      "title": "Романтический герой строится на конфликте личности и мира",
      "proof": "Это исключительная личность, остро переживающая несовершенство действительности. Герой не способен полностью приспособиться к обществу, потому что его внутренние требования выше повседневной нормы. Он может быть поэтом, странником, бунтарём, изгнанником или мечтателем, но во всех случаях сохраняет напряжённое стремление к свободе."
    },
    {
      "title": "Байронический герой является одной из главных разновидностей романтического героя",
      "proof": "Герои Байрона горды, одиноки и внутренне связаны с тайной прошлого. Они презирают общество, но не находят положительного идеала, который мог бы заменить отвергнутый мир. Их бунт сохраняет величие, однако нередко приводит к саморазрушению и ещё большей изоляции."
    },
    {
      "title": "Романтическое двоемирие раскрывает разрыв между действительностью и идеалом",
      "proof": "Романтическое произведение часто строится на сосуществовании двух сфер. Одна связана с бытом, расчётом, социальной нормой и ограниченностью; другая — с мечтой, искусством, чудом или высшей духовной реальностью. В «Золотом горшке» Гофмана чиновничий Дрезден существует рядом с волшебным миром Атлантиды, а герой должен выбрать способ видеть действительность."
    },
    {
      "title": "Двоемирие может существовать не только в пространстве, но и внутри личности",
      "proof": "Романтический герой нередко ощущает себя разделённым между земной жизнью и духовным призванием. Он хочет принадлежать миру людей, но одновременно стремится выйти за его пределы. Поэтому внешний конфликт двух миров становится формой внутреннего раскола сознания."
    },
    {
      "title": "Романтическая ирония показывает условность созданного художественного мира",
      "proof": "Автор одновременно создаёт иллюзию и разрушает её. Он может вмешиваться в повествование, менять тон, напоминать читателю о вымышленности истории или ставить под сомнение собственный идеал. Ирония не означает простую насмешку: она выражает невозможность окончательно вместить бесконечный идеал в завершённую форму."
    },
    {
      "title": "Романтический символ соединяет конкретный образ с бесконечным смыслом",
      "proof": "Символ не сводится к одному толкованию. Голубой цветок у Новалиса обозначает любовь, поэзию, духовное странствие и недостижимое единство мира. Море у романтиков может выражать свободу, бесконечность, опасность и глубину человеческого сознания. Конкретный предмет становится входом в более широкую духовную реальность."
    }
  ],
  "25": [
    {
      "title": "Немецкий романтизм формируется как философское и эстетическое движение",
      "proof": "В конце XVIII века Германия оставалась политически раздробленной, но переживала интенсивное философское и культурное развитие. Романтики стремились преодолеть ограниченность просветительского рационализма и восстановить целостность человека. На них повлияли немецкий идеализм, идеи Фихте и Шеллинга, а также интерес к Средневековью и национальной традиции."
    },
    {
      "title": "Йенская школа создаёт теоретическую основу романтизма",
      "proof": "К йенскому кругу относились братья Август и Фридрих Шлегели, Новалис, Людвиг Тик и другие авторы. Их объединял интерес к философии искусства, универсальной поэзии, синтезу жанров и свободе творческого сознания. Они воспринимали романтизм не только как стиль, но как способ духовного преображения мира."
    },
    {
      "title": "Идея универсальной поэзии выражает стремление к синтезу",
      "proof": "Фридрих Шлегель считал, что новая поэзия должна соединять литературу, философию, критику, религию и повседневную жизнь. Романтическое произведение поэтому не обязано подчиняться строгим жанровым границам. Оно может включать стихи, прозу, размышления, сказку и авторский комментарий."
    },
    {
      "title": "Новалис раскрывает романтизм как путь духовного познания",
      "proof": "В «Генрихе фон Офтердингене» путешествие героя становится историей формирования поэта. Голубой цветок направляет движение Генриха к любви, творчеству и единству мира. Для Новалиса поэзия не отражает готовую реальность, а открывает её скрытый духовный смысл."
    },
    {
      "title": "Гофман показывает кризис романтического идеала в повседневном мире",
      "proof": "У Гофмана художник сталкивается с мещанской действительностью, которая не понимает творчества и сводит жизнь к выгоде. В «Золотом горшке» Ансельм существует между бюргерским Дрезденом и миром Атлантиды. Фантастика и ирония не позволяют определить, где проходит окончательная граница между чудом и заблуждением."
    },
    {
      "title": "Гейдельбергская школа обращается к фольклору и национальной истории",
      "proof": "К ней относятся Ахим фон Арним, Клеменс Брентано, братья Гримм и другие собиратели народной культуры. В центре их внимания находятся песни, сказки, легенды и средневековая история. Сборник «Волшебный рог мальчика» и сказки братьев Гримм должны были сохранить духовную память народа."
    },
    {
      "title": "Различие школ состоит в направлении художественного поиска",
      "proof": "Йенские романтики прежде всего разрабатывали философию творчества и идею бесконечного искусства. Гейдельбергские авторы сильнее сосредоточились на национальной традиции, фольклоре и исторической памяти. При этом обе школы стремились преодолеть рационалистическую ограниченность и восстановить утраченную целостность культуры."
    },
    {
      "title": "Немецкий романтизм оказал влияние на всю европейскую литературу",
      "proof": "Он разработал романтическую иронию, двоемирие, символ, культ художника и интерес к бессознательному. Эти идеи повлияли на французский, английский и русский романтизм, а позднее — на символизм, модернизм и фантастическую литературу."
    }
  ],
  "26": [
    {
      "title": "Новалис понимает поэзию как способ духовного преображения мира",
      "proof": "Для него действительность не исчерпывается видимыми предметами. Поэт должен открывать скрытые связи между природой, человеком, историей и бесконечностью. Поэтому романтическое творчество становится формой познания, а не только художественным изображением."
    },
    {
      "title": "«Генрих фон Офтердинген» является романом становления поэта",
      "proof": "Герой проходит путь от смутного предчувствия призвания к осознанию собственной творческой природы. Его развитие происходит не через профессиональную карьеру или общественный успех, а через встречи, рассказы, любовь, путешествие и символические видения."
    },
    {
      "title": "Сон о голубом цветке задаёт смысл всего произведения",
      "proof": "В начале романа Генрих видит таинственный цветок, в чашечке которого возникает женское лицо. Голубой цветок соединяет любовь, поэзию, мечту и стремление к бесконечному. Он не является предметом, который можно просто найти: это символ внутреннего движения героя к полноте бытия."
    },
    {
      "title": "Путешествие организует композицию романа",
      "proof": "Генрих отправляется вместе с матерью из дома в Аугсбург. По пути он встречает купцов, воинов, восточную пленницу Зулейму и других персонажей, каждый из которых открывает ему новую сторону мира. Дорога превращает внешнее перемещение в последовательное духовное образование."
    },
    {
      "title": "Вставные рассказы расширяют индивидуальную судьбу героя",
      "proof": "Персонажи рассказывают о войне, любви, Востоке, поэзии и прошлом. Эти истории не отвлекают от основного сюжета, а показывают, как личный опыт включается в культурную память. Генрих учится воспринимать мир как множество взаимосвязанных поэтических сюжетов."
    },
    {
      "title": "Образ Матильды соединяет земную любовь и поэтический идеал",
      "proof": "В лице Матильды Генрих узнаёт образ из своего сна. Любовь становится подтверждением его призвания и способом духовного единения с миром. Однако Матильда не сводится к бытовой возлюбленной: она воплощает вдохновение и ту гармонию, к которой стремится герой."
    },
    {
      "title": "Роман полемически соотнесён с «Годами учения Вильгельма Мейстера» Гёте",
      "proof": "У Гёте герой учится находить место в реальном обществе и согласовывать личное развитие с практической жизнью. Новалис предлагает иной путь: Генрих не приспосабливается к действительности, а превращает её в поэзию. Роман воспитания становится романом духовного становления художника."
    },
    {
      "title": "Незавершённость произведения соответствует его романтической идее",
      "proof": "Роман остался незаконченным из-за ранней смерти Новалиса, однако открытая форма органична его замыслу. Становление поэта и поиск бесконечного не могут получить окончательной завершённости. Само движение оказывается важнее достигнутого результата."
    }
  ],
  "27": [
    {
      "title": "Творчество Клейста строится на кризисе рационального представления о мире",
      "proof": "Его герои стремятся действовать справедливо и разумно, но сталкиваются с непредсказуемостью событий, ошибками восприятия и противоречием между законом и нравственным чувством. Человек у Клейста не способен полностью контролировать последствия собственного поступка."
    },
    {
      "title": "Драматургия Клейста показывает личность в предельной ситуации",
      "proof": "В пьесах конфликт быстро достигает крайнего напряжения. Герои вынуждены принимать решение, не располагая полной истиной. Поэтому действие строится не на постепенном развитии, а на внезапном кризисе, который обнаруживает скрытые силы характера."
    },
    {
      "title": "«Пентесилея» раскрывает разрушительное столкновение любви и воинского закона",
      "proof": "Царица амазонок Пентесилея любит Ахилла, но подчинена обычаю, запрещающему свободный выбор возлюбленного. Чувство соединяется с гордостью, агрессией и стремлением победить. Невозможность примирить личное желание и закон племени приводит к катастрофе."
    },
    {
      "title": "Комедия «Разбитый кувшин» соединяет бытовой сюжет и критику правосудия",
      "proof": "Судья Адам должен расследовать дело о разбитом кувшине, хотя сам является виновником происшествия. Каждая попытка скрыть правду усиливает подозрение. Комедия показывает, как представитель закона превращает судебную процедуру в средство самозащиты."
    },
    {
      "title": "Новеллы Клейста строятся вокруг необычного события и резкого смыслового поворота",
      "proof": "Повествование обычно начинается с кризиса, после которого события развиваются быстро и непредсказуемо. Автор избегает подробного психологического объяснения, заставляя судить о герое по поступкам. Финальный поворот нередко меняет нравственную оценку всей истории."
    },
    {
      "title": "«Михаэль Кольхаас» исследует конфликт справедливости и разрушительного фанатизма",
      "proof": "Торговец лошадьми становится жертвой произвола и пытается добиться законного возмещения. Когда суд отказывает ему, он начинает вооружённую борьбу. Его требование справедливо, но средства постепенно превращают защитника закона в источник насилия."
    },
    {
      "title": "Образ Кольхааса раскрывает трагическую двойственность личности",
      "proof": "Герой одновременно является честным человеком и беспощадным мстителем. Чем последовательнее он защищает принцип справедливости, тем сильнее нарушает право других людей на жизнь и безопасность. Клейст показывает опасность нравственной идеи, утратившей чувство меры."
    },
    {
      "title": "Художественная манера Клейста соединяет точность и тревожную неопределённость",
      "proof": "Его проза отличается плотным синтаксисом, быстрым движением и внешне объективным рассказом. При этом мотивы персонажей и окончательный смысл событий остаются спорными. Читатель вынужден самостоятельно оценивать противоречие между поступком, законом и внутренней правдой."
    }
  ],
  "28": [
    {
      "title": "Эстетика Гофмана основана на романтическом двоемирии",
      "proof": "В его произведениях одновременно существуют повседневная бюргерская действительность и фантастический мир искусства, чудес и тайных сил. Эти сферы не отделены друг от друга окончательно: одно и то же событие может получить бытовое и волшебное объяснение."
    },
    {
      "title": "Центральный конфликт строится между художником и филистерским обществом",
      "proof": "Художник чувствует духовную глубину мира, тогда как филистер ценит порядок, выгоду, должность и бытовое благополучие. Гофман показывает, что мещанская среда не просто не понимает творчество, но стремится подчинить его своим практическим нормам."
    },
    {
      "title": "Фантастика у Гофмана раскрывает скрытую сущность реальности",
      "proof": "Чудесное не уводит от действительности, а делает видимыми её психологические и нравственные противоречия. Неодушевлённый предмет может ожить, двойник — выразить подавленную сторону личности, а волшебное существо — обнаружить тайную связь человека с другим миром."
    },
    {
      "title": "«Золотой горшок» показывает выбор между поэтическим и бюргерским существованием",
      "proof": "Студент Ансельм колеблется между Вероникой, обещающей обычное благополучие, и Серпентиной, связанной с волшебным миром Атлантиды. Его путь определяется способностью видеть чудо и сохранять верность поэтическому призванию. Финал можно понимать и как духовное обретение, и как уход из реальности."
    },
    {
      "title": "Романтическая ирония не позволяет принять фантастический идеал без сомнения",
      "proof": "Рассказчик обращается к читателю, меняет тон и напоминает об условности истории. Даже счастливое переселение Ансельма в Атлантиду сопровождается вопросом, возможно ли такое существование вне воображения. Ирония сохраняет дистанцию между мечтой и окончательной истиной."
    },
    {
      "title": "Тема двойничества раскрывает внутренний раскол личности",
      "proof": "В произведениях Гофмана двойник может воплощать страх, подавленное желание или утраченную часть сознания. В «Эликсирах Сатаны» судьба Медарда строится на смешении личностей, наследственной вины и преступного желания. Герой не способен уверенно отделить собственное «я» от чужой и тёмной силы."
    },
    {
      "title": "«Песочный человек» показывает ненадёжность восприятия",
      "proof": "Натанаэль связывает детскую травму с образом Коппелиуса и видит угрозу там, где другие замечают обычные события. Его любовь к механической Олимпии показывает неспособность различить живую личность и проекцию собственного воображения. Читатель не получает окончательного ответа, является ли происходящее сверхъестественным или психологическим."
    },
    {
      "title": "Музыка воплощает высшую форму романтического искусства",
      "proof": "Гофман был не только писателем, но и композитором и музыкальным критиком. Он считал музыку искусством, наиболее близким к бесконечному, потому что она не копирует предметный мир. Образы музыкантов и композиторов позволяют ему говорить о творческом вдохновении и духовной свободе."
    },
    {
      "title": "Гротеск соединяет смешное, страшное и фантастическое",
      "proof": "Персонаж или предмет может одновременно вызывать смех и тревогу. В «Крошке Цахесе» уродливому герою приписывают чужие таланты и заслуги. Фантастическое превращение разоблачает общество, которое готово поклоняться внешнему успеху и не замечать настоящего достоинства."
    }
  ],
  "29": [
    {
      "title": "Английский романтизм формируется под влиянием революционных потрясений и промышленного переворота",
      "proof": "Конец XVIII — начало XIX века в Англии связан с быстрым ростом городов, фабрик и социального неравенства. Первоначальные надежды, вызванные Французской революцией, сменяются разочарованием. Романтики противопоставляют механизированной цивилизации природу, внутреннюю свободу и духовную цельность человека."
    },
    {
      "title": "Поэты «озёрной школы» обращаются к повседневной жизни и естественному человеку",
      "proof": "К «озёрной школе» относят Уильяма Вордсворта, Сэмюэла Тейлора Кольриджа и Роберта Саути. Они жили или были связаны с Озёрным краем и стремились обновить поэтический язык. Их интересовали не только исключительные герои, но и простые люди, сельский быт, детство, память и непосредственное переживание природы."
    },
    {
      "title": "Вордсворт понимает природу как источник нравственного воспитания",
      "proof": "В его поэзии природа не является декоративным фоном. Она формирует сознание, возвращает человеку внутреннее равновесие и помогает преодолеть отчуждение. В стихотворениях Вордсворта воспоминание о природном впечатлении способно поддерживать человека спустя годы, превращаясь в духовный опыт."
    },
    {
      "title": "Кольридж соединяет фантастику с нравственной символикой",
      "proof": "В «Сказании о старом мореходе» сверхъестественные события возникают после убийства альбатроса. Морское путешествие становится испытанием вины, наказания и восстановления связи с живым миром. Фантастика не отменяет нравственную логику, а делает её особенно наглядной."
    },
    {
      "title": "«Лирические баллады» стали программным произведением английского романтизма",
      "proof": "Совместный сборник Вордсворта и Кольриджа показал два направления романтической поэзии. Вордсворт стремился обнаружить необычное в обыденном, а Кольридж — придать сверхъестественному психологическую убедительность. Обоих объединяло стремление обновить поэтический язык и вернуть литературе живое чувство."
    },
    {
      "title": "Английский романтизм придаёт особое значение индивидуальному переживанию",
      "proof": "Лирическое сознание становится главным центром произведения. Внешний пейзаж, воспоминание, путешествие или встреча раскрываются через внутреннюю реакцию героя. Поэзия фиксирует не только событие, но и то, как оно изменяет человека."
    },
    {
      "title": "Значение «озёрной школы» состоит в обновлении темы, языка и роли природы",
      "proof": "Поэты отказались от чрезмерно риторической манеры и приблизили стих к разговорной речи. Они сделали достойными поэзии обычного человека, скромный пейзаж и тихое внутреннее переживание. Их открытия повлияли на дальнейшую английскую лирику и европейский романтизм."
    }
  ],
  "30": [
    {
      "title": "Эстетика Байрона основана на культе свободы и неприятии общественного лицемерия",
      "proof": "Байрон выступает против политического деспотизма, сословных условностей и моральной двойственности светского общества. Его герой не желает подчиняться установленным нормам, если они противоречат внутреннему достоинству. Свобода становится одновременно политической, нравственной и личной ценностью."
    },
    {
      "title": "Байронический герой соединяет гордость, одиночество и внутреннюю тайну",
      "proof": "Такой герой разочарован в обществе и не стремится к примирению с ним. Он несёт в себе тяжёлый прошлый опыт, о котором часто говорится лишь намёками. Его независимость вызывает восхищение, но неспособность к доверию и близости делает бунт саморазрушительным."
    },
    {
      "title": "Лироэпическая поэма соединяет повествование и авторскую исповедь",
      "proof": "В «Паломничестве Чайльд-Гарольда» сюжет путешествия постоянно прерывается размышлениями автора об истории, политике, природе и собственной судьбе. Герой и автор не совпадают полностью, но между ними существует внутренняя близость. Эпическое пространство становится формой лирического самораскрытия."
    },
    {
      "title": "Путешествие позволяет сопоставить личную судьбу и историю народов",
      "proof": "Чайльд-Гарольд движется по странам Европы, а пейзажи вызывают размышления о войне, свободе и национальной памяти. Испания, Греция и Италия воспринимаются не как экзотические декорации, а как пространства исторической борьбы. Личная меланхолия включается в широкий политический контекст."
    },
    {
      "title": "Природа у Байрона противопоставлена ограниченности общества",
      "proof": "Море, горы и буря выражают свободу, силу и бесконечность. В природном мире герой ощущает масштаб, которого лишена светская жизнь. Однако природа не всегда приносит гармонию: она может подчеркнуть одиночество и трагическое несоответствие человека миру."
    },
    {
      "title": "Восточные поэмы раскрывают конфликт исключительной личности и нравственного закона",
      "proof": "В «Корсаре», «Гяуре» и других поэмах герой живёт вне общества и руководствуется собственной волей. Его любовь сильна, но нередко соединяется с местью, ревностью и насилием. Байрон показывает величие страсти и одновременно её разрушительные последствия."
    },
    {
      "title": "Ирония позднего Байрона разрушает героическую позу",
      "proof": "В «Дон Жуане» автор постоянно вмешивается в рассказ, меняет тон и высмеивает литературные условности. Романтический герой утрачивает монументальность, а мир изображается как пространство случайности, компромисса и противоречия. Это свидетельствует о внутренней эволюции поэта."
    },
    {
      "title": "Этическая позиция Байрона связана с личной ответственностью за свободу",
      "proof": "Поэт не ограничился литературным протестом и участвовал в движении за освобождение Греции. Его биография усилила восприятие свободы как практического долга. Однако в произведениях он показывает, что бунт без нравственной цели может превратиться в гордость и разрушение."
    }
  ],
  "31": [
    {
      "title": "Английский романтизм обновляет традиционные лирические жанры",
      "proof": "Романтики сохраняют оду, элегию, балладу, сонет и поэму, но меняют их содержание. В центре оказывается индивидуальное переживание, связь человека с природой, память, свобода и кризис исторического времени. Жанр становится гибким и подчиняется движению личного сознания."
    },
    {
      "title": "Баллада соединяет фольклор, тайну и нравственное испытание",
      "proof": "Кольридж в «Сказании о старом мореходе» использует повторы, простую строфику, чудесное событие и устную интонацию. Однако традиционная балладная форма превращается в сложную историю вины и искупления. Фольклорный жанр получает философское содержание."
    },
    {
      "title": "Элегия становится формой размышления о времени и утрате",
      "proof": "Романтическая элегия обращена не только к смерти конкретного человека. Она выражает чувство исчезновения прежнего мира, утраченной гармонии или собственной молодости. Пейзаж и память помогают перевести личную скорбь в размышление о человеческой судьбе."
    },
    {
      "title": "Сонет используется для сосредоточенного нравственного и политического высказывания",
      "proof": "Вордсворт обращается к сонету, чтобы зафиксировать внутреннее прозрение, историческое событие или состояние природы. Строгая форма концентрирует мысль и позволяет соединить личное чувство с общественной темой."
    },
    {
      "title": "Ода выражает переживание возвышенного",
      "proof": "В романтической оде поэт обращается к природному явлению, предмету искусства или абстрактной силе. Объект становится поводом для размышления о воображении, времени и бессмертии. У Китса, например, произведение искусства противопоставляется быстротечности человеческой жизни."
    },
    {
      "title": "Лироэпическая поэма расширяет возможности лирики",
      "proof": "У Байрона повествовательный сюжет соединяется с авторскими отступлениями и политической исповедью. Путешествие героя превращается в форму самоанализа поэта. Жанр позволяет соединить частное чувство с историей и национальной судьбой."
    },
    {
      "title": "Пейзажная лирика становится формой внутренней биографии",
      "proof": "У Вордсворта природа сохраняется в памяти и продолжает воздействовать на человека после того, как непосредственное впечатление исчезло. Пейзаж отражает этапы духовного развития. Поэтому описание места одновременно является рассказом о сознании."
    },
    {
      "title": "Жанровая свобода становится важнейшим достижением романтизма",
      "proof": "Романтики смешивают повествование, исповедь, философское размышление, фольклор и пейзаж. Традиционный жанр перестаёт быть жёсткой схемой и становится способом передать уникальное движение внутренней жизни."
    }
  ],
  "32": [
    {
      "title": "Вальтер Скотт создал классическую модель исторического романа",
      "proof": "До него прошлое часто служило экзотическим фоном или источником приключений. Скотт показывает историю как процесс столкновения общественных сил, сословий и культур. Судьба отдельного человека включается в перелом эпохи."
    },
    {
      "title": "Вымышленный герой связывает разные исторические лагеря",
      "proof": "Центральный персонаж обычно не является великим правителем или полководцем. Он занимает промежуточное положение и может взаимодействовать с несколькими сторонами конфликта. Благодаря этому читатель видит эпоху не из одной политической перспективы."
    },
    {
      "title": "Исторический конфликт раскрывается через повседневную жизнь",
      "proof": "Скотт подробно изображает одежду, жильё, обычаи, речь, религиозные привычки и отношения сословий. Бытовая деталь показывает, как большие исторические изменения проявляются в жизни обычных людей. История перестаёт быть только последовательностью войн и решений монархов."
    },
    {
      "title": "«Айвенго» строится на столкновении нормандского и саксонского миров",
      "proof": "Конфликт затрагивает язык, право, происхождение и социальное положение героев. Айвенго сохраняет верность королю Ричарду, но связан с саксонской традицией. Его судьба позволяет показать возможность будущего объединения страны, хотя противоречия ещё не исчезли."
    },
    {
      "title": "Исторические личности занимают важное, но не центральное место",
      "proof": "Ричард Львиное Сердце и принц Джон участвуют в действии, однако роман не превращается в их биографию. Реальные деятели включены в судьбы вымышленных персонажей. Так достигается сочетание исторической достоверности и свободы художественного сюжета."
    },
    {
      "title": "Скотт показывает неоднозначность исторического прогресса",
      "proof": "Победа новой силы может быть исторически необходимой, но сопровождаться утратой ценностей прежнего мира. Автор способен сочувствовать уходящей культуре, не отрицая движения истории. Это придаёт его романам трагическую глубину."
    },
    {
      "title": "Композиция соединяет приключение и социально-исторический анализ",
      "proof": "Похищения, поединки, осады и тайные возвращения поддерживают динамику сюжета. Но приключение не существует отдельно от исторического конфликта: каждое событие раскрывает отношения власти, собственности, религии и национальной принадлежности."
    },
    {
      "title": "Модель Скотта повлияла на европейский роман XIX века",
      "proof": "Его открытия были восприняты Гюго, Бальзаком, Манцони, Пушкиным, Толстым и другими писателями. Исторический роман стал способом исследовать связь личности, народа и эпохи, а не просто воспроизводить старинные события."
    }
  ],
  "33": [
    {
      "title": "Французский романтизм формируется в полемике с классицизмом",
      "proof": "Во Франции классицистическая система дольше сохраняла влияние, поэтому романтизм развивался как борьба за свободу жанров, смешение высокого и низкого, историческую конкретность и право художника на индивидуальную форму. Литературный спор одновременно отражал политические и культурные изменения после революции."
    },
    {
      "title": "Жермена де Сталь познакомила Францию с новой моделью национальной литературы",
      "proof": "В книге «О Германии» она противопоставила механическому следованию универсальным правилам идею литературы, связанной с историей, климатом, религией и духом народа. Через неё французская культура получила представление о немецкой философии, Шиллере, Гёте и романтической эстетике."
    },
    {
      "title": "Шатобриан сформировал образ раннего романтического героя",
      "proof": "В повести «Рене» герой испытывает неопределённую тоску, отчуждение и неспособность найти место в обществе. Его страдание не имеет одной внешней причины и выражает «болезнь века». Природа становится отражением внутреннего состояния и пространства духовного одиночества."
    },
    {
      "title": "Религиозное чувство у Шатобриана связано с эстетикой и памятью",
      "proof": "Он защищает христианство не только догматически, но и как источник архитектуры, поэзии, обрядов и исторической памяти. Средневековье переоценивается как эпоха культурной глубины, что подготавливает романтический интерес к прошлому."
    },
    {
      "title": "Французский романтизм тесно связывает личную судьбу с историей",
      "proof": "После революции и наполеоновской эпохи литература обращается к смене режимов, общественным катастрофам и проблеме народа. Исторический роман и драма становятся важнейшими жанрами. Личность рассматривается внутри большого политического конфликта."
    },
    {
      "title": "Виктор Гюго сформулировал зрелую программу французского романтизма",
      "proof": "В предисловии к драме «Кромвель» он выступил против строгого разделения жанров и потребовал соединять трагическое и комическое, возвышенное и гротескное. Жизнь противоречива, поэтому искусство не должно подчинять её искусственной однородности."
    },
    {
      "title": "Премьера «Эрнани» стала символом победы романтической драмы",
      "proof": "Пьеса нарушала привычные нормы классицистического театра и вызвала открытое столкновение сторонников старой и новой эстетики. Театральный спор показал, что романтизм превратился из литературного эксперимента в влиятельное общественное движение."
    },
    {
      "title": "Романы Гюго соединяют исторический масштаб и защиту униженного человека",
      "proof": "В «Соборе Парижской Богоматери» архитектура, толпа и судьбы Квазимодо, Эсмеральды и Клода Фролло образуют сложную картину Средневековья. В «Отверженных» частная судьба Жана Вальжана раскрывается на фоне социальной несправедливости и революционных событий."
    },
    {
      "title": "Другие авторы расширили жанровый диапазон французского романтизма",
      "proof": "Альфред де Мюссе исследовал разочарование молодого поколения, Жорж Санд — свободу личности и женскую судьбу, Александр Дюма развивал историко-приключенческий роман. Французский романтизм объединил лирику, драму, историческую прозу и социальную проблематику."
    }
  ],
  "34": [
    {
      "title": "Романы Жорж Санд соединяют романтическую проблематику с социальным анализом",
      "proof": "В центре её произведений находится свободная личность, вступающая в конфликт с общественными нормами, имущественным неравенством и семейным принуждением. Романтический интерес к сильному чувству и нравственному идеалу сочетается у Санд с вниманием к реальным условиям жизни человека."
    },
    {
      "title": "Женский образ становится самостоятельным центром действия",
      "proof": "Героини Жорж Санд не ограничиваются ролью возлюбленной или жертвы. Они стремятся самостоятельно выбирать жизненный путь, защищать достоинство и сопротивляться браку без любви. Через женскую судьбу писательница обсуждает зависимость личности от семьи, собственности и общественного мнения."
    },
    {
      "title": "Любовь изображается как нравственное испытание свободы",
      "proof": "Истинное чувство у Санд несовместимо с обладанием и подчинением другого человека. Любовь должна основываться на равенстве и взаимном уважении. Если отношения строятся на ревности, власти или социальной выгоде, они становятся источником разрушения."
    },
    {
      "title": "В романе «Индиана» семейный конфликт получает общественный смысл",
      "proof": "Индиана несчастна в браке с полковником Дельмаром, который относится к ней как к своей собственности. Её стремление к любви и свободе сталкивается не только с характером мужа, но и с системой, лишающей женщину самостоятельности. Частная история превращается в критику брачных и правовых норм."
    },
    {
      "title": "Романы об искусстве раскрывают тему независимости художника",
      "proof": "В «Консуэло» героиня обладает выдающимся музыкальным талантом и должна сохранить верность искусству в мире придворных интриг, сословных ограничений и личных испытаний. Её путь показывает, что призвание требует духовной независимости и отказа от успеха, купленного ценой внутренней свободы."
    },
    {
      "title": "Природа и простая жизнь выступают альтернативой испорченному обществу",
      "proof": "Сельское пространство у Жорж Санд часто связано с естественностью, трудом и возможностью гармонических отношений. Однако деревня не идеализируется полностью: в ней также существуют предрассудки и социальное неравенство. Природа скорее создаёт нравственную меру, с которой сравнивается общество."
    },
    {
      "title": "Художественный стиль сочетает эмоциональность и идейную направленность",
      "proof": "Санд использует напряжённый любовный сюжет, контрасты характеров, исповедальные монологи и живописные описания природы. При этом романное действие подчинено обсуждению свободы, равенства, права женщины и ответственности личности."
    }
  ],
  "35": [
    {
      "title": "Гюго стал одним из главных создателей французского романтизма",
      "proof": "Он выступил против классицистического ограничения жанров и утвердил право искусства соединять трагическое и комическое, возвышенное и безобразное, историческое и современное. Его творчество показало, что противоречие является не недостатком формы, а законом самой жизни."
    },
    {
      "title": "Контраст и гротеск организуют художественный мир Гюго",
      "proof": "Писатель постоянно сопоставляет внешнюю уродливость и внутреннюю красоту, величие и унижение, свет и тьму. В «Соборе Парижской Богоматери» Квазимодо безобразен внешне, но способен на самоотверженную любовь, тогда как красивый Феб оказывается поверхностным и нравственно слабым."
    },
    {
      "title": "История у Гюго раскрывается через судьбы людей, исключённых из общества",
      "proof": "Писателя интересуют нищие, каторжники, сироты, уличные дети и изгнанники. Через их жизнь он показывает устройство закона, церкви, государства и общественной морали. Частная трагедия становится способом оценить эпоху."
    },
    {
      "title": "«Собор Парижской Богоматери» соединяет исторический роман и философию культуры",
      "proof": "Собор выступает не только местом действия, но и символом Средневековья, коллективной памяти и искусства. Судьбы Эсмеральды, Квазимодо и Клода Фролло разворачиваются на фоне города и толпы. Архитектура, народный праздник и уличная жизнь создают образ исторической эпохи как единого организма."
    },
    {
      "title": "«Отверженные» строятся вокруг идеи нравственного преображения",
      "proof": "Жан Вальжан после встречи с епископом Мириэлем получает возможность начать новую жизнь. Его дальнейшие поступки показывают, что человек не сводится к прошлому преступлению. Милосердие оказывается сильнее формального закона и запускает внутреннее перерождение."
    },
    {
      "title": "Образ Жавера раскрывает конфликт закона и справедливости",
      "proof": "Жавер честно служит закону, но воспринимает его как абсолютную истину. Когда Вальжан спасает ему жизнь, привычная система рушится: преступник оказывается нравственно выше представителя власти. Неспособность примирить закон с милосердием приводит Жавера к самоубийству."
    },
    {
      "title": "Романы Гюго соединяют личную драму и масштабную историческую панораму",
      "proof": "В «Отверженных» история Вальжана, Козетты и Мариуса включена в картину бедности, восстания и политических конфликтов Франции. Баррикада становится одновременно реальным историческим пространством и символом стремления человека к справедливости."
    },
    {
      "title": "Вклад Гюго связан с защитой человеческого достоинства",
      "proof": "Его романы утверждают, что общество несёт ответственность за преступление, бедность и унижение человека. При этом писатель сохраняет веру в возможность нравственного выбора и духовного возрождения даже в самых тяжёлых обстоятельствах."
    }
  ],
  "36": [
    {
      "title": "Американский романтизм развивается в условиях формирования национальной культуры",
      "proof": "После обретения независимости литература США стремилась освободиться от прямого подражания Европе и создать собственные темы, героев и мифы. Писатели обращались к истории колонизации, природе континента, индейской культуре и проблеме национальной идентичности."
    },
    {
      "title": "Пространство природы становится важнейшей категорией",
      "proof": "Лес, океан, прерия и граница освоенного мира воспринимаются как пространство свободы, опасности и нравственного испытания. В отличие от Европы, где романтики часто обращались к руинам и Средневековью, американская литература строит миф о новом континенте."
    },
    {
      "title": "Пограничный герой воплощает конфликт цивилизации и естественной жизни",
      "proof": "В произведениях Фенимора Купера герой связан одновременно с европейским обществом и миром природы. Он знает законы леса, взаимодействует с индейцами и сохраняет независимость от города. Однако расширение цивилизации постепенно уничтожает пространство его свободы."
    },
    {
      "title": "Американская романтическая традиция включает сильную нравственно-религиозную проблематику",
      "proof": "У Натаниэля Готорна прошлое пуританской Новой Англии становится источником вины, тайны и внутреннего конфликта. В «Алой букве» общественное осуждение противопоставлено сложности личной ответственности, а знак греха со временем меняет значение."
    },
    {
      "title": "Тёмный романтизм исследует иррациональную сторону сознания",
      "proof": "Эдгар По и другие авторы обращаются к безумию, страху, преступлению, двойничеству и распаду личности. Их произведения ставят под сомнение рациональную уверенность человека в собственной природе. Ужас возникает не только извне, но и внутри сознания."
    },
    {
      "title": "Морская тема получает философский масштаб",
      "proof": "В «Моби Дике» Мелвилла охота на белого кита превращается в конфликт человека с непостижимым миром. Капитан Ахав стремится навязать реальности единственное объяснение и погибает вместе с кораблём. Морское приключение становится трагедией познания и воли."
    },
    {
      "title": "Американский романтизм тесно связан с идеей индивидуализма",
      "proof": "Герой часто противостоит обществу, государству или религиозной норме. Однако литература показывает двойственность индивидуализма: независимость может вести к свободе, но также к одиночеству, фанатизму и разрушению связи с другими людьми."
    }
  ],
  "37": [
    {
      "title": "Романтизм становится первым крупным национальным направлением литературы США",
      "proof": "Американские писатели использовали европейские эстетические идеи, но наполнили их собственным историческим и культурным материалом. В центре оказались освоение континента, конфликт природы и цивилизации, пуританское прошлое, рабство и поиск национального характера."
    },
    {
      "title": "В развитии направления можно выделить несколько художественных линий",
      "proof": "Ранний романтизм связан с Вашингтоном Ирвингом и Фенимором Купером, создавшими национальные легенды и историко-приключенческую прозу. Зрелый этап представлен Готорном, По и Мелвиллом, которые усилили философскую, символическую и психологическую проблематику."
    },
    {
      "title": "Национальное прошлое превращается в предмет мифологизации и критики",
      "proof": "Ирвинг обращается к легендам старой Америки, Купер — к истории фронтира и столкновению культур, Готорн — к пуританской Новой Англии. Прошлое используется не как нейтральный фон, а как источник современных нравственных противоречий."
    },
    {
      "title": "Символ становится ведущим способом художественного обобщения",
      "proof": "Алая буква у Готорна, белый кит у Мелвилла, дом Ашеров у По не имеют одного окончательного значения. Они соединяют психологический, нравственный, религиозный и философский смыслы. Читатель должен самостоятельно интерпретировать образ."
    },
    {
      "title": "Романтический герой часто вступает в конфликт с непостижимым миром",
      "proof": "Ахав стремится раскрыть тайну белого кита, герои По пытаются рационально объяснить страх или преступление, персонажи Готорна несут скрытую вину. Их воля и интеллект сильны, но не гарантируют победы над тайной существования."
    },
    {
      "title": "Американский романтизм сочетает демократический пафос и ощущение одиночества",
      "proof": "Новая страна утверждает свободу и самостоятельность личности, однако герой часто оказывается изолированным от общества. Освоение пространства не устраняет внутреннюю бездомность, а индивидуализм может превратиться в болезненную замкнутость."
    },
    {
      "title": "Направление подготовило развитие реализма и модернистской прозы",
      "proof": "Интерес к национальной истории, социальной проблематике и конкретному пространству повлиял на реализм. Одновременно символика, ненадёжное сознание и философская многозначность предвосхитили модернистскую литературу XX века."
    }
  ],
  "38": [
    {
      "title": "Эдгар По стремился подчинить произведение единому художественному эффекту",
      "proof": "В теоретических работах он утверждал, что короткий текст должен быть прочитан за один раз и производить целостное впечатление. Композиция, интонация, деталь и финал должны работать на заранее выбранное эмоциональное воздействие. Эта идея стала основой его поэтики новеллы."
    },
    {
      "title": "По рассматривает художественное создание как сознательную работу формы",
      "proof": "В «Философии творчества» он описывает стихотворение не как результат случайного вдохновения, а как последовательное построение эффекта. Независимо от спорности буквальной достоверности этого объяснения, оно выражает важный принцип писателя: искусство требует точного расчёта."
    },
    {
      "title": "Поэзия По строится вокруг красоты, утраты и музыкальности",
      "proof": "В «Вороне» повтор слова «никогда» постепенно меняет значение и усиливает отчаяние героя. Звуковые повторы, ритм и рефрен создают гипнотическую атмосферу. Смерть прекрасной женщины становится не бытовым событием, а символом недостижимой красоты и вечной памяти."
    },
    {
      "title": "Готические новеллы исследуют распад сознания",
      "proof": "В «Чёрном коте» рассказчик пытается рационально объяснить собственную жестокость, но его речь обнаруживает самообман и внутреннее разрушение. Внешние ужасы связаны с психологией преступника, поэтому сверхъестественное и болезненное сознание невозможно полностью разделить."
    },
    {
      "title": "«Падение дома Ашеров» соединяет пространство, род и психику",
      "proof": "Дом описывается как живой организм и отражает состояние Родерика Ашера. Трещина на фасаде предвещает распад семьи, а финальное разрушение здания совпадает с гибелью последних представителей рода. Архитектурный образ превращается в символ наследственной и духовной катастрофы."
    },
    {
      "title": "Женские образы связаны с памятью и преодолением смерти",
      "proof": "В «Лигейе» героиня воплощает необыкновенную волю и интеллектуальную силу. После её смерти рассказчик не способен освободиться от воспоминания. Финал допускает возможность возвращения Лигейи, но не исключает видения, вызванного зависимостью и болезненным сознанием героя."
    },
    {
      "title": "Аналитические новеллы создают модель интеллектуального расследования",
      "proof": "Огюст Дюпен раскрывает тайну не благодаря случайности, а через наблюдение, сопоставление и реконструкцию чужого мышления. В «Убийстве на улице Морг» и других рассказах преступление становится логической задачей. Эта линия положила начало классическому детективу."
    },
    {
      "title": "«Золотой жук» соединяет приключение и рациональную расшифровку",
      "proof": "Поиск сокровища строится вокруг криптограммы. Герой объясняет частотный анализ знаков и последовательно восстанавливает текст сообщения. Тайна не уничтожается сухой логикой: наоборот, процесс разгадки становится источником напряжения и художественного удовольствия."
    },
    {
      "title": "Новаторство По состоит в соединении строгой композиции и пограничных состояний",
      "proof": "Его тексты исследуют страх, вину, навязчивую память, безумие и смерть, но делают это с исключительной формальной точностью. Даже самый иррациональный сюжет организован системой повторов, деталей и мотивов, ведущих к единому финальному эффекту."
    }
  ],
  "39": [
    {
      "title": "Реализм возникает как стремление объяснить человека через общество и историю",
      "proof": "Реалисты рассматривают личность не изолированно, а в связи с происхождением, профессией, воспитанием, имущественным положением и устройством государства. Характер формируется в конкретных обстоятельствах, поэтому судьба героя становится способом исследовать общественные закономерности."
    },
    {
      "title": "Историзм является одним из главных принципов реалистического мышления",
      "proof": "Писатель показывает не отвлечённый человеческий тип, а человека определённой эпохи. Политические перемены, развитие буржуазных отношений, рост городов и социальная мобильность воздействуют на поведение персонажей. В романах Стендаля и Бальзака личная карьера героя непосредственно связана с послереволюционной Францией."
    },
    {
      "title": "Типизация соединяет индивидуальный характер и общественную закономерность",
      "proof": "Реалистический герой не превращается в схему. Он обладает биографией, привычками, внутренними противоречиями и неповторимой речью. Одновременно его судьба выражает более широкий социальный тип: карьериста, провинциала, буржуа, чиновника, разоряющегося аристократа."
    },
    {
      "title": "Среда становится активной силой произведения",
      "proof": "Интерьер, одежда, район города, деньги и бытовые предметы раскрывают положение и психологию персонажа. У Бальзака описание пансиона госпожи Воке сразу задаёт атмосферу бедности, расчёта и социального падения. Пространство не украшает сюжет, а объясняет поведение людей."
    },
    {
      "title": "Реализм усиливает причинную связь между поступком и последствием",
      "proof": "События развиваются не по воле чуда или рока, а из характера героя и общественных обстоятельств. Решение вступить в выгодный брак, взять долг, скрыть происхождение или начать карьеру запускает цепь закономерных последствий. Даже случай получает смысл внутри уже сложившейся жизненной ситуации."
    },
    {
      "title": "Авторская позиция может выражаться разными способами",
      "proof": "Бальзак часто открыто объясняет социальные механизмы, Диккенс соединяет обличение с эмоциональным сочувствием, Флобер стремится скрыть прямую оценку за безличным стилем и несобственно-прямой речью. Различие манер показывает, что реализм не сводится к одному типу повествования."
    },
    {
      "title": "Национальные варианты реализма имеют собственную специфику",
      "proof": "Французский реализм особенно последовательно анализирует деньги, карьеру и социальную структуру. Английский соединяет общественную критику с нравственной проблематикой, семейным романом и сатирой на институты. Немецкая и другие европейские традиции развиваются в собственных исторических условиях, сохраняя общий интерес к связи личности и среды."
    },
    {
      "title": "Реализм не означает простого копирования действительности",
      "proof": "Писатель отбирает факты, строит композицию, создаёт систему образов и художественно обобщает материал. Реалистический мир убедителен не потому, что воспроизводит жизнь буквально, а потому, что выявляет её скрытые связи и типические закономерности."
    }
  ],
  "40": [
    {
      "title": "Центральный конфликт реализма строится на взаимодействии личности и социальной среды",
      "proof": "Герой стремится к любви, успеху, свободе или признанию, но действует внутри общества, где существуют деньги, сословия, профессии и установленные нормы. Его возможности зависят не только от характера, но и от места в социальной системе."
    },
    {
      "title": "Общество предлагает личности готовые роли",
      "proof": "Человек должен соответствовать ожиданиям семьи, класса, профессии и общественного мнения. Жюльен Сорель вынужден выбирать между духовной карьерой и военной славой, потому что происхождение закрывает ему прямой путь к успеху. Личность учится играть роль, которая может вступить в противоречие с внутренним «я»."
    },
    {
      "title": "Деньги становятся важнейшим механизмом общественных отношений",
      "proof": "У Бальзака семейная любовь, брак, дружба и уважение постоянно зависят от капитала. Отец Горио отдаёт состояние дочерям, но после разорения оказывается им не нужен. Экономическое отношение вытесняет родственную связь и раскрывает нравственную структуру общества."
    },
    {
      "title": "Карьера часто требует внутреннего самоотчуждения",
      "proof": "Растиньяк входит в парижский свет и постепенно понимает его правила: успех требует связей, расчёта и готовности использовать людей. Он не является изначально порочным, но среда предлагает ему модель поведения, которую трудно отвергнуть без отказа от амбиций."
    },
    {
      "title": "Семья выступает уменьшенной моделью общества",
      "proof": "В реалистическом романе семейный конфликт связан с наследством, браком, властью родителей и имущественными интересами. Дом перестаёт быть только частным пространством и показывает действие общественных законов в повседневной жизни."
    },
    {
      "title": "Личность сохраняет ответственность, даже находясь под давлением среды",
      "proof": "Реалисты объясняют поступок обстоятельствами, но не отменяют нравственный выбор. Эмма Бовари сформирована чтением, провинциальной скукой и ограниченностью общества, однако именно она принимает решения, ведущие к обману, долгам и разрушению семьи. Среда объясняет, но не полностью оправдывает."
    },
    {
      "title": "Протест личности может быть одновременно героическим и разрушительным",
      "proof": "Жюльен Сорель отказывается смириться с унижением и сохраняет чувство собственного достоинства. Но его стремление доказать превосходство заставляет превращать отношения с людьми в борьбу. Реализм показывает сложность бунта, который может защищать свободу и одновременно воспроизводить насилие общества."
    },
    {
      "title": "Социальный анализ углубляет психологизм",
      "proof": "Внутренние переживания героя раскрываются через конкретную ситуацию: нехватку денег, страх разоблачения, карьерное ожидание, зависимость от мнения окружающих. Психология не отделена от быта, а формируется внутри него."
    }
  ],
  "41": [
    {
      "title": "Французский реализм формируется после революции и наполеоновской эпохи",
      "proof": "Общество переживает смену политических режимов, рост буржуазии и усиление карьерной конкуренции. Герой нового времени вынужден искать место в мире, где происхождение сохраняет значение, но деньги и личная энергия открывают новые возможности. Эти противоречия становятся основой французского романа."
    },
    {
      "title": "Стендаль соединяет романтическую энергию героя с реалистическим анализом общества",
      "proof": "Его персонажи обладают сильными страстями, честолюбием и стремлением к свободе. Однако их судьба объясняется конкретной политической и социальной ситуацией. Романтическая исключительность помещается в реалистически точную среду."
    },
    {
      "title": "Ранний интерес Стендаля связан с искусством, Италией и сильной личностью",
      "proof": "В книгах об Италии, живописи и музыке он вырабатывает представление о свободном, страстном человеке, способном противостоять условности. Итальянская культура становится для него противоположностью холодному расчёту и лицемерию современной Франции."
    },
    {
      "title": "«Красное и чёрное» раскрывает общество Реставрации через карьеру Жюльена Сореля",
      "proof": "Жюльен происходит из бедной семьи, но обладает умом, волей и честолюбием. Он вынужден выбирать между «красным» военной славы и «чёрным» духовной карьеры. Его жизненный путь определяется эпохой, в которой талантливому человеку без происхождения приходится скрывать себя и приспосабливаться."
    },
    {
      "title": "Жюльен Сорель сочетает искренность и сознательную игру",
      "proof": "Он презирает общество за лицемерие, но сам учится скрывать чувства и играть роль. Отношения с госпожой де Реналь первоначально воспринимаются как победа над классом хозяев, однако постепенно превращаются в подлинную любовь. Герой не совпадает с собственной карьерной программой."
    },
    {
      "title": "Психологизм Стендаля строится на анализе внутреннего движения",
      "proof": "Повествователь показывает, как герой принимает решение, сомневается, репетирует поведение и ошибочно оценивает реакцию другого человека. Особое значение имеют внутренний монолог, авторская ирония и быстрое переключение между поступком и его осмыслением."
    },
    {
      "title": "«Пармская обитель» расширяет историческую перспективу творчества Стендаля",
      "proof": "Судьба Фабрицио дель Донго разворачивается на фоне наполеоновских войн и итальянской политической жизни. Битва при Ватерлоо показана глазами неопытного участника, который не понимает общего хода события. История предстает не как ясная схема, а как хаотический человеческий опыт."
    },
    {
      "title": "Эволюция Стендаля ведёт к зрелому социально-психологическому роману",
      "proof": "От интереса к сильной личности и романтической страсти он приходит к глубокому анализу зависимости характера от эпохи. Его новаторство состоит в соединении историзма, социальной конкретности и тонкой психологии."
    }
  ],
  "42": [
    {
      "title": "Бальзак стремится создать целостную модель французского общества",
      "proof": "Замысел «Человеческой комедии» объединяет десятки романов и повестей в единую систему. Повторяющиеся персонажи переходят из одного произведения в другое, меняют положение и связывают разные общественные круги. Литературный цикл становится аналогом социального организма."
    },
    {
      "title": "Писатель рассматривает общество как систему взаимозависимых сил",
      "proof": "Деньги, происхождение, профессия, брак, наследство и политическая власть формируют судьбы героев. Бальзак показывает не отдельный порок, а механизм, который заставляет людей вступать в борьбу и превращает отношения в обмен выгодами."
    },
    {
      "title": "Подробное описание среды раскрывает социальную сущность персонажа",
      "proof": "Интерьер у Бальзака представляет собой своеобразную биографию владельца. В начале «Отца Горио» описание пансиона госпожи Воке передаёт бедность, запущенность и нравственную атмосферу его обитателей. Предметы заранее объясняют социальное положение и жизненные возможности героя."
    },
    {
      "title": "Бальзаковский характер строится вокруг господствующей страсти",
      "proof": "Гобсек подчинён накоплению, Гранде — скупости, Горио — безграничной отцовской любви, Растиньяк — стремлению к успеху. Однако страсть не превращает персонажа в простую аллегорию. Она развивается внутри биографии и вступает в сложное взаимодействие с обществом."
    },
    {
      "title": "Деньги становятся универсальным эквивалентом человеческих отношений",
      "proof": "Они определяют брак, репутацию, родственные связи и возможность участия в светской жизни. Дочери Горио любят отца, пока он способен оплачивать их потребности, но отдаляются после его разорения. Экономический механизм раскрывает нравственное разрушение семьи."
    },
    {
      "title": "Контраст и гипербола придают реализму Бальзака романтическую энергию",
      "proof": "Его герои часто обладают исключительной силой страсти, а социальные конфликты достигают предельного напряжения. Реалистическое наблюдение соединяется с драматической масштабностью. Поэтому художественный мир Бальзака одновременно конкретен и почти мифологичен."
    },
    {
      "title": "Автор активно объясняет общественные закономерности",
      "proof": "Повествователь комментирует поведение персонажей, сравнивает общество с природой и раскрывает скрытые мотивы поступков. В отличие от Флобера, Бальзак не стремится полностью устранить авторский голос. Он выступает исследователем и толкователем созданного мира."
    },
    {
      "title": "Повторяющиеся персонажи создают эффект исторического времени",
      "proof": "Читатель встречает героя на разных этапах карьеры и видит, как меняются его ценности и положение. Растиньяк проходит путь от провинциального студента до опытного участника светской жизни. Такой приём делает общество динамичным и усиливает достоверность цикла."
    }
  ],
  "43": [
    {
      "title": "Творчество Мериме развивается от романтической игры к реалистической сдержанности",
      "proof": "В ранних произведениях он использовал мистификацию, экзотику и интерес к необычным культурам. Позднее его стиль становится более лаконичным и объективным. Сильная страсть сохраняется, но изображается без авторской патетики."
    },
    {
      "title": "Исторические и этнографические интересы определяют художественную манеру писателя",
      "proof": "Мериме путешествовал, изучал архитектуру, обычаи и памятники прошлого. В произведениях он вводит географические, языковые и бытовые детали, создающие впечатление документальности. Однако точность служит не справочному описанию, а раскрытию конфликта культур."
    },
    {
      "title": "Новелла Мериме строится на сжатости и концентрации действия",
      "proof": "Автор избегает длинных объяснений и подробной предыстории. Характер раскрывается через несколько поступков, реплик и значимых деталей. Сюжет быстро движется к трагической или парадоксальной развязке."
    },
    {
      "title": "Рассказчик часто сохраняет внешнюю объективность",
      "proof": "В «Кармен» повествование начинается от лица образованного путешественника, который наблюдает чужую культуру со стороны. История Хосе передаётся через его собственный рассказ. Такая рамка создаёт дистанцию и не позволяет автору навязать читателю одну окончательную оценку."
    },
    {
      "title": "Образ Кармен воплощает абсолютную личную свободу",
      "proof": "Она не обещает вечной верности и прямо предупреждает Хосе о своей изменчивости. Кармен готова принять смерть, но не отказаться от права выбирать. Её свобода привлекательна и опасна, потому что исключает обладание и подчинение."
    },
    {
      "title": "Трагедия Хосе возникает из стремления превратить любовь во власть",
      "proof": "Он оставляет прежнюю жизнь, нарушает закон и становится контрабандистом, связывая все поступки с Кармен. Однако не принимает её самостоятельности. Убийство становится итогом не «роковой природы» героини, а неспособности Хосе признать свободу другого человека."
    },
    {
      "title": "Экзотическая среда не является только декоративным фоном",
      "proof": "Испанские и цыганские обычаи, язык, одежда и представления о чести формируют поведение персонажей. Конфликт развивается на пересечении разных культурных норм. Этнографическая точность усиливает трагедию непонимания."
    },
    {
      "title": "Авторская сдержанность усиливает эмоциональное воздействие",
      "proof": "Мериме не сопровождает убийство Кармен подробным психологическим комментарием. Краткость и спокойный тон заставляют читателя самостоятельно оценивать событие. Чем меньше прямой патетики, тем сильнее ощущается необратимость финала."
    }
  ],
  "44": [
    {
      "title": "Французская литература 1850–1860-х годов развивается в атмосфере разочарования и эстетического самоопределения",
      "proof": "После революционных потрясений 1848 года и установления Второй империи многие писатели утрачивают веру в прямое общественное действие литературы. На первый план выходит вопрос о самостоятельной ценности искусства. Поэзия стремится освободиться от политической риторики, бытовой назидательности и непосредственного выражения авторской эмоции."
    },
    {
      "title": "Теория «чистого искусства» утверждает автономию художественного произведения",
      "proof": "Сторонники этой позиции считают, что искусство не обязано служить политике, морали или практической пользе. Его ценность заключается в совершенстве формы, красоте и способности создавать особую эстетическую реальность. Поэт должен не проповедовать готовую идею, а работать со словом, ритмом и образом."
    },
    {
      "title": "Парнасцы противопоставляют романтической исповедальности точность и объективность",
      "proof": "К парнасской школе относят Теофиля Готье, Леконта де Лиля, Жозе-Мариа де Эредиа и других поэтов. Они стремятся к пластической ясности, строгой композиции и внешней сдержанности. Лирическое «я» отступает перед тщательно созданным образом, исторической картиной или экзотическим сюжетом."
    },
    {
      "title": "Культ формы становится главным принципом парнасской поэтики",
      "proof": "Стихотворение воспринимается как законченный художественный предмет, над которым поэт работает подобно скульптору или ювелиру. Особое значение получают точный эпитет, выверенная строфа, звучание и зрительная выразительность. Красота достигается не спонтанным вдохновением, а дисциплиной мастерства."
    },
    {
      "title": "Бодлер связан с эстетикой «чистого искусства», но выходит за её пределы",
      "proof": "Он высоко ценит форму и художественную автономию, однако его поэзия не отгораживается от современности. Бодлер обращается к городу, толпе, бедности, пороку, скуке и внутреннему распаду личности. Поэтому его творчество соединяет парнасскую требовательность к форме с проблематикой будущего символизма и модернизма."
    },
    {
      "title": "Сборник «Цветы зла» строится на противоречии идеала и падения",
      "proof": "Само название соединяет красоту и нравственное зло. Лирический герой стремится к чистоте, любви и духовной высоте, но ощущает притяжение порока, телесности и саморазрушения. Поэзия рождается не из устранения зла, а из его художественного преображения."
    },
    {
      "title": "Конфликт сплина и идеала организует внутреннюю композицию сборника",
      "proof": "«Идеал» связан с красотой, искусством, любовью и стремлением выйти за пределы повседневности. «Сплин» выражает скуку, тоску, чувство замкнутости и духовного бессилия. Герой постоянно движется между этими полюсами, но ни искусство, ни любовь, ни путешествие не дают окончательного освобождения."
    },
    {
      "title": "Город становится новым пространством лирики",
      "proof": "Бодлер изображает Париж как мир толпы, случайных встреч, бедности и исчезающих образов. В стихотворении «К прохожей» мгновенный взгляд незнакомки рождает возможность любви, которая сразу становится утратой. Современный город создаёт новые формы одиночества: люди находятся рядом, но не способны обрести устойчивую связь."
    },
    {
      "title": "Теория соответствий подготавливает эстетику символизма",
      "proof": "В стихотворении «Соответствия» природа представлена как храм знаков, где звуки, запахи и цвета перекликаются между собой. Видимый предмет указывает на скрытую духовную связь. Образ перестаёт иметь единственное значение и превращается в многозначный символ."
    }
  ],
  "45": [
    {
      "title": "Флобер стремится к объективному и безличному искусству",
      "proof": "Писатель считает, что автор не должен прямо разъяснять читателю, кого любить и кого осуждать. Его позиция должна выражаться через композицию, отбор деталей, речевую организацию и скрытую иронию. Произведение создаёт впечатление самостоятельного мира, а не иллюстрации к авторской проповеди."
    },
    {
      "title": "Главным требованием эстетики Флобера становится точность стиля",
      "proof": "Он добивается единственно возможного слова, проверяет ритм прозы и устраняет случайные выражения. Стиль для него не является украшением готовой мысли: именно форма создаёт художественную истину. Тщательная работа над фразой противопоставлена литературной поспешности и риторике."
    },
    {
      "title": "Флобер показывает разрыв между человеческим воображением и действительностью",
      "proof": "Его герои воспринимают жизнь через готовые культурные шаблоны — романтические книги, общественные мнения, политические лозунги или обывательские представления. Реальность не соответствует этим схемам, но персонажи не умеют увидеть её самостоятельно. Из этого несоответствия рождаются трагедия и ирония."
    },
    {
      "title": "«Госпожа Бовари» раскрывает опасность жизни по литературным клише",
      "proof": "Эмма формирует представление о любви под влиянием сентиментальных и романтических книг. Она ожидает исключительных страстей, красивых жестов и постоянного восторга. Брак с Шарлем и провинциальная повседневность кажутся ей невыносимыми не только из-за своей ограниченности, но и потому, что она сравнивает их с вымышленной моделью."
    },
    {
      "title": "Несобственно-прямая речь создаёт сложную связь автора и героини",
      "proof": "Повествование нередко передаёт мысли Эммы её собственным языком, не вводя прямого монолога. Читатель одновременно приближается к её сознанию и замечает условность, банальность или самообман этих мыслей. Благодаря этому психологическое сочувствие соединяется с иронической дистанцией."
    },
    {
      "title": "Предметная деталь раскрывает власть пошлости и потребления",
      "proof": "Одежда, мебель, подарки, счета и рекламные обещания окружают Эмму миром вещей. Её мечта о другой жизни постепенно превращается в покупки и долги. Торговец Лере использует желания героини и переводит романтическую неудовлетворённость в финансовую зависимость."
    },
    {
      "title": "«Воспитание чувств» показывает неудачу целого поколения",
      "proof": "Фредерик Моро мечтает о любви, карьере и участии в истории, но постоянно откладывает решение и подчиняется обстоятельствам. Революция 1848 года проходит рядом с ним, не превращая его в деятельного участника. Частная несостоятельность героя отражает духовную неопределённость поколения."
    },
    {
      "title": "Творческий путь Флобера включает различные формы исторического и философского романа",
      "proof": "В «Саламбо» он обращается к древнему Карфагену, соединяя археологическую точность с образами жестокости и экзотической красоты. В «Искушении святого Антония» строит философскую поэму в прозе о столкновении верований, идей и образов. Различие сюжетов не отменяет общего интереса к власти иллюзии над сознанием."
    },
    {
      "title": "Флобер оказал влияние на реализм и модернистскую прозу",
      "proof": "Его безличное повествование, работа с речью персонажа и внимание к структуре текста повлияли на Мопассана, натуралистов и писателей XX века. Он показал, что художественный анализ общества может осуществляться не прямым комментарием, а самой организацией языка."
    }
  ],
  "46": [
    {
      "title": "Диккенс рассматривает литературу как нравственную защиту человека",
      "proof": "В центре его творчества находятся дети, бедняки, сироты, заключённые и люди, униженные социальной системой. Писатель стремится вызвать не только сочувствие, но и чувство ответственности. Он показывает, что общественный порядок должен оцениваться по тому, как он обращается с наиболее беззащитными."
    },
    {
      "title": "Социальная критика соединяется у Диккенса с верой в нравственное преображение",
      "proof": "Писатель разоблачает работные дома, долговые тюрьмы, школы, суды и бюрократические учреждения. Однако источник спасения он часто видит не в политической программе, а в милосердии, семье, взаимной помощи и личном изменении. Этический идеал строится на человечности, противопоставленной бездушному институту."
    },
    {
      "title": "Детский взгляд позволяет обнаружить жестокость привычного мира",
      "proof": "В «Оливере Твисте» ребёнок сталкивается с системой, которая воспринимает бедность как вину. Просьба о дополнительной порции вызывает наказание, потому что учреждение заботится не о человеке, а о дисциплине. Невинность героя делает общественную жестокость особенно очевидной."
    },
    {
      "title": "В романах Диккенса большое значение имеет путь нравственного становления",
      "proof": "В «Больших надеждах» Пип мечтает стать джентльменом и начинает стыдиться Джо, связывая достоинство с богатством и положением. Постепенно он понимает ошибочность этой системы ценностей. Его развитие заключается не в социальном возвышении, а в способности признать вину и научиться благодарности."
    },
    {
      "title": "Гротеск и карикатура раскрывают социальную сущность персонажа",
      "proof": "Внешность, жест, имя и речевая привычка часто подчёркивают господствующую черту героя. Персонаж может казаться преувеличенным, но эта гипербола делает видимой нравственную деформацию. Комическое описание превращается в форму социальной диагностики."
    },
    {
      "title": "Художественный мир строится на резких контрастах",
      "proof": "Рядом существуют богатство и нищета, семейное тепло и холод учреждения, детская доверчивость и взрослый расчёт. Контраст усиливает эмоциональное воздействие и подчёркивает неестественность общества, где комфорт одних основан на страдании других."
    },
    {
      "title": "Город у Диккенса становится самостоятельной художественной силой",
      "proof": "Лондон изображается как лабиринт улиц, тумана, контор, трущоб и судов. Пространство разделяет людей по социальному положению, но одновременно сталкивает разные классы и судьбы. Город способен подавлять личность и создавать неожиданные связи между персонажами."
    },
    {
      "title": "Сюжет сочетает тайну, совпадение и социальную панораму",
      "proof": "Происхождение героя, скрытое родство, наследство или возвращение персонажа поддерживают интригу. Совпадения иногда выглядят условно, но помогают связать различные слои общества в единую систему. Частная судьба оказывается включённой в широкий социальный мир."
    },
    {
      "title": "Сентиментальность и юмор выполняют этическую функцию",
      "proof": "Эмоциональные сцены должны пробудить сострадание, а юмор — лишить ложный авторитет его власти. Диккенс может смеяться над слабостью человека без жестокости, но его сатира становится резкой, когда направлена против лицемерия, равнодушия и насилия."
    }
  ],
  "47": [
    {
      "title": "Теккерей направляет сатиру против общества всеобщего тщеславия",
      "proof": "Его интересуют не отдельные необычные злодеи, а повседневная система ценностей, основанная на деньгах, положении и внешней респектабельности. Люди стремятся казаться значительнее, богаче и добродетельнее, чем они есть. Тщеславие становится общественным механизмом."
    },
    {
      "title": "Раннее творчество связано с журналистикой, пародией и литературной критикой",
      "proof": "Теккерей писал очерки, фельетоны и пародии, направленные против дешёвой героики, светской моды и литературных клише. Эта практика сформировала его иронический стиль и способность видеть за возвышенной позой материальный интерес."
    },
    {
      "title": "Пародия разрушает ложную романтизацию преступника и светского героя",
      "proof": "В ранних произведениях Теккерей высмеивает литературу, которая превращает авантюриста или преступника в исключительную личность. Он возвращает герою его житейскую корысть, трусость и зависимость от обстоятельств. Сатира направлена не только на персонажа, но и на читательскую потребность в красивой иллюзии."
    },
    {
      "title": "Рассказчик открыто вступает в диалог с читателем",
      "proof": "Автор комментирует поступки персонажей, задаёт вопросы, предупреждает против поспешного осуждения и признаёт собственную ироническую позицию. Такое повествование напоминает представление кукольного театра, где рассказчик одновременно показывает героев и раскрывает устройство спектакля."
    },
    {
      "title": "Теккерей избегает простого разделения персонажей на добрых и злых",
      "proof": "Даже положительные герои могут быть слабыми, слепыми или тщеславными, а отрицательные — умными и жизнеспособными. Писатель показывает, что нравственная несостоятельность часто проявляется не в великом преступлении, а в ежедневных уступках общественной лжи."
    },
    {
      "title": "Сатира Теккерея направлена на сословные и денежные отношения",
      "proof": "Брак, дружба, военная служба и светское признание зависят от капитала и происхождения. Персонажи меняют отношение к человеку вместе с изменением его состояния. Общество изображается как рынок, где репутация становится товаром."
    },
    {
      "title": "В зрелом творчестве сатира становится исторически масштабной",
      "proof": "Теккерей обращается к разным периодам английской истории и показывает устойчивость человеческого тщеславия. Меняются костюмы, политические режимы и формы поведения, но стремление к выгоде и престижу сохраняется. История не идеализируется и не противопоставляется современности как утраченный золотой век."
    },
    {
      "title": "Ирония Теккерея соединяется с нравственным сочувствием",
      "proof": "Писатель понимает слабость человека и не всегда выносит окончательный приговор. Его смех может быть горьким, потому что герои сами становятся жертвами ценностей, которым подчиняются. Сатира предполагает не только разоблачение, но и нравственное самонаблюдение читателя."
    }
  ],
  "48": [
    {
      "title": "«Ярмарка тщеславия» — социально-сатирический роман-панорама",
      "proof": "Произведение охватывает разные слои английского общества: аристократию, буржуазию, военных, чиновников и зависимых от них людей. Частные судьбы развиваются внутри общей системы денег, брака, карьеры и репутации. Название превращает общество в ярмарку, где всё получает цену."
    },
    {
      "title": "Подзаголовок «роман без героя» выражает отказ от идеального центрального персонажа",
      "proof": "В книге нет человека, который воплощал бы безусловную нравственную норму. Эмилия добра, но пассивна и слепа; Доббин благороден, но долго идеализирует недостойную его любовь; Бекки умна и деятельна, но использует людей. Автор показывает мир, в котором слабость и тщеславие проникают почти во все характеры."
    },
    {
      "title": "Композиция строится на параллельных судьбах Бекки Шарп и Эмилии Седли",
      "proof": "Героини начинают путь вместе, но представляют разные жизненные стратегии. Эмилия полагается на чувство, семью и привычный порядок, тогда как Бекки рассчитывает на ум, обаяние и способность приспосабливаться. Сопоставление позволяет избежать простой схемы «порочная и добродетельная женщина»."
    },
    {
      "title": "Образ Бекки Шарп раскрывает противоречие личности и общества",
      "proof": "Бекки не имеет состояния и знатного происхождения, поэтому вынуждена самостоятельно бороться за место в мире. Она быстро понимает, что общество ценит богатство, связи и видимость добродетели. Её расчётливость нравственно опасна, но во многом является усвоением правил самой «ярмарки»."
    },
    {
      "title": "Эмилия Седли воплощает не только доброту, но и пассивность сознания",
      "proof": "Она идеализирует Джорджа Осборна и долго не замечает его эгоизма и неверности. Верность превращается в отказ видеть действительность. Теккерей показывает, что нравственная мягкость без самостоятельного суждения не защищает человека от самообмана."
    },
    {
      "title": "Образ Доббина строится на конфликте истинной ценности и общественной незаметности",
      "proof": "Доббин предан, честен и способен к самопожертвованию, но не обладает внешним блеском. Общество и Эмилия долго предпочитают ему красивого и самодовольного Джорджа. Через этот контраст роман показывает разрыв между подлинным достоинством и светской привлекательностью."
    },
    {
      "title": "Семья Осборнов раскрывает власть денег над родственными чувствами",
      "proof": "Старый Осборн оценивает людей по состоянию и общественному положению. Когда семья Седли разоряется, он выступает против брака сына с Эмилией. Родительская власть используется не для защиты ребёнка, а для сохранения капитала и статуса."
    },
    {
      "title": "Наполеоновские войны становятся частью социальной панорамы",
      "proof": "Битва при Ватерлоо влияет на судьбы персонажей, но роман не превращает войну в героический эпос. Пока мужчины отправляются на поле боя, общество продолжает заботиться о балах, связях, деньгах и репутации. Гибель Джорджа разрушает частную иллюзию героизма."
    },
    {
      "title": "Автор-повествователь создаёт эффект кукольного театра",
      "proof": "Рассказчик представляет героев как участников спектакля, обращается к публике и напоминает об условности действия. Такой приём усиливает сатиру: персонажи стремятся выглядеть свободными и значительными, но часто повторяют роли, навязанные общественной сценой."
    },
    {
      "title": "Социально-психологический анализ раскрывает внутреннее усвоение общественных ценностей",
      "proof": "Персонажи действуют не только под внешним давлением. Они сами начинают мыслить категориями выгоды, престижа и чужого мнения. Бекки превращает отношения в расчёт, Эмилия строит жизнь вокруг идеализированного образа, а Осборн отождествляет достоинство с богатством. Общество существует внутри сознания героев."
    }
  ],
  "49": [
    {
      "title": "Литература США середины XIX века стремится к национальному самоопределению",
      "proof": "Американские писатели уже не ограничиваются подражанием европейским образцам, а обращаются к собственным историческим, социальным и культурным проблемам. Рабство, освоение континента, индейская традиция, демократическая идея и образ нового человека становятся основой национальной литературы."
    },
    {
      "title": "Творчество Гарриет Бичер-Стоу связано с аболиционистским движением",
      "proof": "Роман «Хижина дяди Тома» направлен против рабства и показывает его не как отдельную жестокость, а как систему, разрушающую семью, человеческое достоинство и нравственность всего общества. Судьбы рабов позволяют перевести политическую проблему в область личного сострадания и нравственного выбора."
    },
    {
      "title": "Образ дяди Тома воплощает нравственное сопротивление насилию",
      "proof": "Том физически подчинён хозяевам, но сохраняет внутреннюю свободу, веру и способность к состраданию. Он отказывается выдать беглых рабов, несмотря на угрозу смерти. Его сопротивление не принимает форму вооружённого бунта, однако показывает, что рабовладелец не способен полностью подчинить человеческую совесть."
    },
    {
      "title": "Женские и семейные образы усиливают общественное звучание романа Стоу",
      "proof": "Продажа рабов постоянно означает разрыв между матерью и ребёнком, мужем и женой. Бегство Элизы через реку со своим сыном превращает политическую тему рабства в конкретную драму матери, защищающей ребёнка. Семья становится нравственным критерием, по которому рабовладельческая система обнаруживает свою бесчеловечность."
    },
    {
      "title": "Лонгфелло обращается к легендарному прошлому Америки",
      "proof": "В «Песни о Гайавате» поэт использует индейские предания и создаёт эпический образ культурного героя. Гайавата учит людей ремёслам, устанавливает нормы совместной жизни и стремится к миру между племенами. Через мифологический материал Лонгфелло пытается создать национальный эпос Соединённых Штатов."
    },
    {
      "title": "«Песнь о Гайавате» соединяет фольклорную основу и гуманистическую идею",
      "proof": "Природа в поэме одушевлена, а человек существует внутри единого мира животных, растений и стихий. Подвиги Гайаваты направлены не только на личную славу, но и на благо народа. В финале его уход приобретает значение завершения одной культурной эпохи."
    },
    {
      "title": "Уитмен создаёт нового демократического лирического героя",
      "proof": "В сборнике «Листья травы» лирическое «я» стремится вместить множество человеческих судеб, профессий, голосов и телесных переживаний. Поэт говорит не от имени избранной личности, отделённой от общества, а как часть народа и человечества."
    },
    {
      "title": "Свободный стих Уитмена выражает новую модель мира и личности",
      "proof": "Уитмен отказывается от строгой строфики и постоянной рифмы, использует длинную строку, перечисления, повторы и параллелизмы. Такая форма напоминает свободное дыхание и живую речь. Она соответствует его представлению о безграничной личности и многообразии американской жизни."
    },
    {
      "title": "Стоу, Лонгфелло и Уитмен представляют разные пути создания национальной литературы",
      "proof": "Стоу обращается к острой социальной проблеме рабства, Лонгфелло создаёт национальный эпос на основе индейского фольклора, Уитмен обновляет поэтический язык и утверждает демократическую личность. Их объединяет стремление определить духовное и историческое своеобразие Америки."
    }
  ],
  "50": [
    {
      "title": "Рубеж XIX–XX веков становится эпохой кризиса прежней картины мира",
      "proof": "Индустриализация, рост городов, научные открытия, социальные конфликты и кризис традиционной морали меняют представление о человеке. Литература уже не воспринимает действительность как полностью устойчивую и познаваемую систему. Поэтому одновременно развиваются разные, иногда противоположные художественные направления."
    },
    {
      "title": "Реализм сохраняет значение, но углубляет социальный и психологический анализ",
      "proof": "Мопассан, Голсуорси, Томас Манн, Генри Джеймс и другие писатели продолжают изображать общественную среду, семью, собственность и нравы. Однако их всё больше интересуют скрытые мотивы поведения, внутренняя раздвоенность героя и кризис буржуазной культуры."
    },
    {
      "title": "Натурализм подчёркивает зависимость человека от среды и наследственности",
      "proof": "Эмиль Золя рассматривает роман как своеобразный общественный эксперимент. В цикле «Ругон-Маккары» судьбы персонажей связаны с происхождением, физиологией, социальной средой и исторической эпохой. Натурализм усиливает документальность и внимание к телесной стороне жизни."
    },
    {
      "title": "Символизм противопоставляет прямому изображению действительности многозначный образ",
      "proof": "Верлен, Рембо и Малларме стремятся передавать не готовое понятие, а настроение, намёк и скрытые связи мира. Музыкальность, ассоциации и символ позволяют выразить то, что невозможно сообщить логическим описанием."
    },
    {
      "title": "Декаданс выражает кризисное настроение эпохи",
      "proof": "Мотивы усталости, одиночества, болезненной утончённости, искусственности и неприятия повседневности появляются в литературе разных стран. Декаданс является не одним направлением, а более широким мироощущением, которое проявляется в символизме и эстетизме."
    },
    {
      "title": "Эстетизм защищает самостоятельную ценность искусства",
      "proof": "Оскар Уайльд выступает против подчинения искусства прямой общественной пользе. В то же время «Портрет Дориана Грея» показывает противоречие эстетизма: красота, полностью отделённая от ответственности, способна привести к нравственному распаду."
    },
    {
      "title": "Неоромантизм возвращает приключение и исключительную ситуацию",
      "proof": "Стивенсон, Киплинг, Конрад и Джек Лондон обращаются к путешествию, морю, колониальному пространству и испытанию характера. Однако герой становится психологически и нравственно сложнее, чем в классическом романтизме, а приключение часто служит критике цивилизации."
    },
    {
      "title": "«Новая драма» превращает театр в пространство общественной и нравственной дискуссии",
      "proof": "Ибсен, Шоу, Гауптман и Чехов ослабляют традиционную интригу и переносят конфликт в повседневную жизнь, диалог и подтекст. Семейная или бытовая ситуация раскрывает проблемы свободы, общественной нормы и ответственности."
    },
    {
      "title": "Литература США соединяет реализм, регионализм, натурализм и психологическую прозу",
      "proof": "Марк Твен вводит разговорную речь и сатиру на общественные нормы, Генри Джеймс развивает психологический роман, Стивен Крейн и Драйзер показывают зависимость человека от городской и экономической среды, Джек Лондон соединяет натурализм с приключенческой традицией."
    },
    {
      "title": "Жанровая система становится подвижной и смешанной",
      "proof": "Развиваются социальный, психологический, семейный и экспериментальный роман, новелла, драма-дискуссия, научная фантастика, приключенческая и колониальная проза. Один текст может соединять реалистическую конкретность, символику, философскую притчу и элементы мифа."
    }
  ],
  "51": [
    {
      "title": "Французская литература рубежа веков развивается как система сосуществующих направлений",
      "proof": "Реализм и натурализм продолжают исследовать социальную действительность, символизм обновляет поэтический язык, а декадентские тенденции выражают кризисное настроение. Одновременно развиваются психологическая новелла, социальный роман, символистская драма и интеллектуальная проза."
    },
    {
      "title": "Натурализм Золя стремится соединить литературу и научный анализ общества",
      "proof": "В цикле «Ругон-Маккары» судьбы одной семьи рассматриваются на фоне истории Второй империи. Золя показывает влияние наследственности, среды, труда и экономических отношений. Документальное наблюдение становится основой широкого социального обобщения."
    },
    {
      "title": "Творчество Мопассана продолжает реалистическую традицию и углубляет психологический анализ",
      "proof": "В новеллах и романах Мопассан показывает власть денег, общественного мнения, эгоизма и страха. Его лаконичный стиль, точная деталь и неожиданный финал раскрывают скрытый смысл повседневной ситуации."
    },
    {
      "title": "Символизм меняет представление о задачах поэзии",
      "proof": "Символисты считают, что поэзия не должна прямо описывать или объяснять мир. Она должна намекать на скрытую реальность, создавать систему соответствий и воздействовать через звук, ритм и ассоциацию."
    },
    {
      "title": "Верлен развивает поэтику музыкальности и неясного настроения",
      "proof": "Его стихи строятся на полутонах, созвучиях, повторе и изменчивой интонации. Пейзаж становится отражением внутреннего состояния, но чувство не получает окончательного определения."
    },
    {
      "title": "Рембо превращает поэзию в радикальный эксперимент над языком и восприятием",
      "proof": "Он стремится выйти за пределы обычного зрения и соединяет разные чувственные впечатления. В сонете «Гласные» звук получает цвет, а слово становится самостоятельным источником образов и ассоциаций."
    },
    {
      "title": "Малларме утверждает принцип намёка и смысловой открытости",
      "proof": "Он избегает прямого называния предмета и строит текст из пауз, сложных синтаксических связей и многозначных образов. Читатель должен самостоятельно создавать смысл из элементов поэтической структуры."
    },
    {
      "title": "Символистская драма переносит конфликт из внешнего действия в атмосферу ожидания",
      "proof": "В пьесах Метерлинка событие часто почти не развивается, а персонажи ощущают приближение неизвестной силы. Молчание, повтор, символическая деталь и предчувствие смерти становятся важнее традиционной интриги."
    },
    {
      "title": "Анатоль Франс и Ромен Роллан представляют гуманистическую и интеллектуальную линию французской прозы",
      "proof": "Анатоль Франс использует иронию и скептицизм для критики общественных институтов и догм. Ромен Роллан связывает судьбу художника с европейской культурой и утверждает нравственную ответственность личности перед историей."
    },
    {
      "title": "Французская литература рубежа веков подготавливает модернизм XX века",
      "proof": "Внимание к языку, символу, субъективному восприятию и кризису личности создаёт основу для дальнейших экспериментов Пруста, сюрреалистов и других авторов. Литература всё чаще исследует не только мир, но и сам процесс его восприятия."
    }
  ],
  "52": [
    {
      "title": "Реализм Мопассана соединяет анализ общества и психологии личности",
      "proof": "Поступки героев объясняются не только индивидуальным характером, но и властью денег, общественного мнения, сословных предрассудков и материального интереса. Писатель показывает, как внешняя среда проникает во внутренний мир человека."
    },
    {
      "title": "Новелла становится основной формой художественного мастерства Мопассана",
      "proof": "Краткий объём требует точного отбора деталей и концентрации конфликта. В центре обычно находится одно событие, которое раскрывает характер героя и устройство общества. Финал нередко резко меняет оценку всего произошедшего."
    },
    {
      "title": "Авторская сдержанность усиливает критический эффект",
      "proof": "Мопассан редко прямо объясняет читателю, кого следует осуждать. Он показывает поступки, речь и детали поведения, позволяя нравственному выводу возникнуть из самой ситуации. Внешняя объективность делает изображение человеческого эгоизма особенно убедительным."
    },
    {
      "title": "«Пышка» разоблачает лицемерие буржуазного общества",
      "proof": "Пассажиры презирают Пышку из-за её профессии, но во время поездки пользуются её пищей и убеждают пожертвовать собой ради общего спасения. После того как она соглашается на связь с прусским офицером, те же люди снова отворачиваются от неё. Их патриотическая и нравственная риторика скрывает эгоизм."
    },
    {
      "title": "Нравственное превосходство может принадлежать социально презираемому человеку",
      "proof": "Именно Пышка сначала отказывается уступить врагу и проявляет искренний патриотизм. Респектабельные пассажиры готовы к компромиссу, когда затронуты их интересы. Социальная репутация и реальная нравственность оказываются противоположны."
    },
    {
      "title": "Деньги и общественное мнение определяют человеческую судьбу",
      "proof": "В произведениях Мопассана материальный расчёт влияет на брак, дружбу, карьеру и любовь. Человек оценивает другого с точки зрения выгоды и положения. Даже интимное чувство часто оказывается включено в систему социального обмена."
    },
    {
      "title": "«Ожерелье» показывает разрушительную власть тщеславия и социальной иллюзии",
      "proof": "Матильда Луазель стыдится своей скромной жизни и мечтает казаться представительницей высшего общества. Потеря заимствованного ожерелья заставляет супругов многие годы выплачивать долг. Финальное открытие, что украшение было поддельным, показывает трагическую цену стремления жить чужим образом."
    },
    {
      "title": "Художественная деталь заменяет пространный психологический комментарий",
      "proof": "Одежда, жест, еда, взгляд или предмет интерьера раскрывают положение и внутреннее состояние героя. Ожерелье становится не просто вещью, а знаком социальной мечты Матильды и её зависимости от чужой оценки."
    },
    {
      "title": "В поздней прозе усиливаются темы страха и распада сознания",
      "proof": "В рассказе «Орля» повествователь ощущает присутствие невидимого существа и постепенно утрачивает доверие к собственному восприятию. Фантастическое допускает психологическое объяснение и раскрывает страх человека перед скрытыми силами собственного сознания."
    },
    {
      "title": "«Милый друг» изображает карьеру, построенную на манипуляции и общественном лицемерии",
      "proof": "Жорж Дюруа не обладает выдающимся талантом, но умеет использовать привлекательность, связи и женщин. Его продвижение показывает, что успех в буржуазном обществе зависит не от нравственных качеств, а от способности приспосабливаться и превращать людей в средство."
    }
  ],
  "53": [
    {
      "title": "Золя теоретически обосновывает натурализм как научный метод литературы",
      "proof": "В работе «Экспериментальный роман» он предлагает писателю наблюдать человека и общество подобно учёному. Автор должен поставить персонажа в определённые условия и проследить, как проявятся его наследственные и социальные свойства."
    },
    {
      "title": "Художественный эксперимент у Золя не является буквальным лабораторным опытом",
      "proof": "Писатель не создаёт человека искусственно, а отбирает типичные обстоятельства, исторические факты и социальные конфликты. Роман становится мысленной моделью, позволяющей проверить действие среды, труда, бедности, богатства или наследственности."
    },
    {
      "title": "Наследственность и среда являются основными факторами формирования личности",
      "proof": "В цикле «Ругон-Маккары» представители одной семьи наследуют склонности, которые по-разному проявляются в зависимости от воспитания и социального положения. Личная судьба включается в биологическую, семейную и историческую закономерность."
    },
    {
      "title": "Цикл «Ругон-Маккары» соединяет семейную хронику и историю общества",
      "proof": "Подзаголовок определяет цикл как «естественную и социальную историю одной семьи в эпоху Второй империи». Через разные ветви рода Золя показывает буржуазию, рабочих, чиновников, торговлю, искусство, армию и политическую власть."
    },
    {
      "title": "Документальная подготовка становится важной частью метода Золя",
      "proof": "Перед созданием романа писатель изучает место действия, профессиональную лексику, условия труда и реальные документы. Благодаря этому шахта, рынок, магазин, железная дорога или городской квартал получают материальную и социальную достоверность."
    },
    {
      "title": "«Жерминаль» показывает зависимость человека от труда и экономической системы",
      "proof": "Шахтёры живут в условиях голода, опасности и постоянной зависимости от компании. Забастовка возникает не из отвлечённой идеи, а из конкретного ухудшения условий жизни. Судьбы персонажей раскрывают устройство классового общества."
    },
    {
      "title": "Телесность является способом показать материальную правду жизни",
      "proof": "Золя подробно изображает голод, болезнь, труд, запахи, физическое истощение и сексуальность. Тело у него не является низкой темой, а показывает, как социальные условия непосредственно воздействуют на человека."
    },
    {
      "title": "Художественная практика Золя шире его натуралистической теории",
      "proof": "Романы содержат не только наблюдение и детерминистское объяснение, но и символические образы, гиперболу, контраст и эпическую композицию. Шахта в «Жерминале» воспринимается одновременно как реальный промышленный объект и как чудовище, поглощающее человеческие жизни."
    },
    {
      "title": "Авторская позиция не исчезает за внешней объективностью",
      "proof": "Золя подробно исследует разные социальные силы, но его сочувствие угнетённым и критика власти капитала очевидны. Отбор материала, композиция и символика направляют нравственную оценку читателя."
    },
    {
      "title": "В творчестве Золя возникает противоречие между детерминизмом и возможностью исторического изменения",
      "proof": "Герои во многом зависят от наследственности и среды, однако коллективный протест показывает, что общественные условия могут быть осознаны и изменены. Финальный образ прорастающих семян в «Жерминале» выражает надежду на будущее движение рабочих."
    }
  ],
  "54": [
    {
      "title": "Декаданс выражает кризисное мироощущение конца XIX века",
      "proof": "Декаданс связан с ощущением культурного истощения, утраты устойчивых ценностей и сомнением в идее общественного прогресса. Для него характерны мотивы усталости, одиночества, болезненной утончённости, искусственности и неприятия буржуазной повседневности. При этом декаданс нельзя считать единым литературным направлением: это более широкое настроение эпохи, проявившееся в символизме, эстетизме и других течениях."
    },
    {
      "title": "Символизм превращает кризисное мироощущение в самостоятельную художественную систему",
      "proof": "Символисты считают, что видимая реальность не исчерпывает сущности мира. За вещами, звуками и событиями скрываются духовные связи, которые невозможно передать прямым логическим описанием. Поэтому поэзия должна не объяснять, а внушать, создавать настроение и направлять читателя к самостоятельному постижению скрытого смысла."
    },
    {
      "title": "Бодлер является важнейшим предшественником французского символизма",
      "proof": "Бодлер не принадлежал к оформленной символистской школе в том же смысле, что Верлен, Рембо и Малларме, однако именно его поэзия подготовила её эстетику. В стихотворении «Соответствия» природа изображена как храм, наполненный знаками, а запахи, цвета и звуки вступают в перекличку. Эта идея единства чувственного и духовного мира стала одной из основ символистской поэтики."
    },
    {
      "title": "Символ отличается от однозначной аллегории",
      "proof": "Аллегория обычно допускает относительно точную расшифровку: конкретный образ соответствует определённой идее. Символ сохраняет смысловую открытость и способен соединять несколько значений одновременно. Туман, музыка, цветок, дорога или вечер могут выражать внутреннее состояние, тайну бытия, воспоминание и предчувствие, не сводясь к одной формуле."
    },
    {
      "title": "Поль Верлен утверждает принцип музыкальности и поэтику полутонов",
      "proof": "Для Верлена важны ритм, интонация, звук и изменчивое настроение. В его стихах смысл не формулируется как логический вывод, а возникает из повторов, созвучий и едва заметных эмоциональных переходов. Пейзаж часто становится отражением душевного состояния, однако чувство сохраняет неопределённость и не получает окончательного названия."
    },
    {
      "title": "Артюр Рембо превращает поэзию в эксперимент над восприятием и языком",
      "proof": "Рембо стремится разрушить привычную связь между словом и предметом. Он соединяет цвет, звук, движение и телесное ощущение, создавая неожиданные ассоциации. В сонете «Гласные» каждой букве приписывается цвет, благодаря чему язык начинает восприниматься как самостоятельная система видений."
    },
    {
      "title": "Стефан Малларме развивает поэтику намёка и смысловой неполноты",
      "proof": "Малларме избегает прямого называния предмета, потому что буквальное обозначение, по его мнению, уничтожает поэтическую тайну. Смысл возникает из пауз, синтаксических разрывов, расположения слов и системы ассоциаций. Читатель должен не получить готовую мысль, а восстановить её из художественной структуры."
    },
    {
      "title": "Символистская поэзия меняет роль читателя",
      "proof": "Произведение больше не предлагает единственной окончательной интерпретации. Читатель включается в создание смысла, сопоставляя мотивы, звуки, цвета и повторяющиеся образы. Трудность текста становится не случайным недостатком, а частью художественного метода."
    },
    {
      "title": "Французский символизм подготовил поэтику европейского модернизма",
      "proof": "Символисты расширили значение метафоры, музыкальности, ассоциации и многозначного образа. Их открытия повлияли на поэзию, драму и прозу XX века. Особое значение получили фрагментарность, недосказанность, внимание к языку и отказ от прямого изображения действительности."
    }
  ],
  "55": [
    {
      "title": "Немецкая литература рубежа веков развивается в условиях стремительной модернизации общества",
      "proof": "Объединение Германии, индустриализация, рост городов и усиление социальных конфликтов меняют традиционный уклад. Литература обращается к рабочему движению, кризису буржуазной семьи, отчуждению личности и противоречию между культурой и технической цивилизацией."
    },
    {
      "title": "Литературный процесс характеризуется сосуществованием нескольких направлений",
      "proof": "Натурализм, критический реализм, символизм, неоромантизм и ранний модернизм развиваются параллельно и взаимодействуют друг с другом. Один автор может соединять социальную конкретность с философской символикой, а психологический анализ — с гротеском или мифом."
    },
    {
      "title": "Натурализм становится важным этапом обновления немецкой литературы",
      "proof": "Натуралисты стремятся изображать действительность с документальной точностью и подчёркивают влияние среды, наследственности и социального положения. В драме особое значение получают бытовая речь, диалект, профессиональная среда и жизнь низших общественных слоёв."
    },
    {
      "title": "Герхарт Гауптман соединяет натуралистическую драму с трагическим обобщением",
      "proof": "В пьесе «Ткачи» изображено восстание силезских рабочих. Главным героем становится не отдельная личность, а коллектив, доведённый нищетой до протеста. Реалистическая точность быта соединяется с ощущением исторической катастрофы."
    },
    {
      "title": "Критический реализм обращается к кризису буржуазной культуры",
      "proof": "Писатели исследуют разрыв между внешней респектабельностью и внутренним нравственным распадом. Семья, собственность, образование и культура перестают быть устойчивыми опорами. Этот конфликт особенно важен в творчестве Генриха и Томаса Маннов."
    },
    {
      "title": "Генрих Манн развивает социально-политическую сатиру",
      "proof": "В романе «Верноподданный» Дидерих Геслинг строит карьеру на покорности сильным и жестокости к слабым. Он преклоняется перед императорской властью, использует националистическую риторику и превращает общественные идеалы в средство личного продвижения. Частный характер становится сатирическим образом вильгельмовской Германии."
    },
    {
      "title": "Томас Манн исследует противоречие художника и бюргерского мира",
      "proof": "В «Будденброках» упадок семьи связан не только с экономическими причинами, но и с усилением рефлексии и художественной чувствительности. В новелле «Тонио Крёгер» герой разрывается между искусством и тягой к обычной человеческой жизни. Писатель не принимает полностью ни холодный эстетизм, ни духовно ограниченную бюргерскую норму."
    },
    {
      "title": "В немецкоязычной литературе усиливаются символистские и неоромантические тенденции",
      "proof": "Наряду с реалистическим изображением литература обращается к символу, мифу, легенде, сну и философскому образу. Здесь важно разграничивать собственно литературу Германии и более широкое немецкоязычное пространство. Так, австрийский поэт Райнер Мария Рильке принадлежит именно к немецкоязычной литературе и развивает темы одиночества, смерти, вещи и духовного преображения."
    },
    {
      "title": "Рубеж веков подготавливает немецкоязычный модернизм",
      "proof": "Кризис личности, ненадёжность привычных ценностей и внимание к внутреннему сознанию создают основу для дальнейшего творчества Кафки, Гессе, Музиля и других писателей XX века. Литература всё чаще изображает мир как непостижимую и противоречивую систему."
    }
  ],
  "56": [
    {
      "title": "Генрих Манн рассматривает литературу как форму общественной критики",
      "proof": "В центре его творчества находятся власть, социальное лицемерие, политическое приспособленчество и нравственная ответственность интеллигенции. Писатель показывает, как общественная система формирует характер и поощряет покорность, карьеризм и жестокость."
    },
    {
      "title": "Главным объектом сатиры становится авторитарное буржуазное сознание",
      "proof": "Герои Генриха Манна стремятся быть сильными перед слабыми и покорными перед властью. Они не обладают самостоятельными убеждениями, а приспосабливаются к господствующей идеологии. Такая психология раскрывается как основа не только личного, но и политического деспотизма."
    },
    {
      "title": "Роман «Верноподданный» создаёт сатирическую модель вильгельмовской Германии",
      "proof": "Дидерих Геслинг с детства учится бояться начальства и подчинять тех, кто зависит от него. Он преклоняется перед императором, использует националистическую риторику и превращает общественные идеалы в средство карьеры. Его успех показывает, что подобный характер востребован всей системой."
    },
    {
      "title": "Образ Геслинга построен на противоречии внешней силы и внутренней трусости",
      "proof": "Герой стремится казаться властным, но постоянно ищет защиту у более сильных. Его агрессия направлена вниз по социальной лестнице. Благодаря этому сатира разоблачает авторитарность как форму страха и зависимости."
    },
    {
      "title": "Тема интеллигенции раскрывается через вопрос об ответственности перед обществом",
      "proof": "Генрих Манн критикует художника или интеллектуала, который замыкается в эстетической сфере и отказывается от общественного действия. Для него культура должна сопротивляться насилию и политической лжи, а не служить украшением власти."
    },
    {
      "title": "В ранних романах важен конфликт искусства, чувственности и буржуазной морали",
      "proof": "В «Учителе Гнусе» школьный преподаватель, внешне являющийся защитником порядка, оказывается захвачен разрушительной страстью. Его падение разоблачает ложную добродетель и показывает скрытую агрессию человека, привыкшего подавлять других."
    },
    {
      "title": "Художественный стиль сочетает реализм, гротеск и публицистическую остроту",
      "proof": "Персонажи сохраняют социальную узнаваемость, но их господствующие черты часто доводятся до гротескного предела. Речевая карикатура, преувеличение и повтор превращают героя в сатирический тип. При этом конкретность среды не исчезает."
    },
    {
      "title": "Историческая проза расширяет политическую проблематику творчества",
      "proof": "В романах о Генрихе IV писатель обращается к французской истории, чтобы осмыслить гуманную власть, религиозную терпимость и ответственность правителя. Исторический сюжет становится способом противопоставить политическому фанатизму идеал разумного государственного деятеля."
    },
    {
      "title": "Значение Генриха Манна связано с антиавторитарной направленностью его произведений",
      "proof": "Писатель последовательно разоблачал милитаризм, национализм и преклонение перед силой. Его сатира оказалась особенно значимой в контексте дальнейшей истории Германии, поскольку показала психологические и социальные предпосылки диктатуры."
    }
  ],
  "57": [
    {
      "title": "Творчество Томаса Манна строится на конфликте искусства и бюргерской жизни",
      "proof": "Художник у Манна обладает повышенной чувствительностью и интеллектуальной свободой, но часто оказывается неспособным к естественной и устойчивой жизни. Бюргерский мир даёт порядок, здоровье и принадлежность к обществу, однако может быть духовно ограниченным. Писатель не принимает полностью ни одну сторону."
    },
    {
      "title": "Семейная история становится способом изображения культурного кризиса",
      "proof": "В романе «Будденброки» упадок торгового рода связан не только с экономическими причинами. В каждом поколении усиливаются рефлексия, художественная восприимчивость и неспособность продолжать практическую деятельность семьи. Биологический и социальный распад превращается в историю изменения европейской культуры."
    },
    {
      "title": "Томас Манн соединяет реалистическую деталь и философский символ",
      "proof": "Быт, интерьер, болезнь, музыкальный мотив или внешность героя изображаются конкретно, но получают дополнительное значение. Болезнь может обозначать не только физическое состояние, но и исключительность, духовный кризис или отрыв от нормальной жизни."
    },
    {
      "title": "Новелла Манна строится вокруг внутреннего противоречия героя",
      "proof": "Внешнее действие часто ограничено несколькими событиями, тогда как основное напряжение возникает внутри сознания. Герой анализирует собственную непохожесть, стыд, желание принадлежать другим и страх утратить индивидуальность. Поэтому новелла приближается к философскому исследованию личности."
    },
    {
      "title": "«Тонио Крёгер» раскрывает двойственность художника",
      "proof": "Тонио чувствует себя чужим среди здоровых, светловолосых и жизнелюбивых людей, но именно к ним испытывает любовь и зависть. Он не хочет полностью отказаться от искусства, однако понимает опасность холодного эстетизма. Его позиция определяется стремлением сохранить связь с обычной человеческой жизнью."
    },
    {
      "title": "«Смерть в Венеции» показывает превращение эстетического поклонения в саморазрушение",
      "proof": "Писатель Густав фон Ашенбах привык к дисциплине и контролю, но встреча с Тадзио разрушает его внутреннее равновесие. Красота юноши сначала воспринимается как воплощение художественного идеала, затем становится объектом болезненной зависимости. Эстетическое созерцание постепенно переходит в утрату достоинства и воли."
    },
    {
      "title": "Мотив болезни получает философское значение",
      "proof": "В «Смерти в Венеции» эпидемия скрывается городскими властями, а физическое заражение сопровождает духовный распад героя. Болезнь одновременно реальна и символична. Она обнаруживает то, что дисциплинированное сознание долго подавляло."
    },
    {
      "title": "Ирония не позволяет однозначно оценивать героя",
      "proof": "Рассказчик сохраняет дистанцию, сочетая сочувствие с критикой. Высокие культурные формулы могут соседствовать с унизительной бытовой подробностью. Благодаря этому трагический герой не превращается ни в простую жертву, ни в объект насмешки."
    },
    {
      "title": "В зрелом творчестве личный кризис включается в историю европейской культуры",
      "proof": "В «Волшебной горе» и «Докторе Фаустусе» судьба героя связана с болезнью, войной, философскими идеями и духовной катастрофой Германии. Частная биография становится моделью кризиса целой цивилизации."
    }
  ],
  "58": [
    {
      "title": "Гауптман обновляет немецкую драму через обращение к современной социальной действительности",
      "proof": "Он переносит на сцену жизнь рабочих, крестьян, бедняков и людей, ранее редко становившихся центральными героями серьёзной драмы. Социальный конфликт раскрывается не через отвлечённую мораль, а через конкретные условия труда, бедность и зависимость."
    },
    {
      "title": "Натуралистическая точность становится основой сценической достоверности",
      "proof": "Гауптман использует разговорную речь, диалект, бытовые предметы и подробное изображение среды. Персонажи говорят в соответствии со своим происхождением и положением. Язык перестаёт быть условно литературным и превращается в средство социальной характеристики."
    },
    {
      "title": "В драме «Перед восходом солнца» среда и наследственность определяют конфликт",
      "proof": "Семейная жизнь показана как пространство нравственного и физического распада. Алкоголизм, богатство, полученное случайно, и отсутствие духовной опоры воздействуют на всех членов семьи. Личная трагедия объясняется системой условий, а не только характером одного героя."
    },
    {
      "title": "«Ткачи» вводят коллективного героя",
      "proof": "В центре пьесы находится не один выдающийся персонаж, а группа силезских ткачей. Отдельные судьбы складываются в образ народа, доведённого до восстания. Это меняет традиционную драматическую структуру, ориентированную на индивидуальный конфликт."
    },
    {
      "title": "Массовые сцены становятся носителями действия",
      "proof": "Движение толпы, нарастание недовольства, песни и коллективная речь формируют композицию «Ткачей». История создаётся через постепенное соединение частных страданий. Масса изображается не как безличный фон, а как историческая сила."
    },
    {
      "title": "Автор избегает упрощённой политической схемы",
      "proof": "Гауптман показывает причины восстания и сочувствует бедствующим рабочим, но не предлагает готового решения. Протест сопровождается разрушением и страхом. Финал сохраняет трагическую неоднозначность социального действия."
    },
    {
      "title": "Драматург ослабляет традиционную интригу",
      "proof": "Вместо одной сюжетной линии возникает последовательность бытовых сцен, разговоров и столкновений. Напряжение создаётся не тайной или неожиданной развязкой, а постепенным накоплением социального конфликта. Такая композиция приближает драму к наблюдению за реальной жизнью."
    },
    {
      "title": "В дальнейшем Гауптман выходит за пределы строгого натурализма",
      "proof": "В его пьесах появляются символические, мифологические и неоромантические элементы. «Потонувший колокол» соединяет сказочную образность с конфликтом художника и повседневного мира. Это показывает, что драматург не ограничивался одной эстетической программой."
    },
    {
      "title": "Новаторство Гауптмана повлияло на социальную драму XX века",
      "proof": "Он расширил круг сценических героев, усилил значение среды, коллективного действия и разговорной речи. Его произведения подготовили развитие документальной, политической и эпической драмы."
    }
  ],
  "59": [
    {
      "title": "Ибсен переносит центр драматического конфликта из исключительного события в повседневную жизнь",
      "proof": "В его пьесах действие разворачивается в обычном доме, семье или профессиональной среде. Однако за внешне спокойным бытом скрываются ложь, зависимость и давно не разрешённые нравственные противоречия. Повседневность становится пространством подлинной трагедии."
    },
    {
      "title": "«Новая драма» строится на столкновении настоящего с прошлым",
      "proof": "К началу пьесы важнейшие события часто уже произошли. Задача действия — постепенно раскрыть их последствия. В «Кукольном доме» тайный заём Норы предшествует сценическому действию, но именно его разоблачение разрушает внешнее благополучие семьи."
    },
    {
      "title": "Аналитическая композиция заменяет традиционную интригу",
      "proof": "Персонажи в ходе разговоров восстанавливают скрытую историю отношений. Каждая новая подробность меняет смысл уже известного. Зритель не просто наблюдает событие, а вместе с героями анализирует причины сложившегося кризиса."
    },
    {
      "title": "Диалог становится способом борьбы мировоззрений",
      "proof": "Реплика у Ибсена редко является нейтральным обменом информацией. Персонажи защищают собственное понимание долга, семьи, свободы и общественной нормы. В финальном разговоре Норы и Хельмера сталкиваются не только супруги, но и две модели личности: зависимая роль и право на самостоятельное самопознание."
    },
    {
      "title": "Подтекст раскрывает несоответствие между словами и внутренним состоянием",
      "proof": "Герои говорят о любви, порядке и долге, но их поступки обнаруживают страх, расчёт или желание власти. Хельмер обращается к Норе уменьшительными именами и изображает заботу, однако воспринимает её как красивую собственность. Ласковая речь скрывает неравенство отношений."
    },
    {
      "title": "«Кукольный дом» переосмысливает семейную драму",
      "proof": "Первоначально Нора кажется беззаботной и зависимой женщиной, но постепенно выясняется, что именно она совершила рискованный поступок ради спасения мужа. Кризис начинается тогда, когда Хельмер думает прежде всего о репутации. Героиня понимает, что семейная гармония была построена на роли, а не на равноправии."
    },
    {
      "title": "Открытый финал становится важнейшим новаторским приёмом",
      "proof": "Уход Норы не даёт готового ответа о её дальнейшей судьбе. Пьеса завершается поступком, который открывает новый жизненный конфликт за пределами сцены. Зритель должен самостоятельно оценить решение героини и возможность изменения семьи."
    },
    {
      "title": "Символическая деталь углубляет реалистическое действие",
      "proof": "Ёлка в «Кукольном доме» сначала связана с праздничным уютом, затем теряет украшения и отражает разрушение внешнего благополучия. Танец тарантеллы передаёт тревогу Норы и её попытку отсрочить разоблачение. Деталь получает психологический и символический смысл."
    },
    {
      "title": "Ибсен превращает театр в пространство общественной дискуссии",
      "proof": "Пьесы ставят вопросы о браке, правах женщины, власти общественного мнения, наследственной вине и личной ответственности. Автор не сводит конфликт к готовой морали. Драма должна не успокаивать зрителя, а заставлять его спорить и пересматривать привычные нормы."
    }
  ],
  "60": [
    {
      "title": "Английская литература рубежа веков отражает кризис викторианской системы ценностей",
      "proof": "Имперское могущество, промышленное развитие и внешняя респектабельность соседствуют с социальным неравенством, колониальным насилием и внутренним одиночеством человека. Писатели подвергают сомнению веру в прогресс, устойчивость семьи и нравственное превосходство цивилизации."
    },
    {
      "title": "Реализм сохраняет ведущую роль, но меняет проблематику",
      "proof": "Томас Гарди, Джон Голсуорси и другие авторы продолжают исследовать общество и среду, однако усиливают внимание к распаду традиционных связей. Герой сталкивается не только с конкретной несправедливостью, но и с безличной системой собственности, закона и общественного мнения."
    },
    {
      "title": "Томас Гарди изображает трагический конфликт человека и социальной нормы",
      "proof": "В его романах личное чувство сталкивается с сословными предрассудками, религиозной моралью и случайностью. В «Тэсс из рода д’Эрбервиллей» героиня становится жертвой насилия и общественного осуждения, хотя нравственно превосходит тех, кто выносит ей приговор."
    },
    {
      "title": "Джон Голсуорси исследует собственническое сознание буржуазии",
      "proof": "В «Саге о Форсайтах» семья существует как система имущества, брака и репутации. Сомс воспринимает Ирэн не как свободную личность, а как часть своей собственности. Семейный конфликт раскрывает общую духовную ограниченность класса."
    },
    {
      "title": "Бернард Шоу обновляет драму через интеллектуальную дискуссию",
      "proof": "Его пьесы строятся вокруг спора идей, а не только вокруг внешней интриги. Герои обсуждают брак, бедность, профессию, мораль и общественное устройство. Комедия становится способом разрушения привычных представлений."
    },
    {
      "title": "Герберт Уэллс соединяет научную фантастику и социальную критику",
      "proof": "Фантастическое допущение позволяет проверить современную цивилизацию. В «Машине времени» будущее обнаруживает крайнее классовое разделение, а в «Острове доктора Моро» научный эксперимент ставит вопрос о нравственных границах знания."
    },
    {
      "title": "Неоромантизм возвращает приключение, но усложняет образ героя",
      "proof": "Стивенсон, Конрад и Киплинг обращаются к морю, колониальному пространству, опасности и испытанию характера. Однако приключение уже не утверждает простую героику. Оно раскрывает нравственную двойственность цивилизатора, путешественника и человека власти."
    },
    {
      "title": "Эстетизм противопоставляет искусство утилитарной морали",
      "proof": "Оскар Уайльд защищает самостоятельную ценность красоты и художественной формы. При этом его произведения показывают внутреннее противоречие эстетизма: культ красоты без ответственности может привести к нравственному распаду, как в «Портрете Дориана Грея»."
    },
    {
      "title": "Жанровая система становится особенно разнообразной",
      "proof": "Развиваются социальный и семейный роман, интеллектуальная драма, научная фантастика, приключенческая проза, колониальный рассказ и эстетистская сказка. Разные жанры объединяет стремление заново определить человека в мире быстро меняющейся цивилизации."
    }
  ],
  "61": [
    {
      "title": "Английский реализм рубежа веков исследует кризис общественных институтов",
      "proof": "Писатели обращаются к семье, браку, собственности, классовому неравенству, образованию и научному прогрессу. Реализм перестаёт ограничиваться описанием быта и становится способом анализа скрытых механизмов общества."
    },
    {
      "title": "Томас Гарди показывает зависимость личности от среды, нормы и случайности",
      "proof": "Его герои живут в сельской Англии, где традиционный уклад разрушается под воздействием нового времени. Судьба определяется происхождением, общественным мнением и стечением обстоятельств. При этом случай у Гарди обнаруживает уже существующую несправедливость мира."
    },
    {
      "title": "Трагедия Тэсс раскрывает двойную мораль общества",
      "proof": "Тэсс переживает насилие, но общество возлагает вину на неё. Энджел Клэр требует от героини чистоты, хотя сам признаётся в собственном прошлом. Его неспособность применить к себе и к Тэсс одинаковую нравственную меру становится одной из причин катастрофы."
    },
    {
      "title": "Бернард Шоу превращает реалистическую драму в интеллектуальный спор",
      "proof": "В его пьесах персонажи представляют разные общественные позиции, но не превращаются в отвлечённые схемы. Их убеждения проверяются практикой. В «Пигмалионе» эксперимент с речью Элизы ставит вопрос не только о языке, но и о классе, личности и ответственности учителя."
    },
    {
      "title": "Герберт Уэллс использует фантастику как форму реалистического анализа",
      "proof": "Его произведения строятся на необычном научном допущении, но направлены на современные социальные проблемы. Элои и морлоки в «Машине времени» являются фантастическим развитием классового разделения. Будущее объясняет настоящее."
    },
    {
      "title": "Научный прогресс у Уэллса не равен нравственному прогрессу",
      "proof": "В «Человеке-невидимке» открытие даёт Гриффину власть, но не делает его свободнее или ответственнее. Изоляция, гордость и желание господства превращают научный успех в разрушительную силу. Проблема заключается не только в изобретении, но и в личности, которая им распоряжается."
    },
    {
      "title": "Голсуорси раскрывает буржуазное общество через категорию собственности",
      "proof": "В «Саге о Форсайтах» имущество становится универсальным способом восприятия мира. Дом, картины, положение и даже семейные отношения оцениваются как владение. Сомс не понимает, что любовь не может существовать по законам собственности."
    },
    {
      "title": "Семейная хроника у Голсуорси приобретает исторический масштаб",
      "proof": "История нескольких поколений показывает изменение английской буржуазии. Через браки, наследство и конфликты раскрывается движение времени. Семья становится моделью класса, который постепенно теряет прежнюю устойчивость."
    },
    {
      "title": "Различные жанры объединяет критическое отношение к социальной норме",
      "proof": "Гарди использует трагический роман, Шоу — драму-дискуссию, Уэллс — научную фантастику, Голсуорси — семейную хронику. Несмотря на жанровые различия, все они показывают, что закон, мораль, собственность и прогресс не являются безусловными ценностями и должны оцениваться с точки зрения человека."
    }
  ],
  "62": [
    {
      "title": "Шоу создаёт интеллектуальную драму, в которой главным событием становится спор",
      "proof": "Внешнее действие в его пьесах часто относительно просто, но персонажи постоянно обсуждают общественные и нравственные проблемы. Драматическое напряжение возникает из столкновения идей. Зритель должен не только следить за сюжетом, но и оценивать аргументы сторон."
    },
    {
      "title": "Шоу отказывается от однозначного положительного героя",
      "proof": "Каждый персонаж обладает частичной правотой и одновременно ограниченностью. Автор не позволяет зрителю полностью отождествиться с одной позицией. Истина возникает из конфликта мнений, а не из готовой авторской проповеди."
    },
    {
      "title": "Парадокс разрушает привычные моральные формулы",
      "proof": "Шоу строит реплику так, чтобы неожиданно перевернуть общепринятое суждение. То, что общество называет добродетелью, может оказаться лицемерием, а то, что осуждается, — проявлением здравого смысла. Парадокс заставляет увидеть привычную норму со стороны."
    },
    {
      "title": "Комедия соединяется с серьёзной общественной проблематикой",
      "proof": "Смешное у Шоу не отменяет интеллектуальной глубины. В «Пигмалионе» комизм произношения и светских недоразумений связан с проблемой социального неравенства. Зритель смеётся над речью Элизы, но постепенно понимает, что именно общество создало систему, в которой акцент определяет судьбу человека."
    },
    {
      "title": "«Пигмалион» переосмысливает сюжет о создании идеальной женщины",
      "proof": "Хиггинс меняет речь и внешний облик Элизы, но не создаёт её личность. Напротив, героиня начинает осознавать собственное достоинство и требовать самостоятельности. Эксперимент выходит из-под контроля, потому что человек не является произведением или вещью своего наставника."
    },
    {
      "title": "Открытый финал препятствует сентиментальному завершению",
      "proof": "Шоу не превращает отношения Хиггинса и Элизы в обычную любовную историю. Главным итогом становится не брак, а освобождение героини от зависимости. Открытость финала сохраняет интеллектуальный конфликт и не подменяет социальную проблему романтической развязкой."
    },
    {
      "title": "Ремарка и предисловие становятся частью авторской стратегии",
      "proof": "Шоу подробно описывает внешность, поведение и социальную позицию персонажа. Его ремарки иногда приближаются к самостоятельной прозе. Предисловия объясняют общественный контекст, но не заменяют пьесу, а расширяют пространство дискуссии."
    },
    {
      "title": "Шоу развивает традицию «новой драмы» Ибсена",
      "proof": "Как и Ибсен, он обращается к современному обществу, семейным и профессиональным конфликтам и разрушает удобные моральные иллюзии. Однако Шоу усиливает комическое, парадоксальное и полемическое начало. Его пьеса чаще превращается в публичный спор."
    },
    {
      "title": "Театр Шоу требует активного зрителя",
      "proof": "Пьеса не предлагает простого эмоционального очищения. Зритель должен сравнивать позиции, замечать противоречие между словами и действиями и пересматривать собственные убеждения. Театр становится формой интеллектуального участия."
    }
  ],
  "63": [
    {
      "title": "Неоромантизм возникает как обновление романтической традиции в конце XIX века",
      "proof": "Писатели возвращаются к приключению, путешествию, тайне и исключительной ситуации. Однако неоромантизм формируется после реализма и учитывает его опыт. Поэтому экзотический сюжет соединяется с психологическим анализом и нравственной неоднозначностью."
    },
    {
      "title": "Герой раскрывается в ситуации испытания",
      "proof": "Море, необитаемый остров, колония, война или преступление выводят человека из привычного порядка. В опасности обнаруживаются мужество, трусость, верность или скрытая жестокость. Приключение становится способом проверки личности."
    },
    {
      "title": "Стивенсон соединяет динамичный сюжет и нравственную проблематику",
      "proof": "В «Острове сокровищ» поиски клада создают классическую приключенческую интригу, но главное значение получает взросление Джима Хокинса. Он учится различать смелость и безрассудство, доверие и обман, внешнюю привлекательность и нравственную опасность."
    },
    {
      "title": "Образ Джона Сильвера усложняет разделение героев на добрых и злых",
      "proof": "Сильвер является пиратом и обманщиком, но обладает умом, самообладанием и способностью вызывать симпатию. Он может заботиться о Джиме и одновременно использовать его. Такой образ показывает нравственную неоднозначность человека приключенческого мира."
    },
    {
      "title": "«Странная история доктора Джекила и мистера Хайда» раскрывает внутреннее двоемирие личности",
      "proof": "Доктор Джекил пытается отделить нравственную часть человека от тёмных желаний. Однако Хайд постепенно получает самостоятельную власть. Фантастический эксперимент показывает, что зло нельзя безнаказанно вынести за пределы личной ответственности."
    },
    {
      "title": "Конрад превращает морское приключение в исследование сознания",
      "proof": "В его произведениях внешнее путешествие сопровождается внутренним испытанием рассказчика или героя. Море не просто экзотическое пространство, а среда, где человек остаётся один на один со страхом, долгом и неопределённостью."
    },
    {
      "title": "«Сердце тьмы» разоблачает миф о цивилизаторской миссии",
      "proof": "Марлоу отправляется в Африку как представитель европейской компании и сталкивается с эксплуатацией, насилием и бессмысленным разрушением. Курц, который должен был нести цивилизацию, сам становится носителем безграничной власти и нравственного распада."
    },
    {
      "title": "Повествование у Конрада подчёркивает невозможность окончательной истины",
      "proof": "История часто передаётся через рассказчика, который вспоминает события и пытается их истолковать. Читатель получает не объективный отчёт, а личную версию опыта. Истина остаётся неполной и зависит от точки зрения."
    },
    {
      "title": "Английский неоромантизм связан с колониальной тематикой, но способен её критиковать",
      "proof": "Экзотическое пространство создаёт приключение, однако одновременно обнаруживает насилие имперской системы. У Киплинга колониальный мир может изображаться как пространство службы и испытания, у Конрада — как источник нравственной катастрофы. Поэтому внутри направления существуют разные оценки имперского опыта."
    },
    {
      "title": "Неоромантизм подготовил литературу XX века",
      "proof": "Он сохранил занимательный сюжет, но усложнил героя, рассказчика и нравственную оценку события. Психологическая двойственность Стивенсона и ненадёжное повествование Конрада повлияли на модернистскую прозу."
    }
  ],
  "64": [
    {
      "title": "Творчество Киплинга формируется на пересечении английской и индийской культур",
      "proof": "Киплинг родился в Индии, долго жил там и хорошо знал колониальный быт, языковую среду, армию и жизнь разных социальных групп. Индия в его произведениях не является только экзотическим фоном. Она становится сложным миром, где сталкиваются культуры, религии, власть и личный опыт."
    },
    {
      "title": "Писатель сочетает интерес к империи с вниманием к человеку службы",
      "proof": "Героями Киплинга часто становятся солдаты, инженеры, чиновники, врачи и люди, выполняющие тяжёлую работу на окраинах империи. Он ценит дисциплину, профессионализм, товарищество и способность отвечать за дело. Именно эти качества формируют его этический идеал."
    },
    {
      "title": "Имперское мировоззрение Киплинга внутренне противоречиво",
      "proof": "Писатель нередко воспринимает британскую власть как естественную организующую силу и разделяет многие представления своей эпохи о «цивилизаторской миссии». Одновременно он показывает сложность Индии, ограниченность колониальных чиновников и нравственную неоднозначность имперского служения. Поэтому его творчество нельзя сводить ни к простой апологии империи, ни к последовательной антиколониальной критике."
    },
    {
      "title": "Проза Киплинга строится на точном знании среды и профессиональной речи",
      "proof": "В рассказах важны детали формы, оружия, службы, дороги, климата и местных обычаев. Персонажи говорят по-разному в зависимости от происхождения и профессии. Такая речевая и бытовая точность создаёт убедительность и позволяет показать общественную иерархию без длинных авторских объяснений."
    },
    {
      "title": "«Ким» соединяет приключенческий роман, роман воспитания и колониальную панораму",
      "proof": "Ким растёт на улицах Лахора, свободно переходит между культурами и не принадлежит полностью ни одной из них. Его путешествие с тибетским ламой связано с духовным поиском, а участие в «Большой игре» — с политикой и разведкой. Роман строится на двойном движении: герой осваивает мир империи и одновременно ищет собственную идентичность."
    },
    {
      "title": "Образ Кима показывает сложность культурной принадлежности",
      "proof": "Ким является ирландцем по происхождению, но вырос в индийской среде и воспринимает её как родную. Он способен менять язык, одежду и социальную роль. Такая подвижность даёт ему свободу, но одновременно ставит вопрос о том, к какому миру он принадлежит в действительности."
    },
    {
      "title": "«Книга джунглей» изображает воспитание через закон сообщества",
      "proof": "Маугли растёт среди волков и учится Закону джунглей, который регулирует отношения животных. Этот закон требует дисциплины, знания границ и взаимной ответственности. Герой становится сильным не только благодаря природным способностям, но и благодаря усвоению правил, позволяющих разным существам сосуществовать."
    },
    {
      "title": "Образ Маугли раскрывает конфликт принадлежности и одиночества",
      "proof": "Маугли связан и с миром животных, и с людьми, но не может полностью раствориться ни в одном из них. Его изгнание из стаи и трудное возвращение к человеческому обществу показывают цену двойной идентичности. Свобода героя сопровождается внутренней бездомностью."
    },
    {
      "title": "Поэзия Киплинга соединяет балладность, песенность и разговорную интонацию",
      "proof": "Его стихи часто строятся на повторе, чётком ритме, рефрене и голосе конкретного персонажа. Военные и казарменные песни передают речь простого солдата, а не только официальную имперскую риторику. Благодаря этому поэзия приобретает драматический и повествовательный характер."
    },
    {
      "title": "Стихотворение «Если…» выражает этический идеал самообладания",
      "proof": "Лирическое наставление строится на способности сохранять внутреннюю устойчивость в успехе и поражении, не подчиняться ни самодовольству, ни отчаянию. Главной добродетелью становится не внешняя победа, а власть над собой, терпение и верность избранному пути."
    },
    {
      "title": "Современное прочтение Киплинга требует постколониальной критической дистанции",
      "proof": "Художественная точность, внимание к индийской культуре и сложность образов не отменяют того, что тексты создавались внутри британского имперского сознания. Поэтому важно одновременно оценивать литературное мастерство автора и анализировать те представления о культурной и политической иерархии, которые отражены в его произведениях."
    }
  ],
  "65": [
    {
      "title": "Эстетизм утверждает самостоятельную ценность искусства",
      "proof": "Представители эстетизма выступают против требования оценивать произведение только по его общественной пользе или нравственному наставлению. Искусство создаёт особую реальность, подчинённую законам красоты и формы. Художник не обязан превращать текст в прямую моральную проповедь."
    },
    {
      "title": "Эстетизм возникает как реакция на утилитаризм и викторианскую мораль",
      "proof": "Буржуазное общество ценило практическую пользу, респектабельность и соблюдение внешних норм. Эстеты противопоставили этому культ индивидуальности, художественного стиля и свободы воображения. Однако их протест сам становился формой общественной критики."
    },
    {
      "title": "Уайльд строит эстетику на парадоксе",
      "proof": "Его высказывания намеренно переворачивают привычные представления о морали, искусстве и обществе. Парадокс разрушает автоматическое согласие с общепринятой истиной и заставляет увидеть её условность. Острый афоризм становится одновременно формой мысли и художественной игрой."
    },
    {
      "title": "В «Портрете Дориана Грея» эстетический эксперимент превращается в нравственную трагедию",
      "proof": "Дориан желает сохранить молодость, а портрет принимает на себя следы времени и порока. Герой получает возможность отделить внешнюю красоту от последствий поступков. Однако именно это отделение разрушает его личность: безнаказанность превращает свободу в духовное разложение."
    },
    {
      "title": "Портрет выполняет функцию двойника и нравственной памяти",
      "proof": "Внешность Дориана остаётся прекрасной, тогда как изображение становится всё более отталкивающим. Портрет показывает то, что герой скрывает от общества и от самого себя. Он материализует совесть, которую невозможно окончательно уничтожить."
    },
    {
      "title": "Образы Бэзила, лорда Генри и Дориана воплощают разные отношения к искусству",
      "proof": "Бэзил воспринимает красоту как духовную и личную ценность, лорд Генри превращает эстетические идеи в соблазнительную систему афоризмов, а Дориан пытается буквально прожить эту теорию. Роман показывает, как идея, отделённая от ответственности, становится разрушительной практикой."
    },
    {
      "title": "Комедии Уайльда соединяют светскую лёгкость и социальную сатиру",
      "proof": "В пьесах «Как важно быть серьёзным», «Идеальный муж» и других герои скрываются за масками респектабельности, а общественная мораль зависит от репутации и условностей. Быстрый диалог и парадокс разоблачают лицемерие без тяжёлой назидательности."
    },
    {
      "title": "Мотив маски является центральным для творчества Уайльда",
      "proof": "Персонажи создают удобный образ для общества, скрывая желания, прошлое или внутренний конфликт. Маска позволяет сохранить свободу, но одновременно ведёт к раздвоению личности. Внешняя безупречность всё чаще оказывается формой лжи."
    },
    {
      "title": "Сказки Уайльда соединяют красоту и этическую проблематику",
      "proof": "В «Счастливом принце», «Соловье и розе» и других сказках прекрасный образ не отделён от сострадания и жертвы. Искусство получает нравственное содержание через способность видеть чужую боль. Это усложняет представление об Уайльде как стороннике полной независимости красоты от морали."
    }
  ],
  "66": [
    {
      "title": "Литература США рубежа веков отражает превращение страны в индустриальную державу",
      "proof": "Рост городов, корпораций, массовой печати и железных дорог меняет американское общество. Обещание равных возможностей сталкивается с бедностью, классовым неравенством и властью капитала. Литература всё чаще подвергает критике традиционный миф об успехе."
    },
    {
      "title": "Реализм становится ведущим способом изображения американской жизни",
      "proof": "Писатели обращаются к повседневной речи, региональному быту, социальным отношениям и нравам разных слоёв общества. В центре оказывается обычный человек, а не исключительный романтический герой. Реалистический текст стремится показать национальную жизнь во всём её многообразии."
    },
    {
      "title": "Марк Твен соединяет региональную конкретность, юмор и общественную критику",
      "proof": "Он вводит в литературу живую разговорную речь и показывает Америку через взгляд ребёнка, путешественника или простого человека. Комическое повествование постепенно раскрывает расизм, религиозное лицемерие, жадность и жестокость общественных норм."
    },
    {
      "title": "Регионализм помогает создать многообразную картину страны",
      "proof": "Писатели изображают Юг, Запад, Новую Англию, большие города и пограничные территории. Диалект, местные обычаи и природное пространство становятся важными художественными средствами. Национальная литература строится не как единый голос, а как совокупность региональных опытов."
    },
    {
      "title": "Натурализм усиливает внимание к среде и борьбе за существование",
      "proof": "Стивен Крейн, Фрэнк Норрис и Теодор Драйзер показывают человека под воздействием бедности, города, наследственности и экономических сил. Герой не всегда способен свободно изменить судьбу, поскольку действует внутри системы, превосходящей его волю."
    },
    {
      "title": "Стивен Крейн обновляет изображение войны и городского дна",
      "proof": "В «Алой эмблеме доблести» война показана через страх и субъективное восприятие неопытного солдата. В «Мэгги, девушке с улицы» судьба героини определяется бедностью, насилием и общественным лицемерием. Автор избегает героизации и прямого морализаторства."
    },
    {
      "title": "Генри Джеймс развивает психологический роман и тему столкновения культур",
      "proof": "Его герои оказываются между американской непосредственностью и сложной европейской культурой. Основное внимание переносится на восприятие, сомнение и нравственный выбор. Событие важно не только само по себе, но и как оно понято персонажем."
    },
    {
      "title": "Джек Лондон соединяет натурализм, приключение и социальную проблематику",
      "proof": "Его герои проходят испытание природой, трудом, бедностью и конкуренцией. В одних произведениях утверждаются сила и воля, в других разоблачается общество, превращающее человека в товар. Приключенческий сюжет становится формой социального и философского анализа."
    },
    {
      "title": "Новая литература подвергает критике американскую мечту",
      "proof": "История успеха всё чаще изображается как зависимость от денег, случая и общественной системы. Карьера может требовать нравственного компромисса, а богатство не гарантирует свободы. Эта проблематика станет центральной для литературы США XX века."
    }
  ],
  "67": [
    {
      "title": "Марк Твен обновляет американскую прозу живой разговорной речью",
      "proof": "Он вводит диалекты, просторечие, неправильные грамматические формы и интонации устного рассказа. Речь персонажа передаёт его происхождение, образование и отношение к миру. Благодаря этому американская жизнь звучит в литературе собственными голосами."
    },
    {
      "title": "Твен использует маску простодушного рассказчика",
      "proof": "Рассказчик может не понимать истинного смысла события и воспринимать нелепость как норму. Читатель замечает противоречие между его словами и происходящим. Такая форма позволяет сатире возникать без прямого авторского обличения."
    },
    {
      "title": "Юмор строится на преувеличении и столкновении разных логик",
      "proof": "Герой последовательно развивает ошибочную мысль, буквальное понимание сталкивается с переносным, а бытовая ситуация неожиданно достигает абсурда. Комизм показывает ограниченность привычного здравого смысла и условность общественных правил."
    },
    {
      "title": "«Приключения Тома Сойера» соединяют детскую свободу и сатиру на взрослый мир",
      "proof": "Том превращает наказание — покраску забора — в желанное развлечение и заставляет других платить за возможность работать. Эпизод раскрывает его изобретательность, но одновременно пародирует взрослые механизмы рекламы, обмена и социального престижа."
    },
    {
      "title": "«Приключения Гекльберри Финна» строятся как нравственное взросление героя",
      "proof": "Гек усваивает расистские нормы общества и считает помощь беглому рабу грехом. Однако дружба с Джимом заставляет его довериться собственному человеческому чувству. Решение помочь Джиму вопреки официальной морали становится центральным нравственным выбором романа."
    },
    {
      "title": "Детский взгляд обнаруживает противоречие между моралью и человечностью",
      "proof": "Гек не владеет сложными теориями, но видит реальное поведение людей. Респектабельные взрослые поддерживают рабство, участвуют в кровной мести и легко поддаются обману. Наивность героя оказывается нравственно точнее общественного авторитета."
    },
    {
      "title": "Река Миссисипи противопоставлена береговому обществу",
      "proof": "На плоту Гек и Джим временно создают пространство дружбы и относительной свободы. На берегу они сталкиваются с насилием, жадностью, религиозным лицемерием и социальной иерархией. Однако река не является полным спасением: она постоянно возвращает героев к обществу."
    },
    {
      "title": "Образы короля и герцога раскрывают доверчивость и жажду зрелища",
      "proof": "Мошенники успешно обманывают людей, потому что используют их тщеславие, любопытство и стремление к лёгкой выгоде. Сатира направлена не только против обманщиков, но и против общества, которое готово принять ложь, если она соответствует его желаниям."
    },
    {
      "title": "Поздняя сатира Твена становится более мрачной",
      "proof": "Писатель всё сильнее сомневается в разумности цивилизации, политическом прогрессе и нравственной природе человека. Комизм сохраняется, но приобретает горький характер. Смех перестаёт обещать простое исправление общества."
    }
  ],
  "68": [
    {
      "title": "Художественный метод Лондона соединяет реализм, натурализм и неоромантизм",
      "proof": "Писатель подробно изображает труд, голод, холод, городскую бедность и борьбу за существование, что сближает его с реализмом и натурализмом. Одновременно его герои действуют в исключительных обстоятельствах, проходят испытания и обладают сильной волей, что связано с неоромантической традицией."
    },
    {
      "title": "Биографический опыт определяет достоверность его произведений",
      "proof": "Лондон сменил множество профессий, пережил бедность, участвовал в золотой лихорадке и знал тяжёлый физический труд. Поэтому морская жизнь, Север, фабрика и социальное дно описаны с конкретным знанием условий. Личный опыт перерабатывается в художественное исследование общества и человека."
    },
    {
      "title": "Северные рассказы строятся на конфликте человека и природы",
      "proof": "Мороз, голод, расстояние и одиночество проверяют реальные возможности героя. Природа не является злой силой и не мстит человеку. Она равнодушна к его желаниям, поэтому выживание зависит от знания, дисциплины и способности правильно оценить опасность."
    },
    {
      "title": "Рассказ «Любовь к жизни» утверждает инстинкт самосохранения и внутреннюю стойкость",
      "proof": "Изнемогающий герой остаётся один в безлюдном пространстве, терпит голод и преследование волка. Он выживает не благодаря героической позе, а благодаря последовательному сопротивлению смерти. Название подчёркивает первичную ценность самого существования."
    },
    {
      "title": "«Развести костёр» показывает трагедию самоуверенности",
      "proof": "Герой обладает практическими навыками, но недооценивает силу мороза и пренебрегает советами более опытных людей. Его поражение связано не только с природой, но и с ограниченностью собственного мышления. Собака точнее чувствует опасность, потому что не подменяет инстинкт самоуверенной теорией."
    },
    {
      "title": "Образы животных позволяют исследовать границу природы и цивилизации",
      "proof": "В «Зове предков» Бэк проходит путь от домашней собаки к жизни в дикой природе. Жестокая среда пробуждает древние инстинкты, но герой сохраняет способность к преданности. В «Белом Клыке» происходит обратное движение: дикое животное постепенно учится доверять человеку."
    },
    {
      "title": "Мартин Иден воплощает противоречие индивидуализма и общественного успеха",
      "proof": "Герой стремится к знанию и литературному признанию, преодолевая бедность и отсутствие образования. Когда успех приходит, Мартин видит, что общество ценит не его личность и произведения, а созданную репутацию. Победа оказывается духовно пустой."
    },
    {
      "title": "Роман «Мартин Иден» критикует миф о самостоятельном успехе",
      "proof": "Герой убеждён, что сильная личность способна одна подняться над средой. Однако его образование, любовь, издательский рынок и общественное признание зависят от социальных отношений. Лондон показывает, что крайний индивидуализм ведёт не к свободе, а к одиночеству."
    },
    {
      "title": "Социалистическая проблематика раскрывает зависимость человека от общественного устройства",
      "proof": "В «Железной пяте» власть капитала превращается в политическую диктатуру. Писатель показывает, что экономическое неравенство способно уничтожить демократические институты. При этом его интерес к сильной личности вступает в сложное противоречие с идеей коллективной борьбы."
    },
    {
      "title": "Центральный герой Лондона — деятельная личность, проходящая проверку пределом",
      "proof": "Такой герой не остаётся пассивным наблюдателем. Он работает, борется, учится и пытается изменить судьбу. Однако произведения Лондона показывают, что одной силы недостаточно: необходимы знание, нравственная цель и способность понимать условия, в которых действует человек."
    }
  ],
  "69": [
    {
      "title": "Первая мировая война разрушила прежние представления о прогрессе и героике",
      "proof": "До войны европейская культура часто связывала развитие техники, науки и государства с движением к лучшему будущему. Массовая гибель, применение пулемётов, артиллерии, авиации и химического оружия показали, что технический прогресс может служить уничтожению. В литературе война всё реже изображается как пространство славы и всё чаще — как система бессмысленного насилия."
    },
    {
      "title": "Главным объектом изображения становится опыт рядового солдата",
      "proof": "Писатели сосредоточиваются на человеке, который испытывает страх, голод, холод, усталость и потерю товарищей. Историческая панорама уступает место телесному и психологическому опыту. Война раскрывается снизу — через окоп, госпиталь, марш, грязь и ожидание смерти."
    },
    {
      "title": "Возникает конфликт между официальной риторикой и реальным опытом фронта",
      "proof": "Пропаганда говорит о долге, чести и национальном величии, тогда как солдат видит случайную смерть и бессмысленность приказов. Литература разоблачает высокий язык, который скрывает действительное содержание войны. Отсюда особая роль иронии, сдержанности и конкретной детали."
    },
    {
      "title": "Английская фронтовая поэзия разрушает героический миф о войне",
      "proof": "Уилфред Оуэн изображает физическое страдание солдат и разоблачает представление о прекрасной смерти за родину. В стихотворении «Dulce et Decorum Est» газовая атака показана как мучительная и хаотическая гибель, а античная формула о сладости смерти за отечество называется ложью. Зигфрид Сассун соединяет фронтовое свидетельство с сатирой на генералов, тыловое общество и патриотическую риторику."
    },
    {
      "title": "Поэзия Гийома Аполлинера соединяет военный опыт с модернистским экспериментом",
      "proof": "Аполлинер воспринимает войну одновременно как историческую катастрофу и как новый, страшный опыт современности. В его стихах фронтовые впечатления соединяются с монтажом, визуальной формой и неожиданными образами. Это показывает, что война меняет не только тематику, но и сам язык поэзии."
    },
    {
      "title": "Мотив утраты поколения становится одним из центральных",
      "proof": "Молодые люди уходят на фронт до того, как успевают сформировать мирную биографию. После возвращения они не могут продолжить прежнюю жизнь, потому что их опыт непонятен тем, кто остался в тылу. Война разрушает не только тела, но и способность верить в устойчивые ценности."
    },
    {
      "title": "Фронтовое товарищество противопоставляется государству и идеологии",
      "proof": "Солдатская солидарность возникает из общей опасности, а не из политических лозунгов. Товарищ становится важнее отвлечённой национальной идеи. В произведениях Ремарка и Хемингуэя именно человеческая близость временно защищает героя от обезличивающей военной машины."
    },
    {
      "title": "Антивоенная литература показывает универсальность человеческого страдания",
      "proof": "Солдаты противоборствующих армий изображаются как люди, оказавшиеся в одинаковой ситуации. В романе Ремарка «На Западном фронте без перемен» Пауль Боймер, оказавшись в воронке рядом с умирающим французским солдатом, понимает, что убил человека с именем, семьёй и собственной жизнью. Образ врага перестаёт быть отвлечённым."
    },
    {
      "title": "Война меняет художественную форму",
      "proof": "Линейное и торжественное повествование оказывается недостаточным для передачи травматического опыта. Писатели используют фрагментарность, монтаж, обрывочные воспоминания, повторы и внутренний монолог. Разрушенная композиция соответствует разрушенному сознанию и распаду привычной картины мира."
    },
    {
      "title": "Литература о войне развивается в разных художественных направлениях",
      "proof": "Реализм и натурализм передают материальную правду фронта, экспрессионизм усиливает образ катастрофы и обезличивания, модернизм исследует память и травму. Различие методов не отменяет общего стремления заново определить ценность человеческой жизни."
    },
    {
      "title": "Первая мировая война становится границей между культурными эпохами",
      "proof": "После войны европейская литература уже не может полностью восстановить прежнюю уверенность в порядке, разуме и нравственном авторитете цивилизации. Темы отчуждения, исторической катастрофы, утраченного поколения и кризиса личности определяют значительную часть литературы XX века."
    }
  ],
  "70": [
    {
      "title": "«Потерянное поколение» — это поколение, чьё становление было разрушено войной",
      "proof": "Молодые люди ушли на фронт, не успев обрести профессию, семью и устойчивые жизненные ориентиры. После возвращения они обнаружили, что мирная жизнь не учитывает их опыт. Слово «потерянное» обозначает не отсутствие нравственных качеств, а утрату исторического и духовного дома."
    },
    {
      "title": "Герой «потерянного поколения» внешне сдержан, но внутренне травмирован",
      "proof": "Он редко произносит патетические речи и не стремится подробно объяснять собственную боль. Травма проявляется в молчании, бессоннице, алкоголе, неспособности строить долгие отношения и постоянном ощущении внутренней пустоты."
    },
    {
      "title": "Хемингуэй создаёт поэтику недосказанности",
      "proof": "Его «принцип айсберга» предполагает, что главное содержание не высказывается прямо. В диалоге герои говорят о бытовом, но за короткими репликами скрываются страх, утрата и невозможность выразить пережитое. Сдержанный стиль соответствует сознанию человека, который не доверяет высоким словам."
    },
    {
      "title": "«И восходит солнце» показывает послевоенную жизнь как движение без цели",
      "proof": "Джейк Барнс и его друзья путешествуют, пьют, посещают праздники и пытаются заполнить внутреннюю пустоту. Внешняя активность не ведёт к развитию. Любовь Джейка и Бретт невозможна, а повторяющийся образ восходящего солнца подчёркивает контраст между вечным природным циклом и потерянностью людей."
    },
    {
      "title": "В романе «Прощай, оружие!» личная любовь противопоставляется войне",
      "proof": "Фредерик Генри постепенно теряет доверие к военной риторике и дезертирует после хаоса отступления. Его попытка создать частный мир с Кэтрин кажется выходом из исторической катастрофы. Однако смерть Кэтрин показывает, что личное счастье не защищено от случайности и разрушения."
    },
    {
      "title": "Ремарк раскрывает уничтожение поколения изнутри солдатского братства",
      "proof": "В романе «На Западном фронте без перемен» школьники уходят на войну под влиянием патриотических речей учителя. Фронт быстро разрушает эти представления. Их настоящей опорой становится не государство, а товарищество, совместная пища и взаимная помощь."
    },
    {
      "title": "Возвращение домой не восстанавливает прежнюю личность",
      "proof": "Пауль Боймер в отпуске не может объяснить близким, что пережил. Дом остаётся знакомым, но он сам уже другой. Разрыв между фронтом и тылом показывает, что солдат потерял не только друзей, но и возможность естественно принадлежать мирной жизни."
    },
    {
      "title": "Олдингтон соединяет антивоенную проблематику с сатирой на английское общество",
      "proof": "В романе «Смерть героя» судьба Джорджа Уинтерборна показана на фоне буржуазной семьи, ложной морали и патриотической пропаганды. Война становится итогом культуры, которая заранее подавляла личность. Авторский гнев направлен не только на фронт, но и на общество, подготовившее катастрофу."
    },
    {
      "title": "Любовь и дружба становятся последними возможными ценностями",
      "proof": "Герои не верят в официальные идеалы, но сохраняют способность к привязанности, взаимной помощи и частной верности. Эти связи хрупки и часто обречены, однако именно они позволяют человеку не раствориться полностью в бессмысленности."
    },
    {
      "title": "Различие авторов связано со способом выражения травмы",
      "proof": "Хемингуэй использует лаконизм и недосказанность, Ремарк — эмоциональную фронтовую хронику и мотив товарищества, Олдингтон — сатирическую и публицистическую резкость. Их объединяет отказ от героизации войны и внимание к судьбе уничтоженного поколения."
    }
  ],
  "71": [
    {
      "title": "Модернизм возникает из кризиса традиционного представления о мире и человеке",
      "proof": "Исторические катастрофы, урбанизация, новые философские и психологические теории поставили под сомнение устойчивость личности и объективность реальности. Писатели уже не считают, что мир можно полностью объяснить последовательным сюжетом и внешней причинностью."
    },
    {
      "title": "Центр повествования переносится с события на работу сознания",
      "proof": "Главным материалом становится восприятие: память, ассоциация, страх, телесное ощущение и внутренний монолог. Событие важно не столько само по себе, сколько в том виде, в каком оно существует в сознании героя."
    },
    {
      "title": "Субъективное время заменяет простую хронологию",
      "proof": "Несколько секунд могут вызвать длинную цепь воспоминаний, а годы соединяются одним ощущением. Модернистский текст показывает, что человек живёт одновременно в настоящем и прошлом. Время перестаёт быть ровной последовательностью."
    },
    {
      "title": "Пруст раскрывает память как творческую силу",
      "proof": "В цикле «В поисках утраченного времени» вкус пирожного мадлен вызывает у героя непроизвольное воспоминание о Комбре. Прошлое возвращается не через сознательное усилие, а через чувственное впечатление. Память не просто сохраняет жизнь, а заново создаёт её смысл."
    },
    {
      "title": "Джойс использует поток сознания и мифологический параллелизм",
      "proof": "В «Улиссе» один день Леопольда Блума сопоставлен со странствиями Одиссея. Обычные городские события получают эпический масштаб, а античный миф обнаруживается внутри повседневности. Повествование меняет стиль и приближается к движению мысли до её логического оформления."
    },
    {
      "title": "Внутренний монолог разрушает привычную авторскую власть",
      "proof": "Читатель получает не готовое объяснение героя, а поток впечатлений, обрывков фраз, воспоминаний и телесных реакций. Сознание не подчиняется строгой грамматике и последовательности. Интерпретация становится задачей самого читателя."
    },
    {
      "title": "Кафка создаёт мир необъяснимого закона и отчуждения",
      "proof": "В «Процессе» Йозеф К. оказывается обвинённым, но не узнаёт сущности вины и правил суда. Бюрократическая система существует повсюду, но не имеет ясного центра. Реальность внешне точна, однако её логика остаётся недоступной человеку."
    },
    {
      "title": "Фантастическое у Кафки подаётся как обыденное",
      "proof": "Превращение Грегора Замзы в насекомое не сопровождается подробным объяснением. Герой прежде всего думает о работе и опоздании. Спокойный тон усиливает ужас, потому что невозможное включается в обычный порядок жизни."
    },
    {
      "title": "Модернизм обновляет язык и композицию",
      "proof": "Писатели используют монтаж, цитаты, смену стилей, фрагментарность, повтор мотивов и ненадёжного рассказчика. Произведение не только рассказывает историю, но и исследует возможности и пределы самого языка."
    },
    {
      "title": "Читатель становится активным участником создания смысла",
      "proof": "Модернистский текст не всегда объясняет связи между фрагментами и не предлагает единственной трактовки. Читатель должен восстанавливать структуру, сопоставлять мотивы и различать уровни сознания. Сложность становится принципом формы, а не случайным препятствием."
    }
  ],
  "72": [
    {
      "title": "Литература социалистической ориентации связывает искусство с анализом общественной несправедливости",
      "proof": "Писатели рассматривают бедность, войну, эксплуатацию и классовое неравенство не как отдельные несчастья, а как следствие устройства общества. Литература должна не только изображать страдание, но и раскрывать его исторические и социальные причины."
    },
    {
      "title": "Центральным становится образ коллектива",
      "proof": "Вместо исключительного героя на первый план выходят рабочие, солдаты, участники забастовок и революционных движений. Личность раскрывается через её отношение к другим и готовность участвовать в общем деле. Коллектив может становиться самостоятельным действующим лицом произведения."
    },
    {
      "title": "Анри Барбюс приходит к социалистическим взглядам через опыт Первой мировой войны",
      "proof": "Роман «Огонь» основан на фронтовых наблюдениях автора. Солдаты показаны как обычные люди разных профессий и характеров, которых объединяют грязь, страх и угроза смерти. Война постепенно понимается ими как результат политических и экономических интересов, чуждых самим участникам."
    },
    {
      "title": "Документальность «Огня» соединяется с идейным обобщением",
      "proof": "Бытовые подробности окопа, разговорная речь, голод и физическое истощение создают ощущение свидетельства. Однако отдельный фронтовой эпизод ведёт к более широкому выводу о необходимости изменить общество, которое превращает людей в материал войны."
    },
    {
      "title": "Барбюс связывает антивоенный протест с идеей коллективного действия",
      "proof": "Солдаты постепенно осознают общность своего положения и понимают, что личное спасение невозможно без изменения общественной системы. Поэтому антивоенная тема в его творчестве переходит в революционную и социалистическую проблематику."
    },
    {
      "title": "Ромен Роллан сближается с литературой социалистической ориентации через интернациональный гуманизм",
      "proof": "Роллана нельзя полностью сводить к партийной или революционно-социалистической эстетике. Основой его позиции остаётся гуманизм, защита культурного единства Европы и нравственная независимость личности. Однако его антивоенная деятельность, интерес к общественному освобождению и критика буржуазного индивидуализма сближают его с левыми идеями."
    },
    {
      "title": "Роллан утверждает нравственную ответственность интеллигенции",
      "proof": "В годы национальной вражды художник, по его убеждению, должен сохранять верность правде и человеческой солидарности. Позиция «над схваткой» означает не безразличие, а отказ подчинять нравственную оценку национальной пропаганде."
    },
    {
      "title": "«Жан-Кристоф» соединяет судьбу художника и европейскую историю",
      "proof": "Музыкант Жан-Кристоф проходит через личные кризисы, конфликты с обществом и знакомство с разными национальными культурами. Его творчество становится способом преодоления границ и вражды. Искусство связывается с нравственным служением человечеству."
    },
    {
      "title": "В более позднем творчестве Роллана усиливается интерес к революционной истории",
      "proof": "В цикле «Очарованная душа» и общественной деятельности писателя возрастает внимание к социальному освобождению, массовому движению и ответственности личности перед историей. Однако даже здесь Роллан сохраняет самостоятельную гуманистическую позицию и не растворяет человека в политической доктрине."
    },
    {
      "title": "Литература социалистической ориентации сочетает реализм и публицистичность",
      "proof": "Социальная среда и исторический конфликт изображаются конкретно, но авторская позиция часто выражена открыто. Повествование может включать политическое рассуждение, документ, обращение и призыв. Это отличает такую литературу от эстетики безличного автора."
    },
    {
      "title": "Идейная направленность создаёт и художественные возможности, и опасность схематизма",
      "proof": "Ясная общественная позиция позволяет раскрывать массовую историю и связь личности с системой. Однако при подчинении персонажа готовой доктрине характер может превратиться в иллюстрацию. Наиболее значительные произведения сохраняют внутренние противоречия героя и сложность исторического выбора."
    }
  ],
  "73": [
    {
      "title": "Брехт противопоставляет эпический театр традиционной драме сопереживания",
      "proof": "Традиционный театр стремится заставить зрителя забыть об условности сцены и эмоционально слиться с героем. Брехт хочет сохранить критическую дистанцию. Зритель должен не только чувствовать, но и анализировать причины события и возможность иного исхода."
    },
    {
      "title": "Эффект отчуждения разрушает сценическую иллюзию",
      "proof": "Актёр может обращаться к публике, комментировать роль или показывать персонажа со стороны. На сцене используются плакаты, надписи, песни и открытая смена декораций. Театр не скрывает, что является представлением, и тем самым мешает пассивному погружению."
    },
    {
      "title": "Эпизодическая композиция заменяет непрерывную интригу",
      "proof": "Пьеса строится как последовательность относительно самостоятельных сцен. Каждая представляет отдельную социальную ситуацию и может сопровождаться заголовком, заранее сообщающим результат. Интерес переносится с вопроса «что произойдёт?» на вопрос «почему это произошло?»."
    },
    {
      "title": "Песня выполняет функцию комментария",
      "proof": "Музыкальный номер не обязательно продолжает эмоциональное состояние героя. Он может прерывать действие, обобщать ситуацию или противоречить происходящему. Песня создаёт дистанцию и помогает зрителю увидеть социальный механизм за личной драмой."
    },
    {
      "title": "Историзация позволяет посмотреть на современность со стороны",
      "proof": "Брехт переносит действие в другую страну или эпоху, но сохраняет узнаваемые общественные конфликты. Историческая дистанция показывает, что существующий порядок не является естественным и вечным. Если общество когда-то возникло, оно может быть изменено."
    },
    {
      "title": "«Мамаша Кураж и её дети» разоблачает возможность обогащения на войне",
      "proof": "Кураж следует за армией с торговой повозкой и пытается заработать на военном конфликте. Она понимает опасность войны, но не может отказаться от прибыли. В результате последовательно теряет детей, однако продолжает тянуть повозку. Этот финал показывает силу системы, которую героиня одновременно осуждает и поддерживает."
    },
    {
      "title": "Противоречивый герой должен вызывать не только сочувствие, но и оценку",
      "proof": "Мамаша Кураж любит детей и обладает жизненной энергией, однако её торговая стратегия связывает семью с войной. Зритель видит не злодея, а человека, чьи решения определяются общественными обстоятельствами. Сочувствие не отменяет вопроса об ответственности."
    },
    {
      "title": "«Добрый человек из Сычуани» исследует невозможность частной доброты в несправедливом обществе",
      "proof": "Шен Те хочет помогать людям, но окружающие быстро используют её доброту. Для защиты она создаёт образ жёсткого двоюродного брата Шуй Та. Раздвоение показывает, что нравственная личность вынуждена становиться жестокой, чтобы выжить внутри определённой экономической системы."
    },
    {
      "title": "Открытый финал переносит решение к зрителю",
      "proof": "Пьеса не восстанавливает гармонию и не предлагает удобного морального завершения. В финале «Доброго человека из Сычуани» прямо признаётся отсутствие готового выхода. Зритель должен сам продолжить размышление и искать общественное, а не только личное решение."
    },
    {
      "title": "Эпический театр стремится показать изменяемость мира",
      "proof": "Брехт отвергает представление о человеческом характере и общественном порядке как о неизменных. Поведение зависит от условий, а условия могут быть преобразованы. Театр становится не отражением судьбы, а лабораторией социального мышления."
    }
  ],
  "74": [
    {
      "title": "Художественный мир Кафки строится на столкновении человека с непостижимым порядком",
      "proof": "Герой оказывается внутри системы, законы которой существуют и действуют, но не могут быть поняты. Он пытается выяснить причину происходящего, найти нужного чиновника, доказать собственную правоту или выполнить предъявленное требование, однако каждая попытка только глубже вовлекает его в механизм власти."
    },
    {
      "title": "Фантастическое событие изображается как часть обыденности",
      "proof": "В «Превращении» Грегор Замза обнаруживает, что стал огромным насекомым. Рассказчик не объясняет причину метаморфозы и не подчёркивает её невероятность. Сам Грегор прежде всего беспокоится об опоздании на работу. Спокойная повествовательная интонация делает невозможное особенно тревожным."
    },
    {
      "title": "Пространство у Кафки выражает несвободу и недостижимость цели",
      "proof": "Комнаты, коридоры, лестницы, канцелярии и чердаки образуют лабиринт. В «Процессе» судебные учреждения скрываются в жилых домах, а в «Замке» землемер К. постоянно приближается к центру власти, но не может получить к нему прямой доступ. Пространство показывает невозможность установить ясную связь между человеком и системой."
    },
    {
      "title": "Власть лишена видимого единого центра",
      "proof": "Йозефа К. арестовывают служащие, которые сами не знают смысла обвинения. Судебные чиновники подчиняются более высоким инстанциям, но никто не способен указать окончательный источник решения. Такая власть особенно сильна, потому что человек не понимает, с кем и по каким правилам должен бороться."
    },
    {
      "title": "Герой постепенно усваивает навязанное ему чувство вины",
      "proof": "Йозеф К. сначала уверен в абсурдности процесса и пытается относиться к нему с иронией. Однако со временем дело занимает всё его сознание. Не зная обвинения, он начинает искать собственную ошибку и воспринимать суд как нечто почти естественное. Внешнее преследование превращается во внутреннее самообвинение."
    },
    {
      "title": "Семья и труд раскрываются как формы отчуждения",
      "proof": "До превращения Грегор содержит родителей и сестру, но его ценность определяется способностью зарабатывать. Когда он теряет возможность работать, семья постепенно перестаёт видеть в нём человека. Забота сменяется стыдом и желанием избавиться от него. Превращение обнаруживает уже существовавшее отчуждение."
    },
    {
      "title": "Язык общения не приводит к взаимопониманию",
      "proof": "Грегор сохраняет человеческое сознание, но окружающие слышат в его речи только непонятные звуки. В «Процессе» длинные объяснения чиновников не проясняют положения героя, а создают новые вопросы. Речь существует, но не соединяет людей и не открывает истины."
    },
    {
      "title": "Притча становится важнейшим принципом кафкианской поэтики",
      "proof": "История «Перед законом», рассказанная священником Йозефу К., изображает человека, который всю жизнь ждёт разрешения войти в предназначенные только для него врата. Сюжет допускает разные трактовки: человек может быть обманут властью, парализован собственным страхом или неспособен принять решение. Притча не даёт окончательного ответа, а сохраняет смысловую тревогу."
    },
    {
      "title": "Комизм и ужас существуют одновременно",
      "proof": "Ситуации Кафки часто абсурдны: серьёзные учреждения располагаются в душных комнатах, чиновники ведут себя мелочно, а официальная процедура превращается в нелепость. Однако смех не освобождает героя. Комическое подчёркивает безвыходность мира, в котором нелепость обладает реальной властью."
    },
    {
      "title": "Финалы показывают поражение героя без полного объяснения его судьбы",
      "proof": "Йозефа К. убивают «как собаку», но читатель так и не узнаёт сущности обвинения. Грегор умирает, после чего семья ощущает облегчение и начинает строить планы на будущее. Катастрофа завершается буднично, что подчёркивает безразличие мира к отдельной личности."
    }
  ],
  "75": [
    {
      "title": "«Волшебная гора» переосмысливает классический роман воспитания",
      "proof": "Ганс Касторп приезжает в санаторий лишь на три недели, но остаётся на семь лет. Его становление происходит не через обычную профессию, семейную жизнь или социальную карьеру, а через болезнь, чтение, философские споры, любовь и размышление о смерти. Воспитание становится интеллектуальным и духовным испытанием."
    },
    {
      "title": "Санаторий представляет собой модель предвоенной Европы",
      "proof": "Бергоф находится выше равнинного мира и кажется отделённым от обычной истории. Однако в нём встречаются разные национальности, идеологии и культурные традиции. Споры пациентов воспроизводят противоречия Европы начала XX века, которые позднее приведут к мировой войне."
    },
    {
      "title": "Пространство горы выводит героя из привычного порядка жизни",
      "proof": "На равнине время связано с работой, обязанностями и практическими целями. В санатории распорядок состоит из измерения температуры, отдыха, еды и медицинских процедур. Ганс теряет прежние ориентиры и получает возможность наблюдать, размышлять и менять собственное отношение к жизни."
    },
    {
      "title": "Время становится центральной философской проблемой романа",
      "proof": "Первые дни пребывания описываются подробно, а затем месяцы и годы начинают сливаться. Повторяющийся распорядок лишает время привычных границ. Ганс ощущает, что продолжительность зависит не только от часов и календаря, но и от наполненности человеческого сознания."
    },
    {
      "title": "Болезнь имеет реальное и символическое значение",
      "proof": "Пациенты действительно страдают туберкулёзом, однако болезнь одновременно связана с повышенной рефлексией, отрывом от практической жизни и кризисом европейской культуры. Санаторий привлекает героя возможностью выйти из обыденности, но длительное пребывание грозит превратить духовный поиск в пассивность."
    },
    {
      "title": "Сеттембрини и Нафта представляют противоположные идеологические позиции",
      "proof": "Сеттембрини защищает разум, гуманизм, прогресс и свободу личности. Нафта соединяет религиозный догматизм, культ насилия и революционную идею. Их споры становятся интеллектуальным воспитанием Ганса, но ни одна система не даёт ему полного ответа."
    },
    {
      "title": "Ганс Касторп учится не принимать готовую идеологию",
      "proof": "Он слушает обоих наставников, испытывает влияние их идей, но сохраняет способность сомневаться. Его развитие состоит не в выборе одной доктрины, а в понимании ограниченности крайних позиций. Герой должен самостоятельно искать связь между разумом, телом, любовью и смертью."
    },
    {
      "title": "Любовь к Клавдии Шоша становится частью познания жизни",
      "proof": "Клавдия привлекает Ганса свободой поведения, телесностью и сходством с его юношеским другом. Чувство нарушает привычную дисциплину героя и открывает ему сферу желания. Однако любовь не приводит к устойчивому союзу и остаётся опытом внутреннего пробуждения."
    },
    {
      "title": "Эпизод «Снег» формулирует важнейший нравственный вывод",
      "proof": "Заблудившись в снежной буре, Ганс видит сон, где гармоническая человеческая жизнь внезапно соседствует с жестоким ритуалом. Он приходит к мысли, что человек должен помнить о смерти, но не позволять ей господствовать над мыслями. Любовь и человечность должны быть сильнее притяжения разрушения."
    },
    {
      "title": "Финал связывает личное становление с исторической катастрофой",
      "proof": "Ганс покидает санаторий не ради мирной зрелой жизни, а уходит на фронт Первой мировой войны. Роман не сообщает, выживет ли он. Его воспитание проверяется историей, а судьба отдельного героя растворяется в судьбе европейского поколения."
    }
  ],
  "76": [
    {
      "title": "Ивлин Во изображает современное общество как мир разрушенных ценностей",
      "proof": "В его романах традиционные понятия образования, чести, семьи, религии и общественной службы сохраняют внешнюю форму, но утрачивают внутреннее содержание. Персонажи продолжают соблюдать правила приличия, хотя их поступки определяются выгодой, скукой и равнодушием."
    },
    {
      "title": "Сатира Во строится на столкновении наивного героя и абсурдного общества",
      "proof": "Герой нередко пытается действовать разумно, однако окружающий мир воспринимает нормальное поведение как странность. В романе «Упадок и разрушение» Пол Пеннифезер случайно оказывается исключённым из университета, после чего его жизнь начинает зависеть от нелепых решений и чужих прихотей."
    },
    {
      "title": "Общество у Во действует по логике случайности и социального произвола",
      "proof": "Карьера, репутация и даже свобода героя зависят не от заслуг, а от совпадений, знакомств и положения в обществе. Пол может мгновенно потерять место, попасть в тюрьму, а затем вернуться к прежней жизни. Случайность разоблачает иллюзию разумного и справедливого устройства мира."
    },
    {
      "title": "Спокойная повествовательная интонация усиливает сатирический эффект",
      "proof": "Нелепые и жестокие события описываются без патетики, словно являются обычной частью светской жизни. Рассказчик не выражает прямого возмущения, поэтому безразличие общества становится особенно заметным. Чем спокойнее тон, тем резче ощущается нравственный абсурд."
    },
    {
      "title": "Социальные институты изображаются как механизмы, не выполняющие заявленной функции",
      "proof": "Школа не воспитывает, университет не защищает знания, суд не устанавливает справедливость, а пресса не сообщает правду. Каждый институт заботится прежде всего о собственной репутации и существовании. Человек должен приспосабливаться не к смыслу закона, а к процедуре."
    },
    {
      "title": "Роман «Сенсация» раскрывает механизм производства новостей",
      "proof": "Из-за редакционной ошибки неопытного Уильяма Бутта отправляют военным корреспондентом в африканскую страну. Газете важнее получить эффектный материал, чем понять реальную политическую ситуацию. Новость создаётся не как отражение события, а как товар, рассчитанный на ожидания читателя."
    },
    {
      "title": "Сатирические персонажи напоминают социальные маски",
      "proof": "Во намеренно подчёркивает одну доминирующую черту: карьеризм, праздность, самодовольство или профессиональную некомпетентность. Однако гротескный персонаж не выпадает из реальности. Его поведение оказывается нормальным внутри общества, где статус и маска важнее личности."
    },
    {
      "title": "Ранние романы Во разоблачают современность через гротеск и фарс",
      "proof": "«Упадок и разрушение», «Мерзкая плоть» и «Сенсация» строятся на стремительной смене событий, случайностях и резких поворотах. Герой не успевает осмыслить происходящее, а общество предстаёт как бесконечный светский спектакль, лишённый устойчивого нравственного центра."
    },
    {
      "title": "«Возвращение в Брайдсхед» показывает эволюцию Во от чистой сатиры к ностальгической и религиозной прозе",
      "proof": "В этом романе ирония сохраняется, но уже не определяет всю художественную систему. Автор обращается к памяти, вере, исчезающему аристократическому миру и духовному поиску. Поэтому «Возвращение в Брайдсхед» нельзя считать типичным сатирическим романом раннего Во: это свидетельство усложнения его мировоззрения."
    },
    {
      "title": "Сатира Во не предлагает простой программы исправления общества",
      "proof": "Герои редко способны изменить окружающий порядок. Они приспосабливаются, уходят в частную жизнь или снова включаются в тот же механизм. Писатель фиксирует устойчивость общественного абсурда и ограниченность индивидуального сопротивления."
    }
  ],
  "77": [
    {
      "title": "Английская литература 1920-х годов отказывается от традиционной реалистической модели",
      "proof": "Последовательный сюжет, всезнающий рассказчик и подробная социальная биография уже не воспринимаются как достаточные средства изображения человека. Писатели обращаются к внутреннему времени, телесному опыту, фрагментарному сознанию и интеллектуальному эксперименту."
    },
    {
      "title": "Общим объектом исследования становится кризис современной личности",
      "proof": "Герой ощущает отчуждение от общества, собственных чувств и природной жизни. Внешнее благополучие не устраняет внутренней пустоты. Первая мировая война, механизация и массовая культура усиливают ощущение разрыва между человеком и миром."
    },
    {
      "title": "Вирджиния Вулф переносит центр романа во внутреннее сознание",
      "proof": "Внешнее событие у неё может занимать один день, но включает множество воспоминаний, ассоциаций и точек зрения. В романе «Миссис Дэллоуэй» подготовка к вечернему приёму соединяется с переживаниями Клариссы, Септимуса и других персонажей."
    },
    {
      "title": "Поток сознания воспроизводит нелинейное движение мысли",
      "proof": "Настоящее постоянно вызывает прошлое, одна деталь переключает внимание на другое время, а сознания разных героев незаметно сменяют друг друга. Повествование показывает не готовую мысль, а сам процесс её возникновения."
    },
    {
      "title": "Время у Вулф имеет одновременно внешний и внутренний характер",
      "proof": "Бой Биг-Бена отмечает объективное движение дня, но каждый персонаж переживает этот день по-своему. Несколько секунд могут вместить десятилетия памяти. Внешний городской ритм соединяется с индивидуальной биографией."
    },
    {
      "title": "Образ Септимуса раскрывает послевоенную травму",
      "proof": "Септимус возвращается с фронта и не способен восстановить нормальную связь с миром. Его видения и эмоциональное оцепенение врачи воспринимают как отклонение, которое следует подавить. Параллель между ним и Клариссой показывает скрытую близость внешне благополучной жизни и внутреннего чувства смерти."
    },
    {
      "title": "Олдос Хаксли развивает интеллектуальный и сатирический роман 1920-х годов",
      "proof": "В «Жёлтом Кроме» писатель создаёт замкнутое общество, где персонажи воплощают разные интеллектуальные, эстетические и научные позиции. Их разговоры раскрывают духовную усталость и самоизоляцию образованной элиты. Сюжет уступает место ироническому столкновению идей."
    },
    {
      "title": "«Контрапункт» обновляет композицию романа по музыкальному принципу",
      "proof": "Несколько сюжетных линий и мировоззренческих голосов развиваются одновременно, подобно партиям в музыкальном произведении. Персонажи не подчинены единому авторскому выводу. Композиция передаёт множественность и разобщённость современного сознания."
    },
    {
      "title": "Сатира Хаксли направлена против духовной специализации и интеллектуального самообмана",
      "proof": "Его герои нередко обладают развитым умом, но оказываются эмоционально беспомощными. Научная, философская или эстетическая система не даёт им цельности. Интеллект превращается в средство бегства от жизни."
    },
    {
      "title": "Роман «О дивный новый мир» продолжает эти поиски уже в следующем десятилетии",
      "proof": "Антиутопия 1932 года не относится непосредственно к литературе 1920-х годов, поэтому не должна служить основным примером этого билета. Однако она продолжает темы, сформировавшиеся в ранней прозе Хаксли: духовную стандартизацию, власть массовой культуры и конфликт свободы с социальной стабильностью."
    },
    {
      "title": "Лоуренс противопоставляет рациональной цивилизации телесную и эмоциональную целостность",
      "proof": "Он показывает человека как существо, чья жизнь определяется не только сознательными решениями, но и телом, желанием, природным ритмом. Подавление чувственности ведёт к агрессии, отчуждению и внутреннему распаду."
    },
    {
      "title": "Семейный и любовный конфликт у Лоуренса получает философское значение",
      "proof": "В романе «Сыновья и любовники» сильная связь Пола Морела с матерью затрудняет его отношения с другими женщинами. Психологический конфликт связан с классовой средой, семейной властью и неспособностью героя обрести самостоятельную эмоциональную жизнь."
    },
    {
      "title": "Три автора предлагают разные способы обновления романа",
      "proof": "Вулф исследует поток сознания и субъективное время, Хаксли строит интеллектуальный полифонический роман, Лоуренс раскрывает телесность и глубинные эмоциональные связи. Их объединяет отказ сводить человека к внешней социальной биографии."
    }
  ],
  "78": [
    {
      "title": "Антиутопия изображает общество, в котором проект совершенного порядка превращается в систему подавления",
      "proof": "В отличие от классической утопии, антиутопия показывает цену всеобщей гармонии. Государство обещает безопасность, равенство или стабильность, но достигает их через контроль над личностью, языком, памятью и частной жизнью."
    },
    {
      "title": "Оруэлл связывает антиутопию с анализом реальных политических механизмов",
      "proof": "Его произведения не являются отвлечённой фантазией о далёком будущем. Пропаганда, культ вождя, переписывание истории, массовая слежка и политический террор имеют основания в опыте тоталитарных режимов XX века. Художественное преувеличение выявляет логику реальной власти."
    },
    {
      "title": "«Скотный двор» использует форму сатирической аллегории",
      "proof": "Животные свергают хозяина и провозглашают равенство, но свиньи постепенно присваивают власть и привилегии. История революции превращается в историю возникновения новой диктатуры. Простая сказочная форма делает политический механизм особенно ясным."
    },
    {
      "title": "Изменение заповедей показывает власть над исторической памятью",
      "proof": "Правила, написанные после восстания, постепенно переписываются в интересах свиней. Животные чувствуют противоречие, но не могут точно восстановить первоначальный текст. Власть удерживается не только насилием, но и уничтожением возможности сравнить настоящее с прошлым."
    },
    {
      "title": "Формула равенства превращается в оправдание неравенства",
      "proof": "Итоговая заповедь утверждает, что все животные равны, но некоторые «равнее других». Логически невозможная фраза принимается как норма. Язык перестаёт описывать действительность и начинает скрывать её противоречия."
    },
    {
      "title": "В романе «1984» контроль охватывает внешнее поведение и внутреннее сознание",
      "proof": "Телеэкраны наблюдают за людьми, полиция мыслей преследует сомнение, а государство требует не только подчинения, но и искренней любви к Большому Брату. Частная мысль становится преступлением, потому что сохраняет пространство независимости."
    },
    {
      "title": "Новояз ограничивает возможность критического мышления",
      "proof": "Словарь постепенно сокращается, сложные понятия исчезают, а противоречивые явления обозначаются готовыми формулами. Цель новояза состоит в том, чтобы сделать преступную мысль не просто опасной, а грамматически невозможной. Контроль над языком становится контролем над сознанием."
    },
    {
      "title": "Двоемыслие разрушает логическую связь человека с реальностью",
      "proof": "Гражданин должен одновременно принимать два противоречащих утверждения и забывать сам факт противоречия. Лозунги «Война — это мир», «Свобода — это рабство» и «Незнание — сила» учат подчинять восприятие политической необходимости."
    },
    {
      "title": "Любовь Уинстона и Джулии становится формой сопротивления",
      "proof": "Их отношения создают временное пространство доверия, телесности и личной памяти. Сам выбор другого человека противостоит государству, которое требует полной эмоциональной принадлежности. Однако частное сопротивление оказывается уязвимым перед системой пытки и контроля."
    },
    {
      "title": "Комната 101 уничтожает индивидуальное ядро личности",
      "proof": "Каждому человеку предъявляют его самый сильный страх. Уинстон, столкнувшись с крысами, просит перенести пытку на Джулию. Власть достигает цели не тогда, когда герой признаётся, а когда он предаёт личную связь и внутренне принимает Большого Брата."
    },
    {
      "title": "Финал антиутопии предупреждает о возможности полной победы власти",
      "proof": "Уинстон освобождён внешне, но его сознание уже перестроено. Он утрачивает любовь, память и способность к самостоятельному суждению. Победа государства состоит в уничтожении самой личности, которая могла бы сопротивляться."
    }
  ],
  "79": [
    {
      "title": "Американский реализм 1920-х годов отражает противоречия послевоенного общества",
      "proof": "После Первой мировой войны США переживают экономический рост, урбанизацию и расширение массовой культуры. Одновременно усиливаются духовная растерянность, социальное неравенство и ощущение утраты устойчивых ценностей. Писатели исследуют разрыв между внешним благополучием и внутренним одиночеством человека."
    },
    {
      "title": "Реализм этого периода соединяется с психологическим и модернистским поиском",
      "proof": "Авторы сохраняют внимание к социальной среде, деньгам, профессии и американскому образу жизни, но всё чаще показывают действительность через ограниченное восприятие героя, символическую деталь и фрагментарную композицию. Поэтому американский реализм 1920-х годов не сводится к традиционному последовательному повествованию."
    },
    {
      "title": "Шервуд Андерсон обращается к жизни маленького американского города",
      "proof": "В цикле «Уайнсбург, Огайо» город изображён не как гармоническое сообщество, а как совокупность изолированных человеческих судеб. Люди живут рядом, знают внешнюю сторону жизни друг друга, но не способны к подлинному общению. Провинциальная среда становится пространством одиночества."
    },
    {
      "title": "Образ «гротеска» у Андерсона раскрывает духовную деформацию личности",
      "proof": "Герой выбирает одну истину и превращает её в абсолют. То, что могло быть частью живого опыта, становится навязчивой идеей и отделяет человека от окружающих. Гротеск у Андерсона не означает только внешнюю странность: это внутренняя замкнутость, возникшая из подавленного желания и неспособности высказаться."
    },
    {
      "title": "Джордж Уиллард связывает отдельные истории цикла",
      "proof": "Молодой газетчик встречается с жителями Уайнсбурга и становится слушателем их признаний. Он ещё не способен полностью понять каждого, но постепенно узнаёт сложность человеческой жизни. Его отъезд из города обозначает начало самостоятельного пути и попытку выйти за пределы провинциальной замкнутости."
    },
    {
      "title": "Фицджеральд исследует культуру «века джаза»",
      "proof": "Его произведения изображают богатство, праздники, автомобили, моду и культ успеха. Однако блеск 1920-х годов скрывает эмоциональную пустоту и нравственную безответственность. Светская жизнь становится формой бегства от времени, памяти и ответственности."
    },
    {
      "title": "«Великий Гэтсби» раскрывает противоречие американской мечты",
      "proof": "Гэтсби создаёт богатство и новую биографию, надеясь вернуть Дейзи и восстановить прошлое. Его мечта связана с верой, что воля и успех способны преодолеть происхождение и время. Однако общество старых денег не принимает его как равного, а сама Дейзи не соответствует созданному им идеалу."
    },
    {
      "title": "Рассказчик Ник Каррауэй создаёт сложную нравственную перспективу",
      "proof": "История Гэтсби передана не всезнающим автором, а участником событий. Ник одновременно восхищается верностью Гэтсби мечте и видит её иллюзорность. Ограниченная точка зрения заставляет читателя самостоятельно оценивать героя и окружающее общество."
    },
    {
      "title": "Символика усиливает реалистический анализ",
      "proof": "Зелёный огонёк на другом берегу бухты обозначает одновременно Дейзи, будущее, надежду и недостижимую американскую мечту. Долина праха выражает нравственную и социальную пустоту, скрытую между богатыми районами. Символ не отменяет реалистическую конкретность, а углубляет её."
    },
    {
      "title": "Андерсона и Фицджеральда объединяет тема человеческой изоляции",
      "proof": "У Андерсона человек замкнут внутри подавленного чувства и провинциальной среды, у Фицджеральда — внутри социальной мечты, богатства и созданного образа самого себя. Оба писателя показывают, что внешняя принадлежность к обществу не гарантирует внутренней связи с другими."
    }
  ],
  "80": [
    {
      "title": "Американская мечта связывает личный успех со свободой и собственными усилиями",
      "proof": "Согласно этому представлению, человек независимо от происхождения может добиться богатства, признания и высокого положения. Драйзер проверяет этот идеал на материале реального общества и показывает, что возможности распределены неравномерно, а успех зависит от денег, среды, связей и случая."
    },
    {
      "title": "Герой Драйзера формируется под сильным воздействием социальной среды",
      "proof": "Желания персонажа возникают не изолированно. Реклама, городская роскошь, богатые дома и общественное уважение учат его связывать счастье с материальным обладанием. Человек стремится не просто к достатку, а к тому образу жизни, который общество объявляет доказательством ценности."
    },
    {
      "title": "«Американская трагедия» показывает превращение мечты об успехе в нравственную катастрофу",
      "proof": "Клайд Гриффитс вырос в бедной религиозной семье и стыдится своего происхождения. Он хочет богатства, красивой жизни и принадлежности к высшему кругу. Его стремление понятно, но он усваивает общественную формулу успеха без внутренней нравственной опоры."
    },
    {
      "title": "Город создаёт иллюзию безграничных возможностей",
      "proof": "Работа в гостинице открывает Клайду мир денег, развлечений и внешней свободы. Он видит, что социальное положение определяет отношение окружающих. Город обещает движение вверх, но одновременно усиливает зависимость человека от потребления и чужого мнения."
    },
    {
      "title": "Любовный конфликт раскрывает социальную природу выбора героя",
      "proof": "Роберта Олден связана с Клайдом реальными отношениями и общей ответственностью, тогда как Сондра Финчли воплощает богатство, статус и желанное будущее. Клайд выбирает не только между двумя женщинами, но и между двумя социальными мирами."
    },
    {
      "title": "Преступление возникает из соединения личной слабости и общественного давления",
      "proof": "Клайд не является холодным профессиональным преступником. Он колеблется, фантазирует и избегает прямого решения. Однако его нерешительность не снимает ответственности: он допускает гибель Роберты, потому что ставит собственную мечту о статусе выше её жизни."
    },
    {
      "title": "Суд превращает личную трагедию в общественное зрелище",
      "proof": "Политики, адвокаты и пресса используют дело Клайда для карьеры и сенсации. Общество осуждает героя, но не исследует ценности, которые сформировали его желания. Суд наказывает отдельного человека, оставляя без изменения систему поклонения успеху и богатству."
    },
    {
      "title": "Натуралистический метод подчёркивает зависимость личности от обстоятельств",
      "proof": "Драйзер подробно показывает происхождение, воспитание, труд, экономическую зависимость и психологические колебания героя. Судьба Клайда складывается из множества причин. Однако детерминизм не уничтожает нравственную проблему: человек обусловлен средой, но всё же совершает выбор."
    },
    {
      "title": "Поздние романы расширяют критику индивидуалистической модели успеха",
      "proof": "В «Оплоте» Драйзер обращается к религиозно-нравственному сознанию американского буржуа и показывает, как внешняя добропорядочность сталкивается с реальной властью денег, семейными противоречиями и общественным лицемерием. Устойчивый моральный кодекс не спасает героя от внутреннего кризиса."
    },
    {
      "title": "«Стоик» завершает тему финансового могущества и личной несвободы",
      "proof": "Фрэнк Каупервуд достигает исключительного влияния и богатства, но его жизненный путь не приводит к нравственной цельности. Власть капитала расширяет возможности действия, однако не устраняет одиночество, зависимость от страстей и конечность человеческой жизни."
    },
    {
      "title": "Эволюция Драйзера ведёт от индивидуальной карьеры к критике общественной системы",
      "proof": "В ранних и центральных романах писатель показывает сильную личность, стремящуюся к успеху, а в позднем творчестве всё яснее раскрывает ограниченность индивидуального восхождения. Богатство отдельного человека не решает проблему свободы, если общество построено на неравенстве и власти капитала."
    },
    {
      "title": "Американская мечта у Драйзера сохраняет трагическую двойственность",
      "proof": "Стремление выйти из бедности и самостоятельно построить жизнь обладает человеческой привлекательностью. Трагедия начинается тогда, когда свобода отождествляется только с деньгами и престижем. Мечта, лишённая нравственного содержания, превращает другого человека в средство или препятствие."
    }
  ],
  "81": [
    {
      "title": "«Красные тридцатые» связаны с Великой депрессией и ростом социальной литературы",
      "proof": "Экономический кризис привёл к массовой безработице, разорению фермеров, миграции и обострению классовых конфликтов. Писатели обращаются к судьбе рабочих, арендаторов и бездомных семей. Литература стремится показать не только отдельное несчастье, но и причины общественной катастрофы."
    },
    {
      "title": "Роман Стейнбека основан на реальном опыте миграции фермеров",
      "proof": "Семья Джоудов покидает Оклахому после потери земли и отправляется в Калифорнию в надежде найти работу. Их путь соответствует судьбе тысяч переселенцев, вытесненных засухой, банковской системой и механизацией сельского хозяйства."
    },
    {
      "title": "Потеря земли изображается как разрушение человеческой идентичности",
      "proof": "Для фермеров земля связана с трудом, памятью семьи и чувством собственного достоинства. Банк представлен как безличное «чудовище», которому нужны прибыль и выплаты, но которое не способно учитывать жизнь людей. Выселение уничтожает не только хозяйство, но и связь человека с прошлым."
    },
    {
      "title": "Композиция соединяет историю семьи и коллективную судьбу народа",
      "proof": "Главы о Джоудах чередуются с обобщающими вставными главами о дорогах, лагерях, банках, торговцах и мигрантах. Частная история расширяется до эпического образа всей страны. Семья становится одним из проявлений массового исторического процесса."
    },
    {
      "title": "Дорога постепенно превращает семейную группу в часть общего сообщества",
      "proof": "Сначала Джоуды стремятся спасти только собственную семью. По пути они встречают других мигрантов и понимают общность положения. Личная беда перестаёт восприниматься как индивидуальная неудача и раскрывается как результат общественной системы."
    },
    {
      "title": "Том Джоуд проходит путь от частного протеста к социальной солидарности",
      "proof": "В начале романа Том думает прежде всего о себе и семье. Под влиянием Кейси и пережитого насилия он понимает, что борьба одной семьи не может изменить положение. После убийства Кейси Том решает продолжить его дело и связывает собственную жизнь с коллективным сопротивлением."
    },
    {
      "title": "Джим Кейси выражает новую гуманистическую и социальную этику",
      "proof": "Бывший проповедник отказывается от традиционной религиозной догмы и приходит к мысли о единстве всех людей. Он видит святость не в отдельной душе, а в общем человеческом существовании. Его участие в организации рабочих превращает нравственное прозрение в общественное действие."
    },
    {
      "title": "Лагеря раскрывают разные модели организации жизни",
      "proof": "В стихийных лагерях мигранты зависят от насилия, голода и произвола. В государственном лагере они самостоятельно избирают комитеты, поддерживают порядок и сохраняют достоинство. Сопоставление показывает, что бедность не обязательно ведёт к хаосу: многое зависит от общественной организации."
    },
    {
      "title": "Образ Ма Джоуд воплощает устойчивость семьи и расширение солидарности",
      "proof": "Она сохраняет единство близких, принимает решения и не позволяет отчаянию разрушить семью. Постепенно её представление о «своих» расширяется: семья должна помогать не только родственникам, но и другим страдающим людям."
    },
    {
      "title": "Финальная сцена утверждает человеческую связь перед лицом катастрофы",
      "proof": "Роза Сарона кормит своим молоком умирающего от голода мужчину. Личное материнство превращается в акт помощи чужому человеку. Сцена соединяет телесность, страдание и надежду и выражает главную идею романа: выживание возможно через солидарность."
    },
    {
      "title": "Роман сочетает реализм, эпос, символику и публицистичность",
      "proof": "Стейнбек подробно изображает труд, дорогу, голод и экономические отношения, но одновременно использует библейские мотивы исхода, символические образы и обобщающий авторский голос. Благодаря этому социальный роман получает масштаб национального эпоса."
    }
  ],
  "82": [
    {
      "title": "Принцип «айсберга» предполагает скрытое существование главного смысла",
      "proof": "Хемингуэй сравнивал произведение с айсбергом, у которого над водой находится лишь небольшая часть. Автор сообщает минимум внешних сведений, но за поступком, диалогом и деталью должен ощущаться большой невыраженный опыт. Умолчание работает только тогда, когда писатель сам глубоко знает скрытый материал."
    },
    {
      "title": "Лаконизм не означает смысловой бедности",
      "proof": "Простые предложения, короткие реплики и ограниченное количество описаний создают внешнюю прозрачность. Однако читатель должен восстановить страх, травму, любовь или отчаяние, которые герои не способны или не хотят назвать прямо."
    },
    {
      "title": "Диалог передаёт внутренний конфликт через недоговорённость",
      "proof": "Герои часто говорят о погоде, напитках, дороге или бытовом решении, избегая главной темы. Повтор реплик, пауза и смена предмета разговора показывают эмоциональное напряжение. Смысл возникает между словами, а не только в их буквальном значении."
    },
    {
      "title": "Повествователь сохраняет внешнюю сдержанность",
      "proof": "Он редко подробно объясняет психологию персонажа или выносит нравственный приговор. Война, смерть и потеря описываются через действие и конкретную деталь. Эмоция усиливается именно потому, что текст не требует от читателя заранее заданной реакции."
    },
    {
      "title": "«И восходит солнце» строится вокруг скрытой травмы Джейка Барнса",
      "proof": "Физическое ранение героя не описывается подробно, но определяет его отношения с Бретт. Персонажи редко обсуждают невозможность их совместной жизни прямо. Поездки, праздники и разговоры скрывают чувство утраты, которое организует весь роман."
    },
    {
      "title": "Повторяющееся действие выражает внутреннюю пустоту поколения",
      "proof": "Герои пьют, путешествуют, спорят и переходят из одного заведения в другое. Внешне роман насыщен событиями, но движение часто не ведёт к изменению. Повтор показывает попытку заполнить пространство, оставленное войной и разрушенными ценностями."
    },
    {
      "title": "В «Прощай, оружие!» война раскрывается через конкретный человеческий опыт",
      "proof": "Фредерик Генри не строит общей философии войны. Он видит раненых, беспорядок отступления, расстрелы офицеров и случайность смерти. Отказ от громких объяснений позволяет показать войну как непосредственный абсурд и разрушение частной жизни."
    },
    {
      "title": "Слова с высоким идеологическим значением вызывают недоверие",
      "proof": "Герой замечает, что отвлечённые понятия вроде славы, чести и жертвы звучат непристойно рядом с конкретными названиями мест и человеческими потерями. Поэтика Хемингуэя противопоставляет абстрактной риторике точность пережитого факта."
    },
    {
      "title": "Предметная деталь несёт психологическую нагрузку",
      "proof": "Напиток, оружие, дождь, движение руки или устройство комнаты могут выражать состояние героя точнее, чем прямой комментарий. В «Прощай, оружие!» дождь постепенно связывается с тревогой, утратой и предчувствием смерти, не превращаясь при этом в однозначную аллегорию."
    },
    {
      "title": "Герой Хемингуэя выражает достоинство через поведение",
      "proof": "Мужество не провозглашается, а проявляется в способности сохранять самообладание, выполнять необходимое действие и не жаловаться. Нравственная позиция раскрывается через форму поступка. Это соответствует принципу «айсберга»: ценность героя существует глубже произнесённых слов."
    },
    {
      "title": "Читатель становится соавтором психологического смысла",
      "proof": "Текст не объясняет полностью прошлое персонажа, мотив поступка и эмоциональный итог сцены. Читатель сопоставляет детали и восстанавливает скрытую часть истории. Недосказанность создаёт особую активность восприятия."
    }
  ],
  "83": [
    {
      "title": "Фолкнер создаёт собственную модель американского Юга",
      "proof": "Большинство его произведений связано с вымышленным округом Йокнапатофа. В нём повторяются города, семьи, исторические события и социальные конфликты. Вымышленная территория приобретает достоверность целого мира и позволяет проследить судьбу Юга на протяжении нескольких поколений."
    },
    {
      "title": "История прошлого продолжает действовать в настоящем",
      "proof": "Гражданская война, рабство, поражение Юга и расовые конфликты не остаются завершёнными событиями. Они определяют собственность, семейную память, чувство вины и отношения между людьми. Герои живут среди последствий истории, которую не способны полностью осознать или преодолеть."
    },
    {
      "title": "Семейная хроника становится формой исторического романа",
      "proof": "Фолкнер прослеживает судьбы Сарторисов, Компсонов, Сноупсов и других родов. Упадок семьи связан с разрушением аристократического мифа, экономическими изменениями и нравственной деградацией. Частная биография выражает кризис всей культуры Юга."
    },
    {
      "title": "Повествование строится из нескольких несовпадающих точек зрения",
      "proof": "Одно событие может быть рассказано разными персонажами, каждый из которых обладает ограниченным знанием и собственным эмоциональным интересом. Истина не сообщается готовой. Читатель должен сопоставлять версии и замечать, что память и восприятие искажают факты."
    },
    {
      "title": "«Шум и ярость» разрушает линейную хронологию",
      "proof": "Роман состоит из четырёх частей, связанных с разными сознаниями и временными планами. В разделе Бенджи прошлое и настоящее сменяют друг друга без логических переходов, потому что герой воспринимает время через ощущение и ассоциацию. Форма позволяет войти в сознание, неспособное организовать опыт хронологически."
    },
    {
      "title": "Поток сознания передаёт внутренний распад личности",
      "proof": "У Квентина мысли движутся через повторы, образы, воспоминания и незавершённые фразы. Его сознание одержимо семейной честью, Кэдди и невозможностью остановить время. Языковая фрагментарность показывает не просто размышление, а разрушение способности жить в настоящем."
    },
    {
      "title": "Образ Кэдди существует через восприятие других",
      "proof": "У неё нет собственной повествовательной части, но она занимает центральное место в сознании братьев. Бенджи связывает её с теплом и запахом деревьев, Квентин — с семейной честью и утратой, Джейсон — с обидой и материальными претензиями. Отсутствующий голос подчёркивает, как личность превращается в объект чужих проекций."
    },
    {
      "title": "«Когда я умирала» соединяет трагедию и гротеск",
      "proof": "Члены семьи Бандренов везут тело Эдди для погребения, преодолевая наводнение, пожар и разложение. Каждый рассказывает собственную версию пути и преследует личную цель. Высокая тема смерти соседствует с телесностью, нелепостью и корыстным расчётом."
    },
    {
      "title": "Гротеск не уничтожает трагизм персонажа",
      "proof": "Герой может выглядеть смешным, жестоким или умственно ограниченным, но его сознание сохраняет собственную внутреннюю логику. Фолкнер не сводит человека к социальной функции. Даже нравственно слабый персонаж включён в сложную сеть памяти, страдания и исторической вины."
    },
    {
      "title": "Язык прозы меняется вместе с сознанием рассказчика",
      "proof": "Фолкнер использует длинные синтаксические периоды, обрывы, повторы, диалект и резкую смену речевых уровней. Нет единого нейтрального языка, который одинаково описывал бы всех героев. Стиль становится способом показать различие человеческих миров."
    },
    {
      "title": "Расовая проблематика связана с исторической виной Юга",
      "proof": "В романах «Свет в августе» и «Авессалом, Авессалом!» происхождение, цвет кожи и тайна родства определяют судьбы людей. Расовая система создаёт насилие, страх и разрушение идентичности. История семьи оказывается неотделима от истории рабства."
    },
    {
      "title": "Читатель должен самостоятельно собирать целое из фрагментов",
      "proof": "События сообщаются не по порядку, важные сведения появляются поздно, а рассказчики противоречат друг другу. Трудность чтения соответствует основной идее: прошлое невозможно восстановить полностью, но без попытки его понять настоящее остаётся необъяснимым."
    }
  ],
  "84": [
    {
      "title": "О’Нил создаёт национальную американскую трагедию",
      "proof": "До О’Нила американский театр во многом зависел от коммерческой сцены и европейских образцов. Драматург обращается к жизни моряков, фермеров, рабочих и разрушенных семей и показывает в их судьбах трагические конфликты общечеловеческого масштаба."
    },
    {
      "title": "Центральной темой становится разрыв между мечтой и действительностью",
      "proof": "Герои О’Нила стремятся к любви, богатству, семейному дому, свободе или возвращению к прошлому. Однако мечта нередко становится способом уклонения от реальности. Чем сильнее человек держится за иллюзию, тем труднее ему принять собственную жизнь."
    },
    {
      "title": "Семья изображается как пространство любви, зависимости и взаимной вины",
      "proof": "Близкие люди нуждаются друг в друге, но одновременно причиняют друг другу страдание. Старые обиды постоянно возвращаются, а любовь соединяется с обвинением. Семейный конфликт у О’Нила нельзя разрешить простым разоблачением виновного, потому что каждый является и жертвой, и участником общего разрушения."
    },
    {
      "title": "Прошлое непосредственно действует в настоящем",
      "proof": "В пьесе «Долгий день уходит в ночь» семейный кризис складывался годами. Скупость Джеймса Тайрона, зависимость Мэри, болезнь Эдмунда и алкоголизм Джейми образуют единую историю. Настоящий день становится итогом множества прежних решений, которые невозможно отменить."
    },
    {
      "title": "«Долгий день уходит в ночь» строится как движение к болезненной правде",
      "proof": "За один день семья постепенно отказывается от внешнего спокойствия. Возвращение Мэри к морфию уже нельзя скрыть, разговоры переходят в обвинения, признания и попытки оправдаться. Однако знание правды не приносит освобождения: герои понимают причины страдания, но не могут изменить привычный круг отношений."
    },
    {
      "title": "Мотив тумана выражает стремление исчезнуть из реальности",
      "proof": "Мэри говорит о тумане как о состоянии, в котором человек перестаёт видеть окружающий мир и самого себя. Туман связан с морфием, памятью и желанием вернуться в прошлое. Пространственный образ превращается в символ психологического ухода от боли."
    },
    {
      "title": "О’Нил использует психологический подтекст и повтор",
      "proof": "Герои возвращаются к одним и тем же историям, упрёкам и оправданиям. Повтор показывает, что семья не способна выйти из прошлого. Значение имеет не только содержание реплики, но и пауза, интонация, привычный жест или попытка сменить тему."
    },
    {
      "title": "Экспрессионистские приёмы раскрывают скрытую структуру личности и общества",
      "proof": "В пьесе «Косматая обезьяна» рабочий Янк сначала ощущает себя частью машины и источником её силы. После встречи с девушкой из высшего общества он понимает собственную социальную отчуждённость. Условные массовые сцены, резкие контрасты и образ клетки превращают частную судьбу в трагедию человека индустриального мира."
    },
    {
      "title": "«Траур — участь Электры» переосмысливает античный миф",
      "proof": "О’Нил переносит сюжет «Орестеи» в Америку после Гражданской войны. Преступление и возмездие объясняются не только роком, но и семейной психологией, подавленным желанием и пуританской виной. Античная судьба получает современное психологическое содержание."
    },
    {
      "title": "Трагизм О’Нила не исключает сострадания",
      "proof": "Персонажи часто слабы, зависимы и склонны к самообману, но драматург не лишает их человеческого достоинства. Он показывает, что иллюзия может быть разрушительной, но иногда остаётся последней защитой человека от невыносимой правды."
    }
  ],
  "85": [
    {
      "title": "Вторая мировая война и Холокост радикально изменили представление о европейской цивилизации",
      "proof": "Культура, наука и образование не смогли предотвратить массовое уничтожение людей. Поэтому послевоенная литература подвергает сомнению веру в разумный прогресс, гуманистическую устойчивость и нравственное превосходство Запада."
    },
    {
      "title": "Опыт катастрофы становится проблемой памяти и свидетельства",
      "proof": "Писатели стремятся сохранить личный опыт жертв, заключённых, солдат и изгнанников. В произведениях Примо Леви документальная точность и сдержанность становятся формой нравственного свидетельства. Литература должна сохранить факт преступления, не превращая страдание в эффектное зрелище."
    },
    {
      "title": "Немецкая литература обращается к теме вины и непреодолённого прошлого",
      "proof": "Генрих Бёлль показывает, что военное поражение не означает автоматического нравственного очищения общества. Гюнтер Грасс использует гротеск и ненадёжное повествование, чтобы раскрыть механизм забвения и самооправдания. Прошлое продолжает действовать в семье, языке и общественных институтах."
    },
    {
      "title": "Экзистенциализм выражает послевоенное ощущение свободы и ответственности",
      "proof": "В прозе Сартра и Камю человек оказывается в мире без заранее гарантированного смысла. Он не может полностью переложить ответственность на историю, религию или общество. Смысл создаётся поступком, а свобода переживается не только как право, но и как тяжёлое бремя выбора."
    },
    {
      "title": "Театр абсурда показывает кризис языка и коммуникации",
      "proof": "В пьесах Беккета и Ионеско персонажи говорят, но не достигают взаимопонимания; повторяют привычные фразы и ожидают события, которое не наступает. Разрушение диалога отражает духовную дезориентацию послевоенного человека."
    },
    {
      "title": "Холодная война усиливает политическую тревогу",
      "proof": "Мир разделяется на противостоящие идеологические блоки, а ядерное оружие создаёт возможность глобального уничтожения. Литература обращается к тоталитаризму, пропаганде, манипуляции сознанием и страху перед будущим."
    },
    {
      "title": "Деколонизация меняет границы западного литературного канона",
      "proof": "Освобождение колоний ставит вопрос о последствиях империализма, культурной зависимости и праве народов говорить от собственного имени. В литературу входят голоса мигрантов, бывших колониальных народов и людей с двойной культурной идентичностью."
    },
    {
      "title": "Массовое общество становится объектом критики",
      "proof": "Развитие телевидения, рекламы и потребления создаёт стандартизированные желания и модели поведения. Литература исследует, как комфорт и товарное изобилие могут сочетаться с одиночеством, конформизмом и потерей индивидуальности."
    },
    {
      "title": "«Новый роман» ставит под сомнение традиционную форму повествования",
      "proof": "Натали Саррот и Ален Роб-Грийе отказываются от цельного героя, линейного сюжета и всезнающего рассказчика. Личность раскрывается как поток реакций, а предметный мир получает самостоятельное значение. Кризис доверия к готовой истине отражается в самой структуре романа."
    },
    {
      "title": "Постмодернистская проза усиливает недоверие к единственной версии истории",
      "proof": "Фаулз, Эко, Пинчон и другие авторы используют интертекстуальность, иронию и множественные финалы. История понимается как система конкурирующих текстов и интерпретаций. Читатель должен самостоятельно оценивать версии прошлого."
    },
    {
      "title": "Послевоенная литература сохраняет поиск человеческой опоры",
      "proof": "Несмотря на кризис универсальных систем, писатели обращаются к личной ответственности, памяти, любви, солидарности и защите другого человека. У Камю доктор Риэ борется с чумой не потому, что уверен в окончательной победе, а потому, что считает необходимым уменьшать страдание."
    }
  ],
  "86": [
    {
      "title": "Постмодернизм возникает как культура недоверия к универсальным объяснениям",
      "proof": "История XX века показала, что идеи прогресса, нации, разума и общественного освобождения могут использоваться для насилия. Постмодернистская литература ставит под сомнение возможность одной окончательной истины и подчёркивает множественность интерпретаций."
    },
    {
      "title": "Мир воспринимается как пространство уже существующих текстов",
      "proof": "Писатель не начинает с абсолютно нового материала, а работает с мифами, литературными сюжетами, жанрами, цитатами и массовой культурой. Произведение становится диалогом с предшествующей традицией."
    },
    {
      "title": "Интертекстуальность является основным принципом поэтики",
      "proof": "Текст содержит прямые и скрытые цитаты, аллюзии, стилизации и переработанные сюжеты. Читатель одновременно воспринимает новую историю и узнаёт культурный источник, который получает иной смысл."
    },
    {
      "title": "Ирония препятствует окончательному утверждению одной позиции",
      "proof": "Автор может использовать жанр детектива, исторического романа или любовной истории и одновременно показывать его условность. Ирония не обязательно уничтожает серьёзность темы, но не позволяет превратить её в бесспорную догму."
    },
    {
      "title": "Метапроза раскрывает процесс создания произведения",
      "proof": "Рассказчик обсуждает выбор сюжета, обращается к читателю, предлагает несколько финалов или признаёт невозможность восстановить события. Роман говорит не только о мире, но и о том, как этот мир создаётся повествованием."
    },
    {
      "title": "Смешение высокой и массовой культуры разрушает жанровую иерархию",
      "proof": "Философская проблема может раскрываться через детектив, фантастику, комикс или приключение. Цитаты из классики соседствуют с рекламой, песней и газетой. Постмодернизм отказывается признавать одну культурную форму безусловно высшей."
    },
    {
      "title": "История понимается как текст, доступный через версии",
      "proof": "Писатель не может непосредственно вернуть прошлое и работает с документами, свидетельствами и культурными образами. Поэтому исторический роман подчёркивает неполноту знания и зависимость прошлого от способа рассказа."
    },
    {
      "title": "Борхес является важнейшим предшественником постмодернизма",
      "proof": "Его рассказы о лабиринтах, бесконечных библиотеках, вымышленных книгах и множественном авторстве предвосхищают интертекстуальность и метапрозу. Однако точнее называть Борхеса предшественником и интеллектуальным источником постмодернизма, а не безоговорочно включать его в зрелое направление второй половины XX века."
    },
    {
      "title": "Роман Фаулза «Женщина французского лейтенанта» соединяет викторианский сюжет и современную рефлексию",
      "proof": "Повествователь комментирует нормы XIX века, нарушает иллюзию всезнания и предлагает несколько финалов. Историческая история одновременно рассказывается и анализируется с позиции более поздней культуры."
    },
    {
      "title": "Умберто Эко соединяет интеллектуальную игру с массовым жанром",
      "proof": "«Имя розы» использует форму монастырского детектива, но включает философские споры, средневековую семиотику и размышление о власти над знанием. Детективная разгадка не устраняет многозначности произведения."
    },
    {
      "title": "Итало Кальвино раскрывает условность самого процесса чтения",
      "proof": "В романе «Если однажды зимней ночью путник» читатель становится персонажем, который постоянно начинает новые книги и не может завершить ни одну. Произведение превращает чтение в сюжет и показывает, как желание целостности сталкивается с бесконечностью текстов."
    },
    {
      "title": "К характерным представителям постмодернизма относятся Эко, Кальвино, Фаулз, Пинчон и другие",
      "proof": "Их объединяют текстовая игра, интертекстуальность, проблематизация истины и смешение жанров. При этом национальные модели различаются: у Эко сильна историко-семиотическая линия, у Фаулза — проблема свободы и авторской власти, у Пинчона — энтропия, паранойя и массовая культура."
    },
    {
      "title": "Постмодернизм не сводится к бессодержательной игре",
      "proof": "Цитатность и ирония могут служить осмыслению памяти, власти, войны и исторической травмы. Игра показывает не отсутствие реальности, а трудность говорить о ней языком, который уже сформирован культурой и идеологией."
    }
  ],
  "87": [
    {
      "title": "Сартр и Камю обращаются к человеку, оказавшемуся в мире без заранее гарантированного смысла",
      "proof": "Их герои не могут опереться на готовую религиозную, общественную или историческую систему, которая автоматически объяснила бы существование. Человек вынужден сам определять отношение к миру и отвечать за собственные поступки. Философская проблема раскрывается через конкретную жизненную ситуацию, а не через отвлечённый трактат."
    },
    {
      "title": "В философии Сартра существование предшествует сущности",
      "proof": "Человек не получает при рождении окончательно заданной природы. Он создаёт себя решениями и поступками. Происхождение, профессия и общественная роль влияют на него, но не снимают личной ответственности за то, кем он становится."
    },
    {
      "title": "Роман Сартра «Тошнота» превращает философскую идею в телесное переживание",
      "proof": "Антуан Рокантен внезапно начинает воспринимать привычные вещи вне их названий и функций. Корень каштана перестаёт быть понятным предметом и открывается ему как бесформенное, избыточное существование. Философская категория случайности бытия переживается героем физически — как тошнота."
    },
    {
      "title": "Обыденный язык скрывает случайность и необязательность существования",
      "proof": "Названия, профессии и общественные привычки создают ощущение устойчивого порядка. Рокантен понимает, что вещи и человек могли бы не существовать и не имеют заранее предписанного назначения. Язык временно упорядочивает реальность, но не устраняет её фундаментальной случайности."
    },
    {
      "title": "Свобода у Сартра неотделима от ответственности",
      "proof": "Даже отказ от действия является выбором. Человек не может полностью оправдаться приказом, ролью или обстоятельствами, поскольку сам принимает решение подчиниться им. Свобода поэтому переживается не как лёгкое освобождение, а как тяжёлая необходимость постоянно выбирать."
    },
    {
      "title": "Понятие «дурной веры» раскрывает механизм самообмана",
      "proof": "Человек может изображать себя полностью определённым социальной ролью и утверждать, что не имеет выбора. Тем самым он скрывает от себя собственную свободу. В художественных произведениях Сартра персонаж часто пытается переложить ответственность на характер, общество или обстоятельства, но именно это становится формой нравственного уклонения."
    },
    {
      "title": "Камю традиционно рассматривается рядом с экзистенциализмом, хотя сам не принимал это определение",
      "proof": "Его творчество связано с темами свободы, смерти, одиночества и отсутствия готового смысла, поэтому оно входит в общий контекст экзистенциальной литературы. Однако центральные категории Камю — абсурд, бунт, мера и солидарность. Это отличает его позицию от философской системы Сартра."
    },
    {
      "title": "Абсурд у Камю возникает из столкновения человеческой потребности в смысле с молчанием мира",
      "proof": "Человек стремится к ясности, справедливости и объяснению, но действительность не даёт окончательного ответа. Абсурд не находится только в человеке или только в мире: он возникает в их отношении. Поэтому его нельзя устранить простой теорией или верой в готовый порядок."
    },
    {
      "title": "«Посторонний» показывает героя, не принимающего общественные эмоциональные формулы",
      "proof": "Мерсо не демонстрирует ожидаемую скорбь на похоронах матери и не пытается представить себя нравственно лучше, чем он есть. Он говорит о жаре, усталости и телесных ощущениях, а не о возвышенных чувствах. Общество воспринимает такую честность как угрозу."
    },
    {
      "title": "Суд над Мерсо создаёт удобную моральную версию его жизни",
      "proof": "Обвинение связывает поведение героя на похоронах с убийством и строит цельный образ безнравственного человека. Реальные обстоятельства преступления подчиняются заранее выбранной интерпретации. Суд осуждает Мерсо не только за поступок, но и за отказ подтверждать общественные нормы чувствования."
    },
    {
      "title": "Финал «Постороннего» показывает принятие абсурда",
      "proof": "Ожидая казни, Мерсо отказывается от надежды на высшее оправдание и принимает безразличие мира. Это не приносит внешнего спасения, но освобождает его от необходимости притворяться. Герой впервые ощущает полноту собственного существования."
    },
    {
      "title": "«Чума» переводит философию абсурда в этику совместного действия",
      "proof": "Доктор Риэ не знает высшего смысла эпидемии и не уверен в окончательной победе. Тем не менее он лечит людей и организует сопротивление болезни. Нравственность определяется не гарантией успеха, а отказом мириться с чужим страданием."
    },
    {
      "title": "Бунт у Камю утверждает общую человеческую меру",
      "proof": "Человек говорит злу «нет» не только ради себя, но и ради ценности, которую признаёт общей для всех. Такое сопротивление не должно превращаться в оправдание нового насилия. Поэтому Камю противопоставляет солидарный бунт и революционную идеологию, которая приносит конкретного человека в жертву будущему."
    },
    {
      "title": "Сартр и Камю предлагают разные ответы на отсутствие готового смысла",
      "proof": "Сартр подчёркивает радикальную свободу, выбор и ответственность личности за себя и историю. Камю обращается к абсурду, пределам действия, мере и солидарности. Их объединяет отказ от пассивного самооправдания, но различает понимание политического действия и допустимых средств."
    }
  ],
  "88": [
    {
      "title": "Театр абсурда отражает кризис рационального и связного понимания мира",
      "proof": "После исторических катастроф XX века привычные представления о логике, прогрессе и устойчивой человеческой личности оказываются под сомнением. Абсурдистская драма показывает мир, где действие не ведёт к ясной цели, а причина и следствие утрачивают надёжную связь."
    },
    {
      "title": "Язык перестаёт выполнять функцию общения",
      "proof": "Персонажи произносят фразы, повторяют формулы и поддерживают разговор, но не достигают взаимопонимания. Слова становятся автоматическими, распадаются или заменяют реальный контакт. Кризис языка выражает кризис человеческой связи."
    },
    {
      "title": "Ионеско раскрывает абсурд повседневной речи",
      "proof": "В «Лысой певице» диалоги построены из учебных клише, очевидных утверждений и бессмысленных повторов. Семейная беседа постепенно разрушается, а слова утрачивают значение. Комизм показывает, что привычный разговор может быть пустым ещё до открытого распада языка."
    },
    {
      "title": "Бытовая реальность превращается в гротеск",
      "proof": "Обычная гостиная, супружеский разговор или встреча знакомых постепенно обнаруживают нелогичность. Абсурд не приходит из фантастического внешнего мира, а скрыт внутри привычных социальных ритуалов."
    },
    {
      "title": "«Носорог» исследует массовый конформизм",
      "proof": "Жители города один за другим превращаются в носорогов. Сначала они возмущаются, затем объясняют и оправдывают превращение, а потом начинают считать его естественным и привлекательным. Фантастическая эпидемия становится образом распространения тоталитарной или массовой идеологии."
    },
    {
      "title": "Беранже сохраняет человечность не благодаря совершенству, а благодаря отказу подчиниться",
      "proof": "Он слаб, неорганизован и не выглядит классическим героем. Однако именно Беранже остаётся человеком, когда окружающие выбирают силу стада. Его сопротивление ценно как личный нравственный поступок, хотя победа не гарантирована."
    },
    {
      "title": "У Беккета действие заменяется ожиданием",
      "proof": "В пьесе «В ожидании Годо» Владимир и Эстрагон остаются у дороги и ждут человека, который не приходит. Они разговаривают, ссорятся, примиряются и собираются уйти, но остаются на месте. Повторяющаяся структура показывает существование без ясной цели и завершения."
    },
    {
      "title": "Повтор создаёт одновременно комический и трагический эффект",
      "proof": "Во втором акте возвращаются те же ситуации, предметы и разговоры, но с небольшими изменениями. Персонажи плохо помнят прошлое и не способны превратить опыт в развитие. Смешная повторяемость обнаруживает трагическую неподвижность жизни."
    },
    {
      "title": "Неопределённость Годо принципиальна",
      "proof": "Пьеса не сообщает, кем является Годо и почему его приход должен изменить жизнь героев. Его можно связывать с Богом, спасением, властью, будущим или смыслом, но ни одна трактовка не становится окончательной. Важнее само устройство ожидания."
    },
    {
      "title": "Пространство и предметы предельно сокращены",
      "proof": "Дорога, дерево, камень или пустая сцена не создают подробного бытового мира. Минимальное пространство обнажает основную ситуацию существования. Человек остаётся почти без социальных и исторических объяснений перед временем, телом и другим человеком."
    },
    {
      "title": "Трагическое существование выражается средствами клоунады",
      "proof": "Персонажи падают, обмениваются шляпами, повторяют комические действия и напоминают артистов мюзик-холла. Смех не отменяет отчаяния, а делает его переносимым. Комическое поведение становится способом продолжать жизнь."
    },
    {
      "title": "Ионеско и Беккет предлагают разные формы абсурда",
      "proof": "Ионеско чаще показывает разрастание нелепости внутри общества, языка и массового поведения. Беккет предельно сокращает действие и исследует ожидание, память, зависимость и истощение существования. Оба разрушают традиционный сюжет и психологически цельный характер."
    }
  ],
  "89": [
    {
      "title": "«Новый роман» возникает как критика традиционной реалистической формы",
      "proof": "Писатели школы считают, что классический роман слишком уверенно изображает цельного героя, последовательную биографию и причинно связанный мир. После опыта модернизма и исторических катастроф такая устойчивость воспринимается как условность. Поэтому «новый роман» отказывается от привычного сюжета и психологического объяснения."
    },
    {
      "title": "Персонаж утрачивает положение единого центра произведения",
      "proof": "Герой может не иметь подробной биографии, устойчивого характера или даже имени. Автор не объясняет его поступки через готовую психологическую формулу. Личность раскрывается как изменчивое поле восприятий, речевых реакций и отношений с окружающим пространством."
    },
    {
      "title": "Предметный мир приобретает самостоятельное значение",
      "proof": "В прозе Алена Роб-Грийе вещи описываются подробно, точно и внешне нейтрально. Форма комнаты, положение предмета, свет и поверхность могут занимать больше места, чем переживания человека. Такой приём разрушает представление, будто предметы существуют только как отражение психологии героя."
    },
    {
      "title": "Повторяющееся описание ставит под сомнение надёжность восприятия",
      "proof": "Один и тот же предмет или эпизод может возвращаться с небольшими изменениями. Читатель не знает, относится ли описание к реальному событию, воспоминанию, предположению или фантазии. Повтор не подтверждает факт, а делает его всё менее определённым."
    },
    {
      "title": "В романе Роб-Грийе «Ревность» сознание героя передаётся без прямого внутреннего монолога",
      "proof": "Рассказчик почти не называет себя и не объясняет чувства. Однако повторяющиеся наблюдения за женой, гостем, окнами, следами и расположением предметов позволяют восстановить состояние ревности. Психология создаётся не признанием, а навязчивой организацией взгляда."
    },
    {
      "title": "Натали Саррот исследует «тропизмы» — первичные движения сознания",
      "proof": "Под тропизмами она понимает едва уловимые внутренние импульсы, возникающие до ясной мысли и оформленного чувства. Они проявляются в интонации, паузе, ожидании чужой реакции и скрытом напряжении разговора. Традиционное психологическое имя кажется слишком грубым для таких состояний."
    },
    {
      "title": "Диалог у Саррот раскрывает скрытую борьбу между людьми",
      "proof": "Обычная фраза может содержать давление, страх, желание получить признание или защититься. Внешне нейтральная беседа превращается в пространство психологического столкновения. Автор исследует не столько содержание слов, сколько возникающую вокруг них внутреннюю реакцию."
    },
    {
      "title": "Мишель Бютор соединяет экспериментальную форму с исследованием сознания",
      "proof": "В романе «Изменение» повествование ведётся во втором лице. Герой едет поездом в Рим, собираясь изменить свою жизнь, а обращение «вы» создаёт дистанцию между ним и самим собой. Путешествие превращается в процесс внутреннего пересмотра решения."
    },
    {
      "title": "Пространство и время перестают быть нейтральным фоном",
      "proof": "Комната, поезд, город или маршрут организуют движение сознания. Внешнее перемещение вызывает воспоминания и меняет оценку настоящего. Пространственная структура нередко заменяет традиционную событийную интригу."
    },
    {
      "title": "Читатель должен самостоятельно создавать связи между фрагментами",
      "proof": "Текст не сообщает готовой версии событий и не гарантирует достоверности наблюдения. Читатель сопоставляет повторы, детали, временные сдвиги и речевые формы. Процесс чтения становится частью художественного эксперимента."
    }
  ],
  "90": [
    {
      "title": "Движение возникает в Англии 1950-х годов как выражение социального недовольства молодого поколения",
      "proof": "После войны британское общество формально становится более демократичным, но сохраняет классовые различия, культурную иерархию и ограниченные возможности продвижения. Молодые герои получают образование, однако не чувствуют себя принятыми элитой и не верят в справедливость существующего порядка."
    },
    {
      "title": "Название объединяет авторов не единой программой, а общим настроением протеста",
      "proof": "Кингсли Эмис, Джон Уэйн и Джон Осборн различаются жанрами и художественной манерой. Их сближает неприятие респектабельности, официального оптимизма и традиционной культурной власти. Центральным становится голос раздражённого, социально неудовлетворённого молодого человека."
    },
    {
      "title": "Герой движения принадлежит к низшему среднему или рабочему классу",
      "proof": "Он получил образование и освоил язык культуры, но остаётся чужим в привилегированной среде. Происхождение определяет акцент, манеры, знакомства и перспективы. Его конфликт с обществом строится на болезненном понимании классовой границы."
    },
    {
      "title": "Протест героя имеет бытовую и речевую форму",
      "proof": "Он редко предлагает последовательную политическую программу. Недовольство проявляется в сарказме, грубости, насмешке над начальством, нарушении правил поведения и отказе уважать авторитет только за его положение. Разговорная речь становится средством социальной оппозиции."
    },
    {
      "title": "Роман Кингсли Эмиса «Счастливчик Джим» сатирически изображает университетскую среду",
      "proof": "Джим Диксон зависим от профессора Уэлча и вынужден притворяться заинтересованным в его культурных увлечениях. Университет оказывается не свободным пространством знания, а системой связей, ритуалов и карьерной зависимости. Комизм рождается из столкновения внутреннего раздражения героя с необходимостью соблюдать приличия."
    },
    {
      "title": "Джим Диксон — антигерой, а не романтический бунтарь",
      "proof": "Он ленив, иногда труслив и не обладает возвышенной целью. Однако его скептицизм обнаруживает фальшь окружающей среды. Значение героя состоит не в нравственном совершенстве, а в отказе считать респектабельную культуру безусловно достойной."
    },
    {
      "title": "Джон Уэйн исследует конфликт личности и обезличивающей системы",
      "proof": "Его персонажи пытаются сохранить самостоятельность внутри образовательных, профессиональных и общественных институтов. Система требует приспособления и превращает индивидуальность в функцию. Протест связан с защитой права человека не совпадать с навязанной ролью."
    },
    {
      "title": "Пьеса Осборна «Оглянись во гневе» переносит социальный конфликт в частную жизнь",
      "proof": "Джимми Портер живёт в тесной квартире и направляет гнев на жену, её семью, общество и собственное положение. Его речь полна энергии и точных обвинений, но протест часто превращается в жестокость к близким. Социальное унижение не оправдывает эмоциональное насилие."
    },
    {
      "title": "Гнев героя выражает как общественную, так и личную неудовлетворённость",
      "proof": "Джимми чувствует отсутствие великой цели и значимого исторического действия. Он хочет подлинности и сильного чувства, но не умеет создать конструктивную форму жизни. Его бунт одновременно справедлив и разрушителен."
    },
    {
      "title": "Движение обновило язык английской прозы и театра",
      "proof": "На сцену и в роман вошли провинциальная речь, бытовая теснота, молодой антигерой и непосредственная классовая агрессия. Литература стала говорить о современности без аристократической дистанции и смягчающей риторики."
    }
  ],
  "91": [
    {
      "title": "Фаулз соединяет традиционный сюжет с постмодернистской рефлексией",
      "proof": "Его романы могут напоминать викторианскую любовную историю, психологический роман, детектив или притчу. Одновременно текст показывает условность выбранного жанра, вмешательство автора и невозможность единственного толкования. Читатель получает и увлекательную историю, и размышление о способах её создания."
    },
    {
      "title": "Центральной проблемой становится свобода личности",
      "proof": "Герои сталкиваются с чужой властью, культурной ролью, общественным ожиданием или собственным самообманом. Свобода понимается не как отсутствие ограничений, а как способность осознать ответственность за выбор и признать самостоятельность другого человека."
    },
    {
      "title": "Отношения между людьми часто строятся как борьба власти и интерпретаций",
      "proof": "Один герой стремится определить другого, разгадать его или включить в собственный сценарий. Однако личность не совпадает с созданным образом. Попытка полностью понять и присвоить другого человека становится формой насилия."
    },
    {
      "title": "«Коллекционер» противопоставляет обладание и подлинное отношение к личности",
      "proof": "Фредерик Клегг похищает Миранду и считает, что любовь можно получить через изоляцию и материальную заботу. Он коллекционирует бабочек и так же обращается с девушкой: сохраняет внешнюю красоту, уничтожая свободу. Его неспособность признать её самостоятельное сознание приводит к гибели пленницы."
    },
    {
      "title": "Двойная повествовательная перспектива усложняет нравственную оценку",
      "proof": "В «Коллекционере» события показаны сначала через рассказ Клегга, затем через дневник Миранды. Первая часть демонстрирует самооправдание похитителя, вторая возвращает жертве голос и внутреннюю сложность. Сопоставление точек зрения разрушает иллюзию нейтрального рассказа."
    },
    {
      "title": "«Волхв» строится как система испытаний, театральных постановок и ложных объяснений",
      "proof": "Николас Эрф оказывается вовлечён в загадочную игру Мориса Кончиса. Каждый раз, когда герой считает, что понял происходящее, ему предлагается новая версия. Испытание заставляет Николаса столкнуться с собственной эмоциональной незрелостью и привычкой использовать других."
    },
    {
      "title": "Игра в «Волхве» исследует границу свободы и манипуляции",
      "proof": "Кончис утверждает, что помогает герою познать себя, однако использует наблюдение, инсценировку и психологическое давление. Роман не даёт простого ответа, оправдывает ли воспитательная цель подобные средства. Читатель также становится участником игры и испытывает ненадёжность интерпретации."
    },
    {
      "title": "«Женщина французского лейтенанта» переосмысливает викторианский роман",
      "proof": "История Чарльза и Сары разворачивается в Англии XIX века, но рассказчик обладает знаниями более поздней эпохи, комментирует условности викторианской культуры и открыто вмешивается в сюжет. Историческая реконструкция соединяется с современной критикой пола, класса и авторской власти."
    },
    {
      "title": "Несколько финалов выражают идею открытости выбора",
      "proof": "Рассказчик предлагает разные варианты судьбы героев и отказывается закреплять один как абсолютно истинный. Такой приём разрушает власть автора, который обычно полностью распоряжается персонажами. Свобода героя поддерживается незавершённостью интерпретации."
    },
    {
      "title": "Женские персонажи связаны с тайной и сопротивлением чужому определению",
      "proof": "Миранда, Лили и Сара не исчерпываются той ролью, которую им приписывает мужчина. Они могут быть жертвой, участницей игры, создательницей собственной версии и источником внутреннего изменения героя. При этом Фаулз показывает и ограниченность мужского взгляда, который склонен превращать женщину в символ."
    },
    {
      "title": "Читатель у Фаулза должен постоянно проверять собственное доверие",
      "proof": "Повествователь может менять правила, персонажи — разыгрывать роли, а жанровая форма — скрывать иной смысл. Чтение становится процессом выбора между версиями. Поэтика романов требует интеллектуальной и нравственной активности."
    }
  ],
  "92": [
    {
      "title": "Британский постмодернистский роман переосмысливает национальную литературную традицию",
      "proof": "Писатели активно используют исторический роман, биографию, викторианскую прозу, готику, детектив и научную фантастику. Традиция не отвергается, а превращается в материал для цитирования, стилизации, пародии и нового толкования."
    },
    {
      "title": "История изображается как совокупность текстов и конкурирующих версий",
      "proof": "Прошлое доступно только через документы, мемуары, книги, городские пространства и более поздние интерпретации. Роман не утверждает, что способен полностью восстановить событие. Он показывает, как исторический рассказ создаётся и зависит от языка и позиции рассказчика."
    },
    {
      "title": "Питер Акройд создаёт образ Лондона как многослойного культурного текста",
      "proof": "В его романах город хранит следы разных эпох, авторов, преступлений и литературных сюжетов. Одни и те же мотивы повторяются через столетия, а современный герой оказывается включён в старую историю. Лондон становится не фоном, а носителем коллективной памяти."
    },
    {
      "title": "В прозе Акройда документальность соединяется с вымыслом",
      "proof": "Реальные писатели, исторические обстоятельства и стилизованные документы соседствуют с вымышленными эпизодами. Читатель не всегда может провести чёткую границу между архивным источником и авторской мистификацией. Тем самым ставится вопрос о повествовательной природе любой биографии и истории."
    },
    {
      "title": "Стилизация воспроизводит не только эпоху, но и способ её мышления",
      "proof": "Акройд имитирует язык хроники, викторианского романа, детектива, биографии или научного исследования. Каждый стиль создаёт собственную модель реальности. Смена языков показывает, что прошлое нельзя отделить от форм, в которых оно было описано."
    },
    {
      "title": "Энтони Бёрджесс занимает переходное положение между модернизмом и постмодернизмом",
      "proof": "Его нельзя без оговорки считать только представителем зрелого постмодернизма. В его прозе соединяются модернистский интерес к языку, сатирическая антиутопия, жанровая игра и постмодернистское смешение культурных кодов. Поэтому точнее говорить о переходной и гибридной позиции автора."
    },
    {
      "title": "«Заводной апельсин» исследует связь языка, насилия и свободы",
      "proof": "Алекс рассказывает историю на вымышленном жаргоне надсат, сочетающем английскую основу и русские элементы. Читатель постепенно осваивает этот язык и оказывается внутри сознания героя. Речевая форма создаёт опасную близость к насилию, не отменяя его нравственной неприемлемости."
    },
    {
      "title": "Надсат защищает молодёжную среду и одновременно манипулирует восприятием читателя",
      "proof": "Жаргон отделяет Алекса и его друзей от мира взрослых и делает преступления частью особого эстетизированного кода. Непривычные слова смягчают непосредственный ужас происходящего. Читатель вынужден самостоятельно возвращать словам их реальное содержание."
    },
    {
      "title": "Принудительное исправление уничтожает возможность нравственного выбора",
      "proof": "После применения метода Людовико Алекс физически не способен совершать насилие. Однако он также теряет способность свободно выбрать добро. Государство превращает человека в безопасный механизм, а роман ставит вопрос: может ли поступок считаться нравственным, если у личности нет возможности поступить иначе."
    },
    {
      "title": "«Заводной апельсин» не оправдывает героя и не оправдывает государство",
      "proof": "Алекс жесток и несёт ответственность за совершённое. Но государственная система отвечает на его насилие собственным насилием над сознанием. Роман не предлагает простого выбора между преступником и властью, а защищает сам принцип свободной воли."
    },
    {
      "title": "Британский постмодернистский роман смешивает жанры и культурные уровни",
      "proof": "Историческая проза соединяется с детективом, философский роман — с фантастикой, классическая цитата — с рекламой, жаргоном и массовой культурой. Смешение разрушает устойчивую иерархию жанров и позволяет одному произведению обращаться к разным читательским ожиданиям."
    },
    {
      "title": "Ненадёжный рассказчик становится важным средством поэтики",
      "proof": "Герой может ошибаться, скрывать сведения, искажать прошлое или оправдывать себя. Читатель не получает окончательно авторитетной версии и должен учитывать ограниченность голоса, через который воспринимает события."
    },
    {
      "title": "Джулиан Барнс и Грэм Свифт исследуют ненадёжность памяти и исторического знания",
      "proof": "В их романах частное воспоминание не совпадает с объективной хроникой. Герой пересматривает прошлое, обнаруживает пробелы и понимает, что память создаёт связную историю задним числом. История раскрывается как предмет личной и нравственной ответственности."
    },
    {
      "title": "Мартин Эмис и Салман Рушди расширяют проблематику британского постмодернизма",
      "proof": "Мартин Эмис обращается к массовой культуре, деньгам, насилию и нравственной деградации современного общества. Рушди соединяет историю, миф, фантастику и опыт миграции, показывая гибридную идентичность человека, существующего между несколькими культурами."
    },
    {
      "title": "Формальная игра не исключает этической серьёзности",
      "proof": "Британский постмодернистский роман обсуждает насилие, память, колониальное прошлое, свободу и власть языка. Игра и стилизация не отменяют реальность, а показывают сложность её осмысления."
    }
  ],
  "93": [
    {
      "title": "Сэлинджер переносит центр повествования во внутренний мир подростка",
      "proof": "Подростковый герой показан не как объект воспитания со стороны взрослых, а как самостоятельное сознание со своей речью, нравственными требованиями и болезненным восприятием мира. Его бунт связан с попыткой сохранить искренность в обществе, которое кажется ложным."
    },
    {
      "title": "Повествование от первого лица создаёт эффект непосредственной исповеди",
      "proof": "В романе «Над пропастью во ржи» Холден Колфилд сам рассказывает о нескольких днях своей жизни. Читатель получает события через его оценки, преувеличения, повторы и резкие смены настроения. Такой голос создаёт близость, но не гарантирует полной объективности."
    },
    {
      "title": "Разговорная речь становится главным средством психологической характеристики",
      "proof": "Холден использует жаргон, слова-паразиты, гиперболы и повторяющиеся оценки. Его речь передаёт стремление казаться независимым и одновременно внутреннюю растерянность. За грубостью и насмешкой скрываются страх, одиночество и потребность в доверии."
    },
    {
      "title": "Ненадёжность рассказчика делает образ героя сложнее",
      "proof": "Холден обвиняет окружающих в фальши, но сам часто лжёт, играет роли и противоречит себе. Эти несоответствия не дискредитируют его полностью. Они показывают подростка, который ещё не умеет точно выразить собственное состояние и защищается от боли иронией."
    },
    {
      "title": "Конфликт с «фальшью» имеет нравственную основу",
      "proof": "Героя раздражают не только условности поведения, но и равнодушие, стремление к престижу и превращение личности в социальную роль. Он особенно чувствителен к унижению слабых. Однако его критика часто становится тотальной и мешает увидеть сложность других людей."
    },
    {
      "title": "Гибель Алли объясняет скрытую травму Холдена",
      "proof": "Смерть младшего брата продолжает определять его отношение к миру. Холден идеализирует Алли как воплощение чистоты и не может принять необратимость утраты. Многие его поступки и эмоциональные срывы связаны с невыраженным горем."
    },
    {
      "title": "Образ детей связан с идеей подлинности и уязвимости",
      "proof": "Холден легче общается с Фиби, чем со взрослыми, потому что воспринимает ребёнка как свободного от общественной лжи. Однако он идеализирует детство и хочет остановить естественное взросление. Его мечта становится попыткой защитить других от того опыта, который не смог пережить сам."
    },
    {
      "title": "Символ ловца во ржи раскрывает спасительную фантазию героя",
      "proof": "Холден представляет детей, играющих у края пропасти, и себя как человека, который должен удержать их от падения. Образ выражает желание защищать невинность и одновременно страх перед взрослением. Герой неверно вспоминает строку стихотворения, что подчёркивает личный, созданный им смысл фантазии."
    },
    {
      "title": "Эпизод с каруселью показывает изменение отношения к взрослению",
      "proof": "Наблюдая за Фиби, Холден понимает, что нельзя постоянно предотвращать риск и удерживать ребёнка. Дети должны сами тянуться за кольцом, даже если могут упасть. Герой впервые частично принимает необходимость движения и изменения."
    },
    {
      "title": "Социальный анализ осуществляется через индивидуальное восприятие",
      "proof": "Школа, гостиница, театр, семья и город показаны не в форме подробной общественной панорамы, а через эмоциональную реакцию Холдена. Благодаря этому социальная критика соединяется с психологией одиночества и травмы."
    },
    {
      "title": "Открытая композиция сохраняет незавершённость взросления",
      "proof": "Роман не показывает полного выздоровления или окончательного примирения героя с обществом. Холден рассказывает историю из лечебного учреждения и только допускает возможность возвращения к учёбе. Его становление остаётся процессом, а не достигнутым итогом."
    }
  ],
  "94": [
    {
      "title": "Хеллер и Воннегут изображают войну через абсурд, гротеск и чёрный юмор",
      "proof": "Оба писателя отказываются от героической модели военного романа. Война предстаёт как система, где массовая смерть сочетается с бюрократическими правилами, коммерческим расчётом и автоматическим исполнением приказов. Смех возникает рядом с ужасом и помогает показать ненормальность мира, который считает себя разумным."
    },
    {
      "title": "Абсурд у Хеллера имеет институциональную природу",
      "proof": "В романе «Уловка-22» герой не может отказаться от боевых вылетов по причине безумия. Желание сохранить жизнь признаётся доказательством здравого рассудка, поэтому просьба об освобождении автоматически отклоняется. Логически замкнутое правило превращает человека в пленника системы."
    },
    {
      "title": "«Уловка-22» становится универсальной формулой безвыходности",
      "proof": "Любое действие героя подтверждает правоту власти. Если Йоссариан продолжает летать, он выполняет приказ; если пытается уклониться, доказывает, что способен разумно оценивать опасность. Система заранее присваивает себе все возможные решения человека."
    },
    {
      "title": "Нелинейная композиция Хеллера передаёт травматическую память",
      "proof": "События возвращаются фрагментами, а обстоятельства смерти Сноудена постепенно дополняются. Повествование движется не по календарю, а по ассоциациям Йоссариана. Повтор показывает, что травматический эпизод невозможно оставить в прошлом."
    },
    {
      "title": "Образ Сноудена разрушает отвлечённую военную риторику",
      "proof": "Во время гибели Сноудена Йоссариан сталкивается с физической уязвимостью человека. Высокие слова о славе и долге уступают конкретной правде разорванного тела. После этого желание героя выжить приобретает не трусливый, а нравственно оправданный смысл."
    },
    {
      "title": "Коммерция у Хеллера становится продолжением войны",
      "proof": "Майло Миндербиндер создаёт международную торговую систему, в которой прибыль важнее принадлежности к своей армии. Он способен организовать бомбардировку собственной базы, если сделка выгодна. Экономическая логика оказывается сильнее национального долга и человеческой жизни."
    },
    {
      "title": "Воннегут соединяет автобиографическое свидетельство и фантастическую условность",
      "proof": "В «Бойне номер пять» основой становится пережитая автором бомбардировка Дрездена. Однако прямой реалистический рассказ кажется недостаточным. Поэтому история Билли Пилигрима соединяет военный плен, путешествия во времени, планету Тральфамадор и авторские вмешательства."
    },
    {
      "title": "«Расклеенность во времени» выражает состояние травмированного сознания",
      "proof": "Билли не управляет перемещениями между эпизодами жизни. Он внезапно оказывается то на войне, то в послевоенной Америке, то на Тральфамадоре. Такая композиция показывает, что травма разрушила последовательность биографии: прошлое постоянно возвращается как настоящее."
    },
    {
      "title": "Формула «такие дела» передаёт бессилие перед массовой смертью",
      "proof": "Фраза повторяется после сообщений о смерти людей. С одной стороны, она воспроизводит тральфамадорское принятие неизменности времени; с другой — звучит как защита сознания от невыносимого количества гибелей. Механический повтор одновременно комичен и трагичен."
    },
    {
      "title": "Тральфамадорская философия ставит проблему свободы",
      "proof": "Тральфамадорцы видят все моменты времени одновременно и считают каждое событие неизменным. Такая позиция помогает Билли пережить страх смерти, но может оправдывать пассивность перед насилием. Роман не предлагает её как окончательную истину, а показывает психологическую привлекательность отказа от ответственности."
    },
    {
      "title": "Поэтика обоих авторов соединяет комизм и нравственный протест",
      "proof": "Хеллер разоблачает бюрократическую логику войны, Воннегут — невозможность связно осмыслить массовое уничтожение. Смех не примиряет с происходящим. Он разрушает официальную серьёзность институтов и возвращает внимание к отдельному человеческому существованию."
    }
  ],
  "95": [
    {
      "title": "Битничество возникает как протест против американского конформизма 1950-х годов",
      "proof": "Послевоенное общество предлагало человеку модель успеха, основанную на стабильной работе, семье, потреблении и внешней респектабельности. Битники воспринимали такую жизнь как духовно пустую и противопоставляли ей дорогу, импровизацию, непосредственный опыт и отказ от установленных ролей."
    },
    {
      "title": "Слово beat соединяет значения усталости и духовного прозрения",
      "proof": "Герой битнической литературы чувствует себя разбитым, выброшенным из общественного порядка и незащищённым. Одновременно это состояние может открыть иной способ существования, связанный со свободой, религиозным поиском и интенсивностью переживания."
    },
    {
      "title": "Дорога становится центральным образом битнической культуры",
      "proof": "В романе Керуака «В дороге» путешествие не подчинено конечной практической цели. Герои постоянно перемещаются по Америке, встречают людей, ищут музыку, любовь и чувство полноты. Дорога выражает желание выйти из неподвижной социальной идентичности."
    },
    {
      "title": "Сал Парадайз и Дин Мориарти представляют разные стороны битнического опыта",
      "proof": "Сал выступает наблюдателем и писателем, стремящимся осмыслить пережитое. Дин воплощает энергию, импульсивность и постоянное движение. Его свобода привлекательна, но связана с безответственностью перед близкими. Роман одновременно создаёт миф о Дине и показывает разрушительную сторону этого мифа."
    },
    {
      "title": "Спонтанная проза Керуака ориентируется на ритм джаза",
      "proof": "Длинные фразы, повторы, быстрые перечисления и свободные переходы передают движение дороги и сознания. Автор стремится приблизить письмо к импровизации музыканта. При этом впечатление непосредственности является результатом продуманной художественной организации."
    },
    {
      "title": "«Вопль» Гинзберга становится поэтическим манифестом поколения",
      "proof": "Поэма начинается с образа лучших умов поколения, разрушенных безумием и общественным давлением. Длинные строки, анафоры и перечисления создают ритм публичной исповеди и обвинения. Частный опыт превращается в коллективный голос тех, кого нормативная Америка объявила неприемлемыми."
    },
    {
      "title": "Образ Молоха выражает обезличивающую власть цивилизации",
      "proof": "Молох соединяет государство, деньги, индустрию, войну и холодный разум. Это не конкретный персонаж, а символ системы, которая требует подчинения и уничтожает творческую личность. Мифологический образ придаёт социальной критике масштаб религиозного видения."
    },
    {
      "title": "Битническая литература расширяет границы допустимого опыта",
      "proof": "Авторы открыто пишут о наркотиках, сексуальности, психическом кризисе, маргинальной среде и отказе от традиционной карьеры. Темы, вытесненные из официальной культуры, становятся частью литературного языка."
    },
    {
      "title": "Берроуз радикально разрушает традиционное повествование",
      "proof": "В «Голом завтраке» отсутствует единый последовательный сюжет. Текст состоит из фрагментов, галлюцинаций, сатирических сцен и повторяющихся образов. Такая форма передаёт зависимость, распад личности и насильственное действие языка и социальных систем."
    },
    {
      "title": "Техника cut-up ставит под сомнение авторский контроль",
      "proof": "Текст разрезается на фрагменты и соединяется в новом порядке. Случайное соседство слов создаёт неожиданные связи и разрушает привычную логику. Для Берроуза язык является не нейтральным инструментом, а силой, способной программировать сознание."
    },
    {
      "title": "Освобождение у битников остаётся внутренне противоречивым",
      "proof": "Дорога, наркотический опыт и отказ от нормы могут расширять сознание, но также приводить к одиночеству, зависимости и разрушению отношений. Наиболее значительные произведения не только романтизируют свободу, но и показывают её цену."
    }
  ],
  "96": [
    {
      "title": "«Непреодолённое прошлое» обозначает сохранение нацистского наследия в послевоенной Германии",
      "proof": "Военное поражение не означает автоматического нравственного очищения общества. Люди, служившие прежнему режиму или приспосабливавшиеся к нему, могут сохранить положение и влияние. Новая респектабельность скрывает отсутствие подлинного признания вины."
    },
    {
      "title": "Бёлль противопоставляет официальную историю частной человеческой памяти",
      "proof": "Государство и общество стремятся быстро перейти к восстановлению и экономическому успеху. Персонажи Бёлля помнят погибших, разрушенные семьи, фронт и собственное участие в событиях. Частная память сопротивляется удобному забвению."
    },
    {
      "title": "Война изображается через повседневный опыт обычного человека",
      "proof": "Писателя интересуют солдаты, вдовы, дети, инвалиды и люди, возвращающиеся домой. Он избегает героической панорамы. Война раскрывается через голод, страх, усталость, потерю близких и невозможность вернуться к прежней жизни."
    },
    {
      "title": "Возвращение домой не означает восстановления нормальности",
      "proof": "Герой обнаруживает разрушенное пространство и общество, которое хочет жить так, будто катастрофа завершена. Однако его тело, память и семейные утраты сохраняют войну внутри мирной жизни. Дом оказывается одновременно желанной целью и местом отчуждения."
    },
    {
      "title": "«Бильярд в половине десятого» строится как роман памяти нескольких поколений",
      "proof": "История семьи Фемелей связывает кайзеровскую Германию, нацизм и послевоенную эпоху. События прошлого раскрываются через воспоминания разных персонажей. Семейная хроника показывает историческую преемственность насилия и конформизма."
    },
    {
      "title": "Противопоставление «причастия агнца» и «причастия буйвола» выражает нравственный выбор",
      "proof": "«Буйволы» воплощают власть, насилие, милитаризм и готовность подчиняться коллективной агрессии. «Агнцы» связаны с жертвами, состраданием и отказом участвовать в жестокости. Символическое противопоставление проходит через поколения и раскрывает разные способы отношения к истории."
    },
    {
      "title": "Разрушение аббатства становится нравственно противоречивым поступком",
      "proof": "Роберт Фемель во время войны уничтожает здание, построенное его отцом. Формально это военное действие, но оно направлено и против символа общества, которое служило власти. Поступок показывает, что сопротивление историческому злу тоже может принимать разрушительную форму."
    },
    {
      "title": "Экономическое чудо не устраняет нравственной пустоты",
      "proof": "Послевоенная Германия быстро восстанавливает города, карьерные структуры и материальное благополучие. Однако Бёлль показывает, что достаток может стать новым способом забыть о жертвах и ответственности. Внешняя нормальность не равна внутреннему исцелению."
    },
    {
      "title": "Католическая и буржуазная респектабельность становятся объектами критики",
      "proof": "Институты, провозглашающие мораль, способны поддерживать общественный конформизм и закрывать глаза на прошлое. Писатель отделяет подлинную веру и сострадание от официальной благопристойности."
    },
    {
      "title": "В романе «Глазами клоуна» частная судьба раскрывает лицемерие послевоенного общества",
      "proof": "Ганс Шнир не принимает социальных компромиссов и церковной морали, которая вмешивается в его отношения с Мари. Его одиночество связано не только с личной неудачей, но и с невозможностью приспособиться к обществу, быстро сменившему лозунги, но сохранившему привычку к подчинению."
    },
    {
      "title": "Ирония и лаконизм защищают текст от прямой назидательности",
      "proof": "Бёлль часто строит произведение на бытовой детали, сдержанном диалоге и ограниченной точке зрения. Нравственная оценка возникает из несоответствия между официальной формулой и конкретной человеческой судьбой."
    }
  ],
  "97": [
    {
      "title": "Творчество Грасса направлено на критическое осмысление немецкой истории XX века",
      "proof": "Писатель обращается к нацизму, войне, послевоенному восстановлению и проблеме коллективной памяти. Его интересует не только преступление политических лидеров, но и поведение обычных людей, которые приспосабливались, молчали или извлекали выгоду."
    },
    {
      "title": "Гротеск позволяет разрушить героическую и оправдательную версию истории",
      "proof": "Реальные события соединяются с фантастикой, телесной гиперболой, абсурдом и карнавальным смехом. История теряет торжественную монументальность и раскрывается как пространство лжи, страха и человеческой слабости."
    },
    {
      "title": "«Жестяной барабан» строится вокруг необычного рассказчика",
      "proof": "Оскар Мацерат утверждает, что в три года сознательно перестал расти. Он рассказывает свою историю из лечебного учреждения и постоянно меняет дистанцию по отношению к самому себе. Его повествование нельзя считать полностью достоверным."
    },
    {
      "title": "Отказ Оскара расти выражает неприятие взрослого общества",
      "proof": "Мир взрослых связан с лицемерием, сексуальной ложью, политическим конформизмом и насилием. Сохраняя детское тело, Оскар пытается не участвовать в нём. Однако позиция наблюдателя не освобождает его от ответственности: он способен манипулировать людьми и влиять на события."
    },
    {
      "title": "Жестяной барабан становится инструментом памяти и протеста",
      "proof": "Оскар отбивает ритм собственной жизни и разрушает официальную музыку общественных ритуалов. Во время нацистского собрания его игра превращает марш в танец. Искусство временно нарушает дисциплину массы, но не уничтожает политическую систему."
    },
    {
      "title": "Разрушительный голос Оскара соединяет искусство и агрессию",
      "proof": "Его крик способен разбивать стекло. Голос выражает отказ подчиняться внешнему порядку, но одновременно обладает разрушительной силой. Художник у Грасса не является безусловно нравственным спасителем."
    },
    {
      "title": "Телесность возвращает истории материальную конкретность",
      "proof": "Еда, запахи, болезнь, уродство и физиологические детали противостоят отвлечённому историческому языку. Грасс показывает, что политические процессы реализуются через человеческие тела и повседневную жизнь."
    },
    {
      "title": "Данциг становится пространством сложной культурной памяти",
      "proof": "Город связан с немецкой, польской и кашубской традициями. Его история не укладывается в простую национальную схему. Судьба города позволяет показать нестабильность границ, идентичности и исторического права."
    },
    {
      "title": "Ненадёжное повествование ставит проблему ответственности за рассказ о прошлом",
      "proof": "Оскар выбирает, что помнить, что скрывать и как объяснять собственное участие. Читатель вынужден различать факт, фантазию и самооправдание. Историческая память раскрывается как сложный и нравственно опасный процесс."
    },
    {
      "title": "«Данцигская трилогия» соединяет частные истории и коллективную вину",
      "proof": "«Жестяной барабан», «Кошки-мышки» и «Собачьи годы» показывают разные формы приспособления, стыда и попытки забыть прошлое. Повторяющееся пространство и мотивы создают многоголосную картину эпохи."
    },
    {
      "title": "Политическая позиция Грасса не превращает произведение в прямую декларацию",
      "proof": "Автор активно участвовал в общественной жизни, но в прозе избегал простой схемы виновных и невиновных. Гротеск и ненадёжный рассказчик показывают, как трудно отделить жертву, свидетеля и участника исторического зла."
    }
  ],
  "98": [
    {
      "title": "«Парфюмер» сочетает постмодернистскую игру с традицией исторического и романтического романа",
      "proof": "Произведение использует форму биографии необыкновенного героя, исторический материал XVIII века, мотив исключительного гения и подробное описание ремесла. Одновременно эти традиции иронически переосмысливаются: гениальный художник оказывается лишённым человечности убийцей."
    },
    {
      "title": "Определение романа как постмодернистского допустимо, но не исчерпывает его поэтику",
      "proof": "В тексте присутствуют жанровая игра, стилизация, пародийное переосмысление мифа о гении и соединение массового сюжета с философской проблематикой. Однако роман также сохраняет черты притчи, исторической прозы, готики и романтической истории об исключительном художнике."
    },
    {
      "title": "Историческая достоверность соединяется с гротеском",
      "proof": "Париж XVIII века подробно изображён через ремесло, торговлю, общественную иерархию и бытовые детали. Одновременно мир представлен через гиперболизированное зловоние, уродство и физическую материальность. История становится одновременно убедительной и нарочито деформированной."
    },
    {
      "title": "Запах является главным принципом организации художественного мира",
      "proof": "Гренуй почти не интересуется внешним обликом, речью или нравственными качествами людей. Он воспринимает мир через запахи и способен различать их мельчайшие оттенки. Читателю предлагается необычная сенсорная перспектива, меняющая привычную иерархию чувств."
    },
    {
      "title": "Отсутствие собственного запаха символизирует отсутствие устойчивой человеческой идентичности",
      "proof": "Окружающие бессознательно ощущают в Гренуе нечто пугающее, потому что он не обладает индивидуальным запахом. Он способен воспринимать и присваивать мир, но сам не вступает в естественную взаимность с другими людьми. Его невидимость выражает внутреннюю пустоту."
    },
    {
      "title": "Гренуй пародийно переосмысливает романтический образ гения",
      "proof": "Он обладает уникальным даром, презирает толпу и посвящает жизнь созданию совершенного произведения. Но его искусство основано на убийстве и превращении человека в материал. Возвышенный миф о художнике доводится до преступного и гротескного предела."
    },
    {
      "title": "Искусство у Гренуя становится не формой познания, а технологией власти",
      "proof": "Герой хочет создать аромат, который заставит людей любить его. Он не стремится к взаимности и не выражает внутренний мир. Его произведение программирует чужую реакцию и лишает толпу способности к самостоятельной оценке."
    },
    {
      "title": "Убийства девушек показывают превращение личности в эстетическое сырьё",
      "proof": "Гренуй не воспринимает жертв как самостоятельных людей. Он сохраняет их запах так же, как парфюмер извлекает эссенцию из цветка. Эстетическая цель полностью уничтожает нравственную границу между творчеством и преступлением."
    },
    {
      "title": "Телесность разрушает декоративный образ прошлого",
      "proof": "Город изображён через запахи рынков, тел, нечистот, мастерских и разлагающейся материи. Историческая эпоха лишается музейной красоты. Такая материальность одновременно создаёт достоверность и пародирует традиционную идеализацию XVIII века."
    },
    {
      "title": "Сцена казни раскрывает управляемость массового сознания",
      "proof": "Под воздействием аромата толпа перестаёт видеть в Гренуе убийцу и воспринимает его как прекрасное и невинное существо. Суд, память и мораль мгновенно уступают чувственному внушению. Общество оказывается готовым отказаться от истины ради сильного впечатления."
    },
    {
      "title": "Абсолютная власть над людьми не приносит герою подлинной любви",
      "proof": "Гренуй понимает, что толпа любит не его самого, а созданный им запах. Полный успех только подтверждает, что собственной личности, способной вступить в отношения с другим, у него нет. Триумф превращается в окончательное доказательство одиночества."
    },
    {
      "title": "Финал соединяет самоуничтожение, потребление и последнюю манипуляцию",
      "proof": "Гренуй обливается духами, после чего толпа в состоянии восторженной любви разрывает и съедает его. Герой уничтожает себя собственным шедевром. Любовь, созданная искусственно, принимает форму буквального потребления."
    },
    {
      "title": "Авторская позиция сохраняет двойственность",
      "proof": "Рассказчик подробно и увлекательно описывает талант Гренуя, заставляя читателя следить за его успехами. Одновременно преступления героя нравственно отвратительны. Эстетическое восхищение мастерством вступает в конфликт с этической оценкой."
    }
  ],
  "99": [
    {
      "title": "Интеллектуальная проза превращает философскую проблему в художественный сюжет",
      "proof": "Борхес и Кортасар исследуют время, бесконечность, случайность, язык, авторство и границы реальности не в форме отвлечённого трактата, а через рассказ, фантастическую ситуацию, композиционную игру и парадокс."
    },
    {
      "title": "Интеллектуальная фантастика Борхеса и Кортасара отличается от классического магического реализма",
      "proof": "Магический реализм чаще соединяет миф, историю, народное сознание и повседневную жизнь целого сообщества. У Борхеса фантастическое прежде всего воплощает философскую конструкцию, а у Кортасара нарушает устойчивость индивидуального восприятия и привычной реальности. Поэтому их поэтику точнее связывать с интеллектуальной и экспериментальной фантастикой."
    },
    {
      "title": "Борхес создаёт короткий текст с масштабом воображаемой энциклопедии",
      "proof": "Его рассказы могут имитировать рецензию, научную статью, биографию, комментарий к несуществующей книге или историческое свидетельство. Небольшой объём открывает огромное пространство вымышленных источников и философских предположений."
    },
    {
      "title": "Лабиринт становится моделью мира и человеческого познания",
      "proof": "Лабиринт у Борхеса может быть зданием, книгой, временем, системой зеркал или сетью решений. Человек ищет центр и окончательный смысл, но сам процесс поиска создаёт новые ответвления. Познание не завершает лабиринт, а продолжает его."
    },
    {
      "title": "«Вавилонская библиотека» изображает Вселенную как бесконечный текст",
      "proof": "Библиотека содержит все возможные сочетания знаков, а значит, все истинные и ложные книги. Полнота информации не даёт людям знания, потому что они не способны найти и распознать нужный текст. Бесконечность информации становится формой недоступности смысла."
    },
    {
      "title": "«Сад расходящихся тропок» предлагает модель множественного времени",
      "proof": "В книге Цюй Пэна каждое возможное решение осуществляется и создаёт отдельную ветвь будущего. Время перестаёт быть единственной линией. Детективный и шпионский сюжет становится художественным воплощением философской идеи параллельных возможностей."
    },
    {
      "title": "Борхес ставит под сомнение устойчивость авторства",
      "proof": "В рассказе «Пьер Менар, автор “Дон Кихота”» словесно одинаковые фрагменты получают другой смысл, потому что созданы в иную эпоху. Значение определяется не только текстом, но и культурным контекстом. Автор перестаёт быть единственным и окончательным источником смысла."
    },
    {
      "title": "Кортасар вводит фантастическое внутрь бытовой реальности",
      "proof": "Необычное не объясняется и не отделяется от повседневного мира. Комната может быть захвачена неизвестной силой, привычный маршрут — открыть иной уровень реальности, а сознание — перейти в другое тело. Фантастическое обнаруживает хрупкость нормального порядка."
    },
    {
      "title": "«Захваченный дом» строится на принципиально неназванной угрозе",
      "proof": "Брат и сестра постепенно оставляют комнаты, занятые неизвестным присутствием. Рассказ не сообщает, что именно вытесняет героев. Благодаря этому событие допускает психологическое, социальное, историческое и метафизическое толкование."
    },
    {
      "title": "В рассказах Кортасара граница между субъектом и реальностью становится неустойчивой",
      "proof": "В «Ночью, на спине, лицом кверху» современная реальность и мир древнего ритуала меняются местами, а читатель до финала не понимает, какой уровень был сном. Повествование показывает, что чувство реальности зависит от точки зрения и структуры сознания."
    },
    {
      "title": "«Игра в классики» превращает композицию в форму читательского выбора",
      "proof": "Роман можно читать последовательно или двигаться по предложенной автором схеме между главами. Единственный обязательный порядок отсутствует. Читатель становится участником построения произведения."
    },
    {
      "title": "Игра у Кортасара связана с поиском иной формы существования",
      "proof": "Герои пытаются выйти за пределы привычного сознания через любовь, музыку, случай, детскую игру и нарушение логики. Но достижение целостности постоянно откладывается. Игра одновременно освобождает и обнаруживает невозможность окончательного выхода."
    },
    {
      "title": "Джаз становится моделью художественной импровизации",
      "proof": "В прозе Кортасара эпизоды, голоса и мотивы могут соединяться как музыкальные импровизации. Возврат темы не означает точного повторения: каждый раз она получает новое развитие. Такая композиция противопоставлена жёстко заданной последовательности."
    },
    {
      "title": "Борхеса и Кортасара объединяет активная роль читателя",
      "proof": "У Борхеса читатель должен распознавать философские парадоксы, вымышленные источники и интертекстуальные связи. У Кортасара — выдерживать неопределённость и самостоятельно выбирать маршрут чтения. Произведение не сообщает готовую истину, а создаёт интеллектуальную задачу."
    }
  ],
  "100": [
    {
      "title": "Роман соединяет семейную хронику, национальную историю и миф",
      "proof": "История рода Буэндиа охватывает несколько поколений и одновременно отражает развитие Макондо от основания до исчезновения. Частная жизнь семьи включена в войны, экономические изменения, иностранное вмешательство и историческое насилие. Семейная хроника становится моделью истории Латинской Америки."
    },
    {
      "title": "Магический реализм изображает чудесное как естественную часть мира",
      "proof": "Вознесение Ремедиос Прекрасной, многолетний дождь, призраки и необыкновенное долголетие не вызывают у рассказчика удивления. Чудесное описывается тем же спокойным тоном, что и бытовое событие. Благодаря этому миф, народное верование и историческая реальность существуют на равных правах."
    },
    {
      "title": "Макондо проходит путь от утопии к катастрофе",
      "proof": "В начале это изолированное поселение, где вещи ещё не имеют устойчивых названий, а мир кажется новым. Постепенно в Макондо входят государственная власть, гражданские войны, техника, капитал и массовое насилие. История разрушает первоначальную целостность."
    },
    {
      "title": "Повторяющиеся имена создают циклическую модель времени",
      "proof": "В роду вновь появляются Аурелиано, Хосе Аркадио, Амаранты и другие повторяющиеся типы. Вместе с именами возвращаются черты характера, страсти и ошибки. Семья не осмысляет опыт предков и потому воспроизводит их судьбы."
    },
    {
      "title": "Аурелиано и Хосе Аркадио воплощают разные жизненные начала",
      "proof": "Аурелиано обычно связан с одиночеством, рефлексией, замкнутостью и интеллектуальным поиском. Хосе Аркадио — с телесной силой, импульсивностью и действием. Эти линии повторяются в поколениях, но не создают гармонии."
    },
    {
      "title": "Одиночество является не только личным, но и историческим состоянием",
      "proof": "Герои неспособны полностью понять друг друга, замыкаются в любви, власти, войне, ремесле или воспоминании. Макондо также изолировано от исторического опыта и не умеет сохранять правду о собственном прошлом. Личное одиночество соединяется с культурной амнезией."
    },
    {
      "title": "Эпидемия бессонницы символизирует утрату памяти",
      "proof": "Жители постепенно забывают названия и назначение предметов и начинают прикреплять к ним надписи. Язык временно удерживает мир от исчезновения, но механическая маркировка не заменяет живой памяти. Эпизод предвосхищает последующее общественное забвение."
    },
    {
      "title": "Гражданская война разрушает идеал исторического действия",
      "proof": "Полковник Аурелиано Буэндиа начинает борьбу, связанную с политическими убеждениями, но постепенно война превращается в повторяющийся механизм. Цели теряются, а насилие продолжает само себя. Герой возвращается к изготовлению золотых рыбок, замыкаясь в бессмысленном повторе."
    },
    {
      "title": "Расстрел рабочих банановой компании соединяет историю и коллективное забвение",
      "proof": "После массового убийства официальная версия утверждает, что события не было. Даже жители Макондо постепенно принимают это отрицание. Историческое преступление совершается дважды: сначала как физическое уничтожение, затем как уничтожение памяти."
    },
    {
      "title": "Гипербола выражает масштаб страсти и истории",
      "proof": "Дождь длится годами, герои обладают невероятной силой, количество погибших превышает возможность бытового подсчёта. Преувеличение не удаляет текст от реальности, а позволяет передать опыт, который не помещается в обычную меру."
    },
    {
      "title": "Рукописи Мелькиадеса соединяют письмо и судьбу",
      "proof": "История Буэндиа оказывается заранее записанной, но может быть прочитана только в момент завершения. Последний Аурелиано читает о собственной жизни одновременно с её исчезновением. Текст и мир совпадают в финальной точке."
    },
    {
      "title": "Финал завершает циклическое время и весь роман одним актом чтения",
      "proof": "Аурелиано понимает, что повторение истории было заключено в рукописи и что Макондо исчезнет, как только текст будет прочитан до конца. Семья обречена не абстрактным роком, а неспособностью выйти из одиночества, инцеста, повторения и забвения."
    },
    {
      "title": "Композиция соединяет цикличность и необратимое историческое движение",
      "proof": "Имена, характеры и ситуации возвращаются, создавая ощущение круга. Одновременно Макондо движется от основания к уничтожению. Повтор не отменяет истории, а ведёт её к окончательной катастрофе."
    }
  ]
};


function contextForQuestion(q){return HISTORICAL_CONTEXT[q.section]||'Сначала обозначьте историко-литературный период. Затем переходите к направлению, автору и произведению.'}
function bioForQuestion(q){return AUTHOR_BIO_FACTS[q.number]||''}
function episodePoolForMaterials(m){
  const exact=[];
  (m.works||[]).forEach(w=>{
    const key=Object.keys(DETAILED_EPISODES).find(k=>w.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(w.toLowerCase()));
    if(key)exact.push(...DETAILED_EPISODES[key]);
  });
  const legacy=(m.episodes||[]).map((text,i)=>({loc:'эпизод для аргумента',text}));
  return exact.length?exact:legacy;
}
function evidenceForPoint(m,point,index){
  const manual=MANUAL_THESIS_EVIDENCE[m.q?.number];
  if(manual?.[index]){
    const e=manual[index];
    return {loc:'Доказательство',title:e.title,text:e.proof,manual:true};
  }
  const pool=episodePoolForMaterials(m);
  if(pool.length){
    const e=pool[index%pool.length];
    return {loc:e.loc,title:sentencePoint(point,index),text:e.text,manual:false};
  }
  const work=m.works?.[0]||'основное произведение билета';
  return {loc:'ориентир для ответа',title:sentencePoint(point,index),text:`После общего тезиса назовите ${work}. Кратко перескажите сцену, где проявляется этот признак. Затем объясните, как деталь, поступок героя или композиционный приём подтверждает аргумент.`,manual:false};
}

function renderTicketAnswers(){
  const host=$('#ticket-answers');if(!host)return;
  const term=($('#answer-search')?.value||'').trim().toLowerCase();
  const fam=$('#answer-familiarity')?.value||'all';
  const sec=$('#answer-section')?.value||'all';
  const rows=EXAM_QUESTIONS.map(answerMaterials).filter(m=>{
    const hay=`${m.q.number} ${m.q.text} ${m.q.section} ${m.works.join(' ')} ${m.thesis}`.toLowerCase();
    return (!term||hay.includes(term))&&(fam==='all'||m.level===fam)&&(sec==='all'||m.q.section===sec);
  });
  host.innerHTML=rows.map(m=>{
    const ctx=contextForQuestion(m.q), bio=bioForQuestion(m.q);
    const argumentsHtml=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(e.title||p)}</b></div><div class="argument-proof"><span class="evidence-label">Опора: ${esc(e.loc)}</span><p>${esc(e.text)}</p><p class="argument-link"><b>Связь с тезисом.</b> Этот эпизод переводит общий признак в конкретный художественный факт.</p></div></div>`}).join('');
    return `<article class="ticket-answer-card card" data-answer-card="${m.q.number}">
      <div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div>
      <div class="ticket-answer-body">
        ${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}
        <div class="answer-block context-block"><h4>1. От общего: эпоха и причины</h4><p>${esc(ctx)}</p></div>
        ${bio?`<div class="answer-block bio-block"><h4>2. Автор и биографический контекст</h4><p>${esc(bio)}</p></div>`:''}
        <div class="answer-block"><h4>${bio?'3':'2'}. Главный тезис</h4><div class="ready-answer">${esc(m.thesis)}</div></div>
        <div class="answer-block"><h4>${bio?'4':'3'}. От частного: аргументы и доказательства</h4>${argumentsHtml}</div>
        <div class="answer-block"><h4>${bio?'5':'4'}. Произведения для повторения</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Подберите пример из обзора эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Краткая сводка.</b> ${esc(m.summary)}</p>`:''}</div>
        <div class="answer-status-row"><span class="tiny-note">Сначала проговорите общий контекст. Затем докажите каждый тезис эпизодом.</span>${statusControls(m.q.number,true)}</div>
      </div></article>`;
  }).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
  $$('[data-toggle-answer]',host).forEach(b=>b.onclick=()=>{const card=$(`[data-answer-card="${b.dataset.toggleAnswer}"]`,host);card.classList.toggle('open');b.textContent=card.classList.contains('open')?'Свернуть':'Открыть ответ'});
  bindStatusButtons(host);
}

const FAMILIAR_THEORY_EXAMPLES=[
 {id:'familiar-romanticism-novalis',difficulty:2,ticketNumbers:[23,24,25,26,29],prompt:'Как «Генрих фон Офтердинген» помогает увидеть отличие немецкого романтизма от английского?',correct:'Немецкий романтизм строит философский символ единства мира, тогда как английский чаще начинает с природы и личного опыта',options:['Немецкий романтизм строит философский символ единства мира, тогда как английский чаще начинает с природы и личного опыта','Новалис изображает только социальный быт','Английский романтизм полностью исключает природу','Обе традиции основаны на натурализме'],explain:'Сначала назовите общее двоемирие. Затем укажите философию и символ голубого цветка у Новалиса. После этого сопоставьте с природной лирикой озёрной школы.'},
 {id:'familiar-realism-flober',difficulty:2,ticketNumbers:[39,40,45],prompt:'Какой эпизод «Госпожи Бовари» лучше всего показывает реалистическое разоблачение романтических клише?',correct:'Любовное признание Родольфа во время сельскохозяйственной выставки',options:['Любовное признание Родольфа во время сельскохозяйственной выставки','Сон Генриха о голубом цветке','Разговор Гамлета с призраком','Появление носорогов'],explain:'Общее правило реализма — проверка мечты средой. Частный пример — монтаж любовной речи и официальных речей о хозяйстве.'},
 {id:'familiar-naturalism-zola',difficulty:2,ticketNumbers:[53],prompt:'Как «Жерминаль» показывает натуралистическое понимание среды?',correct:'Шахта изображена как система, которая физически и социально формирует жизнь людей',options:['Шахта изображена как система, которая физически и социально формирует жизнь людей','Среда не влияет на героев','Действие полностью переносится в миф','Герои свободны от наследственности и труда'],explain:'От общего принципа среды переходите к спуску Этьена в Ворё. Пространство шахты объясняет тело, быт и конфликт рабочих.'},
 {id:'familiar-modernism-kafka-faulkner',difficulty:3,ticketNumbers:[71,74,83],prompt:'Что объединяет «Превращение» Кафки и первую часть «Звука и ярости»?',correct:'Нарушенная форма повествования передаёт отчуждение и нестабильное сознание',options:['Нарушенная форма повествования передаёт отчуждение и нестабильное сознание','Оба текста соблюдают классицистические единства','Оба романа строятся как документальная хроника войны','В обоих отсутствует психологизм'],explain:'Сначала назовите модернистский кризис внешней причинности. Затем сопоставьте деловой тон фантастики Кафки и ассоциативное время Бенджи.'},
 {id:'familiar-absurd-examples',difficulty:2,ticketNumbers:[88],prompt:'Как «Лысая певица» и «Носорог» по-разному раскрывают кризис языка и общества?',correct:'У Ионеско речь распадается в автоматизм, а превращение в носорогов показывает массовое подчинение',options:['У Ионеско речь распадается в автоматизм, а превращение в носорогов показывает массовое подчинение','Обе пьесы утверждают устойчивость логического диалога','Обе пьесы являются историческими хрониками','В них отсутствует общественная проблематика'],explain:'Общее — кризис смысла. Частное — бессмысленный диалог в одной пьесе и зараза конформизма в другой.'},
 {id:'familiar-postmodernism-fowles-suskind',difficulty:3,ticketNumbers:[86,91,98],prompt:'Как «Женщина французского лейтенанта» и «Парфюмер» показывают постмодернистскую работу с традицией?',correct:'Фаулз разрушает единственный финал, а Зюскинд пародирует роман о гении',options:['Фаулз разрушает единственный финал, а Зюскинд пародирует роман о гении','Оба автора полностью отказываются от культурных цитат','Оба текста строятся по правилам классицизма','Постмодернизм исключает игру с жанром'],explain:'Сначала назовите диалог с прежними жанрами. Затем покажите разные способы игры: метаповествование и пародию.'},
 {id:'familiar-american-dream',difficulty:3,ticketNumbers:[79,80],prompt:'Как «Великий Гэтсби» и «Американская трагедия» по-разному критикуют американскую мечту?',correct:'Гэтсби превращает успех в попытку вернуть прошлое, Клайд — в путь к социальному преступлению',options:['Гэтсби превращает успех в попытку вернуть прошлое, Клайд — в путь к социальному преступлению','Оба героя достигают устойчивого счастья','Оба романа отвергают тему денег','Оба текста являются романтическими сказками'],explain:'Общее — миф о равных возможностях. Частное — зелёный огонёк у Фицджеральда и социальная ловушка Клайда у Драйзера.'}
];

const _buildTheoryQuestionBankV6=buildTheoryQuestionBank;
buildTheoryQuestionBank=function(){
  const bank=_buildTheoryQuestionBankV6();
  return [...FAMILIAR_THEORY_EXAMPLES,...bank].map(q=>{
    if(q.id.startsWith('ticket-')){
      const n=q.ticketNumbers?.[0]; const exam=EXAM_QUESTIONS.find(x=>x.number===n); const m=exam?answerMaterials(exam):null;
      if(m&&m.works?.length){
        const familiar=m.works.find(w=>USER_READING_PROFILE.known.some(k=>w.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(w.toLowerCase())))||m.works[0];
        q.explain=`От общего к частному: сначала назовите эпоху и направление. Затем используйте «${familiar}» как пример. ${q.explain}`;
      }
    }
    return q;
  });
};
refreshTheoryQuestions();

// ===== v7: исправление карты, тестов и полноценных ответов =====
let selectedMapCountry='';
const COUNTRY_MAP_LABELS={
  'Великобритания':'United Kingdom','Франция':'France','Германия':'Germany','США':'United States of America',
  'Италия':'Italy','Испания':'Spain','Ирландия':'Ireland','Колумбия':'Colombia','Аргентина':'Argentina',
  'Норвегия':'Norway','Австрия':'Austria','Чехия':'Czechia','Швейцария':'Switzerland','Бельгия':'Belgium',
  'Греция':'Greece','Дания':'Denmark','Швеция':'Sweden','Польша':'Poland','Россия':'Russia'
};
function highlightMapCountry(country){
  selectedMapCountry=country||'';
  const label=COUNTRY_MAP_LABELS[selectedMapCountry]||selectedMapCountry;
  $$('#world-shapes .land').forEach(p=>p.classList.toggle('country-selected',!!label&&p.getAttribute('aria-label')===label));
}
const _focusCountryV7=focusCountry;
focusCountry=function(country){
  highlightMapCountry(country);
  _focusCountryV7(country);
  const c=$('#map-country');if(c&&c.value!==country)c.value=country;
};
const _applyMapTransformV7=applyMapTransform;
applyMapTransform=function(){
  _applyMapTransformV7();
  const s=mapState.scale||1;
  $$('.author-marker').forEach(n=>n.setAttribute('r',String(Math.max(.75,3.1/s))));
  $$('.work-marker').forEach(n=>{
    const cx=Number(n.getAttribute('x'))+Number(n.getAttribute('width'))/2;
    const cy=Number(n.getAttribute('y'))+Number(n.getAttribute('height'))/2;
    const side=Math.max(1.5,6.2/s);n.setAttribute('x',cx-side/2);n.setAttribute('y',cy-side/2);n.setAttribute('width',side);n.setAttribute('height',side);
  });
  $$('.cluster circle').forEach(n=>n.setAttribute('r',String(Math.max(7,15/s))));
};
const _zoomMapV7=zoomMap;
zoomMap=function(factor,cx,cy){
  const old=mapState.scale;const next=Math.min(20,Math.max(.7,old*factor));
  const wx=(cx-mapState.tx)/old,wy=(cy-mapState.ty)/old;
  mapState.scale=next;mapState.tx=cx-wx*next;mapState.ty=cy-wy*next;applyMapTransform();
};
const _bindFilterV7=bindFilter;
bindFilter=function(prefix){
  _bindFilterV7(prefix);
  if(prefix==='map'){
    const c=$('#map-country');
    c.addEventListener('change',()=>{if(c.value==='all')highlightMapCountry('');else focusCountry(c.value)});
    $('#map-reset').addEventListener('click',()=>highlightMapCountry(''));
  }
};

function cleanTopic(text){return String(text).replace(/^\d+\.?\s*/,'').replace(/\s+/g,' ').trim()}
function theoryCore(q){
  const t=q.text.toLowerCase();
  if(t.includes('барокко'))return 'Барокко возникает в XVII веке как искусство кризисного и изменчивого мира. Для него характерны контрасты, метафорическая сложность, ощущение непрочности земного порядка и соединение религиозного пафоса с телесностью. В Испании эти черты заметны у Кальдерона и Гонгоры, во Франции — в прециозной и религиозной словесности, в Германии — в поэзии Тридцатилетней войны.';
  if(t.includes('классицизм'))return 'Классицизм стремится подчинить художественный мир разуму, норме и иерархии жанров. Его теория связана с культурой абсолютизма и рационализмом XVII века. В драме важны единство действия, ясный конфликт долга и чувства, а также типизированные характеры.';
  if(t.includes('просвещ')||t.includes('вольтер')||t.includes('дидро')||t.includes('свифт')||t.includes('стерн'))return 'Литература Просвещения исходит из веры в разум, воспитание и общественную критику. Писатели используют философскую повесть, сатиру, роман-путешествие и экспериментальный роман, чтобы проверять существующие институты. Частный герой становится способом обсуждения устройства общества.';
  if(t.includes('романтизм')||t.includes('романтичес'))return 'Романтизм возник после Французской революции и наполеоновских войн. Разочарование в рациональном переустройстве мира усилило интерес к личности, свободе, истории, фольклору и непознаваемому. Немецкая традиция тяготеет к философии, мифу и символу, английская — к природе и личной свободе, французская — к историческому и общественному конфликту.';
  if(t.includes('реализм'))return 'Реализм XIX века исследует человека в системе общественных, экономических и семейных связей. Его основные принципы — историзм, социальная обусловленность характера, типизация и значимая бытовая деталь. Французская традиция чаще строит системный анализ общества, английская соединяет его с нравственной проблематикой, американская проверяет миф об успехе и равных возможностях.';
  if(t.includes('натурализ')||t.includes('золя'))return 'Натурализм усиливает реалистическое внимание к среде и причинности. Человек рассматривается под воздействием наследственности, физиологии, труда и социального окружения. У Золя роман уподобляется наблюдению или эксперименту, но художественный образ всегда шире научной схемы.';
  if(t.includes('символизм')||t.includes('декаданс'))return 'Символизм исходит из представления о многослойности мира. Видимая реальность понимается как знак скрытых соответствий, поэтому образ не исчерпывается одним значением. Музыкальность, внушение и ассоциативность становятся важнее прямого объяснения.';
  if(t.includes('модернизм'))return 'Модернизм формируется на фоне кризиса европейской культуры, Первой мировой войны и новых представлений о психике. Он переносит внимание с внешней последовательности событий на сознание, память, язык и субъективное время. Отсюда возникают поток сознания, монтаж, мифологические параллели и фрагментарная композиция.';
  if(t.includes('постмодернизм'))return 'Постмодернизм строит текст как диалог с прежней культурой. Он использует цитату, пародию, жанровую игру, ненадёжного рассказчика и несколько возможных истин. Автор не скрывает условность повествования, а читатель становится участником построения смысла.';
  if(t.includes('потерянного поколения'))return 'Писатели «потерянного поколения» показывают людей, чью систему ценностей разрушила Первая мировая война. Их герои не доверяют патриотической риторике, ищут частную честность и пытаются жить после травмы. Военный опыт Хемингуэя, Ремарка и Олдингтона придаёт этой теме личную достоверность.';
  if(t.includes('эпический театр')||t.includes('брехт'))return 'Эпический театр Брехта должен не растворять зрителя в переживании, а побуждать к анализу причин. Эффект отчуждения, песни, надписи и прямые обращения разрывают сценическую иллюзию. Зритель должен увидеть, что общественные отношения созданы людьми и могут быть изменены.';
  if(t.includes('абсурд'))return 'Театр абсурда показывает кризис смысла через саму форму пьесы. Диалог перестаёт обеспечивать взаимопонимание, действие зацикливается, а привычные слова превращаются в пустые формулы. У Ионеско это видно в автоматизме речи, у Беккета — в ожидании, которое не приводит к событию.';
  if(t.includes('экзистенциал'))return 'Экзистенциализм рассматривает человека как существо, которое не получает готового смысла и отвечает за собственный выбор. Свобода переживается одновременно как возможность и тяжесть. У Сартра акцент падает на выбор и ответственность, у Камю — на абсурд и солидарность.';
  const authors=questionAuthors(q.number);
  if(authors.length){const a=authors[0];return `${a.name} относится к направлению «${a.movement}». В центре его творчества находятся ${a.problems}. Наиболее удобной опорой для ответа служит произведение «${a.work}», где эти особенности проявляются через конфликт, композицию и систему образов.`}
  return `Тема «${cleanTopic(q.text)}» требует сначала определить эпоху, направление и ключевые понятия. Затем следует показать, как эти признаки проявляются в жанре, композиции и образах конкретных произведений. Завершить ответ нужно выводом о месте явления в развитии национальной и мировой литературы.`;
}
function sentencePoint(point,index){
  let p=String(point).trim().replace(/[.;]+$/,'');
  const reps=[['Назвать ','Следует назвать '],['Показать ','Нужно показать '],['Раскрыть ','Важно раскрыть '],['Объяснить ','Следует объяснить '],['Разобрать ','Нужно разобрать '],['Сопоставить ','Полезно сопоставить '],['Указать ','Важно указать '],['Определить ','Сначала нужно определить '],['Сделать вывод','В завершение следует сделать вывод']];
  for(const [a,b] of reps)if(p.startsWith(a)){p=b+p.slice(a.length);break}
  if(!/[.!?]$/.test(p))p+='.';
  return p.charAt(0).toUpperCase()+p.slice(1);
}
function fullAnswerText(m){
  if(Array.isArray(m.fullAnswer)&&m.fullAnswer.length)return m.fullAnswer;
  const ctx=contextForQuestion(m.q),bio=bioForQuestion(m.q),core=theoryCore(m.q);
  const opening=`${ctx} ${core}`;
  const author=bio?`${bio} `:'';
  const thesis=m.thesis&&m.thesis.length>35?m.thesis:`Главная мысль ответа состоит в следующем: ${m.thesis}.`;
  const args=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `${sentencePoint(p,i)} ${e.text}`}).join(' ');
  const conclusion=`Таким образом, ${cleanTopic(m.q.text).replace(/^./,c=>c.toLowerCase())} следует понимать не как набор терминов, а как исторически обусловленное художественное явление, которое раскрывается в конкретных образах и эпизодах.`;
  return [opening,author+thesis,args,conclusion];
}
renderTicketAnswers=function(){
  const host=$('#ticket-answers');if(!host)return;
  const term=($('#answer-search')?.value||'').trim().toLowerCase(),fam=$('#answer-familiarity')?.value||'all',sec=$('#answer-section')?.value||'all';
  const rows=EXAM_QUESTIONS.map(answerMaterials).filter(m=>{const hay=`${m.q.number} ${m.q.text} ${m.q.section} ${m.works.join(' ')} ${m.thesis}`.toLowerCase();return(!term||hay.includes(term))&&(fam==='all'||m.level===fam)&&(sec==='all'||m.q.section===sec)});
  host.innerHTML=rows.map(m=>{const paras=fullAnswerText(m);const evidence=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(e.title||sentencePoint(p,i))}</b></div><div class="argument-proof"><span class="evidence-label">${esc(e.loc)}</span><p>${esc(e.text)}</p></div></div>`}).join('');return `<article class="ticket-answer-card card" data-answer-card="${m.q.number}"><div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div><div class="ticket-answer-body">${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}<div class="answer-block"><h4>Полный ответ</h4><div class="full-answer-text">${paras.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div><div class="answer-block"><h4>Аргументы и эпизоды</h4>${evidence}</div><div class="answer-block"><h4>Произведения для повторения</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Для обзорного вопроса используйте несколько авторов эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Сводка по произведению.</b> ${esc(m.summary)}</p>`:''}</div><div class="answer-status-row"><span class="tiny-note">Ответ построен от исторического контекста к теории, автору и эпизоду.</span>${statusControls(m.q.number,true)}</div></div></article>`}).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
  $$('[data-toggle-answer]',host).forEach(b=>b.onclick=()=>{const card=$(`[data-answer-card="${b.dataset.toggleAnswer}"]`,host);card.classList.toggle('open');b.textContent=card.classList.contains('open')?'Свернуть':'Открыть ответ'});bindStatusButtons(host);
};

function topicExample(q){
  const authors=questionAuthors(q.number);
  if(authors.length)return `${authors[0].name} — «${authors[0].work}»`;
  const m=answerMaterials(q);return m.works?.[0]||cleanTopic(q.text);
}
function safeTheoryDistractors(q,kind){
  const pool=EXAM_QUESTIONS.filter(x=>x.number!==q.number&&x.section===q.section);
  return pool.map(x=>kind==='example'?topicExample(x):theoryCore(x)).filter(Boolean);
}
buildTheoryQuestionBank=function(){
  const generated=[];
  EXAM_QUESTIONS.forEach(q=>{
    const core=theoryCore(q),example=topicExample(q);
    generated.push({id:`topic-${q.number}-concept`,difficulty:1,ticketNumbers:[q.number],prompt:`Какое объяснение точнее раскрывает тему «${cleanTopic(q.text)}»?`,correct:core,options:uniqueOptions(core,safeTheoryDistractors(q,'core')),explain:`Сначала определяется историко-литературная основа темы. Затем общий признак подтверждается произведением.`,xpCategory:'Теория'});
    generated.push({id:`topic-${q.number}-example`,difficulty:2,ticketNumbers:[q.number],prompt:`Какой автор или текст уместнее всего использовать при ответе на тему «${cleanTopic(q.text)}»?`,correct:example,options:uniqueOptions(example,safeTheoryDistractors(q,'example')),explain:`Этот пример прямо связан с формулировкой темы и не подменяет её материалом другого автора.`,xpCategory:'Теория'});
  });
  return [...THEORY_FOUNDATION,...FAMILIAR_THEORY_EXAMPLES,...generated];
};
refreshTheoryQuestions();

// ===== v8: восстановлены отдельные страницы «Билеты» и «Ответы»; исправлены цитаты =====
const QUOTE_TICKET_MAP_V8 = {
  hemingway_fitzgerald:[79],
  anastasyev_wolfe:[101,102,103,104,105],
  bakhtin_rabelais:[7],
  bakhtin_novel:[8,20,39],
  zhirmunsky_byron:[23,24,30],
  zverev_vonnegut:[94],
  elistratova_realism:[39,40,46,47,48],
  apt_mann_t:[57,75],
  motyleva_mann_h:[56],
  boll_mann_h:[56],
  motyleva_zola:[53],
  zverev_vonnegut_tech:[94],
  ast_hem_1:[70,82],ast_hem_2:[70,82],ast_hem_3:[70,82],ast_hem_4:[82],
  gil_period_verified:[50,51,55,60,66],bakhtin_rabelais_ru:[7],zhirm_byron_ru:[23,24,30],anast_wolfe_ru:[101,102,103,104,105]
};
quoteQuestions=function(q){
  if(QUOTE_TICKET_MAP_V8[q.id])return QUOTE_TICKET_MAP_V8[q.id];
  if(Array.isArray(q.questions)&&q.questions.length)return q.questions;
  const item=q.targetId&&itemById(q.targetId);return item?.questions||[];
};
function quoteUseTextV8(q,n){
  const question=EXAM_QUESTIONS.find(x=>x.number===n);
  const c=q.context||'';
  if(c)return `${c} В ответе эту цитату следует привести после общего тезиса и затем объяснить, какой признак темы она подтверждает.`;
  return `Цитата помогает подтвердить тему «${question?cleanTopic(question.text):q.target}». После неё нужно назвать произведение или художественный приём.`;
}
renderQuotesPage=function(){
  const host=$('#quotes-page'),sel=$('#quote-question-filter');if(!host||!sel)return;
  if(!sel.dataset.ready){sel.innerHTML='<option value="all">Все экзаменационные вопросы</option>'+EXAM_QUESTIONS.map(q=>`<option value="${q.number}">№ ${q.number}. ${esc(q.text)}</option>`).join('');sel.dataset.ready='1';sel.onchange=renderQuotesPage;$('#quote-search').oninput=renderQuotesPage;}
  const selected=sel.value,term=($('#quote-search').value||'').trim().toLowerCase();
  const all=russianQuotes().filter(q=>quoteQuestions(q).length&&(!term||`${q.speaker} ${q.target} ${q.text} ${q.context}`.toLowerCase().includes(term)));
  const numbers=selected==='all'?[...new Set(all.flatMap(quoteQuestions))].sort((a,b)=>a-b):[Number(selected)];
  const chunks=[];
  for(const n of numbers){
    const qn=EXAM_QUESTIONS.find(x=>x.number===n);const rows=all.filter(q=>quoteQuestions(q).includes(n));if(!rows.length)continue;
    chunks.push(`<div class="quote-question-heading"><h3>Вопрос № ${n}. ${esc(qn?.text||'')}</h3><p>Цитаты ниже относятся именно к этому вопросу.</p></div>`);
    rows.forEach(q=>chunks.push(`<article class="quote-study-card card"><blockquote>«${esc(q.text.replace(/^«|»$/g,''))}»</blockquote><div><b>${esc(q.speaker)}</b> — о ${esc(q.target)}</div><p class="quote-meta">${esc(q.context||'')}</p><div class="quote-use"><b>Как использовать в ответе.</b> ${esc(quoteUseTextV8(q,n))}</div>${sourceLink(q.sourceUrl,q.sourceLabel)}</article>`));
  }
  host.innerHTML=chunks.join('')||'<article class="card" style="padding:18px">Для выбранного вопроса пока нет проверенной содержательной цитаты. Пустые и формально связанные цитаты скрыты.</article>';
};
function normalizedNameTokensV8(name){return String(name||'').toLowerCase().replace(/ё/g,'е').split(/[^а-яa-z]+/).filter(x=>x.length>=5)}
function leaksAnswerV8(q,mode){
  const text=String(q.text||'').toLowerCase().replace(/ё/g,'е');
  const value=mode==='quoteTarget'?q.target:q.speaker;
  return normalizedNameTokensV8(value).some(token=>text.includes(token));
}
function eligibleQuotesV8(mode){
  return russianQuotes().filter(q=>q.text&&q.speaker&&q.target&&!leaksAnswerV8(q,mode));
}
const makeQuizQuestionV7=makeQuizQuestion;
makeQuizQuestion=function(mode){
  if(mode==='quoteTarget'){
    const pool=eligibleQuotesV8(mode);const q=randomOne(pool);
    if(!q)return makeQuizQuestionV7('work');
    return {id:`quote-target-v8-${q.id}`,prompt:q.text,quote:true,question:'О ком или о каком явлении сказано в этой цитате?',correct:q.target,options:uniqueOptions(q.target,pool.map(x=>x.target)),explain:`Высказывание принадлежит ${q.speaker}. ${q.context||''}`,source:{url:q.sourceUrl,label:q.sourceLabel},xpCategory:xpCountry(itemById(q.targetId))};
  }
  if(mode==='quoteSpeaker'){
    const pool=eligibleQuotesV8(mode);const q=randomOne(pool);
    if(!q)return makeQuizQuestionV7('work');
    return {id:`quote-speaker-v8-${q.id}`,prompt:q.text,quote:true,question:`Кто является автором этого высказывания о ${q.target}?`,correct:q.speaker,options:uniqueOptions(q.speaker,pool.map(x=>x.speaker)),explain:q.context||'',source:{url:q.sourceUrl,label:q.sourceLabel},xpCategory:xpCountry(itemById(q.targetId))};
  }
  return makeQuizQuestionV7(mode);
};
renderTicket=function(){
  const host=$('#ticket-paper');if(!host||!currentTicket.length)return;
  host.innerHTML=`<div class="eyebrow" style="color:#657085;text-align:center">Литературы народов мира · 5.9.2</div><h3>Тренировочный экзаменационный билет</h3><div class="ticket-questions">${currentTicket.map((q,i)=>`<div class="ticket-question"><div class="ticket-q-head"><b>${i+1}.</b><span>${esc(q.text)}</span></div>${statusControls(q.number,true)}</div>`).join('')}</div><p class="tiny-note">На этой странице нет подсказок и ответов. Готовые материалы находятся в разделе «Ответы по билетам».</p>`;
  bindStatusButtons(host);
};
initQuestions=function(){normalizeOldStatuses();$('#ticket-generate').onclick=generateTicket;$('#ticket-print').onclick=()=>window.print();generateTicket();};
renderTicketAnswers=function(){
  const host=$('#ticket-answers');if(!host)return;
  const term=($('#answer-search')?.value||'').trim().toLowerCase(),fam=$('#answer-familiarity')?.value||'all',sec=$('#answer-section')?.value||'all';
  const rows=EXAM_QUESTIONS.map(answerMaterials).filter(m=>{const hay=`${m.q.number} ${m.q.text} ${m.q.section} ${m.works.join(' ')} ${m.thesis}`.toLowerCase();return(!term||hay.includes(term))&&(fam==='all'||m.level===fam)&&(sec==='all'||m.q.section===sec)});
  host.innerHTML=rows.map(m=>{const paras=fullAnswerText(m);const evidence=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(e.title||sentencePoint(p,i))}</b></div><div class="argument-proof"><span class="evidence-label">${esc(e.loc)}</span><p>${esc(e.text)}</p></div></div>`}).join('');return `<article class="ticket-answer-card card" data-answer-card="${m.q.number}"><div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div><div class="ticket-answer-body">${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}<div class="answer-block"><h4>Полный ответ</h4><div class="full-answer-text">${paras.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div><div class="answer-block"><h4>Тезисный план и доказательства</h4>${evidence}</div><div class="answer-block"><h4>Произведения для аргументации</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Для обзорного вопроса используйте несколько авторов эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Сводка по произведению.</b> ${esc(m.summary)}</p>`:''}</div></div></article>`}).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
  $$('[data-toggle-answer]',host).forEach(b=>b.onclick=()=>{const card=$(`[data-answer-card="${b.dataset.toggleAnswer}"]`,host);card.classList.toggle('open');b.textContent=card.classList.contains('open')?'Свернуть':'Открыть ответ'});
};
initTicketAnswers=function(){const sec=$('#answer-section');if(!sec)return;sec.innerHTML='<option value="all">Все разделы</option>'+[...new Set(EXAM_QUESTIONS.map(q=>q.section))].map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');$('#answer-search').oninput=renderTicketAnswers;$('#answer-familiarity').onchange=renderTicketAnswers;sec.onchange=renderTicketAnswers;renderTicketAnswers();};
switchView=function(view){
  $$('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.view===view));$$('.view').forEach(v=>v.classList.toggle('active',v.id===view+'-view'));
  if(view==='timeline')renderTimeline();if(view==='tickets')renderTicket();if(view==='answers')renderTicketAnswers();if(view==='wolfe')renderWolfePage();if(view==='theory')renderTheory();if(view==='quotes')renderQuotesPage();window.scrollTo({top:$('.tabs-wrap').offsetTop,behavior:'smooth'});
};
init=function(){bindTabs();fillFilters();bindFilter('map');bindFilter('timeline');initMap();initQuiz();initQuestions();initTicketAnswers();renderWolfePage();renderTheory();renderQuotesPage();updateProgress();};

// ===== Полные ответы по билетам 1–3: ручная редакция =====
Object.assign(ANSWER_OVERRIDES[1], {"works": ["Похищение быка из Куальнге", "Песнь о Хильдебранде", "Беовульф", "Старшая Эдда"], "level": "unknown", "thesis": "Ранний средневековый героический эпос отражает родовое сознание, воинскую этику и трагическое принятие судьбы.", "points": ["Устное происхождение и общие признаки раннего эпоса.", "Кельтский эпос: Уладский цикл и Кухулин.", "Германский эпос: Хильдебранд и Беовульф.", "Древнескандинавский эпос: «Старшая Эдда» и Сигурд.", "Сходства, различия и общий вывод."], "episodes": ["Кухулин один защищает Улад и в поединке убивает своего друга Фердиада.", "Хильдебранд вынужден вступить в бой с сыном, который не узнаёт его.", "Беовульф в старости выходит против дракона и погибает, защищая народ.", "Сигурд побеждает Фафнира, но не избегает предательства и проклятия клада."], "fullAnswer": ["Ранний средневековый героический эпос возник из устных преданий. Его создавали и передавали певцы-сказители. В текстах сохранялась память о переселениях, войнах и родовых конфликтах. Первый экзаменационный вопрос требует сопоставить кельтскую, германскую и древнескандинавскую традиции.", "Такой эпос называют архаическим героическим эпосом. Он сформировался раньше рыцарской культуры зрелого Средневековья. В центре находится не частная жизнь человека, а судьба героя, рода и народа.", "Первая общая особенность раннего эпоса — устное происхождение. Произведения долго существовали без письменной записи. Поэтому в них часто встречаются повторы, устойчивые формулы и типовые описания. Они помогали певцу запоминать большой текст и воспроизводить его перед слушателями.", "Вторая особенность — коллективное авторство. У произведения нет одного установленного автора. Каждый исполнитель мог менять отдельные детали. Однако основные события, образы и нравственные оценки сохранялись.", "Третья особенность — соединение истории и мифа. В основе сюжета могли лежать реальные войны, переселения и гибель племён. Но исторические события дополнялись фантастическими мотивами. Герой сражался с чудовищами, колдунами или сверхъестественными силами.", "Четвёртая особенность — родовое сознание. Человек ощущал себя частью рода. Его поступок влиял на родственников и потомков. Поэтому важное место занимали кровная месть, верность родичам и ответственность за честь семьи.", "Пятая особенность — героический идеал. Герой должен быть смелым и физически сильным. Он обязан защищать род, народ или правителя. Слава после смерти ценится выше спокойной и безопасной жизни.", "Шестая особенность — трагическое понимание судьбы. Герой часто знает о будущей гибели. Однако он всё равно принимает бой. Отказ от подвига считался более страшным, чем смерть.", "В текстах соединяются языческие и христианские представления. Древние сюжеты возникли в языческую эпоху. Записывали их позднее христианские книжники. Поэтому старые мифы иногда получают христианское объяснение.", "Кельтская традиция лучше всего представлена ирландскими сагами, или скелами. Сначала их передавали устно. Позднее их записали христианские монахи. Главным памятником считается Уладский цикл. Его центральный герой — Кухулин.", "В начале воинского пути герой получает имя Кухулин. Оно означает «пёс Кулана». Юноша случайно убивает сторожевого пса кузнеца Кулана. После этого он обещает сам охранять дом кузнеца. Эпизод раскрывает не только силу героя, но и его способность отвечать за свой поступок.", "В «Похищении быка из Куальнге» Кухулин один защищает Улад. Мужчины королевства поражены магической слабостью. Поэтому юный герой вынужден сдерживать целое войско. Он поочерёдно вступает в поединки с противниками.", "Особенно важен бой Кухулина с Фердиадом. Они были друзьями и учились вместе. Но обстоятельства заставляют их стать противниками. Кухулин побеждает, однако не радуется победе. Личная дружба сталкивается с воинским долгом, а подвиг становится нравственной потерей.", "Кельтский эпос отличается обилием волшебных элементов. В нём действуют пророчицы, друиды и магические существа. Герои могут обладать чудесным происхождением. Граница между земным и потусторонним миром остаётся подвижной.", "Важную роль играют гейсы. Гейс — это магический запрет или обязательство. Нарушение такого запрета ведёт героя к гибели. Судьба выражается через систему личных запретов.", "Кельтские саги написаны преимущественно прозой. В прозаический рассказ вставляются стихотворные речи. В стихах передаются пророчества, плачи и важные признания героев. Таким образом, кельтский эпос соединяет воинскую героику, волшебство и трагическое одиночество героя.", "Германский эпос связан с эпохой Великого переселения народов. Это примерно IV–VI века. В памяти народов сохранились войны, гибель королевств и судьбы правителей. Реальные правители постепенно становились эпическими героями.", "К германской традиции относятся «Песнь о Хильдебранде» и «Беовульф». В «Песни о Хильдебранде» отец и сын встречаются на поле боя. Хильдебранд долго находился в изгнании. Его сын Хадубранд не узнаёт отца и считает его погибшим.", "Хильдебранд пытается избежать поединка. Он рассказывает о себе и предлагает сыну подарок. Хадубранд воспринимает это как обман. Воинская честь не позволяет ему отказаться от боя. Традиционный сюжет предполагает гибель сына. Родственная связь оказывается слабее воинского долга.", "«Беовульф» — англосаксонская поэма. Действие происходит в Скандинавии. Главный герой принадлежит к племени гаутов. Он приезжает помочь датскому конунгу Хротгару.", "Дворец Хротгара называется Хеорот. Его много лет разоряет чудовище Грендель. Беовульф вступает с ним в рукопашный бой. Герой побеждает и отрывает чудовищу руку. Затем он сражается с матерью Гренделя в её подводном жилище.", "Через много лет Беовульф становится правителем. В старости он сражается с драконом. Герой понимает, что может погибнуть. Но он обязан защитить свой народ.", "Воины Беовульфа отступают во время боя. Только Виглаф остаётся рядом с правителем. Вместе они убивают дракона. Однако Беовульф получает смертельную рану. Финал раскрывает идеал германского воина: герой исполняет долг до конца, а смерть не отменяет его победу.", "Основой германского общества становится союз правителя и дружины. Воин получает от конунга оружие и сокровища. В ответ он обязан хранить верность. Бегство с поля боя считается величайшим позором.", "Главная ценность героя — слава. Земная жизнь ограничена. Но память о подвиге может пережить человека. Поэтому герой сознательно выбирает опасность.", "Язык германского эпоса отличается аллитерацией. В строке повторяются одинаковые согласные звуки. Также используются сложные поэтические обозначения. Например, море может называться «дорогой китов».", "Древнескандинавская традиция сохранилась прежде всего в «Старшей Эдде». Её рукопись относится к XIII веку. Однако сами песни появились значительно раньше. Они существовали в устной форме.", "«Старшая Эдда» включает мифологические и героические песни. Мифологические тексты рассказывают о богах. Героические песни посвящены людям и легендарным воинам. Важнейшим героем становится Сигурд.", "Сигурд побеждает дракона Фафнира. Затем он получает проклятое золото. Вместе с сокровищем герой принимает будущую гибель. Богатство становится источником предательства.", "После победы Сигурд пробует кровь дракона. Он начинает понимать язык птиц. Птицы предупреждают его о предательстве Регина. Тогда Сигурд убивает своего наставника.", "Сигурд связан любовью с валькирией Брюнхильд. Но колдовской напиток заставляет его забыть её. Герой женится на Гудрун. Позднее обман приводит к трагедии, и Сигурд погибает из-за заговора родственников.", "Этот сюжет показывает важную особенность эпоса. Герой способен победить дракона. Однако он не может победить судьбу. Внешняя сила не спасает от предательства.", "Скандинавский эпос отличается особенно сильным фатализмом. Судьба заранее определена. Даже боги знают о своей будущей гибели. Однако они продолжают бороться.", "В мифологических песнях описывается Рагнарёк. Это последняя битва богов и чудовищ. Один погибнет в бою с волком Фенриром. Тор победит змея, но сам умрёт. Такое мировоззрение формирует особый идеал: победа не всегда возможна, но человек обязан сохранить мужество.", "В скандинавской поэзии используются кеннинги. Это сложные образные замены обычного слова. Корабль мог называться «конём моря», а кровь — «росой битвы». Стиль эддических песен сжат и напряжён. Большое значение имеют диалоги и пророчества.", "Кельтский эпос сильнее связан с волшебным миром. В нём важны друиды, гейсы и чудесные превращения. Герой часто оказывается между людьми и магическими силами.", "Германский эпос сосредоточен на дружинной этике. Главными ценностями становятся верность и воинская честь. Особое значение имеет отношение героя к правителю.", "Древнескандинавский эпос подчёркивает неизбежность судьбы. Даже великий герой не может избежать гибели. Его достоинство проявляется в мужественном принятии конца.", "При этом все три традиции имеют общую основу. Герой защищает род и народ. Он ставит долг выше личного благополучия. После смерти его сохраняет коллективная память.", "Ранний средневековый эпос отражает переходную эпоху. Старые родовые отношения уже начинали разрушаться. Одновременно складывались ранние государства и воинские союзы. Поэтому герой находится между родом, дружиной и личной судьбой.", "Кельтская традиция раскрывает героя через магию и запреты. Германская — через верность правителю и дружине. Скандинавская — через борьбу с неизбежной судьбой. Во всех случаях смерть героя превращается в доказательство его величия."]});
Object.assign(ANSWER_OVERRIDES[2], {"works": ["Песнь о Роланде", "Песнь о Нибелунгах"], "level": "known", "thesis": "«Песнь о Роланде» превращает историческое поражение в национальный миф о верности королю, Франции и христианской вере.", "points": ["Историческая основа и эпоха создания.", "Жанр песни о деяниях и композиция.", "Предательство Ганелона.", "Спор Роланда и Оливье.", "Битва, смерть Роланда и образ Карла.", "Поэтика и значение произведения."], "episodes": ["Троекратный спор Роланда и Оливье об Олифанте показывает конфликт храбрости и разумной ответственности.", "Роланд трубит слишком поздно и получает смертельную рану от напряжения.", "Перед смертью герой пытается разбить Дюрандаль и протягивает Богу правую перчатку.", "Суд над Ганелоном утверждает, что частная месть становится преступлением против государства."], "fullAnswer": ["Героический эпос зрелого Средневековья возник позднее раннего эпоса. К этому времени в Европе укрепились государства, сложились феодальные отношения и христианская культура. Поэтому герой защищает уже не только род. Он служит королю, государству и христианской вере.", "К зрелому эпосу относятся национальные памятники. Во Франции это «Песнь о Роланде». В Германии — «Песнь о Нибелунгах». В Испании — «Песнь о моём Сиде». Наиболее показателен французский памятник.", "«Песнь о Роланде» создана примерно в XI веке. Однако описанные события произошли в 778 году. Тогда войско Карла Великого возвращалось из Испании. В Ронсевальском ущелье арьергард был уничтожен басками.", "В историческом событии не было религиозной войны. Нападавшими были христиане-баски. Но автор поэмы изменил факты. В эпосе на войско Карла нападают мусульмане.", "Такое изменение связано с эпохой создания текста. XI век — время Крестовых походов. Борьба христиан и мусульман воспринималась как важнейший конфликт. Поэтому старое событие получило новое религиозное значение.", "Реальный Карл Великий во время похода был молод. В поэме он изображён седым старцем. Это делает его похожим на библейского патриарха. Так усиливается его величие и святость.", "«Песнь о Роланде» относится к жанру chanson de geste, то есть «песни о деяниях». Такие произведения исполняли жонглёры. Поэма состоит из строф-лассов разного объёма. Их объединяют созвучные окончания строк.", "Композиция строится вокруг гибели арьергарда в Ронсевальском ущелье. Основные части произведения — предательство Ганелона, бой в Ронсевале, гибель Роланда, месть Карла и суд над Ганелоном.", "Композиция основана на противопоставлениях. Роланд противопоставлен Ганелону. Христиане противопоставлены сарацинам. Верность сталкивается с предательством.", "Карл Великий ведёт войну в Испании. Сарагосский царь Марсилий предлагает мир, но предложение оказывается обманом. Для переговоров нужен посол. Роланд предлагает отправить Ганелона.", "Ганелон считает это смертельным оскорблением. Он начинает ненавидеть Роланда. Личная обида становится причиной государственной измены.", "Ганелон вступает в соглашение с врагами. Он советует напасть на арьергард, которым командует Роланд. Вместе с ним остаются Оливье и архиепископ Турпен.", "Этот эпизод раскрывает главную проблематику поэмы. Личный интерес сталкивается с общественным долгом. Роланд ставит государство выше себя. Ганелон ставит личную обиду выше Франции.", "Ганелон не считает себя предателем. Он говорит, что мстит только Роланду. Но эпос отвергает такую логику. В феодальном обществе удар по вассалу короля становится ударом по всему государству.", "Роланд и Оливье воплощают два типа героизма. Роланд представляет безграничную храбрость. Оливье — разум и осторожность. Их спор составляет нравственный центр поэмы.", "Когда враги приближаются, Оливье предлагает трубить в Олифант. Звук рога должен позвать Карла. Однако Роланд отказывается. Он боится позора.", "Роланд считает просьбу о помощи проявлением слабости. Он надеется победить своими силами. Его позиция выражает героический максимализм. Для него честь важнее жизни.", "Оливье думает иначе. Он понимает численное превосходство врага. Поэтому хочет спасти войско. Его позиция выражается формулой: Роланд храбр, но Оливье разумен.", "Спор повторяется несколько раз. Повтор усиливает трагическое напряжение. Читатель понимает, что помощь ещё возможна. Но гордость Роланда приближает катастрофу.", "Роланд — положительный герой. Он мужественен и верен Карлу. Однако автор не скрывает его ошибку. Чрезмерная гордость приводит к гибели воинов.", "Эту черту называют героической безмерностью. Достоинство развивается до опасной крайности. Храбрость превращается в самоуверенность. Честь начинает мешать исполнению долга.", "Роланд поздно принимает решение трубить. Теперь Оливье возражает. Он говорит, что помощь уже не спасёт войско. Просьба о помощи может лишь опозорить героя.", "Архиепископ Турпен разрешает спор. Он объясняет, что Карл уже не успеет спасти воинов. Однако король сможет отомстить за них. После этого Роланд трубит в Олифант.", "Роланд трубит с такой силой, что у него лопаются виски. Карл слышит рог. Ганелон пытается убедить его, что опасности нет. Но король возвращается.", "Этот эпизод показывает изменение героя. Роланд перестаёт думать только о личной славе. Он осознаёт ответственность перед погибающими товарищами. Его позднее решение становится нравственным прозрением.", "Битва строится как ряд поединков. Каждый герой получает отдельную сцену. Воины совершают подвиги и произносят речи. Это создаёт торжественный и замедленный ритм.", "Архиепископ Турпен соединяет религиозное и воинское служение. Он благословляет воинов и сам участвует в битве. Его образ показывает единство меча и креста.", "Гибель французов изображается не как бессмысленное поражение. Они умирают за Францию и веру. Поэтому смерть получает жертвенный смысл. Герои терпят военное поражение, но одерживают нравственную победу.", "Особенно важна смерть Оливье. Он уже почти не видит от ран. По ошибке он ударяет Роланда. Однако друзья прощаются и примиряются.", "Эпизод подчёркивает братство воинов. Их спор не уничтожает дружбу. Оливье умирает не врагом Роланда. Он остаётся его ближайшим товарищем.", "После гибели войска Роланд остаётся почти один. Он пытается сломать меч Дюрандаль. Герой не хочет отдавать оружие врагу. Однако меч оказывается несокрушимым.", "Дюрандаль имеет символическое значение. Это не просто оружие. Меч связан с воинской честью и христианскими реликвиями. Поэтому его нельзя оставить противнику.", "Роланд вспоминает свои победы. Он говорит о землях, которые завоевал для Карла. Герой подводит итог своему служению.", "Перед смертью Роланд ложится лицом к Испании. Так он показывает, что умер победителем. Он протягивает Богу правую перчатку. Этот жест напоминает вассальную церемонию.", "В земной жизни Роланд был вассалом Карла. Перед смертью он становится вассалом Бога. Ангел принимает его душу. Поэтому гибель героя получает религиозное оправдание.", "Карл изображён идеальным правителем. Он мудр, справедлив и благочестив. Его власть поддерживает Бог. Природа также реагирует на события его правления.", "Когда погибает Роланд, во Франции происходит буря. Люди думают, что наступает конец света. Так смерть героя приобретает вселенский масштаб.", "Карл возвращается и обнаруживает погибших. Его скорбь показана очень подробно. Он не выглядит бесчувственным властителем. Король лично переживает смерть вассалов.", "После этого Карл преследует врагов. Бог останавливает солнце. Благодаря чуду французы успевают настигнуть противника. Эпическое время подчиняется справедливости.", "Однако финал не является радостным. После победы Карлу является ангел. Он требует отправиться в новый поход. Король плачет от тяжести бесконечного служения.", "После возвращения начинается суд над Ганелоном. Он утверждает, что не предавал Карла, а лишь мстил Роланду. Сначала бароны склонны оправдать его, потому что боятся его родственников.", "Тогда рыцарь Тьерри выступает против обвиняемого. Он доказывает общественный характер преступления. Спор решается судебным поединком. Представитель Ганелона проигрывает, после чего предателя казнят.", "Суд завершает основную тему поэмы. Частная месть не может быть оправдана. Феодальная верность требует поставить государство выше личных чувств. Предательство одного человека угрожает всей стране.", "Роланд воплощает воинскую храбрость, верность королю, защиту родины, христианскую веру и готовность к самопожертвованию. Однако он ошибается из-за гордости. Эта ошибка делает сюжет трагическим. Идеальный воин оказывается не идеальным военачальником.", "Оливье дополняет Роланда. Он показывает необходимость рассудительности. Вместе герои воплощают две стороны идеала. Настоящему воину нужны храбрость и мудрость.", "В раннем эпосе герой защищал род. В «Песни о Роланде» он защищает Францию. Это важное историческое изменение. Эпос выражает формирование национального сознания.", "Франция представлена единым христианским государством. Карл становится её символом. Роланд служит не только родственникам. Он служит общей стране.", "Поэтика произведения отличается монументальностью. Герои и события показаны крупным планом. Их чувства выражаются прямо. Психологические полутона почти отсутствуют.", "Автор использует гиперболы. Врагов значительно больше, чем французов. Роланд обладает невероятной силой. Звук Олифанта слышен на огромном расстоянии.", "Большую роль играют повторы. Одна сцена может рассказываться несколько раз. Каждое повторение добавляет новую деталь. Так создаётся замедление действия.", "Повествование строится на параллелях. Двенадцати французским пэрам соответствуют двенадцать врагов. Карлу противопоставлен Марсилий. Роланду противопоставлен Ганелон.", "Важна символика предметов. Олифант обозначает ответственность героя. Дюрандаль воплощает его честь. Перчатка выражает вассальное служение.", "«Песнь о Нибелунгах» также относится к зрелому эпосу. Но её мир значительно мрачнее. В центре находится не служение государству, а цепь мести и предательства.", "Первая часть рассказывает о Зигфриде. Он помогает Гунтеру получить Брюнхильду. Затем Хаген убивает Зигфрида. Причиной становится борьба за власть и честь.", "Во второй части Кримхильда мстит за мужа. Она заманивает родственников ко двору Этцеля. Пир превращается в массовое убийство. В результате погибают почти все герои.", "Французский эпос утверждает государственное единство. Немецкий эпос показывает разрушение родовых связей. В «Песни о Роланде» месть Карла справедлива. В «Песни о Нибелунгах» месть Кримхильды уничтожает всех.", "«Песнь о Роланде» отражает идеологию зрелого Средневековья. В центре находятся государство, христианство и вассальная верность. Историческое событие превращается в национальный миф.", "Главный конфликт произведения — столкновение служения и эгоизма. Роланд погибает, защищая Францию. Ганелон губит страну ради личной мести. Поэтому один получает вечную славу, а другой — позор."]});
Object.assign(ANSWER_OVERRIDES[3], {"works": ["Ивейн, или Рыцарь со львом", "Ланселот, или Рыцарь телеги", "Персеваль, или Повесть о Граале", "Тристан и Изольда", "Дон Кихот"], "level": "unknown", "thesis": "Рыцарский роман переносит внимание с судьбы народа на личный путь героя, его любовь, выбор и нравственное развитие.", "points": ["Возникновение жанра в XII веке.", "Отличие рыцарского романа от эпоса.", "Куртуазная любовь и рыцарский идеал.", "Артуровский и бретонский циклы.", "Кретьен де Труа и развитие героя.", "«Тристан и Изольда»: любовь и долг.", "Композиция, психологизм и фантастика.", "Влияние на европейский роман."], "episodes": ["Ивейн забывает вернуться к Лодине в обещанный срок, теряет её и проходит путь нравственного восстановления.", "Ланселот садится в позорную телегу ради спасения Гвиневры.", "Персеваль молчит перед процессией Грааля и из-за формального следования совету не исцеляет Короля-Рыбака.", "Тристан и Изольда выпивают любовный напиток, а в финале гибнут из-за ложного сообщения о цвете паруса."], "fullAnswer": ["Рыцарский роман возник в XII веке. Его родиной считается Франция. Жанр связан с развитием феодальной культуры и отражает новые представления о личности и любви.", "Ранний героический эпос показывал судьбу народа. Рыцарский роман сосредоточился на отдельном человеке. Героя интересуют не только война и служение. Он ищет любовь, славу и внутреннее совершенство.", "Слово «роман» первоначально обозначало текст на романском языке, а не на латыни. Произведения писались на языке, понятном светской публике. Постепенно слово стало названием жанра.", "В XII веке укрепляется культура феодальных дворов. При дворах жили поэты и музыканты. Они создавали произведения для аристократической аудитории. Особенно важную роль играли трубадуры и труверы.", "Одновременно меняется положение женщины при дворе. В литературе она становится объектом поклонения. Формируется идеал куртуазной любви. Рыцарь должен заслужить благосклонность дамы.", "На развитие жанра повлияли Крестовые походы. Европейцы знакомились с другими странами. В литературе усиливался интерес к путешествиям, экзотическим землям и чудесным испытаниям.", "Также возрастал интерес к античности. Средневековые авторы перерабатывали сюжеты о Трое и Александре Македонском. Однако античные герои изображались как рыцари и жили по нормам средневекового двора.", "Рыцарские романы делятся на несколько групп. Античный цикл включает «Роман об Александре» и «Роман о Трое». История в них свободно соединяется с вымыслом.", "Бретонский цикл связан с королём Артуром. В него входят романы о Ланселоте, Персевале и Гавейне. Главным местом становится двор Круглого стола.", "Цикл о Тристане и Изольде посвящён трагической любви. Здесь конфликт любви и долга достигает особой остроты. Наиболее известным автором жанра был Кретьен де Труа.", "Эпический герой действует ради народа. Рыцарь отправляется в личное путешествие. Его подвиг связан с индивидуальным выбором. Поэтому жанр открывает внутренний мир человека.", "В эпосе герой обычно дан как готовый характер. Роланд с начала произведения уже является великим воином. В рыцарском романе герой развивается. Испытания меняют его.", "Эпос строится вокруг большого исторического события. Роман состоит из цепочки приключений. Герой путешествует и встречает препятствия. Каждый эпизод проверяет отдельное качество.", "В эпосе любовь занимает второстепенное место. В рыцарском романе она становится главным двигателем сюжета. Рыцарь совершает подвиги ради дамы. Любовь воспитывает героя.", "Куртуазная любовь подчинена строгим правилам. Рыцарь должен служить даме, хранить верность и тайну. Его чувство требует самообладания.", "Дама часто имеет более высокое положение. Иногда она замужем. Поэтому любовь оказывается трудной или невозможной. Именно препятствие делает чувство возвышенным.", "Любовь понимается как нравственная школа. Герой должен стать достойным женщины. Он учится смелости, щедрости и управлению своими желаниями.", "Однако куртуазный идеал противоречив. Он может вступать в конфликт с браком и вассальной верностью. Эти противоречия особенно заметны в сюжетах Ланселота и Тристана.", "Рыцарь должен обладать храбростью, верностью слову, щедростью, благородством, готовностью защищать слабых и преданностью даме. Одной физической силы недостаточно. Герой обязан быть воспитанным и соблюдать правила поведения.", "Важной становится способность к состраданию. Герой помогает вдовам и сиротам. Он защищает тех, кто не может защищаться. Так воинская сила получает нравственное оправдание.", "Основой сюжета является авантюра, то есть неожиданное приключение. Однако авантюра имеет нравственный смысл. Она проверяет героя.", "Рыцарь покидает привычный двор. Он оказывается в лесу или чужой стране. Там обычные правила перестают действовать. Герой должен самостоятельно принять решение.", "Лес становится важным пространством. Он противопоставлен двору. Двор обозначает порядок и известность. Лес связан с тайной и внутренним испытанием.", "После испытаний герой возвращается, но уже другим человеком. Поэтому путешествие имеет круговую структуру. Оно одновременно является духовным развитием.", "Король Артур становится идеальным правителем. Его двор объединяет лучших рыцарей. Круглый стол выражает их равенство. У него нет главного места.", "Однако артуровский двор не лишён проблем. Рыцари постоянно должны подтверждать свою доблесть. Внешний порядок может скрывать нравственный кризис. Поздние романы показывают распад этого мира.", "Приключение часто начинается при дворе. Появляется незнакомец или посланник. Он сообщает о беде. Один из рыцарей принимает вызов и покидает двор.", "Роман Кретьена де Труа «Ивейн, или Рыцарь со львом» показывает развитие героя. Ивейн отправляется искать приключение. Он побеждает хранителя волшебного источника и женится на его вдове Лодине.", "После свадьбы Ивейн хочет продолжить рыцарские подвиги. Лодина разрешает ему уехать на один год. Герой обещает вернуться, однако забывает о сроке.", "Нарушение слова становится нравственной катастрофой. Лодина отвергает мужа. Ивейн теряет рассудок. Он уходит в лес и живёт как дикарь.", "Этот эпизод показывает важную тему жанра. Рыцарская слава не оправдывает нарушение обещания. Герой должен соединить общественный долг и личную верность. Ивейн пока не умеет этого делать.", "Позднее он спасает льва от дракона. Лев становится его спутником. Животное символизирует благородство и благодарность. Ивейн получает новое имя — Рыцарь со львом.", "Затем герой совершает подвиги ради других. Он защищает слабых и несправедливо обвинённых. Его действия перестают быть простым поиском славы. Они становятся нравственным служением.", "В финале Ивейн примиряется с Лодиной. Он заслуживает прощение. Роман показывает полное развитие личности. Герой проходит путь от самоуверенности к ответственности.", "В романе «Ланселот, или Рыцарь телеги» Ланселот любит королеву Гвиневру, жену короля Артура. Поэтому любовь героя противоречит вассальному долгу. В этом состоит трагическое напряжение.", "Гвиневру похищает Мелеагант. Ланселот отправляется её спасать. Для продолжения пути он садится в телегу. В Средние века телега была связана с преступниками.", "Рыцарь сначала колеблется перед позором. Затем всё же принимает унижение. Гвиневра позднее упрекает его за мгновение сомнения. Для куртуазной любви даже короткая нерешительность считается недостатком.", "Этот эпизод показывает власть любви. Ланселот готов пожертвовать репутацией. Рыцарская честь вступает в конфликт с преданностью даме. Герой выбирает любовь.", "Однако выбор остаётся нравственно сложным. Ланселот нарушает верность Артуру. Поэтому его идеальность неполна. Любовь возвышает и одновременно разрушает.", "В «Персевале, или Повести о Граале» герой растёт вдали от общества. Его мать хочет защитить сына от рыцарской судьбы. Но Персеваль встречает рыцарей и отправляется ко двору Артура.", "В начале Персеваль ведёт себя наивно. Он не знает правил общения. Герой буквально понимает советы. Его неопытность создаёт комические ситуации.", "Позднее он оказывается в замке Короля-Рыбака. Перед ним проходит загадочная процессия. В ней несут копьё и Грааль. Персеваль хочет задать вопрос, но молчит.", "Раньше наставник советовал ему не быть слишком разговорчивым. Герой механически следует совету. Из-за молчания он не исцеляет хозяина замка. Его ошибка имеет тяжёлые последствия.", "Этот эпизод важен для развития жанра. Рыцарь должен не просто соблюдать правила. Он обязан понимать ситуацию. Нравственность требует живого сострадания.", "Грааль позднее получает христианское значение. Он связывается с Тайной вечерей и кровью Христа. Поэтому приключение превращается в духовный поиск. Рыцарский роман приближается к религиозной аллегории.", "В истории Тристана и Изольды Тристан служит королю Марку. Он побеждает врагов и защищает Корнуолл. Затем герой отправляется за невестой короля, ирландской принцессой Изольдой.", "Во время путешествия Тристан и Изольда случайно выпивают любовный напиток. Он предназначался Изольде и Марку. После этого герои не могут сопротивляться чувству.", "Любовь вступает в конфликт с долгом. Тристан должен быть верен королю. Изольда должна быть верной женой. Но чувство оказывается сильнее общественного закона.", "Герои постоянно вынуждены скрываться. Их преследуют придворные. Иногда они живут в лесу. Лес становится пространством свободы.", "Однако полная свобода невозможна. Тристан продолжает уважать Марка. Изольда остаётся королевой. Герои не могут уничтожить прежние обязанности.", "В финале Тристан смертельно ранен. Он просит привести Изольду. Белый парус должен означать её приближение, чёрный — отсутствие.", "Жена Тристана из ревности говорит, что парус чёрный. Герой умирает от отчаяния. Изольда приходит слишком поздно и умирает рядом с ним.", "История раскрывает трагическую природу любви. Чувство изображено как абсолютная сила. Но оно несовместимо с общественным порядком. Поэтому любовь ведёт к гибели.", "Рыцарский роман широко использует фантастику. Герой встречает волшебные источники, заколдованные замки и чудесные предметы. Однако фантастика связана с внутренним испытанием.", "Чудовище может выражать страх героя. Заколдованный замок обозначает духовную несвободу. Волшебный предмет проверяет нравственное качество. Поэтому чудесное имеет символическое значение.", "Композиция строится как цепь эпизодов. Приключения могут казаться случайными. Однако они объединены развитием героя. Каждый эпизод открывает новое качество.", "Типичная схема такова: герой покидает двор, получает испытание, совершает ошибку, переживает кризис, искупает ошибку и возвращается изменившимся.", "Такая композиция повлияла на роман воспитания. Позднее герой также будет развиваться через опыт. Средневековое путешествие станет основой нового европейского романа.", "Рыцарский роман делает шаг к изображению внутреннего мира. Герой сомневается и страдает. Он выбирает между разными обязанностями. Его поступок нельзя объяснить только долгом.", "Особенно подробно изображается любовь. Автор показывает тоску, ревность и чувство вины. Психологизм ещё не похож на роман XIX века. Чувства часто передаются через жесты, потерю сна или сознания.", "Женщина занимает важное место. Она может направлять развитие героя. Лодина требует от Ивейна верности. Гвиневра проверяет преданность Ланселота.", "Женский образ часто идеализирован. Однако героиня не всегда пассивна. Изольда действует самостоятельно, принимает решения и защищает любовь.", "Рыцарский роман утвердил интерес к личности. Герой получил индивидуальную биографию. Его характер мог меняться. Это стало важным шагом к роману Нового времени.", "Жанр разработал тему любви. Любовь стала самостоятельной ценностью. Она перестала быть только частью брака. Европейская литература получила модель трагического чувства.", "Рыцарский роман создал сюжет испытания. Герой формируется в пути. Позднее эта схема появится в приключенческом романе и романе воспитания.", "Артуровские сюжеты стали общими для Европы. К ним обращались Томас Мэлори и Альфред Теннисон. Позднее их использовали Марк Твен и современные писатели.", "Жанр повлиял и на пародийную литературу. В «Дон Кихоте» Сервантес высмеял поздние рыцарские романы. Однако сам Дон Кихот сохраняет высокие идеалы. Поэтому пародия одновременно становится защитой мечты.", "К XVI веку рыцарские сюжеты стали шаблонными. Авторы нагромождали чудеса и подвиги. Психологическое развитие исчезало. Жанр превращался в массовое чтение.", "Дон Кихот пытается жить по законам старых книг. Он видит великанов вместо мельниц и принимает трактиры за замки. Реальность не соответствует литературной модели.", "Но Сервантес не просто смеётся над героем. Дон Кихот защищает слабых и верит в справедливость. Его ошибка заключается не в идеалах, а в неспособности увидеть реальный мир.", "Таким образом, рыцарский роман повлиял даже на жанр, который его разрушил. «Дон Кихот» возникает из спора с рыцарской традицией. Одновременно он превращает героя-путешественника в основу современного романа.", "Рыцарский роман возник в культуре XII века. Он соединил воинский идеал и куртуазную любовь. В центре оказался отдельный человек. Его характер развивался через испытания.", "Главными темами стали любовь, честь и внутренний выбор. Приключение получило нравственный смысл. Герой должен был не только победить врага, но и измениться.", "Значение жанра состоит в развитии психологизма. Он подготовил роман воспитания и приключенческий роман. Также он создал важнейшие европейские сюжеты: Артура, Грааль, Ланселота и Тристана."]});


// ===== v10: полноценные ответы для всех 100 экзаменационных вопросов =====
function buildCompleteTicketAnswer(q){
  const m=answerMaterials(q);
  if(Array.isArray(m.fullAnswer)&&m.fullAnswer.length)return m.fullAnswer;
  const authors=questionAuthors(q.number);
  const paragraphs=[];
  const ctx=contextForQuestion(q);
  const core=theoryCore(q);
  paragraphs.push(`${ctx} ${core}`.trim());
  if(authors.length){
    const names=authors.slice(0,4).map(a=>a.name).join(', ');
    const main=authors[0];
    paragraphs.push(`Ключевые представители и тексты для ответа: ${names}. Основной опорой может служить произведение «${main.work}». Его анализ позволяет связать общую характеристику эпохи с конкретной системой образов, конфликтом и художественной формой.`);
    if(main.extra)paragraphs.push(`${main.name}: ${main.extra} В экзаменационном ответе биографические сведения следует использовать только тогда, когда они объясняют выбор темы, жанра или художественного метода.`);
  }
  paragraphs.push(`Главный тезис: ${m.thesis}`);
  m.plan.forEach((point,index)=>{
    const e=evidenceForPoint(m,point,index);
    paragraphs.push(`${sentencePoint(point,index)} В качестве доказательства следует обратиться к следующему материалу: ${e.text} Этот пример нужно не просто пересказать, а связать с формулировкой билета и объяснить функцию образа, детали, композиционного решения или речевого приёма.`);
  });
  if(m.works.length){
    paragraphs.push(`Для аргументации необходимо уверенно назвать произведения: ${m.works.map(w=>`«${w}»`).join(', ')}. При обзорном характере вопроса достаточно подробно разобрать один основной текст, а остальные использовать для сопоставления и подтверждения общих закономерностей.`);
  }
  if(m.summary)paragraphs.push(m.summary);
  paragraphs.push(`Таким образом, ${cleanTopic(q.text).replace(/^./,c=>c.toLowerCase())} раскрывается через связь исторической эпохи, художественного направления и конкретной поэтики текста. Сильный ответ должен двигаться от определения и общего контекста к анализу эпизода, а затем завершаться выводом о значении автора или явления для развития зарубежной литературы.`);
  return paragraphs;
}

EXAM_QUESTIONS.forEach(q=>{
  ANSWER_OVERRIDES[q.number]??={};
  if(!Array.isArray(ANSWER_OVERRIDES[q.number].fullAnswer)||!ANSWER_OVERRIDES[q.number].fullAnswer.length){
    ANSWER_OVERRIDES[q.number].fullAnswer=buildCompleteTicketAnswer(q);
  }
});

const _fullAnswerTextV10=fullAnswerText;
fullAnswerText=function(m){
  return Array.isArray(m.fullAnswer)&&m.fullAnswer.length?m.fullAnswer:buildCompleteTicketAnswer(m.q);
};


// ===== v11: точная опора на читательский опыт пользователя =====
const READING_SUPPORT = {
  56:'Поскольку романы Генриха Манна не входят в прочитанный корпус, ответ должен подробно объяснять сатирическую модель автора. В «Учителе Гнусе, или Конце одного тирана» учитель Раат получает от учеников кличку Unrat — «грязь», «мусор», «нечистоты». Говорящая фамилия выражает нравственное разложение героя и превращает школьный деспотизм в модель авторитарного общества.',
  57:'Творчество Томаса Манна известно частично по началу «Волшебной горы». Поэтому ответ должен напоминать основные этапы его творчества и подробно объяснять интеллектуальный роман, мотив болезни, спор Сеттембрини и Нафты, особое течение времени и финальный выход Ганса Касторпа в войну.',
  70:'Ричард Олдингтон практически не знаком по чтению. В ответе нужно напоминать сюжет «Смерти героя»: Джордж Уинтерборн — молодой художник, чья фронтовая гибель показана как итог лицемерия довоенного общества и бессмысленности войны. Это следует сопоставлять с хорошо знакомыми текстами Хемингуэя и Ремарка.',
  71:'Марсель Пруст не прочитан, поэтому ответ обязан объяснять механизм непроизвольной памяти. Эпизод с мадлен показывает, как вкус и запах возвращают целый пласт прошлого и превращают память в принцип композиции романа «В поисках утраченного времени». Для сопоставления нужно опираться на прочитанные «Превращение», «Дублинцы» и начало «Портрета художника в юности».',
  75:'«Волшебная гора» прочитана только частично. Поэтому в ответе нужно кратко напоминать фабулу: Ганс Касторп приезжает в санаторий на три недели и остаётся на семь лет; его воспитание происходит через болезнь, любовь, опыт смерти и спор идей; финал переносит героя в Первую мировую войну.'
};

function normalizeReadingTitle(value){
  return String(value||'').toLowerCase().replace(/[«»„“”"']/g,'').replace(/ё/g,'е').replace(/[^а-яa-z0-9]+/g,' ').trim();
}
function readingLevelForWorks(works,authors=[]){
  const hay=[...works,...authors.map(a=>a.name)].map(normalizeReadingTitle).join(' | ');
  const has=(arr)=>arr.some(x=>{const n=normalizeReadingTitle(x);return n&&hay.includes(n)});
  if(has(USER_READING_PROFILE.partial))return 'partial';
  if(has(USER_READING_PROFILE.unknown))return 'unknown';
  if(has(USER_READING_PROFILE.known))return 'known';
  return 'unknown';
}
const answerMaterialsV11=answerMaterials;
answerMaterials=function(q){
  const m=answerMaterialsV11(q);
  const authors=questionAuthors(q.number);
  m.level=readingLevelForWorks(m.works,authors);
  m.readingSupport=READING_SUPPORT[q.number]||'';
  return m;
};

const fullAnswerTextV11=fullAnswerText;
fullAnswerText=function(m){
  const paragraphs=[...fullAnswerTextV11(m)];
  const support=m.readingSupport||READING_SUPPORT[m.q.number];
  if(support&&!paragraphs.some(p=>p.includes(support.slice(0,45))))paragraphs.splice(1,0,support);
  if(m.level==='known'){
    paragraphs.splice(1,0,'В ответе целесообразно опираться прежде всего на произведения, которые хорошо знакомы по чтению: конкретный эпизод, образ, композиционная деталь и собственное понимание текста убедительнее общего пересказа учебника.');
  }else if(m.level==='partial'){
    paragraphs.splice(1,0,'Произведение знакомо частично, поэтому ответ должен сначала кратко восстановить фабулу и систему образов, а затем использовать один хорошо понятный эпизод. Нельзя выдавать общее знакомство за полное чтение текста.');
  }else{
    paragraphs.splice(1,0,'Произведение не входит в прочитанный корпус. Поэтому материал должен содержать краткое содержание, систему образов, основные эпизоды, проблематику и ясное объяснение того, как использовать текст в экзаменационном ответе.');
  }
  return paragraphs;
};

// ===== Промежуточная ручная редакция билетов 4–30 =====
const MANUAL_FULL_ANSWERS_4_30 = {
  "4": [
    "«Божественная комедия» Данте создавалась в начале XIV века, на границе Средневековья и Возрождения. Поэма сохраняет христианскую картину мира, но одновременно утверждает ценность личности, земной истории и нравственного выбора. Поэтому её называют переходным произведением.",
    "Данте участвовал в политической жизни Флоренции и был изгнан. Опыт изгнания усилил темы справедливости, суда над современностью и поиска истинного пути.",
    "Поэма состоит из трёх частей: «Ад», «Чистилище» и «Рай». В каждой по тридцать три песни, а вместе со вступительной песнью «Ада» — сто. Число три связано с Троицей, основная строфа — терцина.",
    "Сюжет строится как путешествие Данте по загробному миру. Тёмный лес символизирует духовное заблуждение. Вергилий воплощает человеческий разум и античную мудрость, а Беатриче — любовь, веру и божественное откровение.",
    "Важно различать Данте-путника и Данте-автора. Путник пугается, сострадает и учится понимать высшую справедливость; автор уже знает итог пути и оценивает события с позиции приобретённого знания.",
    "«Ад» устроен как воронка из девяти кругов. Наказания строятся по принципу контрапассо: они символически соответствуют земному выбору грешника.",
    "В эпизоде Паоло и Франчески Данте-путник сочувствует героям, но автор не отменяет их ответственности. Франческа говорит языком куртуазной любви и представляет страсть как непреодолимую силу, хотя выбор сделали сами герои.",
    "Образ Улисса показывает переходность Данте: средневековый автор осуждает нарушение божественного запрета, но одновременно восхищается человеческой жаждой знания.",
    "Люцифер в центре Ада огромен, но неподвижен и вмёрз в лёд. Зло показано не как свобода, а как отсутствие любви, движения и творческой силы.",
    "Таким образом, «Божественная комедия» завершает средневековую картину мира и открывает путь к Возрождению. В центре строгого божественного порядка находится человек, способный заблуждаться, познавать и отвечать за свой выбор."
  ],
  "5": [
    "Франческо Петрарка — один из основоположников итальянского гуманизма. Его лирика возникает в XIV веке, когда личное земное чувство уже становится самостоятельной ценностью.",
    "Главное произведение Петрарки — «Канцоньере», или «Книга песен». Большинство текстов посвящено Лауре. Сборник условно делится на стихи «на жизнь» и «на смерть» возлюбленной.",
    "Основная форма — итальянский сонет из четырнадцати строк: двух катренов и двух терцетов. В катренах обычно задаётся ситуация или противоречие, а в терцетах происходит поворот мысли.",
    "Сонеты строятся на внутреннем конфликте. Герой одновременно стремится к любви и боится её, прославляет чувство и страдает от него. Поэтому Петрарка использует антитезы, оксюмороны и парадоксы.",
    "Лаура идеализирована. Её внешние черты становятся знаками высшей гармонии, но образ остаётся недоступным. Главное действие происходит не во внешнем сюжете, а во внутреннем мире героя.",
    "Петраркизм — система тем и приёмов, возникшая под влиянием «Канцоньере»: идеализация возлюбленной, конфликт земной и духовной любви, культ страдания, самоанализ, антитезы и природные сравнения.",
    "Отдельные сонеты образуют психологически связанный цикл. Повторяются мотивы первой встречи, памяти, времени, смерти и раскаяния.",
    "Таким образом, сонеты Петрарки стали основой петраркизма, потому что создали устойчивую модель любовного переживания, где главным содержанием поэзии становится самоанализ личности."
  ],
  "6": [
    "«Декамерон» Джованни Боккаччо создан в середине XIV века и является одним из главных произведений раннего итальянского Возрождения.",
    "Исторический фон — чума 1348 года во Флоренции. На фоне распада городского порядка семь девушек и трое юношей покидают город и создают в загородном поместье разумно организованное сообщество.",
    "Название означает «десятиднев». За десять дней десять рассказчиков рассказывают сто новелл. История молодых людей образует рамку, объединяющую самостоятельные рассказы.",
    "Рамочная композиция противопоставляет хаосу чумного города порядок, культуру общения и способность рассказывать.",
    "Новелла — небольшой жанр с динамичным сюжетом, ограниченным числом персонажей и неожиданным поворотом. Характер раскрывается через поступок, диалог и реакцию на обстоятельства.",
    "Мир «Декамерона» строится на взаимодействии фортуны, любви, ума и социальной нормы. Случай меняет судьбу, но находчивость позволяет человеку противостоять обстоятельствам.",
    "В новелле о сере Чаппеллетто порочный человек даёт ложную исповедь и после смерти почитается как святой. История показывает разрыв между репутацией и истиной и силу слова, способного создать общественную реальность.",
    "Женские персонажи нередко умны и самостоятельны, а любовь изображается как естественное чувство. Автор осуждает прежде всего лицемерие, принуждение и насилие.",
    "Комическое принимает формы остроумной реплики, обмана, разоблачения и переворачивания социальных ролей, но рядом существуют и трагические новеллы.",
    "Таким образом, «Декамерон» соединяет рамочную композицию и сто самостоятельных новелл, а жанр новеллы становится формой быстрого и точного раскрытия человеческого характера."
  ],
  "7": [
    "Роман Франсуа Рабле «Гаргантюа и Пантагрюэль» создавался в XVI веке, в эпоху французского Возрождения, развития наук и борьбы гуманизма со схоластикой.",
    "Произведение соединяет народный смех, гуманистическую философию, сатиру и фантастический гротеск. Его композиция свободна: хроника, пародия, утопия, философский диалог и приключение соединяются в одном тексте.",
    "Главный художественный принцип — гротеск. Он соединяет высокое и низкое, реальное и фантастическое. Гигантские тела, телесные подробности и гиперболические поступки выражают жизненную энергию и обновление.",
    "В эпизодах воспитания Гаргантюа Рабле противопоставляет схоластическое заучивание гуманистическому образованию Понократа, которое соединяет чтение, физические упражнения, наблюдение природы и практическую деятельность.",
    "Пикрохолова война начинается из-за мелкой ссоры, но превращается в захватническую кампанию. Пикрохол воплощает тщеславие и агрессию, Грангузье — разумное и миролюбивое правление.",
    "Телемское аббатство — утопическая модель. Его девиз «Делай что хочешь» означает не произвол, а доверие к свободным, образованным и нравственно воспитанным людям.",
    "Панург — умный, красноречивый, хитрый и трусливый герой. Его рассуждения о браке превращаются в пародию на богословские и философские споры.",
    "Сатира направлена против схоластики, фанатизма, церковного лицемерия, захватнических войн и пустой риторики.",
    "Таким образом, гротеск у Рабле выражает энергию жизни, сатира разрушает догматизм, а утопия Телема утверждает идеал свободного и гармонически развитого человека."
  ],
  "8": [
    "Роман Сервантеса «Дон Кихот» опубликован в двух частях в 1605 и 1615 годах. Он возникает на границе Возрождения и XVII века и первоначально задуман как пародия на поздние рыцарские романы.",
    "Главный герой — идальго Алонсо Кихано, который, начитавшись рыцарских книг, становится Дон Кихотом Ламанчским. Он превращает обычную реальность в мир высокого подвига: мельницы становятся великанами, трактиры — замками, крестьянка Альдонса — Дульсинеей.",
    "Эпизод с ветряными мельницами смешон из-за разрыва между реальностью и фантазией, но стремление героя бороться со злом остаётся нравственно значительным.",
    "Освобождая каторжников, Дон Кихот защищает свободу как ценность, но не учитывает конкретные обстоятельства. Идеал без знания жизни приводит к разрушительным последствиям.",
    "Образ Дон Кихота двойственен: он безумен, но честен, бескорыстен, мужествен и сострадателен. Поэтому герой вызывает и смех, и уважение.",
    "Санчо Панса практичен и связан с народным здравым смыслом. Постепенно герои влияют друг на друга: Санчо принимает часть идеалов хозяина, а Дон Кихот становится внимательнее к действительности.",
    "Губернаторство Санчо на острове Баратария показывает, что простолюдин способен проявить справедливость и практический разум.",
    "Во второй части герои встречают читателей первой части романа. Сервантес вводит игру с авторством и рукописью Сида Ахмета Бененхели, превращая сам процесс повествования в тему произведения.",
    "В финале Дон Кихот возвращается домой, отказывается от рыцарских фантазий и умирает как Алонсо Кихано. Вместе с безумием исчезает его высокая вера в возможность справедливого мира.",
    "Таким образом, роман пародирует рыцарскую традицию и одновременно сохраняет её нравственный идеал. Сложный герой, множественность точек зрения и игра с повествованием делают «Дон Кихота» одним из оснований романа Нового времени."
  ],
  "9": [
    "Комедии Шекспира связаны с гуманистической культурой английского Возрождения и утверждают ценность любви, свободы, разума и жизненной энергии.",
    "Главная тема — освобождение живого чувства от ложных запретов. Героям мешают воля родителей, общественные условности, ошибки, ревность, переодевания и путаница.",
    "Композиция строится на временном нарушении порядка. Затем через ошибки и превращения герои приходят к узнаванию, восстановлению семьи и гармонии.",
    "В «Комедии ошибок» действуют две пары близнецов — Антифолы и Дромио, разлучённые в детстве. Их встреча в Эфесе создаёт цепь ложных узнаваний.",
    "Жена одного Антифола принимает другого за мужа, купцы требуют чужие долги, а слуги получают наказания за поступки двойника. Каждый действует логично, но исходя из неверной информации.",
    "Комизм строится на превосходстве зрителя, который знает о существовании близнецов. Ошибки накапливаются и создают ощущение полного безумия мира.",
    "В финале раскрывается семейная история, разлучённые родственники соединяются. Счастливая развязка восстанавливает не только фактическую истину, но и человеческие связи.",
    "В других комедиях сходную функцию выполняют переодевания и лесное пространство, где ослабевают социальные правила и проверяются чувства.",
    "Шуты и слуги часто лучше господ понимают происходящее, а любовь получает право противостоять расчёту и навязанной воле.",
    "Таким образом, комедии Шекспира жизнеутверждающи потому, что хаос оказывается преодолимым, а ошибки помогают восстановить любовь, семью и взаимопонимание."
  ],
  "10": [
    "Трагедии Шекспира создавались на рубеже XVI–XVII веков, в период кризиса ренессансного гуманизма. Идеи свободы и разума сталкиваются с насилием, честолюбием и политической борьбой.",
    "К великим трагедиям относятся «Гамлет», «Отелло», «Король Лир» и «Макбет». Их герой велик, но внутренне противоречив.",
    "В «Гамлете» призрак сообщает принцу, что Клавдий убил его отца. Внешний сюжет мести превращается в философский вопрос о возможности справедливого действия в мире лжи.",
    "Гамлет медлит не из трусости. Он проверяет истину, сомневается в природе призрака и боится стать частью того насилия, которое осуждает.",
    "В «Мышеловке» театр становится средством познания. Реакция Клавдия подтверждает его вину и показывает способность искусства разоблачать скрытое.",
    "Монолог «Быть или не быть» посвящён выбору между терпением и сопротивлением, жизнью и отказом от неё. Простой ответ невозможен из-за нравственной ответственности и страха неизвестности.",
    "Офелия оказывается между волей отца, приказами короля и любовью к Гамлету. Её безумие показывает разрушение частного чувства политическим миром.",
    "Клавдий осознаёт вину, но не готов отказаться от короны. Лаэрт и Фортинбрас являются двойниками Гамлета и показывают другие способы ответа на смерть отца.",
    "Сцена на кладбище напоминает о равенстве всех перед смертью и одновременно утверждает силу личной памяти.",
    "В финале истина раскрыта и преступник наказан, но справедливость оплачена гибелью почти всех главных героев.",
    "Таким образом, трагедии Шекспира выражают кризис гуманизма: нравственное величие личности сохраняется, но разум и справедливость уже не гарантируют победы."
  ],
  "11": [
    "XVII век — переходная эпоха между Возрождением и Просвещением. Религиозные войны, укрепление абсолютизма, научная революция и кризис ренессансной веры в гармонию сделали литературный процесс противоречивым.",
    "Литературное направление — широкая система мировоззренческих и эстетических принципов. В XVII веке ведущими направлениями были барокко и классицизм.",
    "Литературное течение — более узкое объединение внутри направления. Например, к барочной культуре относятся метафизическая поэзия в Англии, гонгоризм в Испании, маринизм в Италии и прециозность во Франции.",
    "Стиль — система художественных средств, проявляющаяся в языке, композиции, образности и синтаксисе. Можно говорить о стиле эпохи, направления, школы и отдельного автора.",
    "Барокко выражает ощущение изменчивого, театрального и ненадёжного мира. Его признаки — контраст, гипербола, сложная метафорика, мотив бренности и соединение высокого с низким.",
    "Классицизм стремится противопоставить хаосу разум и порядок. Он опирается на античность, жанровую иерархию, правила трёх единств и конфликт долга с чувством.",
    "Однако литература века не укладывается в жёсткие схемы: Корнель соединяет классицистический конфликт с барочной динамикой, Мольер — норму с живым характером, Мильтон — библейский эпос с барочной масштабностью.",
    "Таким образом, направление выражает общее мировоззрение, течение — его конкретный вариант, стиль — художественный способ воплощения. Барокко и классицизм представляют две разные реакции на кризис XVII века."
  ],
  "12": [
    "Барокко сформировалось на рубеже XVI–XVII веков в условиях религиозных войн, Контрреформации, абсолютизма и новых научных открытий.",
    "Главный принцип — противоречивое единство мира. Духовное соединяется с телесным, прекрасное — с безобразным, жизнь — со смертью, величие — с ничтожеством.",
    "Важны мотивы сна, театра, маски, лабиринта и зеркала. Стиль основан на контрастах, гиперболах, парадоксах и сложных метафорах. Мотив vanitas подчёркивает бренность красоты и власти.",
    "В Испании выделяются культизм Гонгоры и консептизм Кеведо. Первый создаёт усложнённый поэтический язык, второй строится на интеллектуальной остроте, сатире и гротеске.",
    "Кальдерон в пьесе «Жизнь есть сон» показывает принца Сехисмундо, который не знает, где реальность, а где сон. Вывод этический: даже в неустойчивом мире человек обязан поступать достойно.",
    "Во Франции барокко проявляется в прециозности, пасторальном романе, трагикомедии и раннем Корнеле. У Паскаля барочное сознание выражается в контрасте величия и ничтожества человека.",
    "В Германии барокко развивается на фоне Тридцатилетней войны. У Грифиуса преобладают мотивы разрушения и бренности, а в «Симплициссимусе» Гриммельсгаузена плутовской герой проходит через хаос войны.",
    "Таким образом, испанское барокко отличается философской драмой и сложной поэзией, французское сосуществует с классицизмом, немецкое особенно остро выражает опыт войны и разрушения."
  ],
  "13": [
    "«Сид» Корнеля поставлен в 1636 году и занимает промежуточное место между барочной трагикомедией и классицистической трагедией.",
    "Главный конфликт — любовь и честь. Родриго любит Химену, но должен отомстить её отцу за оскорбление дона Диего.",
    "Если Родриго откажется от мести, он потеряет честь и станет недостоин Химены. Если выполнит долг, уничтожит возможность любви. Он убивает графа.",
    "Химена продолжает любить Родриго, но требует наказания убийцы отца. Её выбор столь же трагичен: простить — нарушить дочерний долг, добиться смерти — потерять любимого.",
    "Жанр трагикомедии определяется высоким конфликтом и отсутствием гибели главных героев. Возможность брака сохраняется, хотя откладывается.",
    "Военный подвиг Родриго против мавров меняет его статус: он становится Сидом, а частная месть вступает в конфликт с государственной необходимостью.",
    "Пьеса вызвала спор о правдоподобии и правилах классицизма: за короткий срок происходят дуэль, война, победа и судебные испытания.",
    "Важнейшее средство — риторический монолог. Стансы Родриго показывают внутреннюю борьбу любви и долга.",
    "Финал компромиссный: Химене предлагают ждать, Родриго — продолжать службу. Конфликт не снят полностью, но трагическая гибель предотвращена.",
    "Таким образом, особенность «Сида» — изображение любви и чести как равно великих ценностей, между которыми человек вынужден выбирать."
  ],
  "14": [
    "Мольер — крупнейший французский комедиограф XVII века. Его творчество соединяет общечеловеческую проблематику, французский национальный быт и яркую индивидуальность героев.",
    "Общечеловеческие ценности — разум, честность, свобода, любовь, достоинство и мера. Национальный уровень связан с салонами, религиозными конфликтами, семейным устройством и сословными претензиями.",
    "Основная модель — столкновение естественной жизни с ложной идеей. Герой подчиняет всё одной страсти и теряет способность видеть реальность.",
    "В «Тартюфе» Оргон отдаёт власть лицемеру, который использует религиозный язык ради имущества и желания. Сатира направлена не против веры, а против её превращения в маску.",
    "В «Мизантропе» Альцест защищает искренность, но его абсолютная непримиримость делает общение невозможным. Мольер отстаивает разумную меру.",
    "В «Дон Жуане» личная свобода превращается в отрицание ответственности, в «Скупом» деньги разрушают семейные отношения, в «Мещанине во дворянстве» внешняя форма подменяет культуру.",
    "Положительный идеал редко сосредоточен в одном герое. Его выражают слуги, женщины, друзья и родственники, способные видеть ситуацию яснее.",
    "Комическое возникает из характера, ситуации, речи, повторов и фарса, но всегда связано с нравственным познанием.",
    "Таким образом, Мольер показывает национально конкретное французское общество и одновременно раскрывает универсальные пороки. Его идеал — свободная, разумная и ответственная жизнь."
  ],
  "15": [
    "«Потерянный рай» Мильтона опубликован в 1667 году и посвящён библейскому сюжету о грехопадении.",
    "Поэма соединяет Библию, античный эпос, барочную масштабность, пуританскую теологию и политический опыт Английской революции.",
    "Главная проблема — свободный выбор. Сюжет начинается после поражения Сатаны, который решает продолжить борьбу через искушение человека.",
    "Сатана величествен, красноречив и волев, но его свобода превращается в зависимость от гордыни и ненависти. Он не создаёт, а искажает созданное.",
    "Адам и Ева до падения свободны и разумны. Ева стремится к знанию и самостоятельности, Адам ест плод из любви к ней, понимая последствия.",
    "После падения возникают стыд, ревность, обвинение и разделение. Однако раскаяние открывает возможность спасения.",
    "Архангел Михаил показывает Адаму будущую историю человечества, и частный сюжет получает всемирный масштаб.",
    "Мильтон использует белый стих, сложный синтаксис, библейские и античные аллюзии.",
    "В финале Адам и Ева покидают Рай, но весь мир лежит перед ними. Человеческая история начинается с утраты невинности и приобретения ответственности.",
    "Таким образом, уникальность поэмы — в соединении религиозного эпоса и философской драмы свободы."
  ],
  "16": [
    "«Путь паломника» Джона Беньяна — религиозная аллегория XVII века о духовном пути человека.",
    "Главный герой Христианин живёт в Городе Разрушения. Книга открывает ему греховность мира, а тяжёлое бремя на спине символизирует вину.",
    "Он покидает дом и идёт к Небесному городу. Уже начало трагично: поиск спасения требует разрыва с привычной жизнью и близкими.",
    "Топь Уныния воплощает отчаяние человека, осознавшего вину, но ещё не обретшего надежду.",
    "У Креста бремя падает, однако путь продолжается. Спасение требует постоянного подтверждения.",
    "Ярмарка Суеты превращает весь земной мир в рынок, где продаются власть, удовольствие и отношения. Верного казнят за отказ участвовать в этой системе.",
    "В Замке Сомнения великан Отчаяние убеждает героев покончить с собой. Христианин спасается ключом Обетования — памятью о надежде.",
    "Река смерти становится последним испытанием. Смерть показана как переход, а не окончательное уничтожение.",
    "Таким образом, трагический поиск смысла связан с одиночеством, страхом и постоянной возможностью падения, но движение сохраняется благодаря вере, памяти и надежде."
  ],
  "17": [
    "Дени Дидро — центральная фигура французского Просвещения, философ, писатель, драматург и организатор «Энциклопедии».",
    "Главная направленность его творчества — критика догматизма, религиозной нетерпимости, сословных предрассудков и защита свободного исследования.",
    "«Энциклопедия» стала не только справочником, но и формой борьбы против невежества и привилегий.",
    "В художественной прозе Дидро использует диалог и столкновение позиций. Истина не сообщается готовой, а возникает в споре.",
    "В «Племяннике Рамо» циничный герой превращает талант в товар и одновременно разоблачает общество, где способности зависят от денег и покровителей.",
    "В «Жаке-фаталисте» герой говорит о предопределении, но постоянно действует. Рассказчик вмешивается и разрушает линейное повествование.",
    "В «Монахине» Сюзанна борется против принудительного монашества. Институт, объявляющий себя духовным, оказывается способен подавлять личность.",
    "В драматургии Дидро развивал мещанскую драму и требовал изображать обычную семейную жизнь и реальные нравственные конфликты.",
    "Таким образом, творчество Дидро защищает разум, свободу и самостоятельный поиск истины, а его художественное новаторство связано с диалогичностью и открытой формой."
  ],
  "18": [
    "Философская повесть Вольтера соединяет быстрый приключенческий сюжет и проверку идей практикой.",
    "Герои путешествуют, сталкиваются с разными обществами, религиями и государствами, а каждый эпизод становится интеллектуальным экспериментом.",
    "В «Кандиде» Панглос утверждает, что всё к лучшему в лучшем из миров. События — война, землетрясение, инквизиция, рабство — постоянно опровергают эту формулу.",
    "Война сначала описана как красивое зрелище, затем показаны сожжённые деревни и убитые мирные жители. Контраст разоблачает официальную риторику.",
    "После Лиссабонского землетрясения инквизиция устраивает аутодафе. Абсурдное сочетание природной катастрофы и религиозного насилия высмеивает фанатизм.",
    "Встреча с искалеченным рабом в Суринаме показывает цену европейского благополучия и колониальной экономики.",
    "Невозмутимый рассказчик говорит о страшном спокойно, что усиливает сатиру.",
    "Финальная формула «надо возделывать наш сад» означает отказ от пустых систем и переход к конкретной деятельности и ответственности.",
    "Таким образом, своеобразие философской повести Вольтера — в лаконизме, условности, быстром сюжете, типизированных героях и иронической проверке идей жизнью."
  ],
  "19": [
    "«Путешествия Гулливера» Свифта — философская сатира на политику, науку, цивилизацию и самого человека.",
    "Четыре путешествия меняют масштаб и точку зрения, лишая человека права считать себя естественным центром мира.",
    "В Лилипутии крошечные люди ведут великие политические споры. Конфликт о том, с какого конца разбивать яйцо, пародирует религиозные войны, а прыжки на канате — придворную карьеру.",
    "В Бробдингнеге Гулливер сам становится маленьким. Король, выслушав рассказ о европейской политике и оружии, считает европейцев опасными существами.",
    "В Лапуте учёные погружены в абстракции и не замечают жизни. Академия Лагадо высмеивает знание, оторванное от практики и нравственной цели.",
    "В стране гуигнгнмов разумные лошади противопоставлены йеху — жадным и агрессивным человекоподобным существам.",
    "Но чистый разум гуигнгнмов тоже холоден и бесчеловечен. Гулливер, вернувшись домой, впадает в мизантропию и не выносит людей.",
    "Сухая документальная манера делает фантастику убедительной и усиливает сатиру.",
    "Таким образом, роман разоблачает политическую мелочность, гордость цивилизации, бесплодный рационализм и животные страсти, но предупреждает и об опасности ненависти к человечеству."
  ],
  "20": [
    "Лоренс Стерн сыграл огромную роль в развитии европейского романа, разрушив линейное повествование и превратив сам рассказ в предмет искусства.",
    "В «Тристраме Шенди» герой пытается рассказать свою жизнь, но постоянно отклоняется в семейные истории, комментарии и ассоциации.",
    "Отступление становится основой композиции. Внешнее время замедляется, а время сознания расширяется.",
    "Рассказчик обращается к читателю, спорит с ним и обманывает ожидания, превращая чтение в совместную игру.",
    "Графические приёмы — чёрная и белая страницы, линии сюжета — подчёркивают материальность книги и условность повествования.",
    "Персонажи строятся вокруг «коньков»: Вальтер Шенди любит теории, дядя Тоби воспроизводит военные осады. Их странности показаны с юмором и сочувствием.",
    "В «Сентиментальном путешествии» важны не достопримечательности, а мимолётные встречи и эмоциональные реакции.",
    "Стерн утверждает ценность чувства и сострадания, но осложняет сентиментальность иронией.",
    "Таким образом, Стерн подготовил психологический роман, модернизм и метаповествование, расширив возможности авторского голоса, времени, графики и читательского участия."
  ],
  "21": [
    "Гёте — центральная фигура немецкой литературы XVIII–XIX веков. Его творчество охватывает «Бурю и натиск», веймарский классицизм и зрелую европейскую культуру.",
    "В «Страданиях юного Вертера» герой переживает невозможную любовь и конфликт с обществом. Эпистолярная форма создаёт близость к сознанию, но автор показывает и опасность чувства, не признающего границ другого.",
    "В Веймаре Гёте вместе с Шиллером стремился соединить свободу личности, разум, античную гармонию и современный опыт.",
    "Главное произведение — «Фауст». Герой разочарован книжным знанием и хочет пережить полноту мира.",
    "Договор с Мефистофелем строится вокруг остановки: если Фауст признает мгновение окончательно прекрасным и удовлетворится, он проиграет.",
    "Трагедия Маргариты показывает цену стремления к опыту. Фауст не принимает вовремя ответственность за последствия.",
    "Во второй части личный поиск расширяется до истории, политики, экономики и античности. Созидательная деятельность героя также связана с насилием.",
    "В финале спасение объясняется не безошибочностью, а постоянным стремлением.",
    "Гёте развил лирику, балладу, роман воспитания и идею мировой литературы как диалога национальных культур.",
    "Таким образом, Гёте связал немецкую литературу с мировой культурой и создал модель личности, развивающейся через деятельность, самоограничение и бесконечный поиск."
  ],
  "22": [
    "Фридрих Шиллер соединяет в драматургии исторический конфликт и нравственное исследование личности.",
    "История у него становится пространством выбора между свободой и подчинением, долгом и страстью, идеалом и необходимостью.",
    "В «Разбойниках» Карл Моор протестует против несправедливости, но его отряд совершает преступления. Благородная цель без нравственной меры превращается в разрушение.",
    "В «Коварстве и любви» любовь Фердинанда и Луизы гибнет из-за сословной системы и придворной интриги. Политическое устройство вторгается в частную жизнь.",
    "В «Дон Карлосе» идея свободы Нидерландов соединяется с трагическим политическим идеализмом маркиза Позы.",
    "В «Валленштейне» герой одновременно создаёт обстоятельства и становится их пленником.",
    "В «Марии Стюарт» политический конфликт превращается в нравственный поединок двух королев: Мария внутренне очищается, Елизавета сохраняет власть, но остаётся одинокой.",
    "В «Вильгельме Телле» частный человек вынужден сопротивляться тирании, а выстрел в яблоко показывает унижение личности властью.",
    "Важная категория — возвышенное: внешнее поражение может сопровождаться внутренней победой и нравственной свободой.",
    "Таким образом, пафос Шиллера — познание истории через личный выбор и поиск свободы, не превращающейся в произвол."
  ],
  "23": [
    "Романтизм сформировался на рубеже XVIII–XIX веков как реакция на кризис просветительской веры в разум и гармонический прогресс.",
    "Главной исторической предпосылкой стала Французская революция. Идеалы свободы, равенства и братства столкнулись с террором, войнами и наполеоновской империей.",
    "Промышленный переворот разрушал традиционный уклад, усиливал власть денег, городов и механизированного труда. Романтики противопоставляли обезличенной цивилизации природу, искусство, народную культуру и свободную личность.",
    "Философской основой стал немецкий идеализм. Кант показал активность сознания, Фихте подчеркнул роль творческого «я», Шеллинг увидел в природе живой организм, а в искусстве — соединение сознательного и бессознательного.",
    "Братья Шлегели разработали идею свободной, незавершённой и универсальной романтической поэзии.",
    "Романтический герой — исключительная личность, конфликтующая с обществом. Он стремится к абсолютной свободе, любви, знанию или творчеству, но идеал не может полностью воплотиться в действительности.",
    "Природа является живой духовной силой, а фольклор и легенда — выражением национального духа.",
    "Первый этап — предромантизм второй половины XVIII века: сентиментализм, готический роман, «Буря и натиск». Второй — ранний йенский романтизм. Третий — зрелый романтизм 1810–1820-х годов.",
    "После 1830-х годов ведущая роль переходит к реализму, но романтическая традиция продолжается в символизме, модернизме и фантастике.",
    "Таким образом, романтизм возникает из кризиса Просвещения и революционной эпохи. Его центральный конфликт — невозможность полного соединения идеала и действительности."
  ],
  "24": [
    "Ключевые понятия романтизма образуют единую систему и описывают отношения человека, идеала и действительности.",
    "Романтический идеал — представление об абсолютной свободе, истинной любви, совершенном искусстве или единстве человека и природы. Он остаётся недостижимым, но организует движение героя.",
    "В «Генрихе фон Офтердингене» идеал воплощён в голубом цветке — символе любви, поэзии, природы и духовного познания.",
    "Романтический герой — исключительная личность, остро переживающая несоответствие внутреннего мира и общества. Он одинок, свободолюбив и может быть поэтом, изгнанником или бунтарём.",
    "Байронический герой горд и разочарован. Генрих Новалиса представляет иной тип — поэта, стремящегося духовно преобразить мир.",
    "У Эдгара По романтический герой часто находится на границе рассудка и безумия. Рассказчики «Чёрного кота», «Лигейи» и «Падения дома Ашеров» не способны надёжно отделить реальность от навязчивой идеи.",
    "Романтическое двоемирие — противопоставление повседневного мира и сферы мечты, искусства, природы или бесконечности.",
    "Романтическая ирония позволяет автору создать художественный мир и одновременно показать его условность. У Гофмана высокое откровение может соседствовать с нелепой бытовой ситуацией.",
    "Романтический символ — многозначный конкретный образ. Голубой цветок, дом Ашеров и образ Лигейи нельзя свести к одному толкованию.",
    "Таким образом, герой стремится к идеалу, двоемирие выражает разрыв между идеалом и реальностью, символ открывает бесконечный смысл, а ирония не позволяет закрепить его в одной окончательной форме."
  ],
  "25": [
    "Германия стала родиной философской теории романтизма. Политическая раздробленность усиливала поиск национального единства в языке, истории, философии и искусстве.",
    "Немецкий романтизм возник под влиянием Французской революции, идеалистической философии и разочарования в просветительском рационализме.",
    "Йенская школа сформировалась в конце 1790-х годов. Её представители — братья Шлегели, Новалис, Тик, Вакенродер; близкими были Шеллинг и Шлейермахер.",
    "Йенцы создали теорию универсальной и прогрессивной романтической поэзии, способной соединять разные жанры и формы знания.",
    "Важнейшие идеи — романтическая ирония, свобода творца, живая природа и романтизация обыденного.",
    "В «Генрихе фон Офтердингене» путь героя становится становлением поэта, а голубой цветок — символом любви, знания и творчества.",
    "Гейдельбергская школа сформировалась в начале XIX века на фоне наполеоновских войн. Её представители — Арним, Брентано, братья Гримм, Эйхендорф.",
    "Если йенцы сосредоточены на философии искусства, гейдельбергцы обращаются к фольклору, истории и национальной памяти.",
    "«Волшебный рог мальчика» и сказки братьев Гримм превращают народную словесность в основу культурного самоопределения.",
    "Таким образом, йенская школа создала философию романтического искусства, а гейдельбергская укрепила интерес к национальной истории и фольклору."
  ],
  "26": [
    "Новалис — псевдоним Фридриха фон Гарденберга, крупнейшего представителя йенского романтизма. Он стремился соединить философию, естественные науки и поэзию.",
    "Любовь к рано умершей Софи фон Кюн повлияла на «Гимны к ночи», где смерть становится переходом к более высокой духовной реальности.",
    "Главная эстетическая идея Новалиса — романтизация мира: обыденное должно обрести высокий смысл, а конечное — открыть связь с бесконечным.",
    "Эта программа воплощена в незавершённом романе «Генрих фон Офтердинген» — романе воспитания художника и полемике с «Вильгельмом Мейстером» Гёте.",
    "В начале Генрих видит сон о голубом цветке. Он символизирует поэзию, любовь, природу, познание и бесконечное стремление.",
    "Путешествие в Аугсбург является внутренним становлением. Купцы, рудокоп, отшельник и Зулейма открывают герою разные стороны мира.",
    "Поэт у Новалиса способен видеть скрытое единство вещей и соединять человека с природой, прошлое с будущим, сон с действительностью.",
    "Матильда получает человеческий облик голубого цветка. Любовь становится частью поэтического призвания.",
    "Сказка Клингзора символически моделирует будущее преображение мира через любовь и поэзию. Она остаётся многозначной.",
    "Таким образом, роман показывает становление поэта: голубой цветок организует бесконечный поиск, путешествие становится формой познания, а поэзия — способом духовного преображения действительности."
  ],
  "27": [
    "Генрих фон Клейст — один из наиболее трагических немецких писателей начала XIX века. Его творчество связано с романтизмом, но не принадлежит полностью к какой-либо школе.",
    "После знакомства с философией Канта Клейст пережил кризис и пришёл к мысли, что человек не способен получить окончательно достоверное знание о мире.",
    "Поэтому его герои стремятся к справедливости и ясности, но действуют в реальности, где истина скрыта, а поступки приводят к неожиданным последствиям.",
    "В комедии «Разбитый кувшин» судья Адам расследует преступление, совершённое им самим. Представитель закона оказывается источником беззакония.",
    "В «Пентесилее» любовь амазонки к Ахиллу подчинена закону военного состязания и заканчивается уничтожением возлюбленного.",
    "В «Принце Фридрихе Гомбургском» герой нарушает приказ, но приносит победу. Возникает конфликт личной инициативы и государственной дисциплины.",
    "В «Михаэле Кольхаасе» честный торговец не может добиться законной справедливости и поднимает восстание. Правое требование превращается в насилие и гибель невиновных.",
    "В «Маркизе д’О» образ спасителя совпадает с образом преступника, а центральное событие передаётся через умолчание.",
    "В «Землетрясении в Чили» природная катастрофа временно разрушает социальные границы, но затем религиозная толпа убивает героев.",
    "Таким образом, Клейст-драматург исследует конфликт личности и закона, а Клейст-новеллист — ограниченность человеческого знания, случай и нравственную неоднозначность поступка."
  ],
  "28": [
    "Э. Т. А. Гофман — крупнейший представитель позднего немецкого романтизма, писатель, композитор, художник и юрист.",
    "Центральный конфликт — противостояние художника и филистерского общества. Филистер признаёт только выгоду и карьеру, художник видит чудесное и поэтическое измерение мира.",
    "Художественный мир существует одновременно в бытовом и фантастическом планах. Нельзя окончательно решить, является ли чудесное реальностью, воображением или безумием.",
    "Романтическая ирония позволяет сочувствовать мечтателю и одновременно видеть его неловкость. Музыка понимается как наиболее романтическое искусство.",
    "В «Золотом горшке» Ансельм выбирает между карьерой и миром Серпентины. Атлантида и золотой горшок символизируют поэтическое призвание и духовную гармонию.",
    "В «Крошке Цахесе» неспособному герою приписываются чужие заслуги. Сказочная ситуация становится сатирой на карьеру, славу и общественную неспособность видеть истинную ценность.",
    "В «Песочном человеке» Натанаэль переносит детский страх на реальность и влюбляется в механическую куклу Олимпию. Его любовь оказывается любовью к собственному отражению.",
    "Клара предлагает рациональное объяснение, но текст не позволяет полностью устранить фантастическое.",
    "Произведения Гофмана соединяют сказку, сатиру, готику, психологическую новеллу, музыку и гротеск.",
    "Таким образом, его эстетика основана на двоемирии, культе искусства, защите творческой личности и ироническом недоверии к любой окончательной версии реальности."
  ],
  "29": [
    "Английский романтизм сформировался в конце XVIII века под влиянием Французской революции и промышленного переворота.",
    "Разочарование в революционной истории и разрушение традиционного сельского уклада сделали важнейшими темами природу, свободу, воображение, детство и критику цивилизации.",
    "К первому поколению относятся поэты «озёрной школы» — Вордсворт, Кольридж и Саути. Началом английского романтизма считается сборник «Лирические баллады» 1798 года.",
    "Вордсворт обращался к обычным людям и живой речи. Природа у него является нравственной силой, сохраняющейся в памяти и возвращающей человеку внутреннюю цельность.",
    "Детство понимается как состояние особой близости к природе и духовной полноте.",
    "Кольридж развивает фантастическую и символическую линию. В «Сказании о старом мореходе» убийство альбатроса означает разрыв человека с живым миром.",
    "Страдания моряков и альбатрос на шее героя выражают вину. Перелом наступает, когда мореход благословляет морских существ и восстанавливает способность любить жизнь.",
    "Искупление остаётся незавершённым: герой должен постоянно рассказывать свою историю.",
    "Саути писал баллады и поэмы на экзотические сюжеты, расширяя культурный горизонт английской поэзии.",
    "Таким образом, озёрная школа обновила язык поэзии, утвердила духовную ценность природы и открыла необычное в обычной жизни."
  ],
  "30": [
    "Джордж Гордон Байрон — крупнейший представитель английского романтизма и поэт, связавший литературу с политическим и национально-освободительным действием.",
    "Центральная этическая ценность Байрона — свобода. Он выступает против тирании, лицемерия и духовного подчинения.",
    "Но свобода имеет трагическую сторону: герой, отвергнувший общество, может оказаться в полном одиночестве.",
    "Байронический герой горд, независим, разочарован и внутренне закрыт. Он часто имеет тайное прошлое, вину или утрату. Его протест велик, но абсолютный индивидуализм способен стать разрушительным.",
    "Природа у Байрона величественна и свободна. Море, горы и буря противопоставлены ограниченному обществу и одновременно подчёркивают одиночество героя.",
    "Лироэпическая поэма соединяет повествовательный сюжет с авторским переживанием, пейзажем, философией и политическим комментарием.",
    "В «Паломничестве Чайльд-Гарольда» разочарованный аристократ путешествует по Европе, но внешнее движение постепенно уступает авторскому размышлению об истории и свободе.",
    "Испания показана в борьбе с Наполеоном, Греция — в контрасте славного прошлого и порабощённого настоящего. Море становится символом свободы, переживающей империи.",
    "В восточных поэмах действуют изгнанники, мстители и герои тайной судьбы. Фрагментарная композиция усиливает загадочность.",
    "В «Дон Жуане» Байрон иронически переосмысливает собственную романтическую модель и разрушает высокий героический тон.",
    "Таким образом, эстетика Байрона основана на свободе, сильной личности и историческом чувстве, а лироэпическая поэма соединяет сюжет путешествия с исповедью, сатирой и философией."
  ]
};
Object.entries(MANUAL_FULL_ANSWERS_4_30).forEach(([number, paragraphs]) => {
  const n = Number(number);
  ANSWER_OVERRIDES[n] ??= {};
  ANSWER_OVERRIDES[n].fullAnswer = paragraphs;
});


// ===== Редакция билетов после критической проверки (2026-07-14) =====
const CRITICALLY_REVISED_TICKETS = {
  "54": {
    "works": [
      "Цветы зла",
      "Соответствия",
      "Поэтическое искусство",
      "Гласные"
    ],
    "thesis": "Декаданс выражает кризисное мироощущение конца XIX века, а символизм превращает его в художественную систему намёка, соответствий и музыкальности. Бодлер подготовил символизм, тогда как собственно школа оформилась у Верлена, Рембо и Малларме.",
    "points": [
      "Разграничить декаданс как мироощущение и символизм как направление.",
      "Показать Бодлера как предшественника символистской школы.",
      "Объяснить теорию соответствий и многозначность символа.",
      "Раскрыть музыкальность Верлена.",
      "Показать эксперимент Рембо и поэтику намёка Малларме.",
      "Сделать вывод о влиянии на модернизм."
    ],
    "episodes": [
      "В «Соответствиях» Бодлер изображает природу как храм знаков, где запахи, цвета и звуки перекликаются. Это программный источник символистской эстетики, но сам Бодлер исторически предшествует оформлению школы.",
      "В «Поэтическом искусстве» Верлен ставит музыкальность выше риторической ясности.",
      "В сонете «Гласные» Рембо соединяет букву, цвет и ощущение, превращая язык в систему видений."
    ],
    "correction": "Бодлера следует называть предшественником французского символизма, а не участником символистской школы в том же смысле, что Верлен, Рембо и Малларме.",
    "fullAnswer": [
      "Декаданс и символизм связаны с кризисом европейской культуры конца XIX века, но эти понятия не совпадают. Декаданс — широкое мироощущение усталости, разочарования в прогрессе, болезненной утончённости и неприятия буржуазной повседневности. Символизм — конкретное художественное направление, которое выработало собственную теорию образа и языка.",
      "Символисты исходили из мысли, что видимая действительность не исчерпывает сущности мира. За предметами скрываются духовные связи, поэтому задача поэзии — не называть и объяснять, а внушать, намекать и создавать цепь ассоциаций. Символ, в отличие от однозначной аллегории, сохраняет открытость и допускает несколько смыслов.",
      "Шарль Бодлер занимает переходное положение. Его следует считать прежде всего предшественником символистской школы. В стихотворении «Соответствия» природа представлена как храм, наполненный знаками, а запахи, цвета и звуки образуют единую систему. Эта теория соответствий стала одной из важнейших основ будущего символизма.",
      "Поль Верлен утверждает музыкальность, полутон и неясное настроение. Для него важнее не логическая формула, а интонация, ритм и звуковой рисунок. В «Поэтическом искусстве» он прямо противопоставляет музыку риторической тяжеловесности.",
      "Артюр Рембо превращает поэзию в эксперимент над восприятием. В сонете «Гласные» каждой букве приписывается цвет, а язык начинает восприниматься как самостоятельная система видений. Неожиданные соединения ощущений расширяют возможности образа.",
      "Стефан Малларме развивает поэтику намёка и смысловой неполноты. Он избегает прямого называния, использует паузы, синтаксические разрывы и сложные ассоциации. Читатель должен не получить готовый смысл, а восстановить его из структуры текста.",
      "Таким образом, Бодлер подготовил эстетику символизма, а Верлен, Рембо и Малларме оформили основные принципы французской символистской школы. Их открытия — музыкальность, соответствия, многозначный символ и активная роль читателя — подготовили европейский модернизм."
    ]
  },
  "55": {
    "works": [
      "Ткачи",
      "Перед восходом солнца",
      "Верноподданный",
      "Будденброки",
      "Тонио Крёгер"
    ],
    "thesis": "Литература Германии рубежа XIX–XX веков развивается от натурализма к социально-психологическому реализму и раннему модернизму; при обращении к Рильке нужно уточнять, что речь идёт о более широком немецкоязычном пространстве.",
    "points": [
      "Назвать исторический контекст объединённой и индустриальной Германии.",
      "Раскрыть натурализм и драматургию Гауптмана.",
      "Показать социальную сатиру Генриха Манна.",
      "Раскрыть кризис бюргерской культуры у Томаса Манна.",
      "Разграничить литературу Германии и немецкоязычную литературу.",
      "Показать переход к модернизму."
    ],
    "episodes": [
      "В «Ткачах» коллектив рабочих становится главным героем, а бытовая точность перерастает в образ исторического протеста.",
      "В «Верноподданном» Дидерих Геслинг соединяет покорность перед сильными с жестокостью к слабым.",
      "В «Будденброках» упадок торгового рода выражает кризис бюргерской культуры."
    ],
    "correction": "Рильке — австрийский поэт. Его допустимо упоминать только при расширении темы до немецкоязычной литературы, ясно отделив её от литературы Германии.",
    "fullAnswer": [
      "Немецкая литература рубежа XIX–XX веков развивается на фоне индустриализации, роста городов, социальных конфликтов и кризиса традиционной бюргерской культуры. В литературе Германии одновременно существуют натурализм, реализм, социальная сатира и ранние модернистские тенденции.",
      "Натурализм стремится передать воздействие среды, наследственности и социальных условий. Главной фигурой становится Герхарт Гауптман. В «Перед восходом солнца» семейный распад объясняется средой и наследственностью, а в «Ткачах» главным героем становится коллектив силезских рабочих.",
      "Генрих Манн развивает социально-политическую сатиру. В «Верноподданном» Дидерих Геслинг строит карьеру на поклонении власти и жестокости к зависимым. Частный характер превращается в модель авторитарного общества вильгельмовской Германии.",
      "Томас Манн исследует кризис бюргерской культуры и конфликт художника с жизнью. В «Будденброках» распад семьи связан с ослаблением практической энергии и усилением рефлексии. В «Тонио Крёгере» художник разрывается между искусством и желанием принадлежать обычной человеческой жизни.",
      "При характеристике литературного процесса важно различать литературу Германии и более широкую немецкоязычную литературу. Райнер Мария Рильке был австрийским поэтом, поэтому его можно упоминать только как представителя немецкоязычного модернизма, а не как собственно немецкого автора.",
      "Рубеж веков становится переходом к модернизму: усиливаются темы отчуждения, болезни, кризиса личности и ненадёжности привычных ценностей. Эти тенденции подготовили дальнейшее развитие прозы Кафки, Гессе и других немецкоязычных авторов XX века.",
      "Таким образом, литературный процесс в Германии определяется движением от социально конкретного натурализма к сложному психологическому и философскому анализу культуры. Гауптман, Генрих Манн и Томас Манн представляют основные линии этого развития."
    ]
  },
  "64": {
    "works": [
      "Ким",
      "Книга джунглей",
      "Если…"
    ],
    "thesis": "Киплинг соединяет точное знание Индии, приключенческую прозу и этику служения, но его художественную силу необходимо рассматривать вместе с исторической ограниченностью имперского мировоззрения.",
    "points": [
      "Показать двойной культурный опыт Киплинга.",
      "Раскрыть тему службы, закона и профессионализма.",
      "Разобрать «Кима» как роман воспитания и колониальную панораму.",
      "Показать воспитательную модель «Книги джунглей».",
      "Охарактеризовать поэзию и «Если…».",
      "Дать критическую постколониальную оценку."
    ],
    "episodes": [
      "Ким свободно переходит между культурами Индии, но одновременно включается в британскую разведывательную «Большую игру».",
      "Маугли усваивает Закон джунглей, основанный на дисциплине и взаимной ответственности.",
      "Стихотворение «Если…» утверждает самообладание, терпение и внутреннюю независимость."
    ],
    "correction": "Нужно отделять богатство художественного изображения Индии от имперских представлений эпохи и прямо обозначать современную постколониальную критику.",
    "fullAnswer": [
      "Творчество Редьярда Киплинга формируется на пересечении английской и индийской культур. Индия в его произведениях — не просто экзотический фон, а сложный мир языков, религий, профессий и социальных иерархий.",
      "Писатель особенно ценит службу, дисциплину, профессиональное мастерство и товарищество. Его героями становятся солдаты, инженеры, чиновники, врачи и люди, отвечающие за практическое дело. Однако эта этика часто включена в колониальную систему, которую автор воспринимал как естественную.",
      "Роман «Ким» соединяет приключение, воспитание и широкую панораму Индии. Ким свободно существует между культурами, путешествует с тибетским ламой и одновременно участвует в британской разведывательной «Большой игре». Поэтому роман показывает и культурную множественность Индии, и взгляд колониальной власти.",
      "В «Книге джунглей» воспитание связано с Законом сообщества. Маугли становится сильным не только благодаря природным качествам, но и потому, что усваивает правила, границы и взаимную ответственность. Одновременно его двойная принадлежность к миру животных и людей делает героя внутренне одиноким.",
      "Поэзия Киплинга отличается песенностью, балладным ритмом, рефренами и разговорной интонацией. В стихотворении «Если…» важнейшей ценностью становится самообладание: человек должен сохранять достоинство и в победе, и в поражении.",
      "Современное чтение Киплинга требует двойной перспективы. С одной стороны, он точно передал многообразие Индии, создал яркую приключенческую прозу и убедительную этику ответственности. С другой — его тексты несут отпечаток имперского сознания, культурной иерархии и колониального патернализма.",
      "Таким образом, Киплинг остаётся крупным художником и одновременно исторически противоречивым автором. Полноценный ответ должен соединять анализ его поэтики с критическим пониманием колониального контекста."
    ]
  },
  "69": {
    "works": [
      "На Западном фронте без перемен",
      "Прощай, оружие!",
      "Смерть героя",
      "Стихи Уилфреда Оуэна и Зигфрида Сассуна"
    ],
    "thesis": "Первая мировая война разрушила героическую риторику и породила литературу свидетельства, травмы и утраченного поколения — от фронтовой поэзии Оуэна и Сассуна до романов Ремарка, Хемингуэя и Олдингтона.",
    "points": [
      "Показать кризис идеи прогресса.",
      "Назвать фронтовую поэзию Оуэна и Сассуна.",
      "Раскрыть конфликт пропаганды и окопной правды.",
      "Показать мотив утраченного поколения.",
      "Объяснить новую фрагментарную форму.",
      "Сделать вывод о границе культурных эпох."
    ],
    "episodes": [
      "Уилфред Оуэн противопоставляет официальной формуле о славной смерти физиологическую правду газовой атаки.",
      "Зигфрид Сассун использует сатиру против тыловой риторики и военного командования.",
      "У Ремарка убийство французского солдата заставляет Пауля увидеть во враге конкретного человека."
    ],
    "correction": "Обзор следует расширить фронтовой поэзией Уилфреда Оуэна, Зигфрида Сассуна и, при необходимости, Гийома Аполлинера, а не ограничивать последующей романной прозой.",
    "fullAnswer": [
      "Первая мировая война стала переломом европейской культуры. Массовая гибель и технически организованное уничтожение разрушили веру в автоматический прогресс и традиционную военную героику.",
      "Одним из первых ответов стала фронтовая поэзия. Уилфред Оуэн передавал телесную правду окопа, газовых атак и страдания солдат, разрушая патриотические клише. Зигфрид Сассун использовал резкую сатиру против тыловой риторики, безответственного командования и общества, превращавшего войну в красивый миф. Гийом Аполлинер соединял фронтовой опыт с модернистским экспериментом.",
      "Главным героем становится рядовой человек, а главным пространством — окоп, госпиталь, марш и ожидание смерти. Официальные слова о славе и долге сталкиваются с грязью, страхом и случайной гибелью.",
      "В послевоенной прозе возникает образ «потерянного поколения». Герои Ремарка, Хемингуэя и Олдингтона возвращаются с войны, но не могут восстановить прежнюю биографию и доверие к обществу.",
      "Фронтовое товарищество противопоставляется государственным лозунгам. В романе Ремарка «На Западном фронте без перемен» человеческая близость временно защищает солдат от обезличивающей машины войны.",
      "Война меняет и художественную форму. Фрагментарность, повтор, внутренний монолог и нарушенная хронология передают травматическую память, которая не подчиняется ровному рассказу.",
      "Таким образом, литература Первой мировой войны развивается от непосредственного поэтического свидетельства Оуэна и Сассуна к романам утраченного поколения. Она превращает войну из героического события в опыт травмы, нравственного кризиса и исторической катастрофы."
    ]
  },
  "72": {
    "works": [
      "Огонь",
      "Жан-Кристоф"
    ],
    "thesis": "Литература социалистической ориентации связывает искусство с критикой войны и социального неравенства; Барбюс выражает революционно-социалистическую линию, тогда как Роллан сближается с ней через интернациональный гуманизм и ответственность интеллигенции.",
    "points": [
      "Определить общественную направленность литературы.",
      "Показать коллективного героя.",
      "Разобрать «Огонь» Барбюса.",
      "Уточнить гуманистическую позицию Роллана.",
      "Сопоставить революционную и гуманистическую линии.",
      "Обозначить риск схематизма."
    ],
    "episodes": [
      "В «Огне» окопная жизнь рядовых солдат приводит к пониманию социальных причин войны.",
      "В «Жан-Кристофе» судьба музыканта связывается с культурным единством Европы и нравственной миссией искусства."
    ],
    "correction": "Ромена Роллана нельзя без оговорки называть представителем партийной социалистической эстетики: его основа — интернациональный гуманизм, антивоенная позиция и нравственная ответственность художника.",
    "fullAnswer": [
      "Литература социалистической ориентации рассматривает войну, бедность и эксплуатацию как следствие общественного устройства. Она связывает судьбу личности с коллективной историей и стремится не только показать страдание, но и раскрыть его причины.",
      "Анри Барбюс приходит к социалистическим взглядам через фронтовой опыт. Роман «Огонь» основан на наблюдениях за жизнью солдат. Бытовая точность, разговорная речь и изображение физического истощения соединяются с выводом о том, что война обслуживает интересы, чуждые рядовым участникам.",
      "Коллектив солдат становится важнее одного героического персонажа. Их общий опыт постепенно рождает социальное сознание. Поэтому «Огонь» представляет революционно-социалистическую линию наиболее последовательно.",
      "Положение Ромена Роллана иное. Его нельзя сводить к партийной эстетике. Основу его позиции составляет интернациональный гуманизм, сопротивление национальной ненависти и убеждение, что интеллигенция обязана сохранять нравственную независимость.",
      "В «Жан-Кристофе» судьба музыканта соединяется с историей европейской культуры. Искусство должно преодолевать национальные границы, защищать человеческое достоинство и противостоять духовному насилию.",
      "Роллан сближается с социалистической ориентацией через защиту общественной ответственности искусства, интерес к революционным движениям и критику войны, но сохраняет самостоятельную гуманистическую позицию.",
      "Таким образом, Барбюс и Роллан представляют разные, но соприкасающиеся линии: революционно-социальную и интернационально-гуманистическую. Такое разграничение делает ответ исторически точным."
    ]
  },
  "76": {
    "works": [
      "Упадок и разрушение",
      "Сенсация",
      "Возвращение в Брайдсхед"
    ],
    "thesis": "Ранние романы Ивлина Во разоблачают абсурд институтов и нравственную пустоту общества; «Возвращение в Брайдсхед» показывает дальнейшую эволюцию автора к ностальгической и религиозно окрашенной прозе.",
    "points": [
      "Показать мир разрушенных ценностей.",
      "Раскрыть наивного героя и логику случайности.",
      "Разобрать сатиру на институты.",
      "Показать журналистику в «Сенсации».",
      "Охарактеризовать спокойную гротескную интонацию.",
      "Отделить позднюю эволюцию от ранней сатиры."
    ],
    "episodes": [
      "В «Упадке и разрушении» жизнь Пола определяется нелепыми решениями институтов и случайностью.",
      "В «Сенсации» редакция создаёт удобную версию войны, не интересуясь реальностью.",
      "«Возвращение в Брайдсхед» уже не сводится к сатире: в нём важны память, католическая вера и исчезновение аристократического мира."
    ],
    "correction": "«Возвращение в Брайдсхед» следует представить как этап эволюции Во, а не как типичный пример его раннего сатирического романа.",
    "fullAnswer": [
      "Ранние романы Ивлина Во изображают современное общество как мир, где образование, суд, пресса, семья и общественная служба сохраняют внешний авторитет, но утрачивают внутренний смысл.",
      "Сатира часто строится на столкновении относительно наивного героя с абсурдной системой. В «Упадке и разрушении» судьба Пола Пеннифезера определяется случайностями, чужими прихотями и институциональной нелепостью.",
      "Спокойная интонация усиливает жестокость сатиры. Рассказчик описывает катастрофические события так, будто они являются нормальной частью светской жизни. Тем самым нравственное равнодушие общества разоблачается без прямой проповеди.",
      "В «Сенсации» объектом критики становится журналистика. Газете важнее эффектный материал, чем фактическая истина, а война превращается в продукт, создаваемый редакцией для массового потребления.",
      "Ранний Во показывает институты как механизмы, занятые собственным воспроизводством. Университет не защищает знание, суд — справедливость, пресса — правду.",
      "Однако «Возвращение в Брайдсхед» нельзя считать просто ещё одним сатирическим романом. Здесь ирония соединяется с ностальгией, темой католической веры, памятью и размышлением об исчезающем аристократическом мире.",
      "Таким образом, ранняя проза Во основана на гротескной социальной сатире, а позднее творчество показывает движение к более сложной, религиозно и ностальгически окрашенной модели романа."
    ]
  },
  "77": {
    "works": [
      "Жёлтый Кром",
      "Контрапункт",
      "Миссис Дэллоуэй",
      "Сыновья и любовники"
    ],
    "thesis": "Новаторство английской прозы 1920-х годов связано с переходом от внешнего события к сознанию, полифонии и телесному опыту: Вулф развивает поток сознания, Хаксли — интеллектуальный роман 1920-х, Лоуренс — психологию чувственности.",
    "points": [
      "Показать кризис традиционного реалистического романа.",
      "Раскрыть поток сознания Вулф.",
      "Показать субъективное время в «Миссис Дэллоуэй».",
      "Разобрать «Жёлтый Кром» и «Контрапункт» Хаксли.",
      "Охарактеризовать телесность и психологизм Лоуренса.",
      "Указать «О дивный новый мир» только как дальнейшее развитие после 1920-х."
    ],
    "episodes": [
      "В «Миссис Дэллоуэй» один день включает десятилетия воспоминаний, а бой Биг-Бена соединяет внешнее и внутреннее время.",
      "В «Контрапункте» параллельные сюжетные линии строятся как музыкальные голоса и воплощают спор идей.",
      "В «Сыновьях и любовниках» зависимость Пола от матери осложняет его взросление и любовные отношения."
    ],
    "correction": "Роман «О дивный новый мир» опубликован в 1932 году. Он может быть назван только как последующее развитие идей Хаксли, но не должен служить главным доказательством для темы о 1920-х годах.",
    "fullAnswer": [
      "Английская проза 1920-х годов отказывается от традиционной модели последовательного сюжета, всезнающего рассказчика и полного объяснения характера. Писателей интересуют внутреннее время, поток сознания, полифония идей и телесный опыт.",
      "Вирджиния Вулф переносит центр романа в сознание. В «Миссис Дэллоуэй» внешнее действие занимает один день, но включает множество воспоминаний и точек зрения. Бой Биг-Бена отмечает объективное время, тогда как каждый персонаж переживает его по-своему.",
      "Образ Септимуса раскрывает послевоенную травму, а параллель между ним и Клариссой показывает скрытую близость внутреннего чувства смерти и внешне благополучной жизни.",
      "Олдос Хаксли в 1920-е годы развивает сатирический и интеллектуальный роман. «Жёлтый Кром» разоблачает культурную самодовольность интеллектуальной среды. В «Контрапункте» несколько сюжетных линий развиваются одновременно, словно музыкальные голоса, а герои воплощают конкурирующие философские и культурные позиции.",
      "Роман «О дивный новый мир» относится уже к 1932 году. Его можно кратко упомянуть как дальнейшее развитие хакслиевской критики массовой цивилизации, но нельзя делать основным текстом билета о 1920-х годах.",
      "Дэвид Герберт Лоуренс противопоставляет рационализированной цивилизации телесную и эмоциональную целостность. В «Сыновьях и любовниках» семейная зависимость, классовая среда и подавленная чувственность определяют трудности взросления Пола Морела.",
      "Таким образом, Вулф обновляет психологический роман через поток сознания и субъективное время, Хаксли создаёт интеллектуально-сатирическую полифонию, а Лоуренс исследует тело, желание и глубокие эмоциональные связи."
    ]
  },
  "80": {
    "works": [
      "Американская трагедия",
      "Оплот"
    ],
    "thesis": "Драйзер разоблачает американскую мечту как миф о равных возможностях: в «Американской трагедии» личный успех ведёт к преступлению, а в поздней прозе критика расширяется до анализа капитала, религиозного морализма и общественной системы.",
    "points": [
      "Определить американскую мечту.",
      "Разобрать Клайда как продукт среды.",
      "Показать социальный смысл любовного конфликта.",
      "Раскрыть преступление и суд.",
      "Добавить поздний роман «Оплот».",
      "Показать эволюцию к системной критике общества."
    ],
    "episodes": [
      "Клайд выбирает между Робертой и Сондрой как между двумя социальными мирами.",
      "Суд превращает трагедию в политическое и газетное зрелище.",
      "В «Оплоте» конфликт религиозно-нравственного идеала и мира денег показывает позднее углубление критики американского общества."
    ],
    "correction": "Поскольку вопрос охватывает 1920–1940-е годы, ответ нельзя строить только на «Американской трагедии»: необходимо обозначить позднюю эволюцию Драйзера, например через роман «Оплот».",
    "fullAnswer": [
      "Американская мечта обещает, что человек независимо от происхождения может добиться свободы, богатства и признания. Драйзер показывает, что в обществе неравных возможностей этот идеал превращается в источник давления и нравственного самообмана.",
      "В «Американской трагедии» Клайд Гриффитс формируется под воздействием бедности, рекламы, городской роскоши и социального престижа. Он хочет не просто достатка, а принадлежности к миру, который общество объявляет доказательством человеческой ценности.",
      "Любовный конфликт имеет социальную природу. Роберта связана с реальными отношениями и ответственностью, Сондра — с богатством и желанным будущим. Клайд выбирает между двумя общественными мирами и ставит мечту о статусе выше жизни другого человека.",
      "Преступление возникает из соединения личной слабости и общественного давления. Суд и пресса затем превращают трагедию в политическое и коммерческое зрелище, осуждая человека, но не систему ценностей, которая сформировала его желания.",
      "Для охвата 1920–1940-х годов необходимо обратиться и к поздней прозе. В романе «Оплот» конфликт строгого религиозно-нравственного идеала и современного мира денег показывает дальнейшее углубление критики американского общества.",
      "В позднем творчестве Драйзер всё сильнее рассматривает власть капитала, общественную несправедливость и ограниченность индивидуального успеха. Свобода не может быть достигнута только личным обогащением, если сама система построена на неравенстве.",
      "Таким образом, Драйзер проходит от трагедии отдельного карьерного стремления к более широкой критике американского капитализма. Американская мечта сохраняет привлекательность, но становится разрушительной, когда богатство подменяет нравственную цель."
    ]
  },
  "85": {
    "works": [
      "Чума",
      "В ожидании Годо",
      "Тропизмы",
      "Бильярд в половине десятого",
      "Жестяной барабан",
      "Человек ли это?"
    ],
    "thesis": "Послевоенная литература Запада определяется опытом Холокоста и войны, экзистенциальной ответственностью, кризисом языка, деколонизацией и поиском новых форм памяти — от Камю и Беккета до Бёлля, Грасса и Примо Леви.",
    "points": [
      "Показать кризис идеи прогресса после войны и Холокоста.",
      "Связать память и свидетельство с Примо Леви.",
      "Назвать экзистенциализм Сартра и Камю.",
      "Раскрыть театр абсурда Беккета и Ионеско.",
      "Показать «новый роман» Саррот и Роб-Грийе.",
      "Связать немецкую литературу памяти с Бёллем и Грассом.",
      "Добавить деколонизацию и массовое общество."
    ],
    "episodes": [
      "Примо Леви строит свидетельство о лагере на точности и нравственной сдержанности.",
      "В «Чуме» Риэ выбирает солидарное действие без гарантии окончательной победы.",
      "В «Ожидании Годо» повтор и несостоявшееся ожидание выражают кризис действия и смысла.",
      "Бёлль и Грасс исследуют непреодолённое нацистское прошлое Германии."
    ],
    "correction": "Широкий обзор нужно связывать с конкретными авторами и текстами, чтобы он не превращался в абстрактный перечень направлений.",
    "fullAnswer": [
      "Послевоенная духовная история Запада определяется опытом Второй мировой войны и Холокоста. Массовое уничтожение поставило под сомнение веру в прогресс, разум и автоматическую гуманность европейской культуры.",
      "Особое значение получает литература свидетельства. Примо Леви в книге «Человек ли это?» стремится сохранить точность памяти о лагере и одновременно поставить вопрос о границах человеческого. Документальность, сдержанность и личное свидетельство становятся нравственными формами письма.",
      "Экзистенциализм Сартра и Камю исследует свободу, ответственность и жизнь без заранее гарантированного смысла. В «Чуме» Камю нравственность выражается в повседневной солидарной работе доктора Риэ.",
      "Театр абсурда Беккета и Ионеско показывает кризис действия, языка и общения. В «В ожидании Годо» герои повторяют одни и те же действия, ожидая события, которое не наступает.",
      "Школа «нового романа» — Натали Саррот, Ален Роб-Грийе, Мишель Бютор — отказывается от цельного героя и линейного сюжета, исследуя восприятие, предметный мир и скрытые движения сознания.",
      "Немецкая литература Бёлля и Грасса обращается к непреодолённому нацистскому прошлому. Семейная память, гротеск и ненадёжное повествование помогают показать, как историческая вина продолжает действовать в послевоенном обществе.",
      "Деколонизация расширяет литературный канон и ставит вопросы об империализме, миграции и гибридной идентичности. Одновременно массовое потребление, реклама и холодная война порождают новые формы конформизма и политической тревоги.",
      "Таким образом, послевоенная литература соединяет свидетельство, экзистенциальную этику, абсурд, формальный эксперимент и историческую память. За различием направлений сохраняется общий поиск человеческой ответственности после катастрофы."
    ]
  },
  "86": {
    "works": [
      "Вымыслы",
      "Имя розы",
      "Женщина французского лейтенанта",
      "Радуга тяготения"
    ],
    "thesis": "Постмодернизм строится на интертекстуальности, иронии и недоверии к единственной истине; Борхес выступает прежде всего предшественником этой поэтики, тогда как Эко, Фаулз и Пинчон представляют её зрелые формы.",
    "points": [
      "Определить недоверие к метанарративам.",
      "Показать интертекстуальность и метапрозу.",
      "Уточнить статус Борхеса как предшественника.",
      "Разобрать Эко и Фаулза.",
      "Показать смешение массовой и высокой культуры.",
      "Объяснить серьёзную этическую функцию игры."
    ],
    "episodes": [
      "Борхес предвосхищает постмодернизм лабиринтами текстов, вымышленными источниками и проблемой авторства.",
      "В «Имени розы» монастырский детектив соединяется с семиотикой, историей и спором о власти над знанием.",
      "В «Женщине французского лейтенанта» рассказчик вмешивается в сюжет и предлагает несколько финалов."
    ],
    "correction": "Борхеса точнее называть предшественником или автором, предвосхитившим постмодернистскую поэтику, а не безоговорочно ставить в один ряд с её зрелыми представителями.",
    "fullAnswer": [
      "Постмодернизм возникает как культура недоверия к универсальным объяснениям истории, прогресса и человеческой природы. Произведение подчёркивает множественность версий и условность любой окончательной истины.",
      "Основные принципы — интертекстуальность, цитатность, ирония, метапроза, жанровая игра и смешение высокой и массовой культуры. Роман может одновременно быть детективом, историческим исследованием и философской притчей.",
      "Хорхе Луиса Борхеса правильнее считать предшественником постмодернизма. Его лабиринты, вымышленные книги, псевдонаучные комментарии и игры с авторством заранее создают многие приёмы, которые позднее станут центральными для направления.",
      "Умберто Эко представляет зрелую постмодернистскую модель. В «Имени розы» детективная интрига соединяется со средневековой историей, семиотикой и проблемой контроля над знанием. Разгадка не отменяет смысловой множественности.",
      "Джон Фаулз в «Женщине французского лейтенанта» комментирует викторианский сюжет с позиции XX века, вмешивается в повествование и предлагает несколько финалов. Томас Пинчон соединяет историческую паранойю, научный дискурс и массовую культуру.",
      "Постмодернистская игра не обязательно означает бессодержательность. Она позволяет обсуждать память, власть, войну и ответственность, показывая, что любой разговор об истории уже зависит от языка и культурных моделей.",
      "Таким образом, Борхес подготавливает постмодернистскую поэтику, а Эко, Фаулз, Пинчон и другие развивают её зрелые формы."
    ]
  },
  "87": {
    "works": [
      "Тошнота",
      "Посторонний",
      "Чума"
    ],
    "thesis": "Сартр художественно раскрывает радикальную свободу и ответственность, а Камю — абсурд, бунт и солидарность; Камю традиционно рассматривается рядом с экзистенциализмом, хотя сам отвергал это определение.",
    "points": [
      "Дать оговорку о статусе Камю.",
      "Раскрыть существование и свободу у Сартра.",
      "Разобрать «Тошноту» и дурную веру.",
      "Объяснить абсурд в «Постороннем».",
      "Показать бунт и солидарность в «Чуме».",
      "Сопоставить позиции авторов."
    ],
    "episodes": [
      "Корень дерева в «Тошноте» открывает Рокантену случайность и избыточность существования.",
      "На суде Мерсо осуждают не только за убийство, но и за несоответствие ожидаемой эмоциональной норме.",
      "Доктор Риэ борется с чумой без гарантии окончательной победы."
    ],
    "correction": "Камю сам дистанцировался от определения «экзистенциалист». Его нужно рассматривать в контексте экзистенциальной проблематики, подчёркивая собственные категории абсурда, бунта, меры и солидарности.",
    "fullAnswer": [
      "Сартр и Камю традиционно рассматриваются рядом, поскольку оба исследуют человека в мире без заранее гарантированного смысла. Однако Камю сам не принимал определение «экзистенциалист», поэтому его позицию нужно описывать отдельно.",
      "Для Сартра человек сначала существует, а затем создаёт себя поступками. Свобода неизбежна: даже отказ выбирать является выбором. Попытка спрятаться за ролью, приказом или общественной нормой называется дурной верой.",
      "В «Тошноте» Рокантен переживает случайность существования непосредственно и телесно. Корень дерева перестаёт быть привычным предметом и обнаруживает избыточность мира, которому не дан заранее установленный смысл.",
      "Камю ставит в центр абсурд — столкновение человеческой потребности в ясности с молчанием мира. В «Постороннем» Мерсо отказывается изображать ожидаемые чувства, а общество создаёт из его поведения удобную моральную схему.",
      "Признание абсурда у Камю не обязательно ведёт к пассивности. В «Чуме» доктор Риэ действует без надежды на окончательное уничтожение зла. Его нравственность выражается в солидарности и отказе увеличивать чужое страдание.",
      "Сартр сильнее подчёркивает свободу и историческую ответственность выбора. Камю — пределы человеческой власти, меру, бунт и солидарность.",
      "Таким образом, Сартр представляет собственно экзистенциалистскую философию свободы, а Камю — самостоятельную философию абсурда и бунта, близкую экзистенциальной проблематике, но не тождественную ей."
    ]
  },
  "92": {
    "works": [
      "Большой лондонский пожар",
      "Заводной апельсин",
      "Попугай Флобера",
      "Водоземье"
    ],
    "thesis": "Британский постмодернистский роман переосмысливает историю, язык и национальную традицию; Акройд является характерным постмодернистом, а Бёрджесс занимает переходное положение между модернистским экспериментом, сатирической антиутопией и постмодернистской игрой.",
    "points": [
      "Показать историю как конкурирующие тексты.",
      "Разобрать Лондон и стилизацию у Акройда.",
      "Уточнить переходный статус Бёрджесса.",
      "Раскрыть язык и свободу в «Заводном апельсине».",
      "Назвать Барнса, Свифта, Рушди.",
      "Показать этическое содержание игры."
    ],
    "episodes": [
      "У Акройда современный Лондон хранит и воспроизводит сюжеты прошлых эпох.",
      "Надсат в «Заводном апельсине» одновременно сближает читателя с Алексом и показывает власть языка над восприятием.",
      "Принудительное исправление Алекса уничтожает возможность нравственного выбора."
    ],
    "correction": "Бёрджесса следует характеризовать как переходную фигуру между модернизмом, антиутопией и постмодернизмом, а не как бесспорного представителя одного направления.",
    "fullAnswer": [
      "Британский постмодернистский роман активно перерабатывает национальную литературную традицию, исторический роман, биографию, детектив, готику и научную фантастику. Прошлое изображается как совокупность документов, легенд и конкурирующих рассказов.",
      "Питер Акройд создаёт Лондон как культурный текст. Город хранит следы разных эпох, а современный герой может повторять старый сюжет. Документальность соединяется с вымыслом, а стилизация воспроизводит языки хроники, викторианского романа и детектива.",
      "Положение Энтони Бёрджесса сложнее. Его нельзя считать только постмодернистом. Он занимает переходное место между модернистским языковым экспериментом, сатирической антиутопией и постмодернистской жанровой игрой.",
      "В «Заводном апельсине» вымышленный жаргон надсат заставляет читателя осваивать язык Алекса и тем самым показывает, как речь формирует восприятие. Принудительное исправление героя делает его безопасным, но лишает свободы выбора, без которой невозможно нравственное добро.",
      "Джулиан Барнс исследует ненадёжность памяти и авторства, Грэм Свифт — связь частной биографии с национальным прошлым, Салман Рушди — колониальную историю и гибридную идентичность.",
      "Жанровая игра не исключает этической проблематики. Британские авторы обсуждают насилие, историческую память, свободу и власть языка.",
      "Таким образом, Акройд представляет характерную постмодернистскую историческую игру, а Бёрджесс демонстрирует переходный синтез нескольких художественных традиций."
    ]
  },
  "98": {
    "works": [
      "Парфюмер"
    ],
    "thesis": "«Парфюмер» сочетает постмодернистскую жанровую игру, историческую стилизацию, притчу и пародию на романтический миф о гении; поэтому его классификация должна быть многосоставной, а не категоричной.",
    "points": [
      "Назвать жанровую многослойность.",
      "Показать историческую материальность мира запахов.",
      "Раскрыть пародию на романтического гения.",
      "Показать искусство как манипуляцию.",
      "Разобрать сцену казни и финал.",
      "Сделать осторожный вывод о постмодернизме."
    ],
    "episodes": [
      "Гренуй лишён собственного запаха, что выражает отсутствие устойчивой человеческой идентичности.",
      "Аромат на площади заставляет толпу отказаться от памяти, закона и нравственной оценки.",
      "Финальное самоуничтожение превращает абсолютную любовь в акт потребления."
    ],
    "correction": "«Парфюмер» следует характеризовать как роман, сочетающий постмодернистскую игру с исторической стилизацией, притчей и романтической традицией образа гения.",
    "fullAnswer": [
      "Роман Патрика Зюскинда «Парфюмер» не следует сводить к одной жанровой формуле. Он соединяет исторический роман, псевдобиографию преступника, философскую притчу, пародию на романтический миф о гении и постмодернистскую игру с традицией.",
      "Историческая Франция XVIII века изображена через запахи, ремесло, рынки, мастерские и телесную материальность. Прошлое лишено декоративной красоты и предстаёт как мир зловония и физического труда.",
      "Гренуй обладает исключительным даром, но не имеет собственного запаха и устойчивой человеческой идентичности. Он напоминает романтического гения, однако его искусство не освобождает людей, а превращает их в материал и объект управления.",
      "Убийства девушек показывают, что эстетическая цель отделена от нравственности. Гренуй сохраняет запах жертвы так же, как мастер извлекает эссенцию из цветка.",
      "В сцене казни созданный аромат заставляет толпу видеть в убийце ангела. Закон, память и мораль мгновенно уступают чувственному внушению. Искусство раскрывается как технология массовой манипуляции.",
      "Финал доводит эту логику до гротеска: люди разрывают и съедают Гренуя из любви. Абсолютное признание оказывается формой уничтожения и потребления.",
      "Таким образом, постмодернистские черты романа проявляются в жанровой игре, пародии и двойственной позиции рассказчика, но они соединены с исторической стилизацией, притчей и романтической традицией."
    ]
  },
  "99": {
    "works": [
      "Вавилонская библиотека",
      "Сад расходящихся тропок",
      "Дом Астерия",
      "Захваченный дом",
      "Игра в классики"
    ],
    "thesis": "Интеллектуальная проза Борхеса и Кортасара отличается от магического реализма: она строится прежде всего на философском парадоксе, фантастике неопределённости, метатексте и активной игре с читателем.",
    "points": [
      "Разграничить интеллектуальную фантастику и магический реализм.",
      "Показать лабиринт, книгу и авторство у Борхеса.",
      "Разобрать множественное время.",
      "Показать фантастическое без объяснения у Кортасара.",
      "Раскрыть композиционную игру «Игры в классики».",
      "Сделать вывод об активном читателе."
    ],
    "episodes": [
      "В «Вавилонской библиотеке» полнота всех возможных книг не даёт людям доступного смысла.",
      "В «Саду расходящихся тропок» все возможные решения создают параллельные будущие.",
      "В «Захваченном доме» неназванная сила вытесняет героев, сохраняя принципиальную неопределённость."
    ],
    "correction": "Борхеса и Кортасара нужно отличать от магического реализма Маркеса: их основа — интеллектуальная фантастика, метафизический парадокс, экспериментальная композиция и игра с читателем.",
    "fullAnswer": [
      "Интеллектуальная проза Борхеса и Кортасара не тождественна магическому реализму. Если у Маркеса чудесное включено в коллективную историю и мифологическое сознание, то Борхес и Кортасар строят текст прежде всего как философский парадокс, эксперимент или игру с восприятием.",
      "Борхес превращает идею в краткий сюжет, который может имитировать научную статью, биографию, рецензию или комментарий к несуществующей книге. Лабиринт, библиотека, зеркало и двойник становятся моделями познания.",
      "В «Вавилонской библиотеке» Вселенная содержит все возможные книги, но полнота информации не гарантирует доступного смысла. В «Саду расходящихся тропок» время существует как сеть параллельных возможностей.",
      "Борхес также ставит под сомнение устойчивость авторства. Одинаковый текст может получать иной смысл в другой эпохе, а вымышленный источник выглядит столь же убедительно, как реальный.",
      "Кортасар вводит фантастическое внутрь повседневности, но не объясняет его. В «Захваченном доме» неизвестное присутствие постепенно вытесняет героев, и текст сохраняет психологическую, социальную и метафизическую неопределённость.",
      "В «Игре в классики» читатель выбирает порядок глав и становится участником построения романа. Композиционная игра связана с поиском иной реальности и невозможностью окончательно выйти за пределы привычного сознания.",
      "Таким образом, интеллектуальная проза Борхеса и Кортасара основана на метафизической фантастике, парадоксе, метатексте и активном читательском участии. Этим она отличается от магического реализма в его более историко-мифологической форме."
    ]
  }
};
Object.entries(CRITICALLY_REVISED_TICKETS).forEach(([number, data]) => {
  const n = Number(number);
  ANSWER_OVERRIDES[n] ??= {};
  Object.assign(ANSWER_OVERRIDES[n], data);
});
