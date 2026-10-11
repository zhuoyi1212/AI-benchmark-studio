import 'server-only';
import { randomUUID } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { throwRepositoryError } from '@/lib/repositories/repository-error';
import type { Json } from '@/lib/types/database';
import type { NextQuickJob, QuickJob } from '@/lib/quick/types';

export const quickJobsRepository = {
  async enqueue(projectId: string, next: NextQuickJob) {
    const { data, error } = await getSupabaseServerClient().rpc('enqueue_quick_job', {
      p_project_id: projectId, p_kind: next.kind, p_scope: next.scope, p_payload: next.payload ?? {},
    });
    if (error) throwRepositoryError('quick.enqueue', error);
    return data;
  },
  async list(projectId: string): Promise<QuickJob[]> {
    const { data, error } = await getSupabaseServerClient().from('quick_jobs').select('*').eq('project_id', projectId).order('created_at');
    if (error) throwRepositoryError('quick.list', error);
    return data;
  },
  async claim(projectId?: string): Promise<QuickJob | null> {
    // Test-only pollers must explicitly identify their own reserved fixture.
    if (!projectId && process.env.E2E_TEST_MODE === '1' && process.env.E2E_TEST_RUN_ID) {
      const { data: fixture, error } = await getSupabaseServerClient().from('projects').select('id').eq('name', `[E2E] Backend Quick ${process.env.E2E_TEST_RUN_ID}`).is('deleted_at', null).maybeSingle();
      if (error) throwRepositoryError('quick.fixtureScope', error);
      if (!fixture) return null;
      projectId = fixture.id;
    }
    const { data, error } = await getSupabaseServerClient().rpc('claim_quick_job', { p_project_id: projectId });
    if (error) throwRepositoryError('quick.claim', error);
    return data[0] ? data[0] as QuickJob : null;
  },
  async finish(job: QuickJob, status: 'completed' | 'failed' | 'queued' | 'cancelled', result: Json = null, errorMessage: string | null = null, next?: NextQuickJob) {
    const { error } = await getSupabaseServerClient().rpc('finish_quick_job', {
      p_id: job.id, p_token: job.lease_token!, p_status: status, p_result: result,
      p_error: errorMessage ?? undefined, p_next: next ? JSON.parse(JSON.stringify(next)) as Json : undefined,
    });
    if (error) throwRepositoryError('quick.finish', error);
  },
  async readStep(jobId: string, key: string): Promise<Json | undefined> {
    const { data, error } = await getSupabaseServerClient().from('quick_job_steps').select('output').eq('job_id', jobId).eq('step_key', key).maybeSingle();
    if (error) throwRepositoryError('quick.readStep', error);
    return data?.output;
  },
  async saveStep(job: QuickJob, key: string, output: Json) {
    const { error } = await getSupabaseServerClient().rpc('save_quick_step', { p_id: job.id, p_token: job.lease_token!, p_key: key, p_output: output });
    if (error) throwRepositoryError('quick.saveStep', error);
  },
  async stage(job: QuickJob, stage: string) {
    const { data, error } = await getSupabaseServerClient().from('quick_jobs').update({ stage, updated_at: new Date().toISOString() })
      .eq('id', job.id).eq('lease_token', job.lease_token!).eq('status', 'running').gt('lease_until', new Date().toISOString()).select('id');
    if (error) throwRepositoryError('quick.stage', error);
    if (!data.length) throw new Error('后台执行权已过期，请等待任务恢复。');
  },
  async heartbeat(job: QuickJob) {
    const now = new Date();
    const { data, error } = await getSupabaseServerClient().from('quick_jobs')
      .update({ lease_until: new Date(now.getTime() + 15 * 60_000).toISOString(), updated_at: now.toISOString() })
      .eq('id', job.id).eq('lease_token', job.lease_token!).eq('status', 'running').gt('lease_until', now.toISOString()).select('id');
    if (error) throwRepositoryError('quick.heartbeat', error);
    if (!data.length) throw new Error('后台执行权已过期，请等待任务恢复。');
  },
  async retry(projectId: string, jobId: string) {
    const { error } = await getSupabaseServerClient().from('quick_jobs').update({ status: 'queued', attempts: 0, result: { retryEpoch: randomUUID() }, error_message: null, available_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('project_id', projectId).eq('id', jobId).eq('status', 'failed');
    if (error) throwRepositoryError('quick.retry', error);
  },
};
