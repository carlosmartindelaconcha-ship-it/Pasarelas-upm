/* VWOMA — interactive OMA / EFDD view.
 * Manual selection on singular-value plot; preserves source files and mode
 * choices while switching tabs. This controller never changes acquisition.
 */
(function registerOmaUI(root){
'use strict';
function createController({s,$,Chart,efdd,demo,comparisonExport,download,storedRuns,storedChunks,escape,tell}){
  const state=()=>s.oma||(s.oma={files:[],analysis:null,modes:[],selected:-1,pick:null,charts:{},source:'',lastInput:null});
  const text=(id,value)=>{const el=$(id);if(el&&el.textContent!==value)el.textContent=value;};
  const number=(id,fallback=null)=>{const el=$(id),v=el?.value;return v===''||v==null?fallback:Number(v);};
  const options=()=>({
    axis:$('jointOmaAxis').value,
    nfft:Number($('jointOmaFFT').value),
    maxHz:Number($('jointOmaMaximum').value)
  });
  const efddOptions=()=>({
    macThreshold:number('jointOmaMac',.8),
    levelThreshold:number('jointOmaLevel',.01),
    bandMin:number('jointOmaBandMin',null),
    bandMax:number('jointOmaBandMax',null)
  });
  const canUseCurrent=()=>{
    try{const record=comparisonExport();return record?.records?.some(r=>r.samples?.length)?record:null;}
    catch{return null;}
  };
  const fmt=(v,d=3)=>Number.isFinite(v)?Number(v).toFixed(d):'—';
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const getNames=()=>state().files.map(x=>x.name);
  function invalidate(){
    const st=state();st.analysis=null;st.modes=[];st.selected=-1;st.pick=null;st.lastInput=null;
    destroyCharts();clearResults();
  }
  function destroyCharts(){
    const st=state();
    for(const chart of Object.values(st.charts||{}))chart?.destroy?.();
    st.charts={};
  }
  function clearResults(){
    $('jointOmaModeList').replaceChildren();
    $('jointOmaMetrics').textContent='';
    $('jointOmaWarnings').textContent='';
    $('jointOmaModeDetail').hidden=true;
    $('jointOmaModalTables').textContent='';
    $('jointOmaExportJSON').disabled=true;
    $('jointOmaExportCSV').disabled=true;
  }
  function renderFileList(){
    const st=state();
    const sim=st.files.length===1?st.files[0].data.simulation:null;
    const demoInfo=$('jointOmaDemoInfo');
    demoInfo.hidden=!sim;
    if(sim){
      demoInfo.textContent='PRUEBA SINTÉTICA · '+sim.sensors+' acelerómetros simultáneos · 50 × 10,5 m · '+
        sim.durationSeconds+' s · '+sim.sampleRateHz+' Hz · '+sim.samplesPerSensor+
        ' muestras por sensor · ruido blanco gaussiano independiente σ = '+
        fmt(sim.whiteNoiseStdMps2,2)+' m/s² (PSD esperada uniforme). Modos: '+
        sim.modes.map(m=>m.name+' '+m.frequencyHz+' Hz').join(' · ')+
        '. Toca cada pico del FDD para recuperar su forma y compararla con la teórica.';
    }
    if(st.files.length){
      $('jointOmaFilesList').textContent=st.files.map((f,i)=>
        (i+1)+'. '+f.name).join(' · ');
      text('jointOmaSource',st.files.length+' ensayo(s) cargados. Pulsa Analizar FDD para calcular los valores singulares.');
    }else{
      $('jointOmaFilesList').textContent='No hay archivos cargados.';
      text('jointOmaSource',canUseCurrent()?
        'Puedes analizar el ensayo que acabas de terminar, o importar varios setups.':
        'Importa uno o varios JSON de ensayo, o carga la campaña individual guardada en este navegador.');
    }
  }
  function normalize(data,name){
    if(!data||!data.plan||!data.windowMasterMs)
      throw Error(name+': falta el plano o la ventana temporal.');
    if(Array.isArray(data.records)&&data.records.length){
      return {name,data};
    }
    if(Array.isArray(data.samples)&&data.device?.id){
      const samples=data.samples.map(row=>Array.isArray(row)?{
        raw:row,masterTimeMs:Number.isFinite(row[8])?row[8]:Number.isFinite(row[7])?row[7]:NaN
      }:row);
      return {name,data:{session:data.session,plan:data.plan,setup:data.setup,
        windowMasterMs:data.windowMasterMs,records:[{device:data.device,samples}]}};
    }
    throw Error(name+': no contiene registros de aceleraciones.');
  }
  async function importFiles(fileList){
    const files=[...fileList];
    if(!files.length)return;
    if(files.length>64)throw Error('Importa como máximo 64 archivos.');
    if(files.reduce((sum,f)=>sum+f.size,0)>150000000)
      throw Error('Los archivos superan 150 MB en conjunto. Reduce el tamaño de la campaña.');
    const st=state(),next=[];
    for(const f of files){
      if(f.size>65000000)throw Error(f.name+': supera el máximo de 65 MB.');
      const raw=await f.text();
      let data;
      try{data=JSON.parse(raw);}catch{throw Error(f.name+': no es JSON válido.');}
      next.push(normalize(data,f.name));
    }
    st.files=next;st.source='files';invalidate();renderFileList();
    text('jointOmaStatus',next.length+' archivos preparados. Configura el eje y calcula FDD.');
  }
  function chooseCurrent(){
    const current=canUseCurrent();
    if(!current)throw Error('Todavía no hay un ensayo finalizado con muestras para analizar.');
    const st=state();st.files=[normalize(current,'Ensayo actual')];st.source='current';
    invalidate();renderFileList();
  }
  async function loadCampaign(){
    if(typeof storedRuns!=='function'||typeof storedChunks!=='function')
      throw Error('No está disponible la recuperación de registros de campaña.');
    const records=await storedRuns();
    const eligible=records.filter(row=>row.meta?.state==='finished'&&
      row.meta?.setup?.singleSensor&&row.meta?.device?.id&&row.meta?.plan);
    if(!eligible.length)throw Error('No hay setups con un único acelerómetro guardados en este navegador.');
    const sessionMatches=eligible.filter(row=>row.meta.session===s.session);
    const candidates=(sessionMatches.length?sessionMatches:eligible)
      .slice().sort((a,b)=>String(a.meta.created).localeCompare(String(b.meta.created)));
    const session=candidates.at(-1).meta.session;
    const same=candidates.filter(row=>row.meta.session===session)
      .sort((a,b)=>String(a.meta.created).localeCompare(String(b.meta.created)));
    const bySetup=new Map();
    for(const row of same)bySetup.set(row.meta.setup.index,row);
    const selected=[...bySetup.values()].sort((a,b)=>a.meta.setup.index-b.meta.setup.index).slice(0,64);
    if(!selected.length)throw Error('No hay setups completos en la campaña.');
    const files=[];
    for(const row of selected){
      const chunks=await storedChunks(row.key),rows=chunks.flatMap(chunk=>chunk.rows||[]);
      if(!rows.length)continue;
      files.push(normalize({...row.meta,samples:rows},
        'Setup '+row.meta.setup.index+' · '+(row.meta.device.point?.id||'M')));
    }
    if(!files.length)throw Error('Los registros guardados no contienen muestras.');
    state().files=files;state().source='archive';invalidate();renderFileList();
    text('jointOmaStatus',files.length+' setups individuales recuperados. El FDD combinará sus PSD sin inventar fases.');
  }
  async function loadDemo(){
    if(!demo?.generate)throw Error('No se ha cargado el generador de prueba.');
    text('jointOmaStatus','Generando 180 s de señales con 14 acelerómetros y ruido blanco…');
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const data=demo.generate();
    const st=state();st.files=[normalize(data,'Demo sintética · 14 acelerómetros · 3 minutos')];
    st.source='demo';
    invalidate();
    $('jointOmaAxis').value='z';
    $('jointOmaMaximum').value='25';
    $('jointOmaFFT').value='4096';
    renderFileList();
    await analyze();
  }
  function sampleSources(){
    const st=state();if(st.files.length)return st.files.map(f=>f.data);
    const current=canUseCurrent();
    if(!current)throw Error('Importa archivos JSON o termina primero un ensayo.');
    return [current];
  }
  function computeAsync(inputs,settings){
    if(typeof Worker!=='function')return Promise.resolve().then(()=>efdd.compute(inputs,settings));
    return new Promise((resolve,reject)=>{
      let worker;
      try{worker=new Worker('src/oma/efdd-worker.js?v=20261117-demo14-v1');}
      catch(_){resolve(efdd.compute(inputs,settings));return;}
      const id=Date.now();
      worker.onmessage=event=>{
        if(event.data?.id!==id)return;
        worker.terminate();
        if(event.data.success)resolve(event.data.result);
        else reject(Error(event.data.error||'Error de cálculo EFDD.'));
      };
      worker.onerror=event=>{
        worker.terminate();
        // A browser may block workers while still permitting ordinary JS.
        // Keep the feature usable in that case, albeit with UI-thread work.
        try{resolve(efdd.compute(inputs,settings));}
        catch(error){reject(error);}
      };
      try{worker.postMessage({id,action:'compute',inputs,options:settings});}
      catch(error){worker.terminate();reject(error);}
    });
  }
  async function analyze(){
    const st=state();
    if(!Chart)throw Error('No se ha cargado Chart.js. Recarga la página con conexión.');
    text('jointOmaStatus','Calculando matrices espectrales y descomposición FDD…');
    // Allow the status update to paint before CPU-heavy FFT and eigensolver.
    await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
    const inputs=sampleSources();
    const answer=await computeAsync(inputs,options());
    destroyCharts();st.analysis=answer;st.modes=[];st.selected=-1;st.pick=null;st.lastInput=inputs;
    renderAnalysis();
    text('jointOmaStatus',answer.sourceCount+' ensayo(s) · '+answer.channels.length+
      ' punto(s) · '+fmt(answer.fs,1)+' Hz · Δf '+fmt(answer.df,3)+' Hz. Selecciona manualmente un pico sobre el espectro.');
  }
  function branchColors(i){return ['rgba(23,107,176,1)','rgba(211,84,64,.58)','rgba(35,128,105,.32)'][i%3];}
  const selectedPeakGuide={
    id:'selectedPeakGuide',
    // Se dibuja en cada repintado de Chart.js (incluido pan/zoom), no como una serie que el plugin de zoom pueda perder.
    afterDraw(chart){
      const pick=chart.$omaSelectedPick;
      if(!pick||!Number.isFinite(pick.hz)||!Number.isFinite(pick.psd))return;
      const x=chart.scales.x.getPixelForValue(pick.hz);
      const y=chart.scales.y.getPixelForValue(Math.max(pick.psd,1e-22));
      const area=chart.chartArea,ctx=chart.ctx;
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<area.left||x>area.right||y<area.top||y>area.bottom)return;
      ctx.save();
      ctx.strokeStyle='#c9413a';
      ctx.lineWidth=1.5;
      ctx.setLineDash([5,4]);
      ctx.beginPath();ctx.moveTo(x,area.top);ctx.lineTo(x,area.bottom);ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();ctx.arc(x,y,8,0,Math.PI*2);
      ctx.fillStyle='#d14c45';ctx.fill();
      ctx.lineWidth=2.5;ctx.strokeStyle='#174a7c';ctx.stroke();
      ctx.restore();
    }
  };
  function scientific(value){
    const n=Number(value);
    if(!Number.isFinite(n)||n===0)return '0';
    return n.toExponential(0).replace('e+','e').replace('e-','e−');
  }
  function nearestPeak(result,hz,branch){
    const values=result.data.map(row=>Math.max(row.values[branch]||0,1e-22));
    let at=0,best=Infinity;
    for(let i=1;i<result.frequency.length;i++){
      const distance=Math.abs(result.frequency[i]-hz);
      if(distance<best){best=distance;at=i;}
    }
    const radius=Math.max(3,Math.min(60,Math.round(.35/Math.max(result.df,1e-6))));
    let peak=at,peakValue=values[at];
    for(let i=Math.max(1,at-radius);i<=Math.min(values.length-2,at+radius);i++){
      if(values[i]>=values[i-1]&&values[i]>=values[i+1]&&values[i]>peakValue){peak=i;peakValue=values[i];}
    }
    return {hz:result.frequency[peak],branch};
  }
  function plotSpectra(){
    const st=state(),result=st.analysis;
    if(!result||!Chart)return;
    const stride=Math.max(1,Math.ceil(result.data.length/1600));
    const visibleRank=Math.min(result.rank,3);
    const series=Array.from({length:visibleRank},(_,j)=>{
      const data=[];
      for(let k=1;k<result.data.length;k+=stride){
        const last=Math.min(result.data.length,k+stride),group=Array.from({length:last-k},(_,i)=>k+i);
        let best=group[0];for(const t of group)if(result.data[t].values[j]>result.data[best].values[j])best=t;
        data.push({x:result.frequency[best],y:Math.max(result.data[best].values[j]||0,1e-22)});
      }
      return {label:'SV'+(j+1),data,borderColor:branchColors(j),
        pointRadius:0,borderWidth:j===0?2.2:1.35,showLine:true,parsing:false,tension:0};
    });
    const confirmed={label:'',data:st.modes.map(mode=>({
      x:mode.selectedHz??mode.frequencyHz,y:Math.max(mode.selectedPsd??mode.peakPsd,1e-22)
    })),showLine:false,pointRadius:5.5,pointHoverRadius:6,
      pointBorderColor:'#174a7c',pointBackgroundColor:'#d14c45',
      pointBorderWidth:2,parsing:false};
    const candidate={label:'',data:[],showLine:false,pointRadius:0,pointHoverRadius:0,
      pointBorderColor:'#174a7c',pointBackgroundColor:'#d14c45',
      pointBorderWidth:2.5,parsing:false};
    series.push(confirmed,candidate);
    st.charts.singular=new Chart($('jointOmaSingular').getContext('2d'),{
      type:'line',data:{datasets:series},plugins:[selectedPeakGuide],options:{
        responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
        interaction:{mode:'nearest',intersect:false},
        plugins:{
          legend:{display:true,position:'top',labels:{filter:item=>item.datasetIndex<visibleRank}},
          tooltip:{enabled:true,callbacks:{label:ctx=>ctx.dataset.label+': '+scientific(ctx.parsed.y)}},
          zoom:{
            pan:{enabled:true,mode:'xy'},
            zoom:{wheel:{enabled:true},pinch:{enabled:true},mode:'xy'},
            limits:{x:{min:0,max:result.fmax}}
          },
          selectedPeakGuide:{}
        },
        scales:{
          x:{type:'linear',min:0,max:result.fmax,title:{display:true,text:'Frecuencia (Hz)'}},
          y:{
            type:'logarithmic',
            title:{display:true,text:'Densidad espectral / valor singular (m²/s⁴/Hz)'},
            ticks:{callback:value=>scientific(value)}
          }
        },
        onClick:(ev,elements,chart)=>activateTick(chart,elements.find(item=>item.datasetIndex<visibleRank))
      }
    });
    st.charts.singular.$omaSelectedPick=st.pick||null;
    // En iOS el primer toque puede actualizar solo el tooltip y no disparar onClick de Chart.js.
    // Pointer-up distingue un toque de un arrastre y selecciona el tick ya en el primer gesto.
    const canvas=st.charts.singular.canvas;
    let touchStart=null;
    const activateTick=(chart,element)=>{
      if(!element)return;
      const branch=element.datasetIndex;
      if(branch>=visibleRank)return;
      const parsed=chart.getDatasetMeta(branch)?.controller?.getParsed(element.index);
      const hz=Number(parsed?.x),psd=Math.max(Number(parsed?.y)||0,1e-22);
      if(!Number.isFinite(hz)||hz<=0||hz>result.fmax)return;
      st.pick={hz,psd,branch};
      updateMarkers();
      $('jointOmaChoosePeak').disabled=false;
      text('jointOmaPickHelp','Punto activo: '+fmt(hz,3)+' Hz · SV'+(branch+1)+'.');
      text('jointOmaStatus','Punto activo: '+fmt(hz,3)+' Hz · SV'+(branch+1)+'. Pulsa «Seleccionar punto» para añadirlo como modo.');
    };
    canvas.addEventListener('pointerdown',event=>{
      touchStart={x:event.clientX,y:event.clientY};
    },{passive:true});
    canvas.addEventListener('pointerup',event=>{
      const start=touchStart;touchStart=null;
      if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>10)return;
      const rect=canvas.getBoundingClientRect();
      const x=(event.clientX-rect.left)*(st.charts.singular.width/rect.width);
      const y=(event.clientY-rect.top)*(st.charts.singular.height/rect.height);
      const hit=st.charts.singular.getElementsAtEventForMode({x,y},'nearest',{intersect:false,axis:'xy'},false)
        .find(item=>item.datasetIndex<visibleRank);
      activateTick(st.charts.singular,hit);
    },{passive:true});
  }
  function showWarnings(){
    const result=state().analysis;
    $('jointOmaWarnings').textContent=result?.warnings?.join(' ')||'';
  }
  function renderAnalysis(){
    const st=state(),r=st.analysis;
    if(!r){clearResults();return;}
    text('jointOmaMetrics','Eje '+r.axis.toUpperCase()+' · '+r.sourceCount+' ensayo(s) · '+
      r.channels.length+' punto(s) · '+r.segments.join('+')+' ventanas Welch · '+fmt(r.df,4)+' Hz/paso FFT');
    showWarnings();plotSpectra();renderModes();
    $('jointOmaExportJSON').disabled=false;
    $('jointOmaExportCSV').disabled=false;
  }
  function addPeak(hz,branch=0,selectedPsd=null){
    const st=state(),r=st.analysis;
    if(!r)throw Error('Calcula primero el FDD.');
    if(!Number.isFinite(hz))throw Error('Toca un pico del espectro.');
    if(st.modes.length>=16)throw Error('Máximo 16 picos. Elimina uno antes de añadir otro.');
    const mode=efdd.estimate(r,hz,Math.min(branch,Math.max(0,r.rank-1)),efddOptions());
    mode.frequencyHz=hz;
    mode.selectedHz=hz;
    mode.selectedPsd=selectedPsd;
    const duplicate=st.modes.findIndex(m=>m.branch===mode.branch&&Math.abs(m.frequencyHz-hz)<.5*r.df);
    if(duplicate>=0){
      st.modes[duplicate]=mode;st.selected=duplicate;
    }else{st.modes.push(mode);st.selected=st.modes.length-1;}
    st.modes.sort((a,b)=>a.frequencyHz-b.frequencyHz);
    st.selected=st.modes.indexOf(mode);
    text('jointOmaStatus','Modo '+(st.selected+1)+' añadido: '+fmt(mode.frequencyHz)+
      ' Hz · SV'+(mode.branch+1)+' · banda '+fmt(mode.bandHz[0])+'–'+fmt(mode.bandHz[1])+' Hz.');
    updateMarkers();renderModes();
  }
  function updateMarkers(){
    const st=state(),chart=st.charts.singular;
    if(!chart||!st.analysis)return;
    const index=Math.min(st.analysis.rank,3);
    chart.data.datasets[index].data=st.modes.map(mode=>({
      x:mode.selectedHz??mode.frequencyHz,y:Math.max(mode.selectedPsd??mode.peakPsd,1e-22)
    }));
    chart.data.datasets[index+1].data=[];
    // Estado propio de la gráfica: sobrevive a los redibujados internos de pan y zoom.
    chart.$omaSelectedPick=st.pick||null;
    $('jointOmaChoosePeak').disabled=!st.pick;
    chart.update('none'); // preserve the interactive zoom and pan
  }
  function choosePeak(){
    const pick=state().pick;
    if(!pick)throw Error('Toca primero un punto del espectro.');
    addPeak(pick.hz,pick.branch,pick.psd);
    state().pick=null;
    $('jointOmaChoosePeak').disabled=true;
    text('jointOmaPickHelp','Toca otro pico del espectro para seleccionar un nuevo punto.');
    updateMarkers();
  }
  function renderModes(){
    const st=state(),holder=$('jointOmaModeList');
    holder.replaceChildren();
    if(!st.modes.length){
      text('jointOmaEmpty','Toca un punto del espectro y después pulsa «Seleccionar punto».');
      $('jointOmaEmpty').hidden=false;
      $('jointOmaModeDetail').hidden=true;
      return;
    }
    $('jointOmaEmpty').hidden=true;
    st.modes.forEach((mode,i)=>{
      const card=document.createElement('div');card.className='joint-oma-mode-card'+(i===st.selected?' is-selected':'');
      const label=document.createElement('button');label.type='button';label.className='joint-secondary';
      label.textContent='Modo '+(i+1)+' · '+fmt(mode.frequencyHz,3)+' Hz · ζ '+(mode.dampingPct===null?'no fiable':fmt(mode.dampingPct,2)+' %');
      label.setAttribute('aria-pressed',String(i===st.selected));
      label.onclick=()=>{st.selected=i;renderModes();};
      const remove=document.createElement('button');remove.className='joint-secondary';remove.type='button';remove.textContent='Eliminar';
      remove.setAttribute('aria-label','Eliminar pico '+(i+1));
      remove.onclick=()=>{
        st.modes.splice(i,1);st.selected=st.modes.length?Math.min(i,st.modes.length-1):-1;
        updateMarkers();renderModes();
      };
      card.append(label,remove);holder.append(card);
    });
    renderModeDetail(st.modes[st.selected]);
  }
  function destroyDetailCharts(){
    for(const key of ['decay','shape']){
      state().charts[key]?.destroy?.();delete state().charts[key];
    }
  }
  function renderShapeMap(points,result){
    const target=$('jointOmaShapeMap');
    target.replaceChildren();
    if(!points?.length)return;
    const NS='http://www.w3.org/2000/svg';
    const node=(tag,attributes={},label=null)=>{
      const element=document.createElementNS(NS,tag);
      for(const [key,value] of Object.entries(attributes))
        element.setAttribute(key,String(value));
      if(label!==null)element.textContent=String(label);
      return element;
    };
    const svg=node('svg',{viewBox:'0 0 680 245',role:'img',
      'aria-label':'Forma modal en planta. Azul: desplazamiento positivo; naranja: negativo.',
      preserveAspectRatio:'xMidYMid meet'});
    svg.append(node('rect',{x:34,y:20,width:612,height:178,rx:8,
      fill:'#f3f8fc',stroke:'#b4cfdf','stroke-width':1.5}));
    for(let i=1;i<10;i++)svg.append(node('path',{
      d:'M '+(34+61.2*i)+' 20 V 198',stroke:'#e0eaf2','stroke-width':1
    }));
    const L=Math.max(.01,Number(result.planLength)||Math.max(...points.map(p=>p.x))),
      W=Math.max(.01,Number(result.planWidth)||Math.max(...points.map(p=>p.y)));
    for(const p of points){
      const x=34+612*clamp(p.x/L,0,1),y=198-178*clamp(p.y/W,0,1);
      const phi=p.re,amp=Math.abs(phi),color=phi>=0?'#176bb0':'#ce6d4d';
      const circle=node('circle',{cx:x,cy:y,r:(6+14*amp).toFixed(2),
        fill:color,'fill-opacity':(.3+.65*amp).toFixed(2),
        stroke:color,'stroke-width':2});
      circle.append(node('title',{},p.id+' · φ = '+fmt(phi,3)+
        ' · X='+fmt(p.x,2)+' m · Y='+fmt(p.y,2)+' m'));
      svg.append(circle);
      svg.append(node('text',{x,y:y-22,fill:'#254763',
        'font-size':12,'text-anchor':'middle','font-weight':600},p.id));
    }
    svg.append(node('text',{x:35,y:225,fill:'#667d91','font-size':12},'X=0'));
    svg.append(node('text',{x:646,y:225,fill:'#667d91','font-size':12,'text-anchor':'end'},
      'X='+fmt(L,1)+' m'));
    target.append(svg);
    const legend=document.createElement('p');
    legend.className='joint-help';
    legend.textContent='Círculos azules: φ positivo · Naranjas: φ negativo · Tamaño proporcional a |φ|.';
    target.append(legend);
  }
  function renderModeDetail(mode){
    destroyDetailCharts();
    const section=$('jointOmaModeDetail');
    section.hidden=!mode;if(!mode)return;
    text('jointOmaModeInfo','f pico: '+fmt(mode.frequencyHz,3)+' Hz · f natural: '+
      fmt(mode.naturalFrequencyHz,3)+' Hz · ζ: '+
      (mode.dampingPct==null?'no estimable':fmt(mode.dampingPct,2)+' %')+
      ' · R²: '+fmt(mode.r2,3)+' · banda: '+fmt(mode.bandHz[0])+'–'+fmt(mode.bandHz[1])+' Hz.' );
    text('jointOmaModeWarning',mode.warnings.join(' '));
    const lines=mode.correlation.map(x=>({x:x.t,y:x.r}));
    const upper=mode.correlation.filter(x=>x.envelope!=null).map(x=>({x:x.t,y:x.envelope}));
    const lower=mode.correlation.filter(x=>x.envelope!=null).map(x=>({x:x.t,y:-x.envelope}));
    if(Chart)state().charts.decay=new Chart($('jointOmaDecay').getContext('2d'),{
      type:'line',data:{datasets:[
        {label:'Correlación EFDD',data:lines,borderColor:'#176bb0',pointRadius:0,borderWidth:1.7,parsing:false},
        {label:'Envolvente ajustada',data:upper,borderColor:'#cf6544',pointRadius:0,borderDash:[6,4],parsing:false},
        {label:'− Envolvente',data:lower,borderColor:'#cf6544',pointRadius:0,borderDash:[6,4],parsing:false}
      ]},options:{responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
        scales:{x:{type:'linear',title:{display:true,text:'Retardo (s)'}},
          y:{title:{display:true,text:'Autocorrelación normalizada'}}}}});
    const table=$('jointOmaModalTables');table.replaceChildren();
    const modeShape=mode.shape;
    $('jointOmaShapePanel').hidden=!modeShape;
    $('jointOmaShapeMap').replaceChildren();
    $('jointOmaDemoCompare').hidden=true;
    if(!modeShape)return;
    const demoModes=state().files.length===1?state().files[0].data.simulation?.modes:null;
    const expected=demoModes?.find(m=>Math.abs(m.frequencyHz-mode.frequencyHz)<.65)||null;
    const truth=new Map((expected?.signedShape||[]).map(p=>[p.id,p.value]));
    const dot=modeShape.points.reduce((sum,p)=>sum+(truth.get(p.id)||0)*p.re,0);
    const sign=dot>=0?1:-1;
    if(expected){
      const target=modeShape.points.map(p=>({re:truth.get(p.id)||0,im:0}));
      const measured=modeShape.points.map(p=>({re:p.re,im:p.im}));
      const m=efdd.mac(target,measured);
      $('jointOmaDemoCompare').hidden=false;
      text('jointOmaDemoCompare','VALIDACIÓN SINTÉTICA · '+expected.name+
        ' · frecuencia teórica '+fmt(expected.frequencyHz,2)+' Hz · frecuencia estimada '+
        fmt(mode.frequencyHz,3)+' Hz · MAC respecto a la forma teórica '+fmt(m,5)+
        ' (1 es coincidencia perfecta).');
    }
    renderShapeMap(modeShape.points,state().analysis);
    text('jointOmaShapeQuality','Componentes en fase: '+fmt(modeShape.realness*100,1)+
      ' %. Referencia de fase: amplitud dominante o punto maestro.');
    const points=modeShape.points,ys=points.map(p=>p.y);
    const mid=(Math.min(...ys)+Math.max(...ys))/2;
    const separate=Math.max(...ys)-Math.min(...ys)>1e-4;
    const groups=separate?
      [{title:'Lado izquierdo',items:points.filter(p=>p.y<=mid),color:'#176bb0'},
       {title:'Lado derecho',items:points.filter(p=>p.y>mid),color:'#c56c39'}]:
      [{title:'Sensores',items:points,color:'#176bb0'}];
    const datasets=[];
    for(const group of groups){
      const sorted=group.items.slice().sort((a,b)=>a.x-b.x);
      datasets.push({label:group.title+' · Re φ',
        data:sorted.map(p=>({x:p.x,y:p.re})),
        borderColor:group.color,backgroundColor:group.color,pointRadius:4,
        borderWidth:2.2,showLine:true,parsing:false});
      datasets.push({label:group.title+' · Im φ',
        data:sorted.map(p=>({x:p.x,y:p.im})),
        borderColor:group.color,borderDash:[3,5],borderWidth:1.15,
        pointRadius:2,showLine:true,parsing:false});
      if(expected){
        datasets.push({label:group.title+' · Teórica',
          data:sorted.map(p=>({x:p.x,y:sign*(truth.get(p.id)||0)})),
          borderColor:'#556576',backgroundColor:'#556576',
          borderDash:[7,4],borderWidth:1.8,pointRadius:2,
          showLine:true,parsing:false});
      }
    }
    if(Chart)state().charts.shape=new Chart($('jointOmaShape').getContext('2d'),{
      type:'line',data:{datasets},options:{
        responsive:true,maintainAspectRatio:false,animation:false,parsing:false,
        plugins:{legend:{position:'top'}},
        scales:{x:{type:'linear',title:{display:true,text:'Coordenada longitudinal X (m)'}},
          y:{min:-1.1,max:1.1,title:{display:true,text:'Forma modal normalizada'}}}
      }
    });
    const tableEl=document.createElement('table');
    const head=document.createElement('thead');const tr=document.createElement('tr');
    const headers=['Punto','X (m)','Y (m)','Re φ','Im φ','|φ|'];
    if(expected)headers.push('φ teórica');
    for(const cell of headers){
      const th=document.createElement('th');th.textContent=cell;tr.append(th);
    }
    head.append(tr);tableEl.append(head);
    const body=document.createElement('tbody');
    for(const p of points){
      const row=document.createElement('tr');
      const values=[p.id,fmt(p.x,2),fmt(p.y,2),fmt(p.re,3),
        fmt(p.im,3),fmt(p.amplitude,3)];
      if(expected)values.push(fmt(sign*(truth.get(p.id)||0),3));
      for(const value of values){
        const td=document.createElement('td');td.textContent=value;row.append(td);
      }
      body.append(row);
    }
    tableEl.append(body);table.append(tableEl);
  }
  function exportJSON(){
    const st=state(),r=st.analysis;if(!r)throw Error('No hay análisis OMA que exportar.');
    download('VWOMA_EFDD_'+r.axis+'_'+Date.now()+'.json',{
      schema:'vwoma-oma-efdd-v1',
      method:'Hann-Welch CPSD, FDD eigenvectors, MAC band, EFDD autocorrelation log decrement',
      created:new Date().toISOString(),
      axis:r.axis,kind:r.kind,sourceCount:r.sourceCount,fs:r.fs,df:r.df,
      nfft:r.nfft,windows:r.segments,windowSeconds:r.windowSeconds,
      channels:r.channels,reference:r.reference,warnings:r.warnings,
      simulation:st.files.length===1?st.files[0].data.simulation||null:null,
      spectralData:r.frequency.map((frequency,i)=>({frequencyHz:frequency,singularValues:r.data[i].values})),
      selectedPeaks:st.modes
    });
  }
  function exportCSV(){
    const st=state(),r=st.analysis;if(!r)throw Error('No hay análisis que exportar.');
    const quote=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
    const rows=[['mode','peak_hz','frequency_natural_hz','damping_pct','r_squared',
      'band_low_hz','band_high_hz','point','x_m','y_m','real_phi','imag_phi','abs_phi'].join(',')];
    st.modes.forEach((m,index)=>{
      const points=m.shape?.points?.length?m.shape.points:[null];
      points.forEach(p=>rows.push([
        index+1,m.frequencyHz,m.naturalFrequencyHz,m.dampingPct,m.r2,m.bandHz[0],m.bandHz[1],
        p?.id,p?.x,p?.y,p?.re,p?.im,p?.amplitude
      ].map(quote).join(',')));
    });
    download('VWOMA_EFDD_modos.csv','\uFEFF'+rows.join('\n'),'text/csv;charset=utf-8');
  }
  function resetZoom(){
    state().charts.singular?.resetZoom?.('none');
  }
  function renderOMA(){
    const st=state();renderFileList();
    if(st.analysis){
      if(!st.charts.singular)renderAnalysis();
      else{for(const chart of Object.values(st.charts))chart?.resize?.();}
    }else{
      text('jointOmaStatus','Listo para analizar. Importa o selecciona un ensayo y calcula el FDD.');
      $('jointOmaModeDetail').hidden=true;
    }
  }
  function bindEvents(guard){
    const localGuard=fn=>guard(async(...args)=>{
      try{return await fn(...args)}
      catch(e){text('jointOmaStatus',e?.message||String(e));throw e}
    });
    $('jointOmaFiles').onchange=localGuard(async e=>{
      await importFiles(e.target.files);e.target.value='';
    });
    $('jointOmaCurrent').onclick=localGuard(chooseCurrent);
    $('jointOmaLoadCampaign').onclick=localGuard(loadCampaign);
    $('jointOmaDemo').onclick=localGuard(loadDemo);
    $('jointOmaAnalyze').onclick=localGuard(analyze);
    $('jointOmaChoosePeak').onclick=localGuard(choosePeak);
    $('jointOmaReset').onclick=localGuard(resetZoom);
    $('jointOmaExportJSON').onclick=localGuard(exportJSON);
    $('jointOmaExportCSV').onclick=localGuard(exportCSV);
    $('jointOmaClear').onclick=localGuard(()=>{
      state().files=[];state().source='';invalidate();renderOMA();
    });
  }
  return Object.freeze({renderOMA,bindEvents,importFiles,chooseCurrent,loadCampaign,loadDemo,
    analyze,addPeak,exportJSON,exportCSV,normalize,renderModes});
}
const api=Object.freeze({createController});
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VWOMAEFDDUI=api;
})(globalThis);