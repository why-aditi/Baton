// Dev-only: calls a resolver through the Custom UI bridge (what @forge/bridge's invoke does) and
// prints the reply. External file because Custom UI's CSP blocks inline scripts.
document.getElementById('run').addEventListener('click', async () => {
  const out = document.getElementById('out');
  out.textContent = 'Running…';
  try {
    const raw = document.getElementById('payload').value.trim();
    const payload = raw ? JSON.parse(raw) : {};
    const functionKey = document.getElementById('fn').value.trim();
    const res = await globalThis.__bridge.callBridge('invoke', { functionKey, payload });
    out.textContent = JSON.stringify(res, null, 2);
  } catch (e) {
    out.textContent = 'Error: ' + (e && e.message ? e.message : e);
  }
});
