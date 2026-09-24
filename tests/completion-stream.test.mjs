import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import createLoader from '../scripts/lib/load-typescript.cjs';
const load=createLoader(fileURLToPath(new URL('..',import.meta.url)));
const {readCompletionStream}=load('@/lib/ai/providers/completion-stream');
function response(events, split=false) {
  const bytes=new TextEncoder().encode(events);
  const body=new ReadableStream({start(controller){if(split)for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));else controller.enqueue(bytes);controller.close();}});
  return new Response(body,{headers:{'content-type':'text/event-stream'}});
}
const delta=(value,reason=null)=>JSON.stringify({id:'request',choices:[{index:0,delta:value,finish_reason:reason}]});
test('SSE preserves split Unicode JSON, skips comments and reasoning, and retains finish/usage',async()=>{
  const result=await readCompletionStream(response(`: keepalive\r\n\r\ndata: ${delta({reasoning_content:'private thoughts'})}\r\n\r\ndata: ${delta({content:'{"观察":'})}\r\n\r\ndata: ${delta({content:'"可用"}'},'stop')}\r\n\r\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20}}\r\n\r\ndata: [DONE]\r\n\r\n`,true));
  assert.equal(result.choices[0].message.content,'{"观察":"可用"}');
  assert.equal(result.choices[0].finish_reason,'stop');assert.equal(result.usage.completion_tokens,20);
  assert.doesNotMatch(JSON.stringify(result),/private thoughts|reasoning/);
});
test('SSE refuses interrupted or invalid streams even when partial output is valid JSON',async()=>{
  await assert.rejects(readCompletionStream(response(`data: ${delta({content:'{}'})}\n\ndata: [DONE]\n\n`)),e=>e.category==='network');
  await assert.rejects(readCompletionStream(response('data: {bad}\n\n')),e=>e.category==='invalid_envelope');
  await assert.rejects(readCompletionStream(response('data: {"error":{"message":"private"}}\n\n')),e=>e.category==='invalid_envelope');
});
test('SSE output-limit finish reason still goes through existing truncation validation',async()=>{
  const value=await readCompletionStream(response(`data: ${delta({content:'{}'},'length')}\n\ndata: [DONE]\n\n`));
  const {normalizeCompletionResponse}=load('@/lib/ai/providers/completion-response');
  assert.throws(()=>normalizeCompletionResponse('zhipu',value,1,200,{task:'findings',model:'vision',attempt:1,timeoutMs:1000}),e=>e.category==='truncated_response');
});
test('Zhipu adapter requests streaming and normalizes the complete structured answer and usage',async t=>{
  let sent;
  t.mock.method(globalThis,'fetch',async(_url,options)=>{sent=JSON.parse(options.body);return response(`data: ${delta({content:'{"ok":true}'},'stop')}\n\ndata: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":20}}\n\ndata: [DONE]\n\n`);});
  const {ZhipuProvider}=load('@/lib/ai/providers/zhipu.provider');
  const result=await new ZhipuProvider('test-key').generateStructured({task:'findings',model:'vision',messages:[{role:'user',content:'fixture'}],reasoning:'high',attempt:1,timeoutMs:1000});
  assert.equal(sent.stream,true);assert.equal(result.content,'{"ok":true}');assert.equal(result.usage.outputTokens,20);assert.equal(result.finishReason,'stop');
});
