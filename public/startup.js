// This tiny classic script runs before the app's module graph or disk IPC.
// Auxiliary transparent windows must never receive the main-window shell.
document.documentElement.dataset.window = new URLSearchParams(location.search).get('window') || 'chat';
