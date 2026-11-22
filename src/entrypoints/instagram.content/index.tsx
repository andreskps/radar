import '@/assets/theme.css';
import ReactDOM from 'react-dom/client';
import { StatusIndicator } from './StatusIndicator';

// Content script en Instagram. La UI vive en un Shadow Root para no alterar los estilos del sitio (RNF-04).
export default defineContentScript({
  matches: ['*://*.instagram.com/*'],
  cssInjectionMode: 'ui',

  async main(ctx) {
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
