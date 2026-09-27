// Server + native-shell access for the walks panel.

const TOKEN = document.querySelector('meta[name="easel-token"]')?.content ?? "";

export async function getJson(path) {
  const r = await fetch(path);
  if (!r.ok) {
    throw new Error(`${r.status} ${path}`);
  }
  return r.json();
}

export async function putProgress(walkId, patch) {
  const r = await fetch(`/api/walks/${encodeURIComponent(walkId)}/progress`, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-easel-token": TOKEN },
    body: JSON.stringify(patch),
  });
  if (!r.ok) {
    throw new Error(`progress save failed (${r.status})`);
  }
  return r.json();
}

/** Subscribe to the global event stream; returns an unsubscribe function. */
export function onEvents(handlers) {
  const es = new EventSource("/events");
  for (const [event, fn] of Object.entries(handlers)) {
    es.addEventListener(event, (e) => fn(JSON.parse(e.data || "{}")));
  }
  return () => es.close();
}

/** Ask the native panel to hide; no-op in a normal browser tab. */
export function hidePanel() {
  window.webkit?.messageHandlers?.easel?.postMessage({ type: "hide" });
}

/** Open an external link outside the panel. */
export function openExternal(url) {
  window.open(url, "_blank", "noopener");
}
