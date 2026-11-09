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
            ids.add(p.id); const device=typeof p.device==='string'?p.device:null;
            if(device && devices.has(device)) throw Error('Un móvil no puede estar asignado a dos puntos a la vez.');
            if(device) devices.add(device);
            return {id:p.id,name:String(p.name||p.id).slice(0,40),x:p.x,y:p.y,axis:p.axis,angle:p.angle,device};
        });
        return {length:plan.length,width:plan.width,name:String(plan.name||'Ensayo multipunto').slice(0,80),points};
    }
    function savePlan(render=true) {
        s.plan=checkPlan(s.plan);
        try {localStorage.setItem(storageKey,JSON.stringify({...s.plan,points:s.plan.points.map(p=>({...p,device:null}))}));} catch(e){tell('Plano en memoria. No se ha podido guardar en este navegador.',true);}
        broadcast({type:'PLAN',plan:s.plan}); if(render)renderPlan();
    }
    function pointFor(device=s.id, plan=s.plan) {return plan.points.find(p=>p.device===device);}
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
        const factor=Math.max(1/20,Math.min(1,Math.min(base.w/L,base.h/W)));
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
    function planGridStep(g) {return niceMetricStep(20/g.scale);}
    function planLabelStep(g) {return niceMetricStep(60/g.scale);}
    function snapPlanPosition(position) {return {x:Math.max(0,Math.min(s.plan.length,Math.round(position.x))),y:Math.max(0,Math.min(s.plan.width,Math.round(position.y)))};}
    function resetPlanView() {s.planView=null;s.planPan=null;s.planPinch=null;renderPlan();}
    // Los móviles y sus nombres crecen suavemente con el zoom, sin superar el 150 %.
    // 1x: 100 %, 2x: 120 %, 4x: 140 %, 8x o superior: 150 %.
    // Los números de los ejes pertenecen al visor y mantienen su tamaño.
    function planPointScale(view=planViewport()) {
        const zoom=Math.max(1,s.plan.length/view.w);
        return zoom<=4?1+.2*Math.log2(zoom):Math.min(1.5,1.4+.1*Math.log2(zoom/4));
    }
    // Conserva el anclaje compacto de la etiqueta en la esquina superior derecha
    // del móvil. La separación y el espacio anticolisión crecen con el icono.
    function pointLabelPlacement(x,y,pointId,placedLabels,markerScale=1) {
        const labelX=x+13*markerScale,labelWidth=Math.max(36,String(pointId).length*15)*markerScale;
        const preferredY=y-8*markerScale;
        const spacing=34*markerScale;
        const offsets=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6,-6,7,-7,8,-8,9,-9];
        const minBaseline=26*markerScale+3,maxBaseline=422-5*markerScale;
        let best=null,bestOverlap=Infinity;
        for(const step of offsets) {
            const baseline=preferredY+step*spacing;
            if(baseline<minBaseline||baseline>maxBaseline)continue;
            const box={left:labelX,top:baseline-26*markerScale,right:labelX+labelWidth,bottom:baseline+5*markerScale};
            if(box.right>792)continue;
            const overlaps=placedLabels.reduce((sum,other)=>sum+
                (box.left<other.right+4&&box.right+4>other.left&&box.top<other.bottom+4&&box.bottom+4>other.top?1:0),0);
            if(!overlaps) {
                placedLabels.push(box);
                return {x:labelX,y:baseline,anchor:'start'};
            }
            if(overlaps<bestOverlap) {bestOverlap=overlaps;best={box,baseline};}
        }
        const baseline=best?best.baseline:Math.max(minBaseline,Math.min(maxBaseline,preferredY));
        placedLabels.push(best?.box||{left:labelX,top:baseline-26*markerScale,right:labelX+labelWidth,bottom:baseline+5*markerScale});
        return {x:labelX,y:baseline,anchor:'start'};
    }
    function renderPlan() {
        const edit=s.role==='host'&&!running()&&!s.transaction;
        $('jointGeometry').disabled=!edit;
        $('jointPlanTools').hidden=s.role!=='host';
        for(const id of ['jointAddPointInline','jointRemovePoint','jointResetView']) $(id).disabled=!edit;
        $('jointName').value=s.plan.name; $('jointLength').value=s.plan.length; $('jointWidth').value=s.plan.width;
        const view=planViewport(),g=geometry(view),selected=s.plan.points.find(p=>p.id===s.selected),gridStep=planGridStep(g),labelStep=planLabelStep(g);
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
        for(let i=Math.ceil(minX/gridStep-1e-7);i<=Math.floor(maxX/gridStep+1e-7);i++){
            const x=Number((i*gridStep).toFixed(6)),sx=g.originX+x*g.scale;
            svg+=`<line x1="${sx}" y1="${deckY}" x2="${sx}" y2="${deckY+deckH}" stroke="#bdcfdd" stroke-width="1"/>`;
            if(Math.abs(x/labelStep-Math.round(x/labelStep))<1e-6)xTicks.push({value:x,pixel:sx});
        }
        for(let i=Math.ceil(minY/gridStep-1e-7);i<=Math.floor(maxY/gridStep+1e-7);i++){
            const y=Number((i*gridStep).toFixed(6)),sy=g.originY-y*g.scale;
            svg+=`<line x1="${deckX}" y1="${sy}" x2="${deckX+deckW}" y2="${sy}" stroke="#bdcfdd" stroke-width="1"/>`;
            if(Math.abs(y/labelStep-Math.round(y/labelStep))<1e-6)yTicks.push({value:y,pixel:sy});
        }
        svg+='</g>';
        // Las marcas de los ejes se anclan al marco, no al tablero.
        for(const tick of xTicks)svg+=`<line x1="${tick.pixel}" y1="${g.top+g.h}" x2="${tick.pixel}" y2="${g.top+g.h+6}" stroke="#698ba6"/><text class="joint-plan-tick" x="${tick.pixel}" y="${g.top+g.h+25}" text-anchor="middle">${tick.value}</text>`;
        for(const tick of yTicks)svg+=`<line x1="${g.left-6}" y1="${tick.pixel}" x2="${g.left}" y2="${tick.pixel}" stroke="#698ba6"/><text class="joint-plan-tick" x="${g.left-11}" y="${tick.pixel+7}" text-anchor="end">${tick.value}</text>`;
        svg+=`<text class="joint-plan-axis" x="${g.left+g.w/2}" y="${g.top+g.h+62}" text-anchor="middle">X (m)</text><text class="joint-plan-axis" x="${g.left}" y="${g.top-12}">Y (m)</text>`;
        const markerScale=planPointScale(view),placedLabels=[];
        for(const p of s.plan.points) {
            const x=g.originX+p.x*g.scale,y=g.originY-p.y*g.scale;
            // Los marcadores que quedan fuera del visor no se dibujan. Los que
            // están sobre los bordes permanecen completos y seleccionables.
            if(x<g.left-1e-7||x>g.left+g.w+1e-7||y<g.top-1e-7||y>g.top+g.h+1e-7)continue;
            const phoneColor=p.device===s.id?'#467c9f':p.device?'#548d85':'#7f8fa1';
            const label=pointLabelPlacement(x,y,p.id,placedLabels,markerScale);
            svg+=`<g class="joint-point ${p.id===s.selected?'selected':''}" data-point="${escape(p.id)}" tabindex="0" role="button" aria-label="${escape(p.id)}, X ${p.x}, Y ${p.y}">
                <title>${escape(p.id)} · ${p.device?escape(deviceName(p.device)):'Sin asignar'}</title>
                <circle class="joint-point-hitbox" cx="${x}" cy="${y}" r="${27*markerScale}"/>
                <g class="joint-phone-marker" transform="translate(${x} ${y}) scale(${markerScale}) rotate(${-p.angle})">
                    <rect class="joint-phone-body" x="-9.5" y="-14" width="19" height="28" rx="3.6" fill="${phoneColor}"/>
                    <rect x="-6.1" y="-10.2" width="12.2" height="18.3" rx="1.7" fill="#edf4f9"/>
                    <path d="M -2.5 -11.8 H 2.5" fill="none" stroke="#e7edf3" stroke-width="1" stroke-linecap="round"/>
                    <circle cx="0" cy="10.9" r="1.2" fill="#e2eaf1"/>
                    <path d="M 9.5 3 H 22 M 22 3 L 17.5 -1 M 22 3 L 17.5 7" fill="none" stroke="#1766d6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M 0 -14 V -24 M 0 -24 L -4 -19 M 0 -24 L 4 -19" fill="none" stroke="#d94751" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="0" cy="-1" r="4.2" fill="#20a567" stroke="#fff" stroke-width="1.2"/>
                    <circle cx="0" cy="-1" r="1.25" fill="#effff6"/>
                </g>
                <text class="joint-point-label" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" style="font-size:${24*markerScale}px">${escape(p.id)}</text>
            </g>`;
        }
        $('jointPlan').innerHTML=svg;
        $('jointPlanHelp').textContent=s.role==='host'?'Doble toque o doble clic en el tablero para añadir un punto. Arrastra para mover puntos o desplazar el plano; pellizca o usa la rueda para ampliar dentro de la ventana. Las posiciones añadidas y arrastradas se ajustan a 1 m.':'El maestro edita el plano. Tu punto aparece en azul. Comprueba posición, eje y orientación.';
        const devices=[{id:s.id,name:s.name},...s.peers.values()].filter(p=>p.name);
        const deviceOptions=devices.map(d=>`<option value="${escape(d.id)}">${deviceCode(d.id)}</option>`).join('');
        $('jointPointsTable').innerHTML=s.plan.points.map(p=>{
            const assigned=!!p.device;
            return `<tr class="joint-point-record" data-point-id="${escape(p.id)}"><td colspan="4" class="joint-point-table-cell"><div class="joint-point-swipe"><div class="joint-point-row" data-point-id="${escape(p.id)}"><div class="joint-point-code ${assigned?'assigned':'unassigned'}">${escape(p.id)}</div><label><span>X (m)</span><input data-point-field="x" type="number" inputmode="decimal" step="0.001" min="0" max="${s.plan.length}" value="${p.x}" aria-label="Coordenada X de ${escape(p.id)}" ${edit?'':'disabled'}></label><label><span>Y (m)</span><input data-point-field="y" type="number" inputmode="decimal" step="0.001" min="0" max="${s.plan.width}" value="${p.y}" aria-label="Coordenada Y de ${escape(p.id)}" ${edit?'':'disabled'}></label><label><span>Sensor</span><select data-point-field="device" aria-label="Sensor asignado a ${escape(p.id)}" ${edit?'':'disabled'}><option value="">—</option>${deviceOptions}</select></label></div><button type="button" class="joint-point-delete" tabindex="-1" data-delete-point="${escape(p.id)}" aria-label="Eliminar ${escape(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button></div></td></tr>`;
        }).join('');
        for(const p of s.plan.points) {const select=$('jointPointsTable').querySelector(`[data-point-id="${CSS.escape(p.id)}"] select[data-point-field="device"]`);if(select)select.value=p.device||'';}
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
        requireHostEdit(); if(s.plan.points.length>=MAX_POINTS) throw Error('Máximo 64 puntos por plano.');
        let n=1; while(s.plan.points.some(p=>p.id==='P'+n)) n++;
        const position=x===undefined&&y===undefined?suggestedPointPosition(n):snapPlanPosition({x,y});
        const p={id:'P'+n,name:'P'+n,x:position.x,y:position.y,angle:0,axis:'z',device:null};
        s.plan.points.push(p); s.selected=p.id; savePlan();
    }
    function updatePlanPoint(id, field, value) {
        requireHostEdit(); const original=s.plan.points.find(p=>p.id===id); if(!original) throw Error('El punto ya no existe.');
        let next=value;
        if(field==='name') next=String(value).trim().slice(0,40)||original.id;
        if(field==='x'||field==='y') {next=Number(Number(value).toFixed(3));if(!finite(next)) throw Error('Introduce una coordenada válida en metros.');}
        if(field==='device') next=value||null;
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
            if(s.selected===id)s.selected=s.plan.points[0]?.id||null;
            savePlan(false);
            record?.remove();
            $('jointPlan').querySelector(`[data-point="${CSS.escape(id)}"]`)?.remove();
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
            checkPlan, savePlan, pointFor, deviceName, deviceCode, planViewport, geometry, niceMetricStep, planGridStep, planLabelStep, snapPlanPosition, resetPlanView, planPointScale, pointLabelPlacement, renderPlan, svgPosition, zoomPlanAt, suggestedPointPosition, addPoint, updatePlanPoint, deletePlanPoint
        });
    }
    const api = Object.freeze({ createController });
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    } else {
        root.VWOMAPlan = api;
    }
})(globalThis);
