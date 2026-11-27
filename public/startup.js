// This tiny classic script runs before the app's module graph or disk IPC.
// Auxiliary transparent windows must never receive the main-window shell.
document.documentElement.dataset.window = new URLSearchParams(location.search).get('window') || 'chat';
// Match the semantic locale selection before the module graph is available.
try {
  document.documentElement.dataset.startupLanguage = localStorage.getItem('presencekit.language') === 'en-US' ? 'en-US' : 'zh-CN';
} catch {
  document.documentElement.dataset.startupLanguage = 'zh-CN';
}
