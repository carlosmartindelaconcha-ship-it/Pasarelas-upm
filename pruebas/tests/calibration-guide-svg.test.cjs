'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
test('los SVG X Y Z animados son exactamente un ciclo y mantienen el teléfono original',()=>{
  for(const axis of ['x','y','z']){
    const original=read('assets/calibration/telefono-eje-'+axis+'.svg');
    const cycle=read('assets/calibration/telefono-eje-'+axis+'-un-ciclo.svg');
    assert.equal((original.match(/<animateTransform\b/g)||[]).length,1);
    assert.equal((cycle.match(/<animateTransform\b/g)||[]).length,1);
    assert.match(cycle,/dur="3s"/);
    assert.match(cycle,/repeatCount="1" fill="freeze"/);
    assert.doesNotMatch(cycle,/repeatCount="indefinite"/);
    assert.equal(cycle.replace('repeatCount="1" fill="freeze"','repeatCount="indefinite"'),
      original,'solo se debe modificar la repetición del SVG del eje '+axis);
  }
  assert.doesNotMatch(read('assets/calibration/telefono-ejes-reposo.svg'),/<animateTransform\b/);
});

test('botón Calibrar ejes precede a X Y Z deshabilitados y existe el texto del ejemplo',()=>{
  const html=read('index.html'),a=html.indexOf('id="jointBeginCalibration"'),
    b=html.indexOf('id="jointCalibrateX"');
  assert.ok(a>=0&&b>a);
  for(const axis of ['X','Y','Z'])assert.match(html,
    new RegExp('id="jointCalibrate'+axis+'"[^>]*disabled'));
  assert.match(html,/id="jointCalibrationExample"[^>]*hidden[^>]*>EJEMPLO: haz un SOLO movimiento de ida y vuelta con el móvil en CADA EJE/);
  assert.match(html,/assets\/calibration\/telefono-ejes-reposo\.svg/);
});
