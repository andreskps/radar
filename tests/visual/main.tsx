// Monta el panel real con un perfil simulado de 1.000 posts. `browser` se reemplaza por un falso.
import './preview.css';
import ReactDOM from 'react-dom/client';
import { analyzeProfile, viralScores } from '@/metrics';
import type { PanelData, PanelPost } from '@/db/views';
import { createStore } from '@/ui/store';
import { createController } from '@/ui/controller';
import { Panel } from '@/ui/panel/Panel';
import { ProfileChip } from '@/entrypoints/instagram.content/ProfileChip';

const DAY = 86_400_000;
const now = Date.now();
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const words = ['vainilla', 'ámbar', 'cítrico', 'dulce', 'oud', 'fresco', 'nicho', 'regalo', 'verano', 'noche'];
const raw = Array.from({ length: 1000 }, (_, i) => {
  const type = i % 4 === 3 ? 'carousel' : i % 5 === 4 ? 'post' : 'reel';
  const base = 8000 * (1 + i / 400);
  const viral = rnd() < 0.06 ? 4 + rnd() * 20 : 0.4 + rnd() * 1.6;
  const views = type === 'reel' ? Math.round(base * viral) : null;
  const likes = Math.round((views ?? base * 0.4 * viral) * 0.05);
  const w = [words[i % 10], words[(i * 3) % 10]];
  return {
    id: `p${i}`, code: `CODE${i}`, type, takenAt: now - (i * 1.3 + 0.5) * DAY - Math.floor(rnd() * 24) * 3_600_000,
    views, likes, comments: Math.round(likes * 0.04), likesHidden: i % 97 === 0, collab: i % 23 === 0,
    caption: `Perfume ${w.join(' ')} #${w[0]} #perfumes`, hashtags: [`#${w[0]}`, '#perfumes'], durationSec: type === 'reel' ? 30 : null, coverUrl: null,
  } as const;
});
const metrics = analyzeProfile(raw as never, { now, followers: 120_000 });
const scores = viralScores(metrics.map((m) => ({ id: m.postId, multiplier: m.multiplier, reach: m.reach, er: m.er })));
const posts: PanelPost[] = raw.map((p, i) => {
  const m = metrics[i]!;
  return { ...p, hashtags: [...p.hashtags], group: m.group, multiplier: m.multiplier, baseline: m.baseline, sampleSize: m.sampleSize, tier: m.tier, maturity: m.maturity, confidence: m.confidence, er: m.er, hiddenGem: m.hiddenGem, reach: m.reach, viralScore: scores.get(m.postId) ?? null };
});
const data: PanelData = {
  profile: { id: '1', username: 'perfumeria.demo', fullName: 'Demo', followers: 120_000, following: 10, mediaCount: 1000, isVerified: false, isPrivate: false, profilePicUrl: null, biography: null, scannedFrom: raw.at(-1)!.takenAt, scannedTo: raw[0]!.takenAt, complete: true, lastScanAt: now - 2 * 3_600_000, unmatchedReels: 0 },
  posts,
};

const mem: Record<string, unknown> = {};
(globalThis as any).browser = {
  runtime: {
    sendMessage: async (msg: { type: string }) => {
      // Lo último que se pidió al service worker (para revisar el rango elegido en el chip).
      (globalThis as any).radarLastMessage = msg;
      return { ok: true, data };
    },
  },
  storage: { local: { get: async () => mem, set: async (o: object) => Object.assign(mem, o) } },
};

const params = new URLSearchParams(location.search);
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
// ?view=chip muestra el chip del perfil (con el selector de rango) en vez del panel; &new=1 = perfil sin escanear.
const chipOnly = params.get('view') === 'chip';
const store = createStore({ username: 'perfumeria.demo', panelOpen: true, theme, view: { username: 'perfumeria.demo', summary: { username: 'perfumeria.demo', followers: 120000, posts: 1000, reels: 600, medianReelViews: 9000, medianSample: 30, virals: 50, hiddenGems: 10, complete: true, lastScanAt: data.profile!.lastScanAt, scannedFrom: null }, job: null, posts: {} } });
const controller = createController(store);
(globalThis as any).radarTiming = controller.timing;
if (chipOnly) {
  store.set({ panelOpen: false, ...(params.get('new') ? { view: { ...store.get().view!, summary: null } } : {}) });
  ReactDOM.createRoot(document.getElementById('root')!).render(<ProfileChip store={store} controller={controller} />);
} else {
  controller.setPanelOpen(true);
  ReactDOM.createRoot(document.getElementById('root')!).render(<Panel store={store} controller={controller} />);
}
