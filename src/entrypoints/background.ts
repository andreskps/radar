// Service worker: cola de escaneo, alarmas de reanudación y acceso a la base para el content script.
import { openDb, getProfileByUsername, profilePosts } from '@/db';
import { ScanQueue, type ProgressMessage, type StoredProfile, type WorkerRequest } from '@/scan';
import { createTabFetcher } from '@/scan/tabFetcher';
import type { ScanJobRow } from '@/db';

const WAKE_ALARM = 'radar-scan-wake';
/** Vigía: mientras hay escaneo, despierta al service worker cada minuto por si Chrome lo suspendió. */
const WATCHDOG_ALARM = 'radar-scan-watchdog';

export default defineBackground(() => {
  const db = openDb();

  const queue = new ScanQueue({
    db,
    fetcher: createTabFetcher(),
    scheduleWake: (at) => {
      if (at === null) void browser.alarms.clear(WAKE_ALARM);
      else void browser.alarms.create(WAKE_ALARM, { when: Math.max(at, Date.now() + 1000) });
    },
    setBusy: (busy) => {
      if (busy) void browser.alarms.create(WATCHDOG_ALARM, { periodInMinutes: 1 });
      else void browser.alarms.clear(WATCHDOG_ALARM);
    },
    onUpdate: (job) => void report(job),
  });

  async function report(job: ScanJobRow) {
    const text = job.status === 'running' ? String(job.read) : job.status === 'paused' ? '||' : job.status === 'error' ? '!' : '';
    void browser.action.setBadgeText({ text });
    console.info(`[Radar] @${job.username} ${job.status} ${job.phase}: ${job.read} posts, ${job.reelsRead} reels, ${job.pages} páginas`, job.message ?? '');
    const msg: ProgressMessage = { type: 'scan/progress', job };
    for (const tab of await browser.tabs.query({ url: ['*://*.instagram.com/*'] })) {
      if (tab.id !== undefined) browser.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  }

  async function storedProfile(username: string): Promise<StoredProfile> {
    const profile = (await getProfileByUsername(db, username)) ?? null;
    if (!profile) return { profile, posts: 0, reelsWithViews: 0, metrics: 0, snapshots: 0 };
    const posts = await profilePosts(db, profile.id);
    return {
      profile,
      posts: posts.length,
      reelsWithViews: posts.filter((p) => p.type === 'reel' && p.views !== null).length,
      metrics: await db.metrics.where('profileId').equals(profile.id).count(),
      snapshots: await db.snapshots.where('postId').anyOf(posts.map((p) => p.id)).count(),
    };
  }

  async function handle(msg: WorkerRequest): Promise<unknown> {
    switch (msg.type) {
      case 'scan/enqueue': {
        const job = await queue.enqueue(msg.username, msg.mode);
        void queue.ensureRunning();
        return job;
      }
      case 'scan/jobs':
        return db.scanJobs.orderBy('id').reverse().limit(20).toArray();
      case 'scan/pause':
        return queue.pause(msg.id);
      case 'scan/resume':
        await queue.resume(msg.id);
        void queue.ensureRunning();
        return;
      case 'scan/cancel':
        return queue.cancel(msg.id);
      case 'db/profile':
        return storedProfile(msg.username);
    }
  }

  browser.runtime.onMessage.addListener((msg: WorkerRequest, _sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || !String((msg as { type?: string }).type).match(/^(scan|db)\//)) return;
    handle(msg).then(
      (data) => sendResponse({ ok: true, data }),
      (e: Error) => sendResponse({ ok: false, message: e.message }),
    );
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WAKE_ALARM || alarm.name === WATCHDOG_ALARM) void queue.ensureRunning();
  });

  // Al arrancar el service worker (Chrome recién abierto o reactivado): retomar lo pendiente.
  void queue.ensureRunning();

  // Clic en el icono de la extensión → abre el Centro en una pestaña.
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('/center.html') });
  });
});
