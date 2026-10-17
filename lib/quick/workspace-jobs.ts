import type { QuickJob } from './types';

type CompletedWork = {
  protocolId?: string;
  protocolLocked?: boolean;
  findingsId?: string | null;
  reviewCompleted: boolean;
  findingsCompleted: boolean;
  publishReady: boolean;
};

// Queue failures are audit records; persisted current results decide whether they still block.
export function selectQuickWorkspaceJobs(jobs: QuickJob[], work: CompletedWork) {
  const current = jobs.filter(job => {
    if (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload) && job.payload.mode === 'regenerate') return false;
    if (['analysis', 'report'].includes(job.kind)) return false;
    if (['research', 'protocol'].includes(job.kind)) return !work.protocolId;
    if (['evaluate', 'findings'].includes(job.kind) && job.scope !== work.protocolId) return false;
    if (['discovery', 'publish'].includes(job.kind)) {
      if (jobs.some(next => ['discovery', 'publish'].includes(next.kind) && Date.parse(next.created_at) > Date.parse(job.created_at))) return false;
      if (work.protocolLocked === false) return false;
      if (job.payload && typeof job.payload === 'object' && !Array.isArray(job.payload)
        && typeof job.payload.findingsId === 'string' && work.findingsId !== undefined
        && job.payload.findingsId !== work.findingsId) return false;
    }
    if (job.status !== 'failed') return true;
    if (work.publishReady) return false;
    if (job.kind === 'evaluate' && work.reviewCompleted) return false;
    if (job.kind === 'findings' && work.findingsCompleted) return false;
    // A newer successful delivery resolves only the same kind and input scope.
    return !jobs.some(next => next.kind === job.kind && next.scope === job.scope
      && next.status === 'completed' && next.created_at >= job.created_at);
  });
  return {
    active: current.find(job => ['queued', 'running'].includes(job.status)),
    failed: [...current].reverse().find(job => job.status === 'failed'),
  };
}
