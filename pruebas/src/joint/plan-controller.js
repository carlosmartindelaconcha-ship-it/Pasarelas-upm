/* VWOMA | Plane, point-table and bridge geometry controller.
 * Extracted without altering the plan gestures, point-deletion animation or SVG rendering.
 * Explicit application dependencies are injected by src/joint/joint-app.js.
 */
(function registerPlanController(root) {
    'use strict';
    function createController({ s, finite, MAX_POINTS, running, $, tell, broadcast, escape, requireHostEdit, renderDevices, storageKey='upm-joint-plan-v1' }) {
    function checkPlan(plan) {
        if (!plan || !finite(plan.length) || !finite(plan.width) || plan.length<.1 || plan.width<.1 || plan.length>10000 || plan.width>10000 || !Array.isArray(plan.points) || plan.points.length>MAX_POINTS) throw Error('Plano no válido: revisa dimensiones y puntos.');
        const ids=new Set(), devices=new Set();
        const points=plan.points.map(p=>{
            if (!p || typeof p.id!=='string' || p.id.length>80 || ids.has(p.id) || !finite(p.x) || !finite(p.y) || p.x<0 || p.x>plan.length || p.y<0 || p.y>plan.width || !['x','y','z'].includes(p.axis) || !finite(p.angle) || Math.abs(p.angle)>360) throw Error('Coordenadas, eje u orientación del plano no válidos.');
            // Planos históricos (sin kind) mantienen TODOS sus puntos como sensores.
            const kind=p.kind==null?'sensor':p.kind;
            if(!['sensor','support','interpolation'].includes(kind))throw Error('Tipo de punto del plano no válido.');
            ids.add(p.id);
            const device=kind==='sensor'&&typeof p.device==='string'&&p.device?p.device:null;
            if(device&&devices.has(device))throw Error('Un móvil no puede estar asignado a dos puntos a la vez.');
            if(device)devices.add(device);
            // φ=0 es una condición de contorno, no una medida sintética.
            return {id:p.id,name:String(p.name||p.id).slice(0,40),x:p.x,y:p.y,axis:p.axis,angle:p.angle,kind,
                modalCoordinate:kind==='support'?0:null,device};
        });
        return {length:plan.length,width:plan.width,name:String(plan.name||'Ensayo multipunto').slice(0,80),points};
    }
    function savePlan(render=true) {
        s.plan=checkPlan(s.plan);
        s.interpolationSuggestions=[];
        try {localStorage.setItem(storageKey,JSON.stringify({...s.plan,points:s.plan.points.map(p=>({...p,device:null}))}));} catch(e){tell('Plano en memoria. No se ha podido guardar en este navegador.',true);}
        broadcast({type:'PLAN',plan:s.plan}); if(render)renderPlan();
    }
    function pointFor(device=s.id, plan=s.plan) {return plan.points.find(p=>(p.kind||'sensor')==='sensor'&&p.device===device);}
    function deviceName(id) {return id===s.id?s.name:(s.peers.get(id)?.name||'Sin conectar');}
    function deviceCode(id) {
        if(!id)return '';
        if(s.role==='host') {if(id===s.id)return 'M';const index=[...s.peers.keys()].indexOf(id);return index>=0?'S'+(index+1):'S?';}
        return id===s.id?'S1':'M';
    }
    function planViewport(candidate=s.planView) {
        const L=s.plan.length,W=s.plan.width;
        const base=candidate||{x:0,y:0,w:L,h:W};
        // Un único factor de zoom en X/Y: no deformar la pasarela.
        const factor=Math.max(1/200,Math.min(1,Math.min(base.w/L,base.h/W)));
        const w=L*factor,h=W*factor;
        return {x:Math.max(0,Math.min(L-w,base.x+(base.w-w)/2)),
                y:Math.max(0,Math.min(W-h,base.y+(base.h-h)/2)),w,h};
    }
    function geometry(view=planViewport()) {
        // El marco es una ventana fija; el tablero se amplía y se recorta dentro.
        // Dos coordenadas de origen independientes del tamaño físico del tablero.
        const left=54,top=46,w=660,h=320;
        const scale=Math.min(w/view.w,h/view.h);
        const centerX=view.x+view.w/2,centerY=view.y+view.h/2;
        return {view,scale,left,top,w,h,
            originX:left+w/2-centerX*scale,
            originY:top+h/2+centerY*scale};
    }
    function niceMetricStep(minimum) {
        const power=10**Math.floor(Math.log10(Math.max(.000001,minimum))),scaled=minimum/power;
        return (scaled<=1?1:scaled<=2?2:scaled<=5?5:10)*power;
    }
    function planGridStep(g) {
        // Rejilla principal cada metro en planos normales. Si 1 m ocupa
        // menos de 5 px se agrupa adaptativamente para no dibujar miles de líneas.
        return Math.max(1,niceMetricStep(6/g.scale));
    }
    function planLabelStep(g) {return niceMetricStep(60/g.scale);}
    function snapPlanPosition(position) {
        // Cuadrícula de 0,1 m: redondear SIN desplazar las esquinas 0 y L/W.
        const snap=v=>Math.round(v*10)/10;
        return {x:Math.max(0,Math.min(s.plan.length,snap(position.x))),
                y:Math.max(0,Math.min(s.plan.width,snap(position.y)))};
    }
    function pointAtPlanEdge(position,tolerancePx=18) {
        if(!position||!finite(position.x)||!finite(position.y))return null;
        const g=geometry(),epsilon=tolerancePx/g.scale;
        if(position.x< -epsilon||position.x>s.plan.length+epsilon||
           position.y< -epsilon||position.y>s.plan.width+epsilon)return null;
        return {x:Math.max(0,Math.min(s.plan.length,position.x)),
                y:Math.max(0,Math.min(s.plan.width,position.y))};
    }
    function resetPlanView() {s.planView=null;s.planPan=null;s.planPinch=null;renderPlan();}
    // Los móviles y sus nombres crecen suavemente con el zoom, sin superar el 150 %.
    // 1x: 100 %, 2x: 120 %, 4x: 140 %, 8x o superior: 150 %.
    // Los números de los ejes pertenecen al visor y mantienen su tamaño.
    function planPointScale(view=planViewport()) {
        const zoom=Math.max(1,s.plan.length/view.w);
        return zoom<=4?1+.2*Math.log2(zoom):Math.min(1.5,1.4+.1*Math.log2(zoom/4));
    }
    // La etiqueta se sitúa preferentemente junto al punto, pero siempre
    // dentro de la ventana del plano. En el borde derecho cambia de lado
    // y en el superior/inferior se desplaza hacia el interior.
    function pointLabelPlacement(x,y,pointId,placedLabels,markerScale=1,g=geometry()) {
        const labelWidth=Math.max(32,String(pointId).length*15)*markerScale;
        const margin=7;
        const left=g.left+margin,right=g.left+g.w-margin;
        const top=g.top+margin,bottom=g.top+g.h-margin;
        const labelHeight=25*markerScale;
        const baselineMin=top+labelHeight,baselineMax=bottom-4;
        // Etiquetas hacia la derecha o izquierda del marcador.
        const options=[{side:'right',x:x+13*markerScale,anchor:'start'},
                       {side:'left',x:x-13*markerScale,anchor:'end'}];
        let best=null,bestPenalty=Infinity;
        const offsets=[0,-1,1,-2,2,-3,3,-4,4];
        for(const option of options){
            let lx=option.x;
            // En un apoyo situado en esquina la etiqueta se mantiene visible.
            lx=option.anchor==='start'?
                Math.max(left,Math.min(right-labelWidth,lx)):
                Math.max(left+labelWidth,Math.min(right,lx));
            const l=option.anchor==='start'?lx:lx-labelWidth;
            const rr=l+labelWidth;
            for(const offset of offsets){
                const ideal=y-8*markerScale+offset*29*markerScale;
                const by=Math.max(baselineMin,Math.min(baselineMax,ideal));
                const box={left:l,top:by-labelHeight,right:rr,bottom:by+4*markerScale};
                const overlap=placedLabels.reduce((count,prev)=>
                    count+(box.left<prev.right+4&&box.right+4>prev.left&&box.top<prev.bottom+4&&box.bottom+4>prev.top?1:0),0);
                const anchorPenalty=option.side==='right'?0:3;
                const sidePenalty=(option.side==='right'&&x+13*markerScale+labelWidth>right?22:0)+
                                  (option.side==='left'&&x-13*markerScale-labelWidth<left?22:0);
                const shiftPenalty=Math.abs(by-ideal)*.06+Math.abs(lx-option.x)*.08;
                const penalty=overlap*150+anchorPenalty+sidePenalty+shiftPenalty;
                if(penalty<bestPenalty){bestPenalty=penalty;best={x:lx,y:by,anchor:option.anchor,box};}
            }
        }
        if(!best)return{x:Math.min(right,Math.max(left,x)),y:Math.min(bottom,Math.max(top,y)),anchor:'middle'};
        placedLabels.push(best.box);
        return{x:best.x,y:best.y,anchor:best.anchor};
    }
    const POINT_TYPES=Object.freeze({support:'Apoyos',sensor:'Sensores',interpolation:'Interpolación'});
    const pointKind=p=>p.kind||'sensor';
    const planFilter=()=>POINT_TYPES[s.planFilter]?s.planFilter:'support';
    const filteredPoints=()=>s.plan.points.filter(p=>pointKind(p)===planFilter());
    // Proponer coordenadas, no amplitudes modales: subdividir primero los
    // mayores huecos espaciales entre apoyos y sensores (más puntos ya dados).
    // Se usan las coordenadas de todos los puntos para evitar duplicados.
    function calculateInterpolationCandidates(){
        const anchors=s.plan.points.filter(p=>pointKind(p)!=='interpolation')
            .map(p=>({x:p.x,y:p.y}))
            .sort((a,b)=>a.x-b.x||a.y-b.y);
        const capacity=Math.min(10,MAX_POINTS-s.plan.points.length);
        const hasSupport=s.plan.points.some(p=>pointKind(p)==='support');
        const hasSensor=s.plan.points.some(p=>pointKind(p)==='sensor');
        if(anchors.length<2||!hasSupport||!hasSensor||capacity<=0)return [];
        // En un vano convencional los puntos suelen compartir alineación Y.
        // Para un trazado oblicuo se usa interpolación lineal de Y entre anclas.
        const ordered=s.plan.points.map(p=>({x:p.x,y:p.y})).sort((a,b)=>a.x-b.x||a.y-b.y);
        const segments=[];
        for(let i=1;i<ordered.length;i++){
            const a=ordered[i-1],b=ordered[i];
            if(b.x-a.x>=.25)segments.push({a,b});
        }
        const proposed=[],target=Math.max(.25,s.plan.length/9);
        const exists=p=>[...s.plan.points,...proposed].some(q=>Math.hypot(q.x-p.x,q.y-p.y)<.16);
        for(let i=0;i<capacity;i++){
            segments.sort((u,v)=>(v.b.x-v.a.x)-(u.b.x-u.a.x));
            const seg=segments.shift();
            if(!seg||seg.b.x-seg.a.x<=target)break;
            const p=snapPlanPosition({x:(seg.a.x+seg.b.x)/2,y:(seg.a.y+seg.b.y)/2});
            if(!exists(p)&&p.x>0&&p.x<s.plan.length)proposed.push(p);
            const dx1=p.x-seg.a.x,dx2=seg.b.x-p.x;
            if(dx1>=.25)segments.push({a:seg.a,b:p});
            if(dx2>=.25)segments.push({a:p,b:seg.b});
        }
        return proposed;
    }
    function proposeInterpolation(){
        requireHostEdit();
        s.interpolationSuggestions=calculateInterpolationCandidates();
        renderPlan();
        if(!s.interpolationSuggestions.length){
            tell('No hay nuevos puntos que proponer. Revisa los apoyos y sensores o amplía su separación.');
        }
    }
    function discardInterpolation(){
        s.interpolationSuggestions=[];
        renderPlan();
    }
    function acceptInterpolation(){
        requireHostEdit();
        const candidates=s.interpolationSuggestions||[];
        if(!candidates.length)return;
        const reserved=new Set(s.plan.points.map(p=>p.id));
        let last=null;
        for(const position of candidates){
            if(s.plan.points.length>=MAX_POINTS)break;
            let n=1;while(reserved.has('I'+n))n++;
            const id='I'+n;reserved.add(id);
            s.plan.points.push({id,name:id,x:position.x,y:position.y,kind:'interpolation',
                axis:'z',angle:0,modalCoordinate:null,device:null});
            last=id;
        }
        s.interpolationSuggestions=[];
        if(last)s.selected=last;
        savePlan();
    }
    function setPlanFilter(filter) {
        if(!POINT_TYPES[filter])throw Error('Vista de puntos desconocida.');
        if(planFilter()===filter)return;
        s.planFilter=filter;
        s.interpolationSuggestions=filter==='interpolation'&&s.role==='host'?calculateInterpolationCandidates():[];
        const visible=filteredPoints();
        if(!visible.some(p=>p.id===s.selected))s.selected=visible[0]?.id||null;
        s.lastPlanTap=null;
        renderPlan();
    }
    function renderPlan() {
        const edit=s.role==='host'&&!running()&&!s.transaction;
        $('jointGeometry').disabled=!edit;
        $('jointPlanTools').hidden=s.role!=='host';
        for(const id of ['jointAddPointInline','jointRemovePoint','jointResetView']) $(id).disabled=!edit;
        $('jointName').value=s.plan.name; $('jointLength').value=s.plan.length; $('jointWidth').value=s.plan.width;
        const visible=filteredPoints(),filter=planFilter();
        if(s.selected&&!visible.some(p=>p.id===s.selected))s.selected=visible[0]?.id||null;
        $('jointRemovePoint').disabled=!edit||!s.selected;
        for(const button of document.querySelectorAll('#jointPointFilters [data-point-filter]')){
            const selected=button.dataset.pointFilter===filter;
            if(button.getAttribute('aria-pressed')!==String(selected))button.setAttribute('aria-pressed',String(selected));
        }
        const headings={support:['Apoyos','Paso 1 de 3 · Sitúa los apoyos (φ = 0).'],
            sensor:['Sensores','Paso 2 de 3 · Edita las coordenadas y asigna los móviles.'],
            interpolation:['Interpolación','Paso 3 de 3 · Define las posiciones donde evaluar el modo.']};
        const title=$('jointPointsTitle'),help=$('jointPointTableHelp'),heading=$('jointPointTableFunction');
        const titleText=headings[filter][0],helpText=headings[filter][1]+' Desliza una fila a la izquierda para eliminar.';
        const headingText=filter==='sensor'?'Móvil':filter==='support'?'Condición':'Estado';
        if(title.textContent!==titleText)title.textContent=titleText;
        if(help.textContent!==helpText)help.textContent=helpText;
        if(heading.textContent!==headingText)heading.textContent=headingText;
        const addKind=filter;
        const addButton=$('jointAddPointInline'),addLabel='Añadir '+({sensor:'sensor',support:'apoyo',interpolation:'interpolación'}[addKind]);
        if(addButton.textContent!==addLabel)addButton.textContent=addLabel;
        if(addButton.hidden)addButton.hidden=false;
        const proposal=$('jointInterpolationProposal'),isInterpolation=filter==='interpolation';
        if(proposal.hidden===isInterpolation)proposal.hidden=!isInterpolation;
        const suggestions=s.interpolationSuggestions||[];
        $('jointSuggestInterpolation').disabled=!edit;
        $('jointAcceptInterpolation').hidden=!edit||suggestions.length===0;
        $('jointDiscardInterpolation').hidden=!edit||suggestions.length===0;
        const proposalText=suggestions.length?
            suggestions.length+' ubicaciones propuestas (círculos discontinuos). Revisa el plano antes de añadirlas.':
            'Para proponer posiciones, define primero al menos un apoyo y un sensor. Las sugerencias no calculan el modo.';
        const message=$('jointProposalMessage');if(message.textContent!==proposalText)message.textContent=proposalText;
        const view=planViewport(),g=geometry(view),gridStep=planGridStep(g),labelStep=planLabelStep(g);
        const deckX=g.originX,deckY=g.originY-s.plan.width*g.scale;
        const deckW=s.plan.length*g.scale,deckH=s.plan.width*g.scale;
        // El rectángulo de visualización permanece siempre fijo: zoom/pan mueven
        // únicamente el tablero, no redibujan el marco con la silueta inicial.
        let svg=`<title>Planta de ${escape(s.plan.name)}</title>
            <defs><clipPath id="jointPlanViewportClip"><rect x="${g.left}" y="${g.top}" width="${g.w}" height="${g.h}" rx="4"/></clipPath></defs>
            <rect x="${g.left}" y="${g.top}" width="${g.w}" height="${g.h}" rx="4" fill="#f8fbfd" stroke="#a9bfd1" stroke-width="1.5"/>
            <g clip-path="url(#jointPlanViewportClip)">
                <rect x="${deckX}" y="${deckY}" width="${deckW}" height="${deckH}" fill="#edf4f9" stroke="#698ba6" stroke-width="2"/>`;
        const minX=Math.max(0,(g.left-g.originX)/g.scale),maxX=Math.min(s.plan.length,(g.left+g.w-g.originX)/g.scale);
        const minY=Math.max(0,(g.originY-g.top-g.h)/g.scale),maxY=Math.min(s.plan.width,(g.originY-g.top)/g.scale);
        const xTicks=[],yTicks=[];
        // Rejilla decimétrica fina, a trazos, solo cuando la separación
        // de 0,1 m alcanza 6 px y resulta legible.
        const showDecimals=g.scale*.1>=6;
        if(showDecimals){
            const decimalStep=.1;
            const lineLimit=1600;
            const nx=Math.ceil((maxX-minX)/decimalStep),ny=Math.ceil((maxY-minY)/decimalStep);
            if(nx+ny<lineLimit){
                for(let i=Math.ceil(minX/decimalStep-1e-7);i<=Math.floor(maxX/decimalStep+1e-7);i++){
                    if(i%10===0)continue;
                    const x=i*decimalStep,sx=g.originX+x*g.scale;
                    svg+=`<line x1="${sx}" y1="${deckY}" x2="${sx}" y2="${deckY+deckH}" stroke="#aebfce" stroke-width=".7" stroke-dasharray="2 3" opacity=".65"/>`;
                }
                for(let i=Math.ceil(minY/decimalStep-1e-7);i<=Math.floor(maxY/decimalStep+1e-7);i++){
                    if(i%10===0)continue;
                    const y=i*decimalStep,sy=g.originY-y*g.scale;
                    svg+=`<line x1="${deckX}" y1="${sy}" x2="${deckX+deckW}" y2="${sy}" stroke="#aebfce" stroke-width=".7" stroke-dasharray="2 3" opacity=".65"/>`;
                }
            }
        }
        // La retícula principal es métrica y de trazo más fuerte; sus cifras
        // se etiquetan con un paso independiente para evitar solapamientos.
        const makeTick=(v,step)=>Math.abs(v/step-Math.round(v/step))<1e-6;
        for(let i=Math.ceil(minX/gridStep-1e-7);i<=Math.floor(maxX/gridStep+1e-7);i++){
            const x=Number((i*gridStep).toFixed(6)),sx=g.originX+x*g.scale;
            svg+=`<line x1="${sx}" y1="${deckY}" x2="${sx}" y2="${deckY+deckH}" stroke="#90a9bf" stroke-width="1.4"/>`;
        }
        for(let i=Math.ceil(minY/gridStep-1e-7);i<=Math.floor(maxY/gridStep+1e-7);i++){
            const y=Number((i*gridStep).toFixed(6)),sy=g.originY-y*g.scale;
            svg+=`<line x1="${deckX}" y1="${sy}" x2="${deckX+deckW}" y2="${sy}" stroke="#90a9bf" stroke-width="1.4"/>`;
        }
        for(let i=Math.ceil(minX/labelStep-1e-7);i<=Math.floor(maxX/labelStep+1e-7);i++){
            const x=Number((i*labelStep).toFixed(3));
            xTicks.push({value:x,pixel:g.originX+x*g.scale});
        }
        for(let i=Math.ceil(minY/labelStep-1e-7);i<=Math.floor(maxY/labelStep+1e-7);i++){
            const y=Number((i*labelStep).toFixed(3));
            yTicks.push({value:y,pixel:g.originY-y*g.scale});
        }
        svg+='</g>';
        for(const tick of xTicks)svg+=`<line x1="${tick.pixel}" y1="${g.top+g.h}" x2="${tick.pixel}" y2="${g.top+g.h+6}" stroke="#698ba6"/><text class="joint-plan-tick" x="${tick.pixel}" y="${g.top+g.h+25}" text-anchor="middle">${tick.value}</text>`;
        for(const tick of yTicks)svg+=`<line x1="${g.left-6}" y1="${tick.pixel}" x2="${g.left}" y2="${tick.pixel}" stroke="#698ba6"/><text class="joint-plan-tick" x="${g.left-11}" y="${tick.pixel+7}" text-anchor="end">${tick.value}</text>`;
        svg+=`<text class="joint-plan-axis" x="${g.left+g.w/2}" y="${g.top+g.h+62}" text-anchor="middle">X (m)</text><text class="joint-plan-axis" x="${g.left}" y="${g.top-12}">Y (m)</text>`;
        const markerScale=planPointScale(view),placedLabels=[];
        for(const p of visible) {
            const x=g.originX+p.x*g.scale,y=g.originY-p.y*g.scale;
            // Los marcadores que quedan fuera del visor no se dibujan. Los que
            // están sobre los bordes permanecen completos y seleccionables.
            if(x<g.left-1e-7||x>g.left+g.w+1e-7||y<g.top-1e-7||y>g.top+g.h+1e-7)continue;
            const kind=pointKind(p);
            const phoneColor=p.device===s.id?'#467c9f':p.device?'#548d85':'#7f8fa1';
            const label=pointLabelPlacement(x,y,p.id,placedLabels,markerScale,g);
            const description=kind==='sensor'?(p.device?deviceName(p.device):'Sensor sin asignar'):
                kind==='support'?'Apoyo · φ = 0':'Punto de interpolación';
            // Los tres símbolos comparten centro geométrico y hitbox; el teléfono
            // conserva exactamente el SVG anterior.
            const marker=kind==='sensor'?`<g class="joint-phone-marker" transform="translate(${x} ${y}) scale(${markerScale}) rotate(${-p.angle})">
                    <rect class="joint-phone-body" x="-9.5" y="-14" width="19" height="28" rx="3.6" fill="${phoneColor}"/>
                    <rect x="-6.1" y="-10.2" width="12.2" height="18.3" rx="1.7" fill="#edf4f9"/>
                    <path d="M -2.5 -11.8 H 2.5" fill="none" stroke="#e7edf3" stroke-width="1" stroke-linecap="round"/>
                    <circle cx="0" cy="10.9" r="1.2" fill="#e2eaf1"/>
                    <path d="M 9.5 3 H 22 M 22 3 L 17.5 -1 M 22 3 L 17.5 7" fill="none" stroke="#1766d6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M 0 -14 V -24 M 0 -24 L -4 -19 M 0 -24 L 4 -19" fill="none" stroke="#d94751" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="0" cy="-1" r="4.2" fill="#20a567" stroke="#fff" stroke-width="1.2"/>
                    <circle cx="0" cy="-1" r="1.25" fill="#effff6"/>
                </g>`:kind==='support'?`<g class="joint-support-marker" transform="translate(${x} ${y}) scale(${markerScale})">
                    <path d="M 0 -11 L -12 10 L 12 10 Z" fill="#f6e6d5" stroke="#a9602b" stroke-width="2.5" stroke-linejoin="round"/>
                    <path d="M -16 13 H 16 M -13 13 l -4 5 M -5 13 l -4 5 M 3 13 l -4 5 M 11 13 l -4 5" fill="none" stroke="#a9602b" stroke-width="1.8" stroke-linecap="round"/>
                    <circle cx="0" cy="-11" r="2.1" fill="#a9602b"/>
                </g>`:`<g class="joint-interpolation-marker" transform="translate(${x} ${y}) scale(${markerScale})">
                    <circle cx="0" cy="0" r="10.5" fill="#fff" stroke="#7b58b7" stroke-width="3.2"/>
                </g>`;
            svg+=`<g class="joint-point joint-point-${kind} ${p.id===s.selected?'selected':''}" data-point="${escape(p.id)}" tabindex="0" role="button" aria-label="${escape(p.id)}, ${escape(description)}, X ${p.x}, Y ${p.y}">
                <title>${escape(p.id)} · ${escape(description)}</title>
                <circle class="joint-point-hitbox" cx="${x}" cy="${y}" r="${27*markerScale}"/>
                ${marker}
                <text class="joint-point-label" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" style="font-size:${24*markerScale}px">${escape(p.id)}</text>
            </g>`;
        }
        if(filter==='interpolation'&&(s.interpolationSuggestions||[]).length){
            for(const p of s.interpolationSuggestions){
                const sx=g.originX+p.x*g.scale,sy=g.originY-p.y*g.scale;
                if(sx<g.left||sx>g.left+g.w||sy<g.top||sy>g.top+g.h)continue;
                svg+=`<g class="joint-interpolation-proposed" aria-hidden="true" pointer-events="none">
                    <circle cx="${sx}" cy="${sy}" r="${11*markerScale}" fill="rgba(123,88,183,.12)" stroke="#7b58b7" stroke-width="2.5" stroke-dasharray="4 3"/>
                    <path d="M ${sx-4} ${sy} H ${sx+4} M ${sx} ${sy-4} V ${sy+4}" stroke="#7b58b7" stroke-width="1.5"/>
                </g>`;
            }
        }
        $('jointPlan').innerHTML=svg;
        $('jointPlanHelp').textContent=s.role==='host'?
            'Doble toque: añadir '+({support:'apoyo',sensor:'sensor',interpolation:'interpolación'}[filter])+'. Arrastra: mover. Pellizca: ampliar hasta 200×. Bordes accesibles. Rejilla de 1 m y 0,1 m al ampliar.':
            'El maestro edita el plano. Selecciona una categoría para consultar sus puntos.';
        const devices=[{id:s.id,name:s.name},...s.peers.values()].filter(p=>p.name);
        const deviceOptions=devices.map(d=>`<option value="${escape(d.id)}">${deviceCode(d.id)}</option>`).join('');
        // Se conserva EXACTAMENTE la estructura de fila/deslizamiento/papelera;
        // solo cambia el contenido de su cuarta columna según la clase.
        $('jointPointsTable').innerHTML=visible.map(p=>{
            const kind=pointKind(p),assigned=!!p.device;
            const lastColumn=kind==='sensor'?
                `<label><span>Sensor</span><select data-point-field="device" aria-label="Móvil asignado a ${escape(p.id)}" ${edit?'':'disabled'}><option value="">—</option>${deviceOptions}</select></label>`:
                `<div class="joint-point-static-cell ${kind}" aria-label="${kind==='support'?'Coordenada modal nula':'Pendiente de interpolación'}">${kind==='support'?'φ = 0':'Por interpolar'}</div>`;
            const pointClass=kind==='sensor'?(assigned?'assigned':'unassigned'):kind==='support'?'support':'interpolation';
            return `<tr class="joint-point-record" data-point-id="${escape(p.id)}"><td colspan="4" class="joint-point-table-cell"><div class="joint-point-swipe"><div class="joint-point-row" data-point-id="${escape(p.id)}"><div class="joint-point-code ${pointClass}">${escape(p.id)}</div><label><span>X (m)</span><input data-point-field="x" type="number" inputmode="decimal" step="0.001" min="0" max="${s.plan.length}" value="${p.x}" aria-label="Coordenada X de ${escape(p.id)}" ${edit?'':'disabled'}></label><label><span>Y (m)</span><input data-point-field="y" type="number" inputmode="decimal" step="0.001" min="0" max="${s.plan.width}" value="${p.y}" aria-label="Coordenada Y de ${escape(p.id)}" ${edit?'':'disabled'}></label>${lastColumn}</div><button type="button" class="joint-point-delete" tabindex="-1" data-delete-point="${escape(p.id)}" aria-label="Eliminar ${escape(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button></div></td></tr>`;
        }).join('');
        for(const p of visible){
            if(pointKind(p)!=='sensor')continue;
            const select=$('jointPointsTable').querySelector(`[data-point-id="${CSS.escape(p.id)}"] select[data-point-field="device"]`);
            if(select)select.value=p.device||'';
        }
        $('jointMyPoint').textContent=pointFor()?.name||'Sin asignar';
    }
    function svgPosition(e) {
        const svg=$('jointPlan'), matrix=svg.getScreenCTM(); if(!matrix) return null;
        const q=new DOMPoint(e.clientX,e.clientY).matrixTransform(matrix.inverse()),g=geometry();
        return {x:(q.x-g.originX)/g.scale,y:(g.originY-q.y)/g.scale};
    }
    function zoomPlanAt(position,factor,base=planViewport()) {
        const w=base.w*factor,h=base.h*factor;
        s.planView=planViewport({x:position.x-(position.x-base.x)*(w/base.w),y:position.y-(position.y-base.y)*(h/base.h),w,h});
    }
    // Colocación automática: 7 posiciones longitudinales en el centro, borde Y=0 y borde Y=anchura.
    // Las filas adicionales (a partir de P22) utilizan bandas interiores sin superponerse.
    const pointXFractions=[1/2,1/4,3/4,1/6,5/6,3/8,5/8];
    const pointYFractions=[1/2,0,1,1/4,3/4,1/8,7/8,3/8,5/8,1/16];
    function suggestedPointPosition(number) {
        const index=number-1,band=Math.floor(index/pointXFractions.length);
        const xFraction=pointXFractions[index%pointXFractions.length];
        const yFraction=pointYFractions[band]??1/2;
        const x=Number((s.plan.length*xFraction).toFixed(3));
        // En los bordes se conservan los valores exactos Y=0 e Y=anchura.
        const y=band===1?0:band===2?s.plan.width:Number((s.plan.width*yFraction).toFixed(3));
        return {x,y};
    }
    function addPoint(x,y) {
        requireHostEdit();
        if(s.plan.points.length>=MAX_POINTS)throw Error('Máximo 64 puntos por plano.');
        const kind=planFilter();
        const prefix={sensor:'S',support:'A',interpolation:'I'}[kind];
        let n=1;while(s.plan.points.some(p=>p.id===prefix+n))n++;
        let position;
        if(x===undefined&&y===undefined){
            if(kind==='support'){
                const anchors=[{x:0,y:0},{x:s.plan.length,y:0},
                    {x:0,y:s.plan.width},{x:s.plan.length,y:s.plan.width},
                    {x:s.plan.length/2,y:0},{x:s.plan.length/2,y:s.plan.width}];
                position=anchors.find(candidate=>!s.plan.points.some(p=>pointKind(p)==='support'&&
                    Math.hypot(p.x-candidate.x,p.y-candidate.y)<.15))||
                    {x:s.plan.length/2,y:s.plan.width/2};
            }else{
                let i=1;
                position=suggestedPointPosition(i);
                while(i<MAX_POINTS&&s.plan.points.some(p=>Math.abs(p.x-position.x)<1e-6&&Math.abs(p.y-position.y)<1e-6)){
                    position=suggestedPointPosition(++i);
                }
            }
        }else position=snapPlanPosition({x,y});
        const id=prefix+n;
        const p={id,name:id,x:position.x,y:position.y,angle:0,axis:'z',kind,modalCoordinate:kind==='support'?0:null,device:null};
        s.plan.points.push(p);s.selected=p.id;savePlan();
    }
    function updatePlanPoint(id, field, value) {
        requireHostEdit(); const original=s.plan.points.find(p=>p.id===id); if(!original) throw Error('El punto ya no existe.');
        let next=value;
        if(field==='name') next=String(value).trim().slice(0,40)||original.id;
        if(field==='x'||field==='y') {next=Number(Number(value).toFixed(3));if(!finite(next)) throw Error('Introduce una coordenada válida en metros.');}
        if(field==='device'){if(pointKind(original)!=='sensor')throw Error('Solo los sensores se asignan a móviles.');next=value||null;}
        if(field==='axis'&&!['x','y','z'].includes(value)) throw Error('Eje no válido.');
        if(field==='device'&&next&&s.plan.points.some(p=>p.id!==id&&p.device===next)) throw Error('Ese móvil ya está asignado a otro punto.');
        const candidate={...original,[field]:next};
        s.plan=checkPlan({...s.plan,points:s.plan.points.map(p=>p.id===id?candidate:p)}); savePlan(); renderDevices();
    }
    function deletePlanPoint(id, animate=true, exitLeft=true) {
        requireHostEdit();
        const point=s.plan.points.find(p=>p.id===id);
        if(!point)return;
        const record=$('jointPointsTable').querySelector(`[data-point-id="${CSS.escape(id)}"]`);
        const swipe=record?.querySelector('.joint-point-swipe');
        const remove=()=>{
            if(!s.plan.points.some(p=>p.id===id))return;
            s.plan.points=s.plan.points.filter(p=>p.id!==id);
            if(s.selected===id)s.selected=filteredPoints()[0]?.id||null;
            savePlan(false);
            record?.remove();
            $('jointPlan').querySelector(`[data-point="${CSS.escape(id)}"]`)?.remove();
            // Las sugerencias dependían de la geometría anterior: se retiran
            // sin recrear toda la tabla ni alterar la animación de borrado.
            $('jointPlan').querySelectorAll('.joint-interpolation-proposed').forEach(el=>el.remove());
            $('jointPlan').querySelectorAll('[data-point]').forEach(el=>el.classList.toggle('selected',el.dataset.point===s.selected));
            renderDevices();
            tell(`${point.id} eliminado del plano.`);
        };
        if(!animate||!swipe){remove();return;}
        if(record.dataset.deleting)return;
        record.dataset.deleting='true';
        // La única animación propia es colapsar verticalmente la fila.
        swipe.style.height=swipe.getBoundingClientRect().height+'px';
        swipe.style.transition='height 240ms cubic-bezier(.22,.8,.25,1),opacity 240ms ease';
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
            swipe.style.height='0px';
            swipe.style.opacity='0';
        }));
        setTimeout(remove,275);
    }

        return Object.freeze({
            checkPlan, savePlan, pointFor, deviceName, deviceCode, setPlanFilter, proposeInterpolation, acceptInterpolation, discardInterpolation, calculateInterpolationCandidates, planViewport, geometry, niceMetricStep, planGridStep, planLabelStep, snapPlanPosition, resetPlanView, planPointScale, pointLabelPlacement, pointAtPlanEdge, renderPlan, svgPosition, zoomPlanAt, suggestedPointPosition, addPoint, updatePlanPoint, deletePlanPoint
        });
    }
    const api = Object.freeze({ createController });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMAPlan = api;
    }
})(globalThis);
