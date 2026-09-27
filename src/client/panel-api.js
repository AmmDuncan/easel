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

async function send(method, path, body) {
  const r = await fetch(path, {
    method,
    headers: { "content-type": "application/json", "x-easel-token": TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(data.error || `Request failed (${r.status})`);
  }
  return data;
}

export const askStep = (walkId, stepId, question) => send("POST", `/api/walks/${encodeURIComponent(walkId)}/ask`, { stepId, question });
export const deleteWalk = (walkId) => send("DELETE", `/api/walks/${encodeURIComponent(walkId)}`);
export const restoreTrash = (trashId) => send("POST", `/api/trash/${encodeURIComponent(trashId)}/restore`);
export const moveWalk = (walkId, project) => send("POST", `/api/walks/${encodeURIComponent(walkId)}/move`, { project });
export const renameProject = (slug, label) => send("PATCH", `/api/projects/${encodeURIComponent(slug)}`, { label });
export const clearDone = (slug) => send("POST", `/api/projects/${encodeURIComponent(slug)}/clear-done`);
export const deleteProject = (slug) => send("DELETE", `/api/projects/${encodeURIComponent(slug)}`);

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
