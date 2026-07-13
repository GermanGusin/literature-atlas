
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
    'Песнь о Роланде','Божественная комедия','Канцоньере','Декамерон','Гамлет','Комедия ошибок','Генрих фон Офтердинген','Золотой жук','Чёрный кот','Падение дома Ашеров','Лигейя','Кармен','Цветы зла','Госпожа Бовари','Песнь о Гайавате','Жерминаль','Человек-зверь','Кукольный дом','Гедда Габлер','Остров доктора Моро','Дом, где разбиваются сердца','Пигмалион','Клуб самоубийц','Странная история доктора Джекила и мистера Хайда','Упадок лжи','Портрет Дориана Грея','Баллада Редингской тюрьмы','Лиспет','Приключения Тома Сойера','Кошка под дождём','Ночь в Лиссабоне','Превращение','Добрый человек из Сезуана','Мамаша Кураж и её дети','Упадок и разрушение','Орландо','О дивный новый мир','Любовник леди Чаттерлей','Скотный двор','1984','Уайнсбург, Огайо','Великий Гэтсби','Американская трагедия','Звук и ярость','Ставок больше нет','Посторонний','Чума','Лысая певица','Носорог','Коллекционер','Женщина французского лейтенанта','Хорошо ловится рыбка-бананка','Над пропастью во ржи','Колыбель для кошки','Бильярд в половине десятого','Кошки-мышки','Парфюмер','Сто лет одиночества','Дом Астерия'
  ],
  partial: ['Ярмарка тщеславия','Волшебная гора','Сердце тьмы','Фиеста','Портрет художника в юности','Дублинцы','Тошнота'],
  unknown: ['Ричард Олдингтон','Марсель Пруст','Учитель Гнус','Верноподданный']
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
  83:{works:['Звук и ярость'],level:'known',thesis:'Фолкнер разрушает линейное повествование, чтобы показать распад семьи Компсонов изнутри разных сознаний.',points:['Назвать четыре части и рассказчиков.','Показать субъективное время.','Объяснить поток сознания.','Раскрыть тему Юга и семьи.','Показать роль Дилси.'],episodes:['В сознании Бенджи прошлое и настоящее существуют одновременно. Переходы запускаются запахом, звуком или словом.','Квентин пытается остановить время, разбивая часы. Но внутреннее время продолжает разрушать его.','Дилси видит начало и конец семьи. Её устойчивость противопоставлена распаду Компсонов.']},
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
  const plan=o.points||answerPlan(q);
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
  'Звук и ярость':[{'loc':'часть 1, 7 апреля 1928 года','text':'Запах деревьев и звук имени Кэдди мгновенно переносят Бенджи в прошлое. Переходы не объясняются. Читатель должен собрать историю семьи из ассоциаций сознания.'}],
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
  const pool=episodePoolForMaterials(m);
  if(pool.length){
    const e=pool[index%pool.length];
    return {loc:e.loc,text:e.text};
  }
  const work=m.works?.[0]||'основное произведение билета';
  return {loc:'ориентир для ответа',text:`После общего тезиса назовите ${work}. Кратко перескажите сцену, где проявляется этот признак. Затем объясните, как деталь, поступок героя или композиционный приём подтверждает аргумент.`};
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
    const argumentsHtml=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(p)}</b></div><div class="argument-proof"><span class="evidence-label">Опора: ${esc(e.loc)}</span><p>${esc(e.text)}</p><p class="argument-link"><b>Связь с тезисом.</b> Этот эпизод переводит общий признак в конкретный художественный факт.</p></div></div>`}).join('');
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
  host.innerHTML=rows.map(m=>{const paras=fullAnswerText(m);const evidence=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(sentencePoint(p,i))}</b></div><div class="argument-proof"><span class="evidence-label">${esc(e.loc)}</span><p>${esc(e.text)}</p></div></div>`}).join('');return `<article class="ticket-answer-card card" data-answer-card="${m.q.number}"><div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div><div class="ticket-answer-body">${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}<div class="answer-block"><h4>Полный ответ</h4><div class="full-answer-text">${paras.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div><div class="answer-block"><h4>Аргументы и эпизоды</h4>${evidence}</div><div class="answer-block"><h4>Произведения для повторения</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Для обзорного вопроса используйте несколько авторов эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Сводка по произведению.</b> ${esc(m.summary)}</p>`:''}</div><div class="answer-status-row"><span class="tiny-note">Ответ построен от исторического контекста к теории, автору и эпизоду.</span>${statusControls(m.q.number,true)}</div></div></article>`}).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
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
  host.innerHTML=rows.map(m=>{const paras=fullAnswerText(m);const evidence=m.plan.map((p,i)=>{const e=evidenceForPoint(m,p,i);return `<div class="argument-evidence"><div class="argument-title"><b>${i+1}. ${esc(sentencePoint(p,i))}</b></div><div class="argument-proof"><span class="evidence-label">${esc(e.loc)}</span><p>${esc(e.text)}</p></div></div>`}).join('');return `<article class="ticket-answer-card card" data-answer-card="${m.q.number}"><div class="ticket-answer-head"><div class="ticket-answer-number">${m.q.number}</div><div class="ticket-answer-title"><h3>${esc(m.q.text)}</h3><p>${esc(m.q.section)}</p></div><div><span class="familiarity-badge familiarity-${m.level}">${familiarityLabel(m.level)}</span><button class="answer-toggle" data-toggle-answer="${m.q.number}">Открыть ответ</button></div></div><div class="ticket-answer-body">${m.correction?`<div class="correction-note"><b>Важное уточнение.</b> ${esc(m.correction)}</div>`:''}<div class="answer-block"><h4>Полный ответ</h4><div class="full-answer-text">${paras.map(p=>`<p>${esc(p)}</p>`).join('')}</div></div><div class="answer-block"><h4>Тезисный план и доказательства</h4>${evidence}</div><div class="answer-block"><h4>Произведения для аргументации</h4>${m.works.length?m.works.map(w=>`<span class="work-chip">${esc(w)}</span>`).join(''):'<p>Для обзорного вопроса используйте несколько авторов эпохи.</p>'}${m.summary?`<p class="ready-answer" style="margin-top:12px"><b>Сводка по произведению.</b> ${esc(m.summary)}</p>`:''}</div></div></article>`}).join('')||'<article class="card" style="padding:18px">Материалы не найдены.</article>';
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
