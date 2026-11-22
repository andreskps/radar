// Service worker: cola de escaneo, alarmas de reanudación, contador del icono por pestaña
// y acceso a la base para el content script (que no la ve: corre en el origen de Instagram).
import { openDb, getProfileByUsername, profilePosts, loadProfileView, jobFor } from '@/db';
import { ScanQueue, type ProgressMessage, type StoredProfile, type WorkerRequest } from '@/scan';
import { createTabFetcher } from '@/scan/tabFetcher';
import { actionBadgeText } from '@/ui/format';
import type { ScanJobRow } from '@/db';

const WAKE_ALARM = 'radar-scan-wake';
/** Vigía: mientras hay escaneo, despierta al service worker cada minuto por si Chrome lo suspendió. */
const WATCHDOG_ALARM = 'radar-scan-watchdog';
/** Pestaña → perfil abierto. En storage.session para sobrevivir a que Chrome suspenda el SW. */
const TABS_KEY = 'radar:tabProfiles';

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

  // ---- Contador del icono por pestaña (según el perfil abierto en cada una) ----
  async function tabProfiles(): Promise<Record<string, string>> {
    return ((await browser.storage.session.get(TABS_KEY))[TABS_KEY] as Record<string, string> | undefined) ?? {};
  }

  async function setTabProfile(tabId: number, username: string | null) {
    const map = await tabProfiles();
    if (username) map[tabId] = username;
    else delete map[tabId];
    await browser.storage.session.set({ [TABS_KEY]: map });
    await paintTab(tabId, username);
  }

  async function paintTab(tabId: number, username: string | null, job?: ScanJobRow | null) {
    let text = '';
    let active = false;
    if (username) {
      const j = job !== undefined ? job : await jobFor(db, username);
      const profile = await getProfileByUsername(db, username);
      const posts = profile ? await db.posts.where('profileId').equals(profile.id).count() : null;
      text = actionBadgeText(posts, j);
      active = !!j && ['queued', 'running', 'paused'].includes(j.status);
    }
    try {
      await browser.action.setBadgeText({ tabId, text });
      await browser.action.setBadgeBackgroundColor({ tabId, color: active ? '#C6F432' : '#1B1E27' });
      await browser.action.setBadgeTextColor({ tabId, color: active ? '#12141A' : '#E8EAF0' });
    } catch {
      // La pestaña se cerró.
    }
  }

  browser.tabs.onRemoved.addListener((tabId) => {
    void tabProfiles().then((map) => {
      if (!(tabId in map)) return;
      delete map[tabId];
      return browser.storage.session.set({ [TABS_KEY]: map });
    });
  });

  async function report(job: ScanJobRow) {
    console.info(`[Radar] @${job.username} ${job.status} ${job.phase}: ${job.read} posts, ${job.reelsRead} reels, ${job.pages} páginas`, job.message ?? '');
    const map = await tabProfiles();
    for (const [tabId, username] of Object.entries(map)) {
      if (username === job.username) void paintTab(Number(tabId), username, job);
    }
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

  async function exportProfile(username: string) {
    const profile = (await getProfileByUsername(db, username)) ?? null;
    if (!profile) return null;
    const [posts, metrics] = await Promise.all([profilePosts(db, profile.id), db.metrics.where('profileId').equals(profile.id).toArray()]);
    return { profile, posts, metrics };
  }

  async function handle(msg: WorkerRequest, tabId: number | undefined): Promise<unknown> {
    switch (msg.type) {
      case 'scan/enqueue': {
        const job = await queue.enqueue(msg.username, msg.mode);
        void queue.ensureRunning();
        void report(job);
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
      case 'db/export':
        return exportProfile(msg.username);
      case 'view/profile':
        return loadProfileView(db, msg.username);
      case 'tab/profile':
        if (tabId !== undefined) await setTabProfile(tabId, msg.username);
        return;
    }
  }

  browser.runtime.onMessage.addListener((msg: WorkerRequest, sender, sendResponse) => {
    if (!msg || typeof msg !== 'object' || !/^(scan|db|view|tab)\//.test(String((msg as { type?: string }).type))) return;
    handle(msg, sender.tab?.id).then(
      (data) => sendResponse({ ok: true, data }),
      (e: Error) => sendResponse({ ok: false, message: e.message }),
    );
    return true;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === WAKE_ALARM || alarm.name === WATCHDOG_ALARM) void queue.ensureRunning();
  });

  // Build de pruebas: recargarse solo cuando hay un build nuevo en disco, y recargar las
  // pestañas de Instagram para que tomen el content script nuevo.
  if (__RADAR_BUILD_STAMP__) {
    setInterval(async () => {
      try {
        const disk = (await (await fetch(browser.runtime.getURL('/build-stamp.txt' as never), { cache: 'no-store' })).text()).trim();
        if (disk && disk !== __RADAR_BUILD_STAMP__) browser.runtime.reload();
      } catch {
        // El build se está escribiendo: se reintenta en la próxima vuelta.
      }
    }, 3000);
    browser.runtime.onInstalled.addListener(async ({ reason }) => {
      if (reason !== 'update') return;
      for (const tab of await browser.tabs.query({ url: ['*://*.instagram.com/*'] })) if (tab.id !== undefined) void browser.tabs.reload(tab.id);
    });
  }

  // El contador global queda vacío: cada pestaña tiene el suyo.
  void browser.action.setBadgeText({ text: '' });

  // Al arrancar el service worker (Chrome recién abierto o reactivado): retomar lo pendiente.
  void queue.ensureRunning();

  // Clic en el icono de la extensión → abre el Centro en una pestaña.
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('/center.html') });
  });
});
