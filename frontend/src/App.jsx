import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import {
  CalendarDays, ChartNoAxesCombined, ChevronRight, CircleHelp, ClipboardList,
  CloudRain, Droplets, Leaf, LayoutDashboard, Map, MapPin, MessageCircle,
  Satellite, Sprout, X, LocateFixed, Volume2, Captions,
  Contrast, Moon, Sun, Type, Thermometer, Languages
} from 'lucide-react';
import MapPage from './pages/Map/Map';
import Questionnaire from './pages/Questionnaire/Questionnaire';
import { applyPageLanguage, observePageLanguage } from './i18n/pageTranslation';

const nav = [
  ['Inicio', '/', LayoutDashboard, 'Inicio'], ['Cuestionario', '/cuestionario', ClipboardList, 'Encuesta'],
  ['Mapa nacional', '/mapa', Map, 'Mapa'], ['Dashboard', '/dashboard', ChartNoAxesCombined, 'Datos'],
  ['Calendario agrícola', '/calendario', CalendarDays, 'Calendario'], ['Guía de usuario', '/guia', CircleHelp, 'Guía']
];

const STATES = [
  ['Aguascalientes',21.9,-102.3],['Baja California',30.8,-115.3],['Baja California Sur',25.6,-111.7],['Campeche',19.0,-90.4],['Chiapas',16.5,-92.5],['Chihuahua',28.6,-106.1],['Ciudad de México',19.4,-99.1],['Coahuila',27.3,-102.0],['Colima',19.1,-103.8],['Durango',24.0,-104.6],['Estado de México',19.4,-99.7],['Guanajuato',21.0,-101.2],['Guerrero',17.6,-99.8],['Hidalgo',20.5,-98.8],['Jalisco',20.7,-103.4],['Michoacán',19.2,-101.9],['Morelos',18.7,-99.1],['Nayarit',21.8,-104.8],['Nuevo León',25.7,-100.3],['Oaxaca',17.1,-96.7],['Puebla',19.0,-98.2],['Querétaro',20.6,-100.4],['Quintana Roo',19.6,-87.9],['San Luis Potosí',22.2,-100.9],['Sinaloa',25.0,-107.5],['Sonora',29.3,-110.3],['Tabasco',17.9,-92.6],['Tamaulipas',24.3,-98.7],['Tlaxcala',19.3,-98.2],['Veracruz',19.2,-96.1],['Yucatán',20.7,-89.1],['Zacatecas',22.8,-102.6]
];
const stateCenter = (name) => { const row = STATES.find(([state]) => state === name); return row ? [row[1], row[2]] : [23.6, -102.5]; };
const closestState = (lat, lon) => STATES.reduce((best, current) => {
  const score = (current[1] - lat) ** 2 + ((current[2] - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
  return score < best.score ? {name: current[0], score} : best;
}, {name: 'Ciudad de México', score: Infinity}).name;
const RAIN_MONTH_COLUMNS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const RAINFALL_LEVELS=[
  {key:'very-low',label:'Muy baja',range:'< 25 mm',max:25},
  {key:'low',label:'Baja',range:'25–49 mm',max:50},
  {key:'moderate',label:'Moderada',range:'50–99 mm',max:100},
  {key:'high',label:'Alta',range:'100–199 mm',max:200},
  {key:'very-high',label:'Muy alta',range:'≥ 200 mm',max:Infinity}
];
const normalizeStateName=(value)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function parseRainfallCsv(csv){
  const [headerLine,...lines]=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/);
  const headers=headerLine.split(',').map(value=>value.trim());
  return lines.map((line)=>{
    const values=line.split(',');
    const row=Object.fromEntries(headers.map((header,index)=>[header,values[index]?.trim()]));
    return {state:row.Estado,year:Number(row.Anio),months:RAIN_MONTH_COLUMNS.map((month)=>Number(row[month]))};
  }).filter(row=>row.state&&Number.isFinite(row.year)&&row.months.every(Number.isFinite));
}
function classifyMonthlyRain(mm){
  if(!Number.isFinite(mm))return {key:'unknown',label:'Sin dato',range:'Sin estimación'};
  return RAINFALL_LEVELS.find(level=>mm<level.max)||RAINFALL_LEVELS.at(-1);
}
function predictRainfallByMonth(state, targetYear, history){
  const selectedName=normalizeStateName(state);
  const records=history.filter(row=>selectedName==='mexico'||normalizeStateName(row.state)===selectedName);
  if(!records.length)return {predictions:[],recordCount:0};
  const predictions=RAIN_MONTH_COLUMNS.map((name,monthIndex)=>{
    const points=records.map(row=>({x:row.year,y:row.months[monthIndex]})).filter(point=>Number.isFinite(point.y));
    const meanX=points.reduce((sum,point)=>sum+point.x,0)/points.length;
    const meanY=points.reduce((sum,point)=>sum+point.y,0)/points.length;
    const denominator=points.reduce((sum,point)=>sum+(point.x-meanX)**2,0);
    const slope=denominator?points.reduce((sum,point)=>sum+(point.x-meanX)*(point.y-meanY),0)/denominator:0;
    const millimeters=Math.max(0,meanY+slope*(targetYear-meanX));
    return {monthIndex,name,millimeters,observations:points.length,category:classifyMonthlyRain(millimeters)};
  });
  return {predictions,recordCount:records.length};
}

function Sidebar({ onOpenAccessibility }) {
  return <aside className="sidebar"><NavLink className="brand" to="/"><span className="brand-icon"><Satellite size={22}/></span><span><b>WiseGrow</b><small>NASA · AGRICULTURA</small></span></NavLink>
    <div className="menu-label">TU ESPACIO DE TRABAJO</div><nav className="navigation">{nav.map(([label, path, Icon, shortLabel]) => <NavLink key={path} to={path} title={label} aria-label={label} end={path === '/'} className={({isActive}) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18}/><span className="nav-wide-label">{label}</span><span className="nav-short-label">{shortLabel}</span></NavLink>)}</nav>
    <button className="accessibility-trigger" onClick={onOpenAccessibility}><span>Accesibilidad</span></button>
    <div className="sidebar-bottom"><span className="source-dot"/> Fuentes de datos NASA</div>
  </aside>;
}

function AssistantCard({ compact = false }) {
  return <div className={`assistant-card ${compact ? 'compact' : ''}`}><div className="assistant-avatar" aria-hidden="true">🧑🏽‍🌾</div><div><strong>Hola, soy Nati</strong><p>{compact ? 'Te acompaño para encontrar lo que necesitas.' : 'Te guío paso a paso. Cuéntame qué quieres planear y revisaremos clima, cultivo y salud del suelo.'}</p></div></div>;
}

function Home() {
  return <div className="content"><div className="hero-panel"><div className="hero-copy"><span className="eyebrow">AGRICULTURA INFORMADA POR SATÉLITE · MÉXICO</span><h1>Planea tu cultivo con el clima y el suelo en mente.</h1><p>Consulta condiciones agroclimáticas y organiza tus labores para aprovechar mejor el agua, cuidar el suelo y tomar decisiones a tiempo.</p><NavLink className="button-primary" to="/cuestionario">Personalizar mi consulta <ChevronRight size={17}/></NavLink></div><div className="hero-art" aria-hidden="true"><div className="sun"/><div className="field field-one"/><div className="field field-two"/><div className="field field-three"/><span>🌱</span></div></div>
    <AssistantCard/><div className="section-head"><div><span className="eyebrow">EMPIEZA POR LO QUE NECESITAS</span><h2>¿Qué quieres consultar?</h2></div></div><div className="quick-grid">
      <QuickCard to="/calendario" icon={CalendarDays} title="Planear labores" body="Revisa ventanas de siembra y riego por temporada, lluvia y condición del suelo."/>
      <QuickCard to="/dashboard" icon={ChartNoAxesCombined} title="Entender mis datos" body="Explora indicadores y tendencias climáticas para tu zona de interés."/>
      <QuickCard to="/cuestionario" icon={Sprout} title="Elegir un cultivo" body="Cuéntanos sobre tu parcela y objetivos para orientar el análisis."/>
    </div><div className="source-foot"><Satellite size={16}/> Información NASA; precipitación NASA o CONAGUA si se requiere una fuente alternativa. Las cifras actuales son ilustrativas.</div></div>;
}

function QuickCard({to, icon: Icon, title, body}) { return <NavLink to={to} className="quick-card"><span className="quick-icon"><Icon size={20}/></span><h3>{title}</h3><p>{body}</p><span className="card-link">Explorar <ChevronRight size={15}/></span></NavLink>; }

function Dashboard({ selectedState }) {
  const currentYear=String(new Date().getFullYear());
  const [year,setYear]=useState(currentYear);
  const [climate,setClimate]=useState(null); const [loading,setLoading]=useState(true); const [error,setError]=useState('');
  const center=stateCenter(selectedState||'México');
  const apiBase=(import.meta.env.VITE_API_URL||(import.meta.env.DEV?'http://127.0.0.1:8000':'')).replace(/\/$/,'');
  useEffect(()=>{
    const controller=new AbortController();let active=true;setLoading(true);setError('');setClimate(null);
    const params=new URLSearchParams({state:selectedState||'México',latitude:center[0].toFixed(3),longitude:center[1].toFixed(3)});
    fetch(`${apiBase}/api/dashboard/clima?${params}`,{signal:controller.signal})
      .then(async response=>{const payload=await response.json().catch(()=>null);if(!response.ok)throw new Error(payload?.detail||`Dashboard API respondió HTTP ${response.status}.`);return payload;})
      .then(payload=>{if(active){setClimate(payload);if(payload.error)setError(payload.error);}})
      .catch(failure=>{if(active&&failure.name!=='AbortError')setError(failure.message||'No fue posible consultar NASA POWER.');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[selectedState,center[0],center[1],apiBase]);
  const months=MONTHS_ES;
  const variableOptions=[
    {key:'PRECTOTCORR',label:'Precipitación',unit:'mm',icon:CloudRain,aggregation:'sum'},
    {key:'T2M',label:'Temperatura media',unit:'°C',icon:Thermometer,aggregation:'mean'},
    {key:'RH2M',label:'Humedad relativa',unit:'%',icon:Droplets,aggregation:'mean'},
    {key:'GWETPROF',label:'Humedad estimada del suelo',unit:'%',icon:Leaf,aggregation:'mean'}
  ];
  const [chartVariable,setChartVariable]=useState('PRECTOTCORR');
  const selectedVariable=variableOptions.find(item=>item.key===chartVariable)||variableOptions[0];
  const isCurrentYear=year===currentYear;
  const isForecastYear=Number(year)>Number(currentYear);
  const selectedYearClimate=isCurrentYear?climate?.observed:isForecastYear?climate?.forecast?.[year]:climate?.historical?.[year];
  const noForecast=Boolean(isForecastYear&&climate&&!climate.forecast_has_data?.[year]);
  const noHistoricalData=Boolean(!isCurrentYear&&!isForecastYear&&climate&&Object.values(selectedYearClimate||{}).every(series=>!series.some(entry=>entry.value!=null)));
  const monthly=useMemo(()=>{
    const source=selectedYearClimate?.[selectedVariable.key];
    return months.map((name,index)=>{
      const entry=isCurrentYear?source?.[index]:source?.find(value=>value.month===index);
      const rawValue=Number(entry?.value);
      return {name,index,value:Number.isFinite(rawValue)?rawValue*(selectedVariable.key==='GWETPROF'?100:1):null,days:entry?.days||0};
    });
  },[year,currentYear,climate,selectedVariable.key,selectedYearClimate,isCurrentYear]);
  const validValues=monthly.map(item=>item.value).filter(Number.isFinite);
  const chartMax=Math.max(1,...validValues);
  const summarize=(key,aggregation)=>{
    const records=selectedYearClimate?.[key];
    const entries=isCurrentYear?Object.entries(records||{}).map(([month,entry])=>({month:Number(month),...entry})):Object.values(records||{});
    const values=entries.map(entry=>({value:Number(entry.value),weight:Number(entry.days)||new Date(Number(year),Number(entry.month)+1,0).getDate()})).filter(entry=>Number.isFinite(entry.value));
    if(!values.length)return null;
    if(aggregation==='sum')return values.reduce((sum,entry)=>sum+entry.value,0);
    const weight=values.reduce((sum,entry)=>sum+entry.weight,0);
    return values.reduce((sum,entry)=>sum+entry.value*entry.weight,0)/(weight||values.length);
  };
  const yearLabel=isCurrentYear?`${year} · observado al ${climate?.period?.end||'—'}`:isForecastYear?`${year} · proyección lineal`:`${year} · histórico NASA POWER`;
  const temp=summarize('T2M','mean'),humidity=summarize('RH2M','mean'),rain=summarize('PRECTOTCORR','sum'),soil=summarize('GWETPROF','mean');
  const originNote=isCurrentYear?'NASA POWER · datos actuales':isForecastYear?'NASA POWER CSV · regresión lineal':'NASA POWER CSV · histórico observado';
  const format=(value,digits=1)=>Number.isFinite(value)?value.toFixed(digits):'—';
  return <div className="content"><div className="page-title section-intro"><span className="eyebrow">RESUMEN DE TU ZONA</span><p>Histórico NASA POWER de los últimos tres años, observaciones del año actual y proyecciones lineales para los siguientes tres años, por entidad seleccionada.</p></div>
    <div className="filters-row"><label>Año del dashboard<select value={year} onChange={event=>setYear(event.target.value)}>{Array.from({length:7},(_,index)=>String(Number(currentYear)-3+index)).map(option=><option key={option} value={option}>{option} · {Number(option)<Number(currentYear)?'NASA POWER histórico':Number(option)===Number(currentYear)?'NASA POWER actual':'proyección lineal'}</option>)}</select></label><span className="demo-pill">{selectedState} · {yearLabel}</span></div>
    {error&&<div className="map-error" role="alert"><span>{error}</span></div>}
    {(noForecast||noHistoricalData)&&<div className="dashboard-data-note">{noForecast?`El CSV NASA histórico no contiene registros para ${selectedState}; no se muestra la proyección de ${year}.`:`El CSV NASA histórico no contiene registros suficientes para ${selectedState} durante ${year}.`}</div>}
    <div className="metric-grid"><Metric icon={CloudRain} label="Precipitación acumulada" value={format(rain,0)} unit="mm" note={`${originNote} · ${isCurrentYear?'acumulado del año':isForecastYear?'estimado por regresión':'acumulado histórico'}`}/><Metric icon={Thermometer} label="Temperatura media" value={format(temp)} unit="°C" note={`${originNote} · ${isCurrentYear?'promedio del año':isForecastYear?'estimado por regresión':'promedio histórico'}`}/><Metric icon={Droplets} label="Humedad relativa media" value={format(humidity,0)} unit="%" note={originNote}/><Metric icon={Leaf} label="Humedad estimada del suelo" value={format(soil==null?null:soil*100,0)} unit="%" note="NASA POWER · GWETPROF · estimación"/></div>
    <div className="dashboard-grid"><section className="panel climate-panel"><div className="panel-heading"><div><span className="eyebrow">NASA POWER · {isCurrentYear?'OBSERVADO':isForecastYear?'REGRESIÓN LINEAL':'HISTÓRICO'}</span><h2>{selectedVariable.label} por mes</h2></div><label className="dashboard-chart-picker" aria-label="Variable del gráfico"><span>Variable</span><select value={chartVariable} onChange={event=>setChartVariable(event.target.value)}>{variableOptions.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></label></div><div className="chart-area"><div className="chart-y"><span>{format(chartMax,chartMax<10?1:0)} {selectedVariable.unit}</span><span>{format(chartMax/2,chartMax<10?1:0)} {selectedVariable.unit}</span><span>0 {selectedVariable.unit}</span></div><div className="chart-columns rainfall-chart">{monthly.map(item=><div className="chart-column" key={item.index}><div className="bar-pair"><i title={item.value==null?'Sin datos':`${item.value.toFixed(1)} ${selectedVariable.unit}`} style={{height:item.value==null?'0%':`${Math.max(2,item.value/chartMax*100)}%`}}/></div><small>{item.name.slice(0,3)}</small></div>)}</div></div><p className="chart-caption">{isCurrentYear?'NASA POWER Daily Point · agregación mensual del año en curso; los últimos días disponibles pueden tener retraso.':isForecastYear?noForecast?'Sin registros históricos NASA POWER para esta entidad.':'Regresión lineal ordinaria por mes calendario sobre promedios anuales del CSV NASA POWER (2023–2026). Proyección exploratoria, no pronóstico estacional.':noHistoricalData?'Sin registros históricos NASA POWER para esta entidad.':`Observaciones históricas NASA POWER del CSV · ${year}. ${year==='2023'?'Solo incluye noviembre y diciembre.':''}`}</p></section>
    <section className="panel soil-panel"><span className="eyebrow">NASA POWER · {yearLabel}</span><h2>Resumen climático</h2>{loading?<div className="soil-status"><span className="soil-icon"><Satellite size={22}/></span><div><b>Consultando NASA POWER…</b><small>Se carga el histórico, la serie actual y las proyecciones por estado.</small></div></div>:<ul className="soil-list"><li><span>Precipitación acumulada</span><b>{format(rain,0)} mm</b></li><li><span>Temperatura media</span><b>{format(temp)} °C</b></li><li><span>Humedad relativa</span><b>{format(humidity,0)} %</b></li><li><span>Humedad del suelo estimada</span><b>{format(soil==null?null:soil*100,0)} %</b></li></ul>}<NavLink className="text-link" to="/mapa">Explorar variables en el mapa <ChevronRight size={15}/></NavLink></section></div>
    <AssistantCard compact/><div className="source-foot"><Satellite size={16}/> Histórico: NASA POWER CSV (2023–2026). Año actual: API NASA POWER Daily Point para coordenada central representativa del estado. Años siguientes: regresión lineal por mes calendario; proyección exploratoria con casi tres años de historial, no pronóstico estacional.{loading?' Cargando…':''}</div>
  </div>;
}
function Metric({icon:Icon,label,value,unit,note}) { return <article className="metric-card"><span className="metric-icon"><Icon size={19}/></span><p>{label}</p><strong>{value}<small>{unit}</small></strong><span className="metric-note">{note}</span></article>; }
const MONTHS_ES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const CROP_SEASONS={Maíz:[4,5],Frijol:[5,6],Trigo:[10,11],Sorgo:[5,6],Cebada:[10,11]};
const WEEKDAYS_ES=['Lun','Ma','Mié','Jue','Vie','Sáb','Dom'];
function MonthCalendar({year,monthIndex,crop,activity,week,onSelectMonth,mini=false,rainfallPrediction,selectedRainCategory}){
  const offset=(new Date(Number(year),monthIndex,1).getDay()+6)%7;
  const count=new Date(Number(year),monthIndex+1,0).getDate();
  const visibleDays=Array.from({length:offset+count},(_,i)=>i<offset?null:i-offset+1);
  const activeSowingMonths=CROP_SEASONS[crop]||[];
  const rainCategory=rainfallPrediction?.category||classifyMonthlyRain(Number.NaN);
  const rainFocus=selectedRainCategory?(selectedRainCategory===rainCategory.key?'rain-category-selected':'rain-category-dimmed'):'';
  const calendarCells=[...visibleDays];
  while(calendarCells.length%7) calendarCells.push(null);
  return <article className={`month-calendar ${mini?'mini':''} ${rainFocus}`}><header><button onClick={()=>onSelectMonth?.(MONTHS_ES[monthIndex])} disabled={!onSelectMonth} aria-label={`Ver ${MONTHS_ES[monthIndex]} ${year}`}>{MONTHS_ES[monthIndex]} <span>{year}</span></button><span className={`month-rain-total rain-level-${rainCategory.key} ${activity==='Siembra'?'rain-muted':''}`} title={`${rainCategory.label}: ${rainCategory.range} de lluvia estimada`}>{rainfallPrediction?mini?`${rainfallPrediction.millimeters.toFixed(0)} mm`:`${rainfallPrediction.millimeters.toFixed(0)} mm · ${rainCategory.label}`:'—'}</span>{mini&&<ChevronRight size={14}/>}</header><div className="calendar-days-head">{WEEKDAYS_ES.map(day=><span key={day}>{day}</span>)}</div><div className="calendar-days">{calendarCells.map((day,index)=>{
    if(!day|| (week!=='Todas'&&Math.floor((offset+day-1)/7)+1!==Number(week.replace('Semana ',''))))return <span className="calendar-day empty" key={`empty-${index}`}/>;
    const sowing=activity==='Siembra'&&activeSowingMonths.includes(monthIndex)&&day>=10&&day<=24;
    const rainTitle=rainfallPrediction?`${rainCategory.label}: ${rainfallPrediction.millimeters.toFixed(1)} mm estimados en ${MONTHS_ES[monthIndex]} ${year}`:null;
    const dayTitle=[sowing?`Ventana de siembra ilustrativa · ${day} ${MONTHS_ES[monthIndex]}`:null,rainTitle].filter(Boolean).join(' · ')||undefined;
    const mutedRain=activity==='Siembra';
    return <span key={day} className={`calendar-day rain-day rain-level-${rainCategory.key} ${mutedRain?'rain-muted':''} ${sowing?'sowing-day':''}`} title={dayTitle}>{day}{sowing&&<i/>}</span>;
  })}</div></article>;
}

function CalendarPage({ selectedState = 'México' }) {
  const [year,setYear]=useState('2026'); const [month,setMonth]=useState('Todos'); const [week,setWeek]=useState('Todas'); const [crop,setCrop]=useState('Maíz'); const [soil,setSoil]=useState('En recuperación'); const [activity,setActivity]=useState('Siembra');
  const [selectedRainCategory,setSelectedRainCategory]=useState(null);
  const [rainfallHistory,setRainfallHistory]=useState([]);
  useEffect(()=>{let mounted=true;import('./data/precipitacion_estados_ancho.csv?raw').then(({default:csv})=>{if(mounted)setRainfallHistory(parseRainfallCsv(csv));}).catch(()=>{if(mounted)setRainfallHistory([]);});return()=>{mounted=false;};},[]);
  const rainfallForecast=useMemo(()=>predictRainfallByMonth(selectedState,Number(year),rainfallHistory),[selectedState,year,rainfallHistory]);
  const rainfallByMonth=Object.fromEntries(rainfallForecast.predictions.map(item=>[item.monthIndex,item]));
  const selectedRainLevel=RAINFALL_LEVELS.find(level=>level.key===selectedRainCategory);
  const selectedRainMonths=selectedRainCategory?rainfallForecast.predictions.filter(item=>item.category.key===selectedRainCategory).sort((a,b)=>a.monthIndex-b.monthIndex):[];
  const rainfallYears=rainfallHistory.map(row=>row.year);
  const rainfallFirstYear=rainfallYears.length?Math.min(...rainfallYears):null;
  const rainfallLastYear=rainfallYears.length?Math.max(...rainfallYears):null;
  const rainfallPeriod=rainfallHistory.length?`${rainfallFirstYear}–${rainfallLastYear}`:'Cargando CSV…';
  const rows = activity === 'Siembra' ? [
    {day:'Semana 1–2',title:`Preparación para ${crop.toLowerCase()}`,status: soil==='Saludable'?'Ventana favorable':'Revisar el suelo',desc:soil==='Saludable'?'La temporada es compatible; confirma humedad y lluvia local antes de sembrar.':'Prioriza cobertura y recuperación; la ventana depende de mejorar la condición del suelo.'},
    {day:'Semana 3–4',title:'Revisión de humedad y pronóstico',status:'Decisión condicionada',desc:'Cruza precipitación observada y pronóstico con las condiciones del terreno antes de definir fecha.'},
    {day:'Siguiente periodo',title:'Evaluar de nuevo la parcela',status:'Seguimiento',desc:'Actualiza el estado del suelo y consulta la temporada recomendada para este cultivo y región.'}
  ] : [
    {day:'Semana 1–2',title:'Revisar lluvia acumulada',status:'Evitar exceso de riego',desc:'Si la lluvia cubre la necesidad hídrica estimada, pospón el riego y vuelve a revisar humedad.'},
    {day:'Semana 3–4',title:'Evaluar necesidad de agua',status:'Riego según condición',desc:'Considera lluvia reciente, etapa del cultivo y disponibilidad de agua antes de regar.'},
    {day:'Siguiente periodo',title:'Actualizar pronóstico',status:'Seguimiento',desc:'La recomendación cambia con lluvia observada y pronóstico local.'}
  ];
  const monthIndex=MONTHS_ES.indexOf(month);
  const visibleMonths=month==='Todos'?MONTHS_ES.map((_,index)=>index):[monthIndex];
  return <div className="content calendar-page">
    <div className="calendar-toolbar panel"><label>Año<select value={year} onChange={e=>setYear(e.target.value)}>{['2025','2026','2027','2028'].map(y=><option key={y}>{y}</option>)}</select></label><label>Mes<select value={month} onChange={e=>setMonth(e.target.value)}>{['Todos',...MONTHS_ES].map(m=><option key={m}>{m}</option>)}</select></label><label>Semana<select value={week} onChange={e=>setWeek(e.target.value)}>{['Todas','Semana 1','Semana 2','Semana 3','Semana 4','Semana 5'].map(w=><option key={w}>{w}</option>)}</select></label><label>Cultivo<select value={crop} onChange={e=>setCrop(e.target.value)}>{['Maíz','Frijol','Trigo','Sorgo','Cebada','Otro'].map(c=><option key={c}>{c}</option>)}</select></label></div>
    <div className="calendar-options"><div className="activity-toggle"><button className={activity==='Siembra'?'selected':''} onClick={()=>setActivity('Siembra')}><Sprout size={16}/> Siembra</button><button className={activity==='Riego'?'selected':''} onClick={()=>setActivity('Riego')}><Droplets size={16}/> Lluvia y riego</button></div><label>Estado del suelo<select value={soil} onChange={e=>setSoil(e.target.value)}><option>En recuperación</option><option>Saludable</option><option>Degradado</option><option>No evaluado</option></select></label></div>
    <section className="calendar-display panel"><div className="calendar-display-head"><div><span className="eyebrow">{month==='Todos'?'VISTA ANUAL':`${month.toUpperCase()} ${year}`} · {crop.toUpperCase()} · {selectedState.toUpperCase()}</span><h2>{activity==='Riego'?'Precipitación mensual estimada':'Siembra y precipitación estimada'}</h2></div><span className="demo-pill">CONAGUA · Regresión lineal · {rainfallPeriod}</span></div><div className="calendar-legend interactive-legend"><div className="legend-guide"><span className="legend-sowing-row"><i className="legend-sowing"/>Ventana de siembra</span><small>Selecciona un nivel para destacarlo en el calendario</small>{activity==='Siembra'&&<small className="rain-muted-note">Lluvia atenuada para priorizar la siembra</small>}</div><div className={`rain-level-buttons ${activity==='Siembra'?'rain-muted':''}`}>{RAINFALL_LEVELS.map(level=>{const count=rainfallForecast.predictions.filter(item=>item.category.key===level.key).length;return <button key={level.key} type="button" aria-pressed={selectedRainCategory===level.key} className={`rain-level-button ${selectedRainCategory===level.key?'active':''}`} onClick={()=>setSelectedRainCategory(current=>current===level.key?null:level.key)} title={`Destacar meses con lluvia ${level.label.toLowerCase()} (${level.range})`}><i className={`rain-legend-${level.key}`}/><span><b>{level.label}</b><small>{level.range}</small></span><em>{count}</em></button>;})}</div></div>{selectedRainLevel&&<div className="rain-selection-detail" aria-live="polite"><strong>{selectedRainLevel.label} · {selectedRainMonths.length} {selectedRainMonths.length===1?'mes':'meses'}</strong><span>{selectedRainMonths.length?selectedRainMonths.map(item=>`${MONTHS_ES[item.monthIndex]} ${item.millimeters.toFixed(0)} mm`).join(' · '):'No hay meses estimados en este rango.'}</span><button type="button" onClick={()=>setSelectedRainCategory(null)}>Quitar selección</button></div>}<div className={`calendar-grid ${month==='Todos'?'year-view':'month-view'}`}>{visibleMonths.map(index=><MonthCalendar key={`${year}-${index}`} year={year} monthIndex={index} crop={crop} activity={activity} week={week} mini={month==='Todos'} onSelectMonth={month==='Todos'?setMonth:undefined} rainfallPrediction={rainfallByMonth[index]} selectedRainCategory={selectedRainCategory}/>)}</div>{month!=='Todos'&&<p className="calendar-disclaimer">La regresión lineal estima la precipitación mensual a partir del histórico {rainfallPeriod}. Los colores representan rangos orientativos en mm/mes; no indican lluvia diaria ni garantizan precipitación.</p>}</section>
    {month!=='Todos'&&<><div className="season-note"><span className="season-icon"><CalendarDays size={20}/></span><p><b>La temporada cambia por estado y cultivo.</b> El calendario combina la lluvia estimada desde el CSV de CONAGUA con la temporada regional y la salud del suelo; las ventanas de siembra se integrarán con esos criterios.</p></div>
    <div className="schedule-head"><div><span className="eyebrow">{month} {year} · {crop}</span><h2>Notas de planificación</h2></div><span className="demo-pill">Plan de demostración</span></div>
    <div className="schedule-list">{rows.filter((_,i)=>week==='Todas'||i===Number(week.replace('Semana ','') )-1).map((row,i)=><article className="schedule-row" key={row.title}><div className="timeline"><span>{i+1}</span></div><div className="schedule-date">{row.day}<small>{month} {year}</small></div><div className="schedule-detail"><h3>{row.title}</h3><p>{row.desc}</p></div><span className={`recommendation ${soil==='Saludable'&&activity==='Siembra'?'good':''}`}>{row.status}</span></article>)}</div>
    </>}
    <div className="source-foot"><CloudRain size={16}/> Precipitación mensual histórica: CSV de CONAGUA. Ajuste lineal calculado por estado y por mes; {rainfallHistory.length?`${rainfallForecast.recordCount.toLocaleString('en-US')} registros para ${selectedState}`:'cargando registros'} en el archivo. Los rangos de color son orientativos y describen el total mensual, no días específicos de lluvia.</div>
  </div>;
}

function Guide() { return <div className="content"><div className="page-title section-intro"><span className="eyebrow">AYUDA Y APRENDIZAJE</span><p>Consulta cómo usar Agroclimatic y planear las labores de tu parcela.</p></div><div className="guide-layout"><AssistantCard/><div className="guide-list">{[['01','Cuéntanos qué necesitas','Responde el cuestionario inicial y selecciona tus objetivos, cultivo y ubicación.'],['02','Revisa el dashboard','Consulta clima, indicadores y evolución estimada del suelo. Identifica los datos de demostración frente a fuentes conectadas.'],['03','Planea en el calendario','Filtra por año, mes y semana. Elige siembra o riego; las recomendaciones consideran cultivo, temporada, lluvia y salud del suelo.'],['04','Consulta las fuentes','Los datos ambientales provendrán de NASA. Para precipitación se contempla CONAGUA como alternativa cuando haga falta.'],['05','Pregunta al asistente','Usa el botón de ayuda para resolver dudas sobre navegación e interpretación.']].map(([n,t,d])=><article className="guide-item" key={n}><span>{n}</span><div><h3>{t}</h3><p>{d}</p></div></article>)}</div></div></div>; }

function ChatWidget() {
  const [open,setOpen]=useState(false); const [question,setQuestion]=useState(''); const [answer,setAnswer]=useState('');
  const [languageOpen,setLanguageOpen]=useState(false); const [language,setLanguage]=useState(()=>localStorage.getItem('agro-language')||'en');
  useLayoutEffect(()=>{
    document.documentElement.lang=language;
    document.title=language==='en'?'Agroclimatic · Smart agriculture':language==='fr'?'Agroclimatic · Agriculture durable':language==='pt'?'Agroclimatic · Agricultura inteligente':'Agroclimatic · Smart agriculture';
    try { applyPageLanguage(language); return observePageLanguage(language); }
    catch (error) { console.error('Page translation failed; keeping the app visible.', error); return undefined; }
  },[language]);
  const chooseLanguage=(code)=>{setLanguage(code);localStorage.setItem('agro-language',code);setLanguageOpen(false);};
  const send=(e)=>{e.preventDefault(); if(!question.trim()) return; setAnswer('Puedo orientarte con la navegación. Para recomendaciones de campo, revisa cultivo, temporada, lluvia y estado del suelo en el calendario.'); setQuestion('');};
  return <>
    <div className="language-switcher"><button className="language-launch" aria-label="Traducir página" aria-expanded={languageOpen} onClick={()=>setLanguageOpen(!languageOpen)}><Languages size={20}/><span>{language.toUpperCase()}</span></button>{languageOpen&&<div className="language-menu" role="group" aria-label="Idioma de la página">{[['es','Español'],['en','English'],['fr','Français'],['pt','Português']].map(([code,label])=><button key={code} aria-pressed={language===code} onClick={()=>chooseLanguage(code)}>{label}{language===code&&<span>✓</span>}</button>)}</div>}</div>
    <button className="chat-launch" aria-label={open?'Cerrar ayuda':'Abrir ayuda'} onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<MessageCircle size={22}/>}</button>
    {open&&<section className="chat-box"><header><span className="avatar-mini">🌱</span><div><b>Ayuda Agroclimatic</b><small>Asistente de navegación</small></div><button onClick={()=>setOpen(false)} aria-label="Cerrar"><X size={17}/></button></header><div className="chat-messages"><p className="bot-message">¡Hola! Puedo ayudarte a encontrar el calendario, entender los indicadores o usar la guía.</p>{answer&&<p className="bot-message">{answer}</p>}</div><form onSubmit={send}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Escribe tu duda…"/><button aria-label="Enviar"><ChevronRight size={18}/></button></form></section>}
  </>;
}

function AccessibilityPanel({ settings, setSettings, onClose }) {
  const toggle = (key) => setSettings((previous) => ({ ...previous, [key]: !previous[key] }));
  const setSize = (size) => setSettings((previous) => ({ ...previous, textSize: size }));
  const readPage = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(document.querySelector('.main-area')?.innerText || ''));
  };
  return <div className="accessibility-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="accessibility-panel" role="dialog" aria-modal="true" aria-labelledby="accessibility-title"><header><div><span className="eyebrow">PREFERENCIAS DE VISUALIZACIÓN</span><h2 id="accessibility-title">Accesibilidad</h2></div><button onClick={onClose} aria-label="Cerrar accesibilidad"><X size={19}/></button></header>
    <div className="accessibility-group"><strong><Type size={17}/> Tamaño de letra</strong><div className="accessibility-buttons"><button aria-pressed={settings.textSize==='normal'} className={settings.textSize==='normal'?'chosen':''} onClick={()=>setSize('normal')}>Normal</button><button aria-pressed={settings.textSize==='large'} className={settings.textSize==='large'?'chosen':''} onClick={()=>setSize('large')}>Grande</button><button aria-pressed={settings.textSize==='extra'} className={settings.textSize==='extra'?'chosen':''} onClick={()=>setSize('extra')}>Muy grande</button></div></div>
    <PreferenceButton icon={Contrast} title="Alto contraste" detail="Aumenta la diferencia entre texto y fondo" active={settings.highContrast} onClick={()=>toggle('highContrast')}/>
    <PreferenceButton icon={settings.darkMode?Sun:Moon} title="Modo oscuro" detail="Usa una interfaz oscura" active={settings.darkMode} onClick={()=>toggle('darkMode')}/>
    <PreferenceButton icon={Captions} title="Avisos visuales" detail="Refuerza avisos con texto e iconos, sin depender del sonido" active={settings.visualAlerts} onClick={()=>toggle('visualAlerts')}/>
    <button className="read-aloud" onClick={readPage}><Volume2 size={17}/> Leer esta página en voz alta</button>
    <p className="accessibility-note">Los avisos visuales ayudan a personas sordas o con dificultad auditiva. La lectura en voz alta apoya a personas con baja visión o dificultad para leer.</p>
  </section></div>;
}
function PreferenceButton({icon:Icon,title,detail,active,onClick}) { return <button aria-pressed={active} className={`preference-row ${active?'enabled':''}`} onClick={onClick}><span className="preference-icon"><Icon size={17}/></span><span><b>{title}</b><small>{detail}</small></span><span className="switch" aria-hidden="true"><i/></span></button>; }

function AppLayout() {
  const route=useLocation(); const title=nav.find(([,path])=>path===route.pathname)?.[0]||'Agroclimatic';
  const [selectedState,setSelectedState]=useState('México');
  const [locationStatus,setLocationStatus]=useState(()=>navigator.geolocation?'Detectando ubicación…':'Selecciona tu estado');
  const [accessibilityOpen,setAccessibilityOpen]=useState(false);
  const [settings,setSettings]=useState({textSize:'normal',highContrast:false,darkMode:false,visualAlerts:false});
  const applyPosition=({coords})=>{
    if(coords.latitude<14||coords.latitude>33.5||coords.longitude< -119||coords.longitude> -86){setSelectedState('México');setLocationStatus('Fuera de México; elige un estado');return;}
    setSelectedState(closestState(coords.latitude,coords.longitude));setLocationStatus('Estado aproximado por ubicación');
  };
  const detectLocation=()=>{
    if(!navigator.geolocation){setLocationStatus('Selecciona tu estado');return;}
    setLocationStatus('Detectando…');
    navigator.geolocation.getCurrentPosition(applyPosition,()=>setLocationStatus('No se pudo detectar; elige tu estado'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  };
  useEffect(()=>{
    if(!navigator.geolocation)return;
    navigator.geolocation.getCurrentPosition(({coords})=>{
      if(coords.latitude<14||coords.latitude>33.5||coords.longitude< -119||coords.longitude> -86){setSelectedState('México');setLocationStatus('Fuera de México; elige un estado');return;}
      setSelectedState(closestState(coords.latitude,coords.longitude));setLocationStatus('Estado aproximado por ubicación');
    },()=>setLocationStatus('Elige tu estado manualmente'),{enableHighAccuracy:false,timeout:10000,maximumAge:300000});
  },[]);
  useEffect(()=>{document.documentElement.dataset.theme=settings.darkMode?'dark':'light';},[settings.darkMode]);
  const appClass=`app-container text-${settings.textSize}${settings.highContrast?' high-contrast':''}${settings.darkMode?' dark-mode':''}${settings.visualAlerts?' visual-alerts':''}`;
  return <div className={appClass}><Sidebar onOpenAccessibility={()=>setAccessibilityOpen(true)}/><main className="main-area"><header className="topbar"><span>{title}</span><div className="location-control"><label><MapPin size={16}/><span className="location-label">Estado</span><select aria-label="Estado de México" value={selectedState} onChange={e=>{setSelectedState(e.target.value);setLocationStatus('Estado seleccionado manualmente');}}><option value="México">Todo México</option>{STATES.map(([state])=><option key={state}>{state}</option>)}</select></label><button onClick={detectLocation} title="Detectar mi ubicación" aria-label="Detectar mi ubicación"><LocateFixed size={17}/></button><span className="location-status" aria-live="polite">{locationStatus}</span></div></header>
    {settings.visualAlerts&&<div className="visual-alert-note" role="status" aria-live="polite"><Captions size={16}/> Los avisos importantes se mostrarán con texto e iconos.</div>}
    <Routes><Route path="/" element={<Home/>}/><Route path="/cuestionario" element={<Questionnaire selectedState={selectedState} onStateChange={setSelectedState}/>}/><Route path="/mapa" element={<MapPage selectedState={selectedState} center={stateCenter(selectedState)} onStateChange={setSelectedState}/>}/><Route path="/dashboard" element={<Dashboard key={selectedState} selectedState={selectedState}/>}/><Route path="/calendario" element={<CalendarPage selectedState={selectedState}/>}/><Route path="/guia" element={<Guide/>}/><Route path="*" element={<Home/>}/></Routes></main><ChatWidget/>{accessibilityOpen&&<AccessibilityPanel settings={settings} setSettings={setSettings} onClose={()=>setAccessibilityOpen(false)}/>}</div>;
}
export default function App() { return <BrowserRouter><AppLayout/></BrowserRouter>; }
