const params = new URLSearchParams(window.location.search);
document.documentElement.dataset.cue ??= params.get('cue') || 'legacy';
document.getElementById('status').textContent = params.get('label') || '';
