// Vercel uses the authenticated Cron worker. Its instrumentation bundle must not
// pull the development poller's entire AI/media graph into every page function.
export async function startNodeWorker() {}
