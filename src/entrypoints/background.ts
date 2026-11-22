// Service worker. En fases siguientes: cola de escaneo, alarmas, notificaciones y Whisper (offscreen).
export default defineBackground(() => {
  // Clic en el icono de la extensión → abre el Centro en una pestaña.
  browser.action.onClicked.addListener(() => {
    browser.tabs.create({ url: browser.runtime.getURL('/center.html') });
  });
});
