/* VWOMA | Planificación de setups multipunto.
 * Con un solo móvil M recorre todos los puntos (un setup por punto).
 * Con varios móviles M es una referencia fija en todos los ensayos.
 * La observabilidad modal se ESTIMA con funciones seno de una viga
 * biapoyada: no sustituye identificar las formas modales reales.
 * Algoritmo puro separado de DOM, WebRTC, adquisición y gráficas.
 */
(function registerSetupPlanner(root) {
  'use strict';
  const EPS=1e-9;
  const symbols=typeof module==='object'&&module.exports?require('./setup-symbols.js'):root.VWOMASetupSymbols;
  const sensor=p=>(p.kind||'sensor')==='sensor';
  const norm=(v,max)=>Math.max(0,Math.min(1,v/Math.max(EPS,max)));
  const unique=values=>new Set(values).size===values.length;
  const byId=(a,b)=>String(a.id).localeCompare(String(b.id));
  function modalScore(point,plan) {
    const x=norm(point.x,plan.length),y=norm(point.y,plan.width);
    // Penaliza nodos esperables en los seis primeros modos de flexión
    // longitudinal; mayor peso para los modos inferiores.
    const orders=[1,2,3,4,5,6],weights=[1,.88,.78,.67,.57,.48];
    let energy=0,avoidNodes=0,total=0;
    for(let i=0;i<orders.length;i++){
      const amplitude=Math.abs(Math.sin(Math.PI*orders[i]*x));
      const weight=weights[i];
      energy+=weight*Math.min(1,amplitude*amplitude/.55);
      avoidNodes+=weight*(amplitude>.22?1:amplitude/.22);
      total+=weight;
    }
    const longitudinal=.68*(energy/total)+.32*(avoidNodes/total);
    // No se penaliza un borde transversal si todos los puntos están allí:
    // las condiciones laterales reales de la pasarela son desconocidas.
    const distinctY=new Set(plan.points.filter(sensor).map(p=>Math.round(p.y/Math.max(EPS,plan.width)*20))).size;
    const transverse=distinctY>1?
      .55*Math.abs(Math.sin(Math.PI*y))+
      .45*Math.min(1,Math.abs(Math.sin(2*Math.PI*y))/.65):.5;
    const supportPoints=plan.points.filter(p=>p.kind==='support');
    const nearSupport=supportPoints.length?Math.min(...supportPoints.map(p=>
      Math.hypot((point.x-p.x)/Math.max(EPS,plan.length),
                 (point.y-p.y)/Math.max(EPS,plan.width)))):1;
    const boundary=Math.min(x,1-x);
    // Criterio explícito de trabajo, NO una garantía de captar todos los modos.
    return .84*longitudinal+.1*transverse+
       .06*Math.min(1,boundary/.12)-
       .08*Math.max(0,(.055-nearSupport)/.055);
  }
  function chooseMaster(plan,preferred=null) {
    const sensors=plan.points.filter(sensor);
    if(!sensors.length)throw Error('Añade al menos un sensor al plano.');
    if(preferred!==null){
      const manual=sensors.find(p=>p.id===preferred);
      if(!manual)throw Error('El sensor elegido para el maestro ya no existe.');
      return manual;
    }
    return [...sensors].sort((a,b)=>
      modalScore(b,plan)-modalScore(a,plan)||byId(a,b))[0];
  }
  function spreadDistance(a,b,plan) {
    // Combinación de distancia normalizada X/Y y distancia física:
    // así un puente largo no ignora la anchura ni trata 0,1 m como 10 m.
    const dx=(a.x-b.x)/Math.max(EPS,plan.length);
    const dy=(a.y-b.y)/Math.max(EPS,plan.width);
    const physical=Math.hypot(a.x-b.x,a.y-b.y)/Math.hypot(plan.length,plan.width);
    return .72*Math.hypot(dx,.75*dy)+.28*physical;
  }
  function coverageQuality(points,master,plan) {
    const all=[master,...points];if(all.length<2)return 0;
    let closest=Infinity,totalNear=0;
    for(let i=0;i<all.length;i++){
      let near=Infinity;
      for(let j=0;j<all.length;j++){
        if(j===i)continue;
        const d=spreadDistance(all[i],all[j],plan);
        if(d<near)near=d;
      }
      closest=Math.min(closest,near);
      totalNear+=near;
    }
    const xs=all.map(p=>norm(p.x,plan.length)),ys=all.map(p=>norm(p.y,plan.width));
    const spanX=Math.max(...xs)-Math.min(...xs),spanY=Math.max(...ys)-Math.min(...ys);
    return .45*closest+.37*(totalNear/all.length)+.18*(.65*spanX+.35*spanY);
  }
  function signature(plan,hostId,guestIds,syncId) {
    const rows=plan.points.filter(p=>sensor(p)||p.kind==='support')
      .map(p=>[p.kind||'sensor',p.id,p.x,p.y,p.axis,p.angle])
      .sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
    return JSON.stringify([plan.length,plan.width,rows,String(hostId),[...guestIds].sort(),String(syncId||'')]);
  }
  function generate(plan,hostId,guestIds,masterPointId=null) {
    if(!plan||!Number.isFinite(plan.length)||!Number.isFinite(plan.width)||
       plan.length<=0||plan.width<=0||!Array.isArray(plan.points))throw Error('Geometría del plano no válida.');
    const sensors=plan.points.filter(sensor);
    if(!sensors.length)throw Error('Añade al menos un punto de medida en Plano.');
    if(!Array.isArray(guestIds)||!unique(guestIds)||guestIds.includes(hostId))
      throw Error('La lista de móviles participantes no es válida.');
    const proposed=chooseMaster(plan);
    // Solo hay un acelerómetro: no existe referencia fija. El maestro
    // recorre todos los puntos, de uno en uno, con ensayos independientes.
    if(guestIds.length===0){
      const ordered=[...sensors].sort((a,b)=>a.x-b.x||a.y-b.y||byId(a,b));
      return {
        masterPointId:null,
        recommendedMasterPointId:proposed.id,
        masterScore:null,
        singleSensor:true,
        setups:ordered.map((p,index)=>({
          index:index+1,
          assignments:[{deviceId:hostId,pointId:p.id}],
          quality:null,
          measuredRunId:null,
          completedRunId:null
        })),
        activeIndex:null,
        selectedIndex:0,
        history:[]
      };
    }
    // Con dos o más acelerómetros conservamos SIN CAMBIOS el método
    // maestro fijo + participantes móviles.
    if(sensors.length<2)throw Error('Necesitas al menos dos puntos con sensor para generar setups.');
    const master=chooseMaster(plan,masterPointId);
    const other=sensors.filter(p=>p.id!==master.id);
    const count=Math.ceil(other.length/guestIds.length);
    if(count<1)throw Error('No hay sensores adicionales que repartir.');
    // Orden espacial estratificado. En la pasarela se usa la dirección
    // longitudinal; en paneles anchos, la dirección transversal.
    const primaryX=plan.length>=plan.width;
    const sorted=[...other].sort((a,b)=>
      primaryX?a.x-b.x||a.y-b.y||byId(a,b):a.y-b.y||a.x-b.x||byId(a,b));
    const groups=Array.from({length:count},()=>[]);
    sorted.forEach((p,i)=>groups[i%count].push(p));
    // Mejoras locales mediante intercambios: cada sensor aparece una sola
    // vez, se mantienen capacidades y mejora la distancia espacial mínima
    // dentro de cada setup (incluida la referencia M).
    const utility=group=>Math.log(.04+coverageQuality(group,master,plan));
    for(let pass=0;pass<4;pass++){
      let changed=false;
      for(let a=0;a<groups.length;a++)for(let b=a+1;b<groups.length;b++){
        const ga=groups[a],gb=groups[b];
        for(let i=0;i<ga.length;i++)for(let j=0;j<gb.length;j++){
          const prior=utility(ga)+utility(gb);
          const pa=ga[i],pb=gb[j];
          ga[i]=pb;gb[j]=pa;
          const after=utility(ga)+utility(gb);
          if(after>prior+1e-7){changed=true;}
          else{ga[i]=pa;gb[j]=pb;}
        }
      }
      if(!changed)break;
    }
    const setups=groups.map((points,index)=>{
      const inOrder=[...points].sort((a,b)=>a.x-b.x||a.y-b.y||byId(a,b));
      return {
        index:index+1,
        assignments:[{deviceId:hostId,pointId:master.id},
          ...inOrder.map((p,i)=>({deviceId:guestIds[i],pointId:p.id}))],
        quality:Number(coverageQuality(inOrder,master,plan).toFixed(4)),
        measuredRunId:null,
        completedRunId:null
      };
    });
    return {
      masterPointId:master.id,
      recommendedMasterPointId:proposed.id,
      masterScore:Number(modalScore(master,plan).toFixed(3)),
      setups,
      activeIndex:null,
      selectedIndex:0,
      history:[]
    };
  }
  function createController({s,$,escape,requireHostEdit,running,savePlan,tell,tab,renderDevices,confirmChange=()=>true}) {
    const peers=()=>[...s.peers.values()].filter(p=>p.channel?.readyState==='open');
    const connected=()=>[{id:s.id,name:s.name},...peers().map(p=>({id:p.id,name:p.name||'Participante'}))];
    // La planificación depende del plano y los moviles, no del identificador
    // de calibracion: permite proponer setups antes de sincronizar.
    const currentSignature=()=>signature(s.plan,s.id,peers().map(p=>p.id),null);
    const syncReady=()=>{
      if(s.role!=='host'||!s.calibration.complete)return false;
      const participants=peers();
      if(!participants.length)return true; // sin pares no hay relojes que sincronizar
      if(!s.syncCalibration.accepted)return false;
      const calibrated=(s.syncCalibration.peerIds||[]).slice().sort();
      return calibrated.length===participants.length&&
        calibrated.every((id,i)=>id===participants.map(p=>p.id).sort()[i]);
    };
    const currentValid=()=>{
      const plan=s.setupPlan;
      if(!plan||plan.signature!==currentSignature())return false;
      if(plan.activeIndex===null)return true;
      const applied=plan.setups[plan.activeIndex];
      if(!applied)return false;
      const expected=new Map(applied.assignments.map(a=>[a.pointId,a.deviceId]));
      // Si alguien cambia manualmente la asignación del plano, un setup
      // anterior deja de ser válido hasta que vuelva a aplicarse.
      return s.plan.points.filter(sensor).every(p=>
        (p.device||null)===(expected.get(p.id)||null));
    };
    // Cachear el marcado de los setups para que los mensajes STATUS no
    // reconstruyan la vista, provoquen parpadeos ni desplacen la página.
    function setMarkup(element,key,markup){
      const cache=s.setupMarkupCache||(s.setupMarkupCache={});
      if(cache[key]===markup)return;
      element.innerHTML=markup;
      cache[key]=markup;
    }
    function renderSetups(){
      const status=$('jointSetupStatus'),list=$('jointSetupList'),
        summary=$('jointSetupSummary'),preview=$('jointSetupPreview');
      const masterInput=$('jointSetupMaster'),generateButton=$('jointGenerateSetups');
      const applyButton=$('jointApplySetup'),measureButton=$('jointSetupToMeasure');
      const participants=peers();
      const available=s.plan.points.filter(sensor);
      const host=s.role==='host';
      const solo=participants.length===0;
      const ready=syncReady();
      const proposed=available.length?chooseMaster(s.plan).id:null;
      const previousChoice=s.setupMasterChoice;
      if(!available.some(p=>p.id===previousChoice))s.setupMasterChoice=proposed;
      const options=available.map(p=>
        '<option value="'+escape(p.id)+'">'+escape(p.id)+' · ('+p.x+', '+p.y+') m'+
        (p.id===proposed?' · recomendado':'')+'</option>').join('');
      setMarkup(masterInput,'options',options);
      masterInput.value=s.setupMasterChoice||'';
      $('jointSetupMasterField').hidden=solo;
      const hint=solo?
        'Con un solo acelerómetro se genera un setup por punto. Traslada el móvil entre ensayos; las medidas no son simultáneas.':
        'La propuesta automática estima la cobertura espacial; puedes modificar las asignaciones antes de activar cada setup. No garantiza identificar todos los modos.';
      if($('jointSetupAutoHint').textContent!==hint)
        $('jointSetupAutoHint').textContent=hint;
      $('jointSetupPhoneCount').textContent=String(1+participants.length);
      $('jointSetupSensorCount').textContent=String(available.length);
      masterInput.disabled=solo||!host||!!running()||!!s.transaction||!!s.run;
      generateButton.disabled=!host||available.length<(solo?1:2)||!!running()||!!s.transaction||!!s.run;
      const mode=solo?'auto':(s.setupMode||'auto');
      const manualMode=mode==='manual';
      $('jointSetupModeAuto').setAttribute('aria-pressed',String(!manualMode));
      $('jointSetupModeManual').setAttribute('aria-pressed',String(manualMode));
      $('jointSetupModeAuto').disabled=!host||!!running()||!!s.transaction||!!s.run;
      $('jointSetupModeManual').disabled=solo||!host||!!running()||!!s.transaction||!!s.run;
      $('jointSetupAutoControls').hidden=manualMode;
      $('jointSetupAutoHint').hidden=manualMode;
      $('jointSetupManualControls').hidden=!manualMode;
      $('jointSetupCreateManual').disabled=!host||!participants.length||available.length<2||
        !!running()||!!s.transaction||!!s.run;
      const manualChoices=peers().map((peer,i)=>{
        const value=s.manualGuestPoints?.[peer.id]||'';
        return '<label>'+escape(peer.name||'Móvil '+(i+1))+
          '<select data-manual-device="'+escape(peer.id)+'" aria-label="Punto manual de '+escape(peer.name||peer.id)+'">'+
          '<option value="">En espera</option>'+available.filter(p=>p.id!==s.setupMasterChoice).map(p=>
          '<option value="'+escape(p.id)+'"'+(p.id===value?' selected':'')+'>'+
          escape(p.id)+' · X '+p.x+' m</option>').join('')+'</select></label>';
      }).join('');
      setMarkup($('jointSetupManualAssignments'),'manual',manualChoices||
        '<p class="joint-help">El modo manual requiere varios acelerómetros. Con uno solo utiliza Propuestas automáticas y edita cada setup.</p>');
      const plan=s.setupPlan,valid=currentValid();
      const choseMaster=plan&&(plan.singleSensor||plan.masterPointId===s.setupMasterChoice);
      const fresh=valid&&choseMaster;
      const active=plan?.activeIndex;
      const index=Number.isInteger(plan?.selectedIndex)?plan.selectedIndex:0;
      const selected=fresh?plan.setups[index]:null;
      applyButton.disabled=!host||!ready||!fresh||!selected||!!running()||!!s.transaction||!!s.run;
      measureButton.disabled=!host||!ready||!fresh||active===null||
        active!==index||!!running()||!!s.transaction;
      if(!host){
        status.textContent='El maestro organiza los setups. Este móvil permanecerá en espera hasta que le asigne un punto.';
        summary.textContent='Tu punto se actualizará automáticamente al activar cada setup.';
        setMarkup(list,'list','');setMarkup(preview,'preview','');return;
      }
      if(solo)status.textContent=!available.length?'Añade puntos de medida en Plano.':
        !ready?'Puedes generar setups para un único acelerómetro. Calibra sus ejes antes de medir.':
        'Un único acelerómetro: el maestro se desplazará de un punto a otro entre setups.';
      else if(available.length<2)status.textContent='Añade al menos dos sensores en Plano.';
      else if(!ready)status.textContent='Puedes planificar ya los setups; para medir deberás completar la calibración y la sincronización.';
      else status.textContent='Móviles sincronizados. El maestro permanecerá fijo en todos los setups.';
      if(!plan){
        summary.textContent=solo?
          'Pulsa «Generar propuestas» para crear un setup por cada punto del plano.':
          manualMode?'Selecciona el punto fijo del maestro y asigna al menos un participante. Puedes crear los setups de uno en uno.':
          'Elige el maestro y pulsa «Generar propuestas». Después podrás editarlas.';
        setMarkup(list,'list','');setMarkup(preview,'preview','');
        $('jointSetupEditor').hidden=true;return;
      }
      if(!fresh){
        summary.textContent='El plano, los móviles o la referencia han cambiado. Genera una nueva planificación.';
        setMarkup(list,'list','');setMarkup(preview,'preview','');
        $('jointSetupEditor').hidden=true;return;
      }
      summary.textContent=plan.setups.length+' setups '+(plan.mode==='manual'?'manuales':'propuestos')+
        (plan.singleSensor?' · un acelerómetro móvil · ':' · maestro fijo en '+plan.masterPointId+' · ')+
        (plan.setups.filter(x=>x.completedRunId).length)+' completados. '+
        (!ready?'Termina la sincronización antes de activar uno.':'Selecciona uno para editarlo o medir.');
      const devices=new Map(connected().map((d,i)=>[d.id,{...d,code:i===0?'M':'S'+i}]));
      const points=new Map(s.plan.points.map(p=>[p.id,p]));
      if(selected){
        const previewMarkup=symbols.planSvg({
          plan:s.plan,assignments:selected.assignments,masterId:s.id,
          measured:symbols.measuredPoints(plan),escapeText:escape
        })+'<p>'+(plan.singleSensor?
          'Rojo: posición actual del único acelerómetro · Verde: puntos medidos · Gris: pendientes · Triángulos: apoyos.':
          'Rojo: maestro · Azul: esclavos activos · Verde: puntos ya medidos · Gris: pendientes · Triángulos: apoyos.')+'</p>';
        setMarkup(preview,'preview',previewMarkup);
      }else setMarkup(preview,'preview','');
      const canEdit=!!selected&&!selected.measuredRunId&&!s.run&&!running()&&!s.transaction;
      $('jointSetupEditor').hidden=!canEdit;
      $('jointSetupSaveEdit').disabled=!canEdit;
      const selectedByDevice=new Map(selected?.assignments.map(a=>[a.deviceId,a.pointId])||[]);
      const editorMarkup=plan.singleSensor?
        '<label>Punto del acelerómetro M'+
          '<select data-setup-edit-device="'+escape(s.id)+'" aria-label="Editar punto del único acelerómetro">'+
          available.map(p=>'<option value="'+escape(p.id)+'"'+
            (p.id===selectedByDevice.get(s.id)?' selected':'')+'>'+
            escape(p.id)+' · X '+p.x+' m</option>').join('')+'</select></label>':
        peers().map((peer,i)=>{
        const value=selectedByDevice.get(peer.id)||'';
        return '<label>'+escape(peer.name||'Participante '+(i+1))+
          '<select data-setup-edit-device="'+escape(peer.id)+'" aria-label="Editar punto de '+escape(peer.name||peer.id)+'">'+
          '<option value="">En espera</option>'+available.filter(p=>p.id!==plan.masterPointId).map(p=>
          '<option value="'+escape(p.id)+'"'+(p.id===value?' selected':'')+'>'+
          escape(p.id)+' · X '+p.x+' m</option>').join('')+'</select></label>';
      }).join('');
      setMarkup($('jointSetupEditAssignments'),'edit',editorMarkup);
      const signature=plan.setups.map((setup,i)=>{
        const isSelected=i===index,applied=i===active;
        const assignments=setup.assignments.map((entry,j)=>{
          const dev=devices.get(entry.deviceId),p=points.get(entry.pointId);
          return '<li><strong>'+escape(dev?.code||'?')+'</strong> · '+escape(p?.id||'?')+
            ' <small>('+p?.x+', '+p?.y+') m</small></li>';
        }).join('');
        const absent=participants.filter(p=>!setup.assignments.some(a=>a.deviceId===p.id));
        return '<article class="joint-setup-card'+(isSelected?' selected':'')+(applied?' active':'')+'">'+
            '<button type="button" class="joint-setup-select" data-setup-select="'+i+
            '" aria-pressed="'+isSelected+'"><strong>Setup '+(i+1)+'</strong><span>'+
            (applied?'Activo':setup.completedRunId&&setup.completedRunId===setup.measuredRunId?'Completado':setup.measuredRunId?'Registrado':'Seleccionar')+'</span></button>'+
            '<ul class="joint-setup-assignments">'+assignments+'</ul>'+
            (absent.length?'<p class="joint-help">En reposo: '+absent.map(d=>escape(devices.get(d.id)?.code)).join(', ')+'</p>':'')+
            (setup.measuredRunId?'<p class="joint-help">'+(setup.completedRunId===setup.measuredRunId?'Setup completado':'Ensayo registrado, pendiente de confirmar')+' · '+escape(setup.measuredRunId.slice(0,8))+'</p>':'')+
          '</article>';
      }).join('');
      setMarkup(list,'list',signature);
    }
    function generateSetups(){
      requireHostEdit();
      if(s.run)throw Error('Prepara un nuevo ensayo antes de generar los setups.');
      if(s.setupMode==='manual'&&peers().length)throw Error('Selecciona el modo automático para generar propuestas.');
      if(s.setupPlan?.setups.some(x=>x.measuredRunId||x.completedRunId))
        throw Error('Ya hay medidas registradas en esta campaña. No puedes reemplazar su planificación.');
      const guestIds=peers().map(p=>p.id);
      const plan=generate(s.plan,s.id,guestIds,s.setupMasterChoice);
      s.setupPlan={...plan,mode:'auto',signature:currentSignature()};
      s.setupMode='auto';
      renderSetups();
      tell(plan.setups.length+' setups generados. Revisa la distribución y activa el primero.');
      return plan;
    }
    function setSetupMode(mode){
      requireHostEdit();
      if(!['auto','manual'].includes(mode))throw Error('Modo de planificación desconocido.');
      if(mode==='manual'&&!peers().length)
        throw Error('Con un único acelerómetro utiliza Propuestas automáticas y edita cada setup.');
      if(s.run)throw Error('Prepara otro ensayo antes de cambiar el modo de planificación.');
      if(s.setupMode===mode)return;
      if(s.setupPlan){
        if(s.setupPlan.setups.some(x=>x.measuredRunId||x.completedRunId))
          throw Error('La campaña ya tiene ensayos. No se puede cambiar el modo sin perder su historial.');
        if(!confirmChange('Cambiar el modo sustituirá los setups sin medir. ¿Continuar?'))return;
        s.setupPlan=null;s.setupMarkupCache=null;
      }
      s.setupMode=mode;renderSetups();
    }
    function assignmentsFrom(containerAttribute){
      const entries=[{deviceId:s.id,pointId:s.setupMasterChoice}];
      const els=[...document.querySelectorAll('['+containerAttribute+']')];
      for(const element of els)if(element.value)
        entries.push({deviceId:element.getAttribute(containerAttribute),pointId:element.value});
      const sensorIds=new Set(s.plan.points.filter(sensor).map(p=>p.id));
      if(entries.length<2)throw Error('Asigna al menos un participante a un punto de medida.');
      if(!entries.every(e=>sensorIds.has(e.pointId)))throw Error('Alguno de los puntos ya no existe.');
      if(!unique(entries.map(e=>e.pointId)))throw Error('Cada móvil debe ocupar un punto diferente.');
      if(!unique(entries.map(e=>e.deviceId)))throw Error('Un móvil no puede tener dos puntos.');
      const devices=new Set(connected().map(d=>d.id));
      if(!entries.every(e=>devices.has(e.deviceId)))throw Error('Hay un móvil desconectado.');
      return entries;
    }
    function createManualSetup(){
      requireHostEdit();
      if(s.run)throw Error('Prepara otro ensayo antes de crear un setup.');
      if(s.setupMode!=='manual')throw Error('Selecciona el modo manual.');
      const entries=assignmentsFrom('data-manual-device');
      const master=chooseMaster(s.plan,s.setupMasterChoice);
      if(!s.setupPlan){
        s.setupPlan={masterPointId:master.id,recommendedMasterPointId:chooseMaster(s.plan).id,
          masterScore:Number(modalScore(master,s.plan).toFixed(3)),setups:[],
          activeIndex:null,selectedIndex:0,history:[],mode:'manual',signature:currentSignature()};
      }else if(s.setupPlan.mode!=='manual'||!currentValid()||s.setupPlan.masterPointId!==master.id)
        throw Error('La referencia o el plano ha cambiado. Crea una campaña manual nueva.');
      const setup={index:s.setupPlan.setups.length+1,assignments:entries,quality:null,
        measuredRunId:null,completedRunId:null};
      s.setupPlan.setups.push(setup);
      s.setupPlan.selectedIndex=setup.index-1;
      renderSetups();
      tell('Setup '+setup.index+' añadido. Puedes crear otro, editarlo o activarlo.');
    }
    function editSelectedSetup(){
      requireHostEdit();
      if(s.run)throw Error('Prepara otro ensayo antes de editar el setup.');
      const plan=s.setupPlan;
      if(!plan||!currentValid())throw Error('Genera primero una planificación válida.');
      const index=plan.selectedIndex,selected=plan.setups[index];
      if(!selected||selected.measuredRunId)throw Error('No puedes editar un setup que ya tiene un ensayo.');
      if(plan.masterPointId!==s.setupMasterChoice)throw Error('La referencia del maestro no coincide.');
      let entries;
      if(plan.singleSensor){
        const local=[...document.querySelectorAll('[data-setup-edit-device]')]
          .find(select=>select.getAttribute('data-setup-edit-device')===s.id);
        if(!local||!s.plan.points.some(p=>sensor(p)&&p.id===local.value))
          throw Error('Elige un punto de medida válido para el acelerómetro.');
        entries=[{deviceId:s.id,pointId:local.value}];
      }else{
        entries=assignmentsFrom('data-setup-edit-device');
      }
      selected.assignments=entries;
      selected.quality=null;
      if(plan.activeIndex===index)plan.activeIndex=null;
      renderSetups();
      tell('Setup '+selected.index+' actualizado. Actívalo de nuevo antes de medir.');
    }
    function selectSetup(index){
      if(!s.setupPlan||!currentValid())throw Error('Genera primero un plan de setups actualizado.');
      if(!Number.isInteger(index)||index<0||index>=s.setupPlan.setups.length)throw Error('Setup desconocido.');
      s.setupPlan.selectedIndex=index;renderSetups();
    }
    function applySetup(index=s.setupPlan?.selectedIndex){
      requireHostEdit();
      if(s.run)throw Error('Antes de cambiar de setup, descarga los resultados y pulsa «Preparar otro ensayo».');
      if(!syncReady()||!currentValid()||(!s.setupPlan?.singleSensor&&s.setupPlan?.masterPointId!==s.setupMasterChoice))
        throw Error('Los setups están desactualizados; vuelve a generarlos.');
      const setup=s.setupPlan?.setups?.[index];
      if(!setup)throw Error('Selecciona un setup válido.');
      const pointIds=new Set(s.plan.points.filter(sensor).map(p=>p.id));
      if(!setup.assignments.every(a=>pointIds.has(a.pointId)))throw Error('Los sensores han cambiado.');
      const ids=new Set(setup.assignments.map(a=>a.deviceId));
      if(!ids.has(s.id)||![...ids].every(id=>connected().some(d=>d.id===id)))
        throw Error('Falta un móvil conectado para activar este setup.');
      for(const p of s.plan.points)if(sensor(p))p.device=null;
      for(const entry of setup.assignments){
        const point=s.plan.points.find(p=>p.id===entry.pointId);
        point.device=entry.deviceId;
      }
      s.setupPlan.activeIndex=index;s.setupPlan.selectedIndex=index;
      savePlan();renderDevices();renderSetups();
      tell(s.setupPlan.singleSensor?
        'Setup '+(index+1)+' activado. Coloca el acelerómetro M en '+
          setup.assignments.find(a=>a.deviceId===s.id).pointId+' antes de medir.':
        'Setup '+(index+1)+' activado. Mantén M en '+s.setupPlan.masterPointId+
          ' y coloca los participantes en sus puntos antes de medir.');
    }
    function markMeasured(){
      const plan=s.setupPlan;
      if(!plan||!s.run?.finished||s.run.state!=='finished'||plan.activeIndex===null)return;
      const setup=plan.setups[plan.activeIndex];
      const measuredByMaster=setup?.assignments.find(a=>a.deviceId===s.id)?.pointId;
      if(setup&&measuredByMaster&&
          s.run.plan.points.some(p=>p.device===s.id&&p.id===measuredByMaster)){
        setup.measuredRunId=s.run.id;
        if(!Array.isArray(plan.history))plan.history=[];
        if(!plan.history.some(h=>h.runId===s.run.id))plan.history.push({
          index:setup.index,runId:s.run.id,finishedAt:new Date().toISOString(),completed:false
        });
        // Esperar la confirmacion del operador antes de pasar al siguiente.
      }
      if(!$('jointPanelSetups').hidden)renderSetups();
    }
    function confirmMeasured(){
      requireHostEdit();
      const plan=s.setupPlan,run=s.run;
      if(!plan||plan.activeIndex===null||!run?.finished||run.state!=='finished')
        throw Error('Termina primero un ensayo válido para confirmar el setup.');
      const setup=plan.setups[plan.activeIndex];
      if(!setup||setup.measuredRunId!==run.id||run.setup?.index!==setup.index)
        throw Error('El ensayo terminado no corresponde al setup activo.');
      const expected=[...new Set(run.plan.points.filter(p=>sensor(p)&&p.device).map(p=>p.device))];
      const missing=expected.filter(id=>!s.results.has(id));
      if(missing.length)throw Error('Faltan '+missing.length+' registros de móviles. Comprueba la transferencia en Resultados.');
      setup.completedRunId=run.id;
      const attempt=plan.history?.find(h=>h.runId===run.id);
      if(attempt)attempt.completed=true;
      const next=plan.setups.findIndex(x=>!x.completedRunId);
      if(next>=0)plan.selectedIndex=next;
      renderSetups();
      tell('Setup '+setup.index+' completado. Puedes preparar el siguiente ensayo.');
    }
    return Object.freeze({
      renderSetups,generateSetups,createManualSetup,setSetupMode,editSelectedSetup,selectSetup,applySetup,markMeasured,confirmMeasured,
      syncReady,currentValid,currentSignature
    });
  }
  const api=Object.freeze({modalScore,chooseMaster,spreadDistance,coverageQuality,
    signature,generate,createController});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMASetupPlanner=api;
})(globalThis);
