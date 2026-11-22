'use strict';

/**
 * Build the isolated GitHub Pages /pruebas/ files from the refactor branch.
 *
 * IMPORTANT: a previous global replaceAll('upm-joint-v1', ...) also changed
 * the protocol schema 'pasarelas-upm-joint-v1', preventing all uploads.
 * Only replace exact JavaScript storage-key expressions.
 */
const PROTOCOL_SCHEMA = 'pasarelas-upm-joint-v1';
const BAD_PREVIEW_SCHEMA = 'pasarelas-upm-joint-vwoma-preview-v1';

function replaceOne(source, oldText, newText, label) {
  if (typeof source !== 'string' || source.split(oldText).length !== 2)
    throw Error('Missing/ambiguous preview replacement: '+label);
  return source.replace(oldText,newText);
}

function assertSameRecordSchema(joint, transfer) {
  const created=joint.match(/function runMeta\(run\)\s*\{\s*return \{schema:'([^']+)'/);
  const required=transfer.match(/r\.schema!=='([^']+)'/);
  const announced=transfer.match(/m\.schema!=='([^']+)'/);
  if (!created||!required||!announced||
      created[1]!==PROTOCOL_SCHEMA||
      required[1]!==created[1]||
      announced[1]!==created[1])
    throw Error('Preview record schema mismatches WebRTC validation: '+JSON.stringify({
      created:created?.[1],required:required?.[1],announced:announced?.[1]
    }));
}

function repairArchivedPreviewMeta(meta) {
  // Only this specifically broken experimental variant is recoverable.
  // Never rewrite arbitrary formats or change the participant's identity.
  return meta?.schema===BAD_PREVIEW_SCHEMA ? {...meta,schema:PROTOCOL_SCHEMA} : meta;
}

function preparePreview({indexHtml,jointApp,language,recordTransfer}) {
  assertSameRecordSchema(jointApp,recordTransfer);
  let joint=jointApp;
  joint=replaceOne(joint,"storageKey:'upm-joint-plan-v1'",
    "storageKey:'upm-joint-plan-vwoma-preview-v1'",'plan storage key');
  joint=replaceOne(joint,"localStorage.getItem('upm-joint-plan-v1')",
    "localStorage.getItem('upm-joint-plan-vwoma-preview-v1')",'plan recovery key');
  joint=replaceOne(joint,"databaseName:'upm-joint-v1'",
    "databaseName:'upm-joint-vwoma-preview-v1'",'IndexedDB name');

  // Existing experimental sessions used the incorrectly rewritten schema.
  // When users download a recovered run, repair just this known bad metadata
  // while preserving all original samples, clocks and device IDs.
  joint=replaceOne(joint,
    "download('recuperado_'+entry.meta.id+'.json',{...entry.meta,recovered:true,samples:chunks.flatMap(v=>v.rows)});",
    "download('recuperado_'+entry.meta.id+'.json',{...repairArchivedPreviewMeta(entry.meta),recovered:true,samples:chunks.flatMap(v=>v.rows)});",
    'legacy experimental recovery');
  // Inline a narrow, independent helper inside the classic joint script.
  joint=replaceOne(joint,"    async function recover() {",
    "    const repairArchivedPreviewMeta=meta=>meta?.schema==='"+BAD_PREVIEW_SCHEMA+"'?{...meta,schema:'"+PROTOCOL_SCHEMA+"'}:meta;\n    async function recover() {",
    'recovery compatibility helper');

  let html=replaceOne(indexHtml,
    '<title>VWOMA · Pasarelas UPM</title>',
    '<title>VWOMA · PRUEBAS · Pasarelas UPM</title>','preview title');
  html=replaceOne(html,
    'src/joint/joint-app.js?v=20261113-calibration-guide-v15',
    'src/joint/joint-app.js?v=20261113-preview-calibration-guide-v15','joint cache version');

  const i18n=replaceOne(language,
    "'vwoma.language.v1'","'vwoma.language.preview.v1'",'preview language');

  assertSameRecordSchema(joint,recordTransfer);
  if (joint.includes("schema:'"+BAD_PREVIEW_SCHEMA+"'"))
    throw Error('Protocol schema was modified unexpectedly');
  if (!joint.includes("databaseName:'upm-joint-vwoma-preview-v1'"))
    throw Error('Preview database is not isolated');
  if (!joint.includes("storageKey:'upm-joint-plan-vwoma-preview-v1'"))
    throw Error('Preview plan is not isolated');
  return {indexHtml:html,jointApp:joint,language:i18n};
}

module.exports={PROTOCOL_SCHEMA,BAD_PREVIEW_SCHEMA,preparePreview,
  assertSameRecordSchema,repairArchivedPreviewMeta};
