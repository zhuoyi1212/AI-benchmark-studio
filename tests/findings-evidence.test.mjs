import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import createLoader from '../scripts/lib/load-typescript.cjs';
const root = fileURLToPath(new URL('..', import.meta.url));
const load = createLoader(root);
const { renderPdfEvidence } = load('@/lib/pdf-evidence');

// Two visibly different pages, generated solely as an isolated regression fixture.
function pdfFixture() {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 2 /Kids [3 0 R 5 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 120] /Resources << >> /Contents 4 0 R >>',
    '<< /Length 26 >>\nstream\n1 0 0 rg 0 0 120 120 re f\nendstream',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 120] /Resources << >> /Contents 6 0 R >>',
    '<< /Length 26 >>\nstream\n0 0 1 rg 0 0 120 120 re f\nendstream',
  ];
  let file='%PDF-1.4\n';
  const offsets=[0];
  for (const [i, object] of objects.entries()) { offsets.push(Buffer.byteLength(file)); file+=`${i+1} 0 obj\n${object}\nendobj\n`; }
  const xref=Buffer.byteLength(file);
  file+=`xref\n0 7\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(file));
}

test('PDF evidence renders every actual page in order, rather than blank placeholders or OCR', async () => {
  const pages=await renderPdfEvidence(pdfFixture());
  assert.equal(pages.length,2);
  for (const [index,url] of pages.entries()) {
    const image=await loadImage(url); const canvas=createCanvas(image.width,image.height); const ctx=canvas.getContext('2d'); ctx.drawImage(image,0,0);
    assert.deepEqual([...ctx.getImageData(20,20,1,1).data], index===0?[255,0,0,255]:[0,0,255,255]);
  }
});

test('PDF limits and corrupt files fail explicitly without returning partial evidence', async () => {
  await assert.rejects(renderPdfEvidence(pdfFixture(),1), /未省略任何页面/);
  await assert.rejects(renderPdfEvidence(pdfFixture(),32,10), /大小上限/);
  await assert.rejects(renderPdfEvidence(new Uint8Array([1,2,3])), /损坏或有密码/);
});

function serviceFixture(artifacts, overrides={}) {
  const testWorkspace={project:{id:'project',name:'test',products:[{id:'product',name:'tool'}]},protocol:{id:'protocol',version:1,testCases:[{id:'case',title:'task',expectedOutputTypes:['mixed']}]},testRuns:[{id:'run',productId:'product',testCaseId:'case',status:'ready_for_review',artifacts}]};
  return createLoader(root, {
    '@/lib/services/test-execution.service':{getTestExecutionWorkspace:async()=>testWorkspace},
    '@/lib/services/research.service':{getResearchWorkspace:async()=>({completedResult:{products:[]}})},
    '@/lib/services/human-review.service':{getHumanReviewWorkspace:async()=>({status:'revealed'})},
    ...overrides,
  })('@/lib/services/findings.service');
}
const pdf=pdfFixture();
const pdfArtifact={id:'pdf-original',fileName:'fixture.pdf',fileType:'application/pdf',sizeBytes:pdf.length,sha256:createHash('sha256').update(pdf).digest('hex'),fileUrl:'https://fixture.invalid/pdf'};
const imageArtifact={id:'screenshot-original',fileName:'fixture.png',fileType:'image/png',fileUrl:'https://fixture.invalid/image'};
const videoArtifact={id:'video-original',fileName:'fixture.mp4',fileType:'video/mp4',fileUrl:'https://fixture.invalid/video'};

test('video evidence is sent without an accompanying screenshot', async () => {
  const content=await serviceFixture([imageArtifact,videoArtifact]).buildRawFindingsEvidenceContent('project');
  assert.equal(content.filter(part=>part.type==='image_url').length,0);
  assert.deepEqual(content.filter(part=>part.type==='file_url').map(part=>part.file_url.url),[videoArtifact.fileUrl]);
  assert.match(content[0].text,/"selectedFamily":"video"/);
  assert.doesNotMatch(JSON.stringify(content),/screenshot-original/);
});

test('mixed PDF and screenshots contain all PDF pages with original IDs and no file_url', async t => {
  t.mock.method(globalThis,'fetch',async()=>new Response(pdf));
  const content=await serviceFixture([pdfArtifact,imageArtifact]).buildRawFindingsEvidenceContent('project');
  assert.equal(content.filter(p=>p.type==='image_url').length,3);
  assert.equal(content.filter(p=>p.type==='file_url').length,0);
  assert.ok(content.some(p=>p.text==='artifactId: pdf-original; original PDF page 1/2'));
  assert.ok(content.some(p=>p.text==='artifactId: pdf-original; original PDF page 2/2'));
  assert.equal(content.at(-1).image_url.url,imageArtifact.fileUrl);
});

test('PDF-only requests keep original file input; mixed requests verify SHA before rendering', async t => {
  const fetchMock=t.mock.method(globalThis,'fetch',async()=>new Response(pdf));
  const content=await serviceFixture([pdfArtifact]).buildRawFindingsEvidenceContent('project');
  assert.equal(content.at(-1).file_url.url,pdfArtifact.fileUrl);
  assert.equal(fetchMock.mock.callCount(),0);
  await assert.rejects(serviceFixture([{...pdfArtifact,sha256:'invalid'},imageArtifact]).buildRawFindingsEvidenceContent('project'),/完整性校验失败/);
});

test('provider failures persist a safe actionable explanation and never complete findings', async () => {
  const {AIProviderError}=load('@/lib/ai/errors');
  const failure=new AIProviderError('secret raw message',{provider:'zhipu',model:'vision',task:'findings',attempt:1,latencyMs:100,timeoutMs:1000,status:400,category:'bad_request',providerCode:'1214',inputIssue:'mixed_media'});
  let saved; let completed=false;
  const service=serviceFixture([imageArtifact],{
    '@/lib/ai/errors':load('@/lib/ai/errors'),
    '@/lib/ai/task-service':{aiTaskService:{generateFindings:async()=>{throw failure;}}},
    '@/lib/repositories/findings.repository':{findingsRepository:{begin:async()=> 'new-id',list:async()=>[{id:'new-id',status:'pending'}],fail:async(_id,message)=>{saved=message},complete:async()=>{completed=true}}},
  });
  await assert.rejects(service.generateExperienceFindings('project'), /PDF、视频与图片混合输入.*1214/);
  assert.match(saved,/1214/); assert.doesNotMatch(saved,/secret/); assert.equal(completed,false);
});

test('HTTP error diagnostics retain only safe codes and known input issue, never echoed secrets', async t => {
  const {postProviderJson}=load('@/lib/ai/providers/http');
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({error:{code:'1214',message:'The simultaneous understanding of documents, videos, and images is not supported secret https://signed.invalid/?token=secret'}}),{status:400}));
  await assert.rejects(postProviderJson('zhipu','https://fixture.invalid','secret',{}, {task:'findings',model:'vision',attempt:1,timeoutMs:1000}), error=>{
    assert.equal(error.providerCode,'1214'); assert.equal(error.inputIssue,'mixed_media'); assert.equal(error.retryable,false);
    assert.doesNotMatch(JSON.stringify(error), /secret|signed.invalid/); return true;
  });
});
