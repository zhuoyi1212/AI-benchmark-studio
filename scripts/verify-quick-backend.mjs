import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { startE2EProviderMock } from './e2e-provider-mock.mjs';

const token = randomUUID(), runId = `${Date.now().toString(36)}-${randomUUID().slice(0,8)}`;
const recovery = process.env.E2E_QUICK_RECOVERY === '1';
const provider = await startE2EProviderMock({ failOnceTask: recovery ? 'HumanizedCommunityPost' : undefined });
const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
function startApp() {
const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
  env: { ...process.env, E2E_TEST_MODE: '1', E2E_TEST_TOKEN: token, QUICK_WORKER_DISABLED: '0', AI_E2E_PROVIDER_BASE_URL: provider.baseUrl, ZAI_API_KEY: 'e2e-key', DEEPSEEK_API_KEY: 'e2e-key', AI_BENCHMARK_NEXT_DIST_DIR: '.next-quick-e2e', NEXT_TELEMETRY_DISABLED: '1', CRON_SECRET: token },
  stdio: ['ignore','pipe','pipe'], detached: true,
});
child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
return child;
}
let child = startApp();
let projectId;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function call(operation) {
  const response = await fetch(`${origin}/api/e2e-test/quick-workflow`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-e2e-token': token }, body: JSON.stringify({ operation, runId, projectId }) });
  assert.equal(response.ok, true, `${operation}: ${await response.clone().text()}`);
  return response.json();
}
async function until(predicate, allowFailure = false) {
  const deadline = Date.now()+240000;
  while (Date.now()<deadline) {
    const state = await call('status');
    const failed = state.jobs.find(job=>job.status==='failed');
    if (!allowFailure) assert.equal(failed, undefined, JSON.stringify(failed));
    if (predicate(state)) return state;
    await pause(2000);
  }
  throw new Error('Background execution did not finish');
}
try {
  for (let i=0;i<90;i++) {
    try { await fetch(`${origin}/api/e2e-test/quick-workflow`, { method:'POST' }); break; } catch { await pause(1000); }
  }
  const rejectedCron = await fetch(`${origin}/api/cron/quick-workflow`);
  assert.equal(rejectedCron.status, 401);
  const authorizedCron = await fetch(`${origin}/api/cron/quick-workflow`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(authorizedCron.status, 200);
  ({ projectId } = await call('create'));
  const prepared = await until(state=>state.protocol?.status==='draft');
  assert.equal(prepared.jobs.filter(job=>job.kind==='research').length,1);
  assert.equal(prepared.jobs.some(job=>job.kind==='evaluate'),false);
  await call('adopt'); await call('upload');
  const findings = await until(state=>state.findings?.status==='completed');
  assert.equal(findings.revealed,true); assert.equal(findings.findings.confirmed,false);
  assert.equal(findings.jobs.some(job=>job.kind==='discovery'),false);
  // No page is open; only read-only status requests are made while workers advance.
  await call('confirm');
  if (recovery) {
    await until(state => state.jobs.some(job => job.kind === 'publish' && job.status === 'failed'), true);
    assert.equal(provider.stats().taskCounts.CommunityPostDraft, 1);
    process.kill(-child.pid, 'SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    child = startApp();
    for (let i = 0; i < 90; i++) {
      try { await fetch(`${origin}/api/e2e-test/quick-workflow`, { method: 'POST' }); break; } catch { await pause(1000); }
    }
    await call('retry');
  }
  const complete = await until(state=>state.publish?.status==='ready' && state.jobs.some(job=>job.kind==='report' && job.status==='completed'));
  for (const kind of ['research','protocol','evaluate','findings','discovery','publish','analysis','report']) assert.equal(complete.jobs.filter(job=>job.kind===kind).length,1,kind);
  for (const task of ['CommunityPostDraft','HumanizedCommunityPost','EvidenceCheckedCommunityPost']) assert.equal(provider.stats().taskCounts[task], recovery && task === 'HumanizedCommunityPost' ? 2 : 1,task);
  const html = await (await fetch(`${origin}/projects/${projectId}/quick`)).text();
  assert.ok(html.includes('快速模式'));
  console.log(JSON.stringify({ ok:true, recovery, projectId, runId, stages:complete.jobs.map(job=>job.kind), publishVersion:complete.publish.version, providerCalls:provider.stats().taskCounts }));
  if (process.env.E2E_BROWSER_HOLD === '1') {
    console.log(`Browser verification ready: ${origin}/projects/${projectId}/quick`);
    await pause(180000);
  }
} finally {
  if (projectId) console.log('Cleanup:', await call('cleanup'));
  process.kill(-child.pid,'SIGTERM'); await provider.close();
}
