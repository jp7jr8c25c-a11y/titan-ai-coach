export const STORAGE_KEY = 'titan.ai.coach.v1';
export const SCHEMA_VERSION = 1;
export function localISO(d=new Date()) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
export function parseLocalDate(s) {const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d,12,0,0);}
export function shiftDay(iso,n) {const d=parseLocalDate(iso);d.setDate(d.getDate()+n);return localISO(d);}
export function mondayOf(iso) {const d=parseLocalDate(iso); const day=(d.getDay()+6)%7;d.setDate(d.getDate()-day);return localISO(d);}
export function dayIndex(iso) {return (parseLocalDate(iso).getDay()+6)%7;}
export function createState() {
 return {version:SCHEMA_VERSION, profile:{age:'',height:'',weight:'',goal:'kas',experience:'orta',trainTime:'21:00',activity:'orta',diet:'karisik',allergies:'',limitations:'',notes:''},logs:{},nutrition:{},metrics:[],chat:[],settings:{aiEndpoint:''},createdAt:new Date().toISOString()};
}
export function normaliseState(value) {
 const b=createState(); if(!value||typeof value!=='object'||Array.isArray(value)) return b;
 const o={...b,...value};
 o.profile={...b.profile,...(value.profile&&typeof value.profile==='object'&&!Array.isArray(value.profile)?value.profile:{})};
 o.settings={...b.settings,...(value.settings&&typeof value.settings==='object'&&!Array.isArray(value.settings)?value.settings:{})};
 o.logs=value.logs&&typeof value.logs==='object'&&!Array.isArray(value.logs)?value.logs:{};
 o.nutrition=value.nutrition&&typeof value.nutrition==='object'&&!Array.isArray(value.nutrition)?value.nutrition:{};
 o.metrics=Array.isArray(value.metrics)?value.metrics.slice(-365):[];
 o.chat=Array.isArray(value.chat)?value.chat.slice(-80):[];
 o.version=SCHEMA_VERSION;return o;
}
export function sessionProgress(log,day) {
 const exercises=day.sections.flatMap(s=>s.exercises), total=exercises.reduce((n,e)=>n+e.sets,0);
 const sets=log?.sets||{}; let done=0;
 for(const e of exercises) { for(const set of sets[e.id]||[]) if(set&&set.done) done++; }
 return {done,total,percent:total?Math.round(done/total*100):0};
}
export function weekSummary(state,weekStart,weekDays) {
 const out={planned:0,done:0,skipped:0,postponed:0,open:0,completedSets:0,plannedSets:0,trainingDays:0,weekStart};
 for(let i=0;i<7;i++){
  const date=shiftDay(weekStart,i),day=weekDays[i],log=state.logs[date];
  if(day.type==='strength') {out.planned++;out.trainingDays++;if(log?.status==='done')out.done++;else if(log?.status==='skipped')out.skipped++;else if(log?.status==='postponed')out.postponed++;else out.open++;}
  if(log){const p=sessionProgress(log,day);out.completedSets+=p.done;out.plannedSets+=p.total;}
 }
 out.adherence=out.planned?Math.round(out.done/out.planned*100):0;
 return out;
}
export function getCoachTips(state,weekStart,weekDays) {
 const summary=weekSummary(state,weekStart,weekDays),tips=[];
 if(summary.skipped>=2)tips.push('Bu hafta iki veya daha fazla antrenman kaçırılmış. Önce uyku, süre ve program yoğunluğunu gözden geçir; doğrudan yük artırma.');
 else if(summary.done>=4)tips.push('Haftalık devamlılık iyi. Bir sonraki hafta artırımı yalnızca tekrarların kontrolü ve toparlanma uygunsa değerlendir.');
 else tips.push('Program takibini düzenli sürdür: her seansı tamamlandı, ertelendi veya yapılmadı olarak işaretle.');
 const logs=Object.entries(state.logs).filter(([d])=>d>=weekStart&&d<=shiftDay(weekStart,6)).map(([,l])=>l);
 if(logs.some(l=>Number(l.pain)>=5)) tips.unshift('Kaydettiğin ağrı düzeyi yüksek. Ağrı oluşturan hareketi durdur ve uygun bir sağlık profesyoneliyle görüş; AI değerlendirmesi tanı değildir.');
 else if(logs.some(l=>Number(l.fatigue)>=8))tips.unshift('Yüksek yorgunluk kaydı var. Bir sonraki seans öncesi toparlanmayı değerlendir, gerekirse hacmi azalt.');
 const met=state.metrics.filter(m=>m.date>=shiftDay(weekStart,-28)&&m.date<=shiftDay(weekStart,6)).sort((a,b)=>a.date.localeCompare(b.date));
 if(met.length<2)tips.push('Gelişimi yorumlayabilmek için haftada bir aynı koşullarda kilo ve bel çevresi ölçümü al.');
 else {const a=met[0],b=met[met.length-1];if(a.weight&&b.weight)tips.push(`Son kayıtlı tartı farkı: ${(Number(b.weight)-Number(a.weight)).toFixed(1)} kg. Tek ölçüm yerine birkaç haftalık eğilime odaklan.`);}
 tips.push('Omuz odaklı üç gün var (Pzt/Cuma/Cmt). Bu bölgede performans düşüşü veya süren ağrı olursa yük/hacim ayarı yap.');
 return tips;
}
export function safeNumber(v,min,max) {if(v===''||v===null||v===undefined)return null;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)&&n>=min&&n<=max?n:null;}
export function determineLoadTip(sets,previousSets) {
 const current=(sets||[]).filter(x=>x?.done&&safeNumber(x.reps,0,100)!==null&&safeNumber(x.weight,0,800)!==null);
 const previous=(previousSets||[]).filter(x=>x?.done&&safeNumber(x.reps,0,100)!==null&&safeNumber(x.weight,0,800)!==null);
 if(current.length<2 || previous.length<2)return 'Yük önerisi için en az iki seanslık tam set kaydı gerekli.';
 const avg=a=>a.reduce((n,x)=>n+Number(x.reps),0)/a.length;
 const rpe=current.map(x=>safeNumber(x.rpe,1,10)).filter(x=>x!==null);
 if(rpe.some(x=>x>=9)) return 'Zorluk yüksek kaydedilmiş; şu an yük artırma yerine tekniği ve toparlanmayı koru.';
 if(avg(current)>=avg(previous)+1) return 'Tekrar performansı iyileşmiş. Teknik ve toparlanma uygunsa küçük bir artış değerlendirilebilir (zorunlu değil).';
 return 'Performans henüz istikrarlı artmıyor; yükü koru ve kontrollü tekrarları tamamlamaya odaklan.';
}
export function isValidHttpsWorker(s){if(!s)return true;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
