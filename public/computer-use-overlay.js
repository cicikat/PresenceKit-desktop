const label = new URLSearchParams(window.location.search).get('label');
document.getElementById('status').textContent = label || '';
