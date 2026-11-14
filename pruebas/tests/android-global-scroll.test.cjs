'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Chrome Android keeps native scroll anchoring across the joint workspace',()=>{
  const css=read('style.css');
  assert.doesNotMatch(css,/html\.joint-workspace-active,[\s\S]*?overflow-anchor\s*:\s*none/);
  assert.doesNotMatch(css,/body\.joint-workspace-active[^{]*\{[^}]*overflow-anchor\s*:\s*none/);
  assert.match(css,/html\.vwoma-post-test,[\s\S]*?overflow-anchor:none/);
});

test('vertical browser-toolbar resize does not refit global header typography',()=>{
  const html=read('index.html');
  assert.match(html,/if \(width < 100 \|\| Math\.abs\(width - lastWidth\) < 0\.5\) return;/);
  assert.match(html,/window\.addEventListener\('resize', queueFit, \{passive:true\}\)/);
  assert.match(html,/document\.fonts\.ready\.then\(\(\) => \{[\s\S]*?lastWidth = 0;\s*queueFit\(\)/);
});

test('no window scroll-to-top is run by periodic joint updates',()=>{
  const app=read('src/joint/joint-app.js');
  const tick=app.split('function tick() {')[1]?.split('function resetSession()')[0];
  assert.ok(tick);
  assert.doesNotMatch(tick,/(window\.)?scrollTo\s*\(|scrollIntoView\s*\(/);
});
