import '@/assets/theme.css';
import ReactDOM from 'react-dom/client';
import { StatusIndicator } from './StatusIndicator';
import { createClient, fetchProfile, readProfileContent, type ReadAllOptions } from '@/ig';

// Acceso desde la consola de DevTools (contexto "Radar"): radar.profile('usuario'), radar.read('usuario').
function exposeConsoleApi() {
  const client = createClient();
  (globalThis as Record<string, unknown>).radar = {
    profile: (username: string) => fetchProfile(client, username),
    read: async (username: string, opts: ReadAllOptions = {}) => {
      const t0 = performance.now();
      const result = await readProfileContent(client, username, {
        onProgress: (p) => console.info(`[Radar] ${p.kind} página ${p.page}: ${p.read} leídos`),
        ...opts,
      });
      const byType = result.posts.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.type]: (acc[p.type] ?? 0) + 1 }), {});
      console.info(
        `[Radar] @${username}: ${result.posts.length} posts en ${result.pages} páginas, ${Math.round((performance.now() - t0) / 1000)} s`,
        byType,
        result.outcome,
        result.unmatchedReels.length ? `${result.unmatchedReels.length} reels sin fecha (solo en la pestaña Reels)` : '',
      );
      return result;
    },
  };
}

// Content script en Instagram. La UI vive en un Shadow Root para no alterar los estilos del sitio (RNF-04).
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
    exposeConsoleApi();
    const ui = await createShadowRootUi(ctx, {
      name: 'radar-ui',
      position: 'overlay',
      anchor: 'body',
      onMount(container) {
        const app = document.createElement('div');
        container.append(app);
        const root = ReactDOM.createRoot(app);
        root.render(<StatusIndicator />);
        return root;
      },
      onRemove(root) {
        root?.unmount();
      },
    });
    ui.mount();
  },
});
