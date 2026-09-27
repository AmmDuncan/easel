/**
 * Decide what to do when a walk arrives: if a panel is already listening on
 * the global event stream, do nothing (it will show the toast itself). Else
 * launch the native panel app if it's installed, else fall back to opening
 * the walk URL in the browser.
 */
export function walkOpenAction(
  globalClients: number,
  panelAppExists: boolean,
): "none" | "launch-panel" | "open-browser" {
  if (globalClients > 0) {
    return "none";
  }
  if (panelAppExists) {
    return "launch-panel";
  }
  return "open-browser";
}
