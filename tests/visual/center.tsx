// Monta el Centro real sobre una base IndexedDB de este origen (localhost), sembrada con dos
// perfiles simulados si está vacía. `?reset` la borra y la vuelve a sembrar; `?empty` la deja vacía.
import './preview.css';
import ReactDOM from 'react-dom/client';
import { openDb } from '@/db/schema';
import { applyReelStats, finalizeProfile, savePosts, saveProfile } from '@/db/repo';
import { makePosts, makeProfile } from '../scan/fakeIg';
import { App } from '@/entrypoints/center/App';

const params = new URLSearchParams(location.search);
const db = openDb();
if (params.has('reset') || params.has('empty')) await Promise.all(db.tables.map((t) => t.clear()));
if (!params.has('empty') && (await db.profiles.count()) === 0) {
  const now = Date.now();
  for (const [username, count] of [['perfumeria.demo', 1000], ['otra.marca', 120]] as const) {
    const p = makeProfile(username);
    await saveProfile(db, { ...p, followers: 120_000 });
    const posts = makePosts(p, count, now - 2 * 86_400_000);
    await savePosts(db, posts, now);
    await applyReelStats(db, posts.filter((x) => x.type === 'reel').map((x, i) => ({ code: x.code, views: 2000 + ((i * 7919) % 9000), likes: null, comments: null, durationSec: 30 })), now);
    await finalizeProfile(db, p.id, { now, scanStartedAt: now, fullScan: true, unmatchedReels: 0 });
  }
}
ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
