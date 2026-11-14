/* VWOMA | SVG de teléfonos para la vista de los setups.
 * Mantiene las proporciones y ejes del marcador de Plano, con un único
 * color de estado en carcasa, iconos y flechas.
 */
(function registerSetupSymbols(root) {
  'use strict';
  const COLORS=Object.freeze({
    master:'#cc3b47',
    slave:'#176bb0',
    pending:'#99a8b6',
    measured:'#16824e'
  });
  const escape=s=>String(s??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const finite=(n,alternative=0)=>Number.isFinite(Number(n))?Number(n):alternative;
  const sensor=p=>(p.kind||'sensor')==='sensor';
  function measuredPoints(setupPlan){
    const measured=new Set();
    for(const setup of setupPlan?.setups||[]){
      if(!setup.completedRunId)continue;
      for(const assignment of setup.assignments||[])measured.add(assignment.pointId);
    }
    return measured;
  }
  function statusFor(pointId,assignments,masterId,measured){
    const active=(assignments||[]).find(a=>a.pointId===pointId);
    if(active&&active.deviceId===masterId)return 'master';
    if(active)return 'slave';
    return measured?.has(pointId)?'measured':'pending';
  }
  function phone({x,y,scale=1,angle=0,status='pending'}={}){
    const role=Object.hasOwn(COLORS,status)?status:'pending';
    const color=COLORS[role];
    const px=finite(x),py=finite(y),zoom=Math.max(.35,Math.min(2,finite(scale,1)));
    const rotation=-finite(angle);
    // Pantalla clara como espacio negativo: ninguna flecha o detalle está
    // coloreado con otro rol, a diferencia del marcador de edición de Plano.
    return '<g class="joint-phone-marker joint-setup-phone" data-status="'+role+
      '" transform="translate('+px+' '+py+') scale('+zoom+') rotate('+rotation+')">'+
      '<rect class="joint-phone-body" x="-9.5" y="-14" width="19" height="28" rx="3.6" fill="'+color+'"/>'+
      '<rect x="-6.1" y="-10.2" width="12.2" height="18.3" rx="1.7" fill="#ffffff" fill-opacity=".92"/>'+
      '<path d="M -2.5 -11.8 H 2.5" fill="none" stroke="'+color+'" stroke-width="1" stroke-linecap="round"/>'+
      '<circle cx="0" cy="10.9" r="1.2" fill="'+color+'"/>'+
      '<path d="M 9.5 3 H 22 M 22 3 L 17.5 -1 M 22 3 L 17.5 7" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<path d="M 0 -14 V -24 M 0 -24 L -4 -19 M 0 -24 L 4 -19" fill="none" stroke="'+color+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+
      '<circle cx="0" cy="-1" r="4.2" fill="'+color+'" stroke="#ffffff" stroke-width="1.2"/>'+
      '<circle cx="0" cy="-1" r="1.25" fill="#ffffff"/>'+
      '</g>';
  }
  function planSvg({plan,assignments=[],masterId=null,measured=new Set(),labels=true,escapeText=escape}={}){
    if(!plan||!Array.isArray(plan.points)||!plan.points.length)
      return '<p class="joint-help">Añade sensores y apoyos en la pestaña Plano.</p>';
    const L=Math.max(.001,finite(plan.length,1)),W=Math.max(.001,finite(plan.width,1));
    const x=p=>54+532*Math.min(1,Math.max(0,finite(p.x)/L));
    const y=p=>50+142*(1-Math.min(1,Math.max(0,finite(p.y)/W)));
    const active=new Map(assignments.map((a,i)=>[a.pointId,{
      code:a.deviceId===masterId?'M':'S'+i,deviceId:a.deviceId
    }]));
    let svg='<svg viewBox="0 0 640 255" role="img" aria-label="Planta de medida con teléfonos: maestro rojo, participantes activos azules, puntos medidos verdes y pendientes grises; apoyos triangulares" preserveAspectRatio="xMidYMid meet">';
    svg+='<rect x="35" y="33" width="567" height="175" rx="6" fill="#f2f7fb" stroke="#a0b8ca" stroke-width="1.3"/>';
    for(let j=1;j<10;j++)svg+='<path d="M '+(35+j*56.7)+' 33 V 208" stroke="#d6e4ee" stroke-width=".9"/>';
    for(let j=1;j<5;j++)svg+='<path d="M 35 '+(33+j*35)+' H 602" stroke="#d6e4ee" stroke-width=".9"/>';
    for(const p of plan.points.filter(p=>p.kind==='support')){
      svg+='<g transform="translate('+x(p)+' '+y(p)+')">'+
        '<path d="M 0 -11 L -12 10 L 12 10 Z" fill="#f6e6d5" stroke="#a9602b" stroke-width="2.5" stroke-linejoin="round"/>'+
        '<path d="M -16 13 H 16 M -13 13 l -4 5 M -5 13 l -4 5 M 3 13 l -4 5 M 11 13 l -4 5" fill="none" stroke="#a9602b" stroke-width="1.8" stroke-linecap="round"/>'+
        '</g>';
    }
    for(const p of plan.points.filter(p=>p.kind==='interpolation')){
      svg+='<circle cx="'+x(p)+'" cy="'+y(p)+'" r="8" fill="#ffffff" stroke="#9079ab" stroke-width="2.2"/>';
    }
    const sensors=plan.points.filter(sensor);
    for(const p of sensors){
      const state=statusFor(p.id,assignments,masterId,measured);
      const role=active.get(p.id), px=x(p),py=y(p);
      svg+=phone({x:px,y:py,scale:1.12,angle:p.angle,status:state});
      if(labels)svg+='<text x="'+Math.max(58,Math.min(572,px))+'" y="'+(py<79?py+33:py-30)+'" text-anchor="middle" font-weight="'+(role?'700':'500')+'" font-size="11.2" fill="#345873">'+
        escapeText((role?role.code+' · ':'')+p.id)+'</text>';
    }
    svg+='<text x="35" y="239" font-size="12" fill="#617a90">X = 0</text>'+
      '<text x="602" y="239" text-anchor="end" font-size="12" fill="#617a90">X = '+escapeText(plan.length)+' m</text>'+
      '</svg>';
    return svg;
  }
  const api=Object.freeze({COLORS,measuredPoints,statusFor,phone,planSvg});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.VWOMASetupSymbols=api;
})(globalThis);
