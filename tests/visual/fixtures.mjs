/**
 * Visual-regression fixtures for easel's render layer.
 *
 * Each entry is the `html` body of a single push plus its `kind`. The driver
 * pushes every fixture to a running easel server, then the matrix run renders
 * each across preset × theme × density (+ print) and collects the injected
 * contrast audit. Fixtures lead with the primitives most prone to the
 * surface-vs-ink washout bug, then a few realistic composites.
 */

const primitives = [
  {
    name: "window-light",
    kind: "mockup",
    html: `
<div class="window" data-title="Light dashboard">
  <div style="padding:28px;display:flex;flex-direction:column;gap:16px">
    <div style="display:flex;gap:10px">
      <span style="background:#eef2f7;color:#5b6677;padding:6px 12px;border-radius:8px;font-size:13px">Month to date</span>
      <span style="background:#eef2f7;color:#9aa4b2;padding:6px 12px;border-radius:8px;font-size:13px">Old system vs new</span>
    </div>
    <div style="display:flex;gap:16px">
      <div style="flex:1;border:1px solid #e6e9ef;border-radius:12px;padding:18px">
        <div style="color:#8b94a3;font-size:12px;letter-spacing:.04em">INVOICES</div>
        <div style="font-size:30px;font-weight:600;color:#16a34a">1,284</div>
        <div style="color:#9aa4b2;font-size:12px">842,300.00</div>
      </div>
      <div style="flex:1;border:1px solid #e6e9ef;border-radius:12px;padding:18px">
        <div style="color:#8b94a3;font-size:12px;letter-spacing:.04em">PAYMENTS</div>
        <div style="font-size:30px;font-weight:600;color:#dc2626">942</div>
        <div style="color:#9aa4b2;font-size:12px">615,900.00</div>
      </div>
    </div>
  </div>
</div>`,
  },
  {
    name: "window-dark",
    kind: "mockup",
    html: `
<div class="window dark" data-title="Dark app">
  <div style="padding:28px;display:flex;flex-direction:column;gap:16px">
    <div style="color:#9aa4b2;font-size:13px">Subtle secondary label on a dark surface</div>
    <div style="font-size:24px;font-weight:600">Primary heading inherits the dark ink</div>
    <div style="border:1px solid #2a2f3a;border-radius:12px;padding:18px;background:#1d222c">
      <div style="color:#8b94a3;font-size:12px">PANEL LABEL</div>
      <div style="font-size:26px;font-weight:600">$48,210</div>
    </div>
  </div>
</div>`,
  },
  {
    // Regression: app-fidelity (kind:"mockup") push that paints its own ink via
    // light-dark() on a bare .wrap — NO .window chrome. The preset tokens are
    // omitted in app-fidelity mode, so without a color-scheme→data-theme binding
    // in the structural CSS, light-dark() follows the OS scheme and the ink
    // washes out whenever the OS disagrees with the easel toggle. Must stay
    // theme-flip-stable (readable in BOTH light and dark host).
    name: "mockup-lightdark-ink",
    kind: "mockup",
    html: `
<div class="wrap" style="padding:40px;font-family:Inter,system-ui,sans-serif;color:light-dark(#10251b,#eef6f0)">
  <style>:root{color-scheme:light dark}.wrap *{color:inherit}</style>
  <div style="font-size:30px;font-weight:600;letter-spacing:-.02em">Self-service proposal</div>
  <p style="font-size:17px;line-height:1.55">Body copy painted with light-dark() ink on a bare wrap. It must track the easel light/dark toggle, not the OS scheme.</p>
  <p style="font-size:15px;opacity:.75">Secondary line that should also stay readable in both host themes.</p>
</div>`,
  },
  {
    name: "window-desktop",
    kind: "mockup",
    html: `
<div class="window desktop" data-title="Full desktop canvas">
  <div style="padding:40px">
    <h2 style="margin-top:0">Settings</h2>
    <p style="color:#5b6677">A full-screen mock should sit in a tall viewport, not a short strip.</p>
  </div>
</div>`,
  },
  {
    name: "code-block",
    kind: "default",
    html: `
<div class="code"><span class="kw">const</span> <span class="prop">port</span> = <span class="num">7900</span>;
<span class="kw">function</span> <span class="fn">boot</span>() { <span class="comment">// start the server</span>
  <span class="prop">app</span>.<span class="fn">listen</span>(<span class="prop">port</span>, <span class="string">"127.0.0.1"</span>);
}</div>`,
  },
  {
    name: "terminal-block",
    kind: "default",
    html: `
<div class="terminal"><span class="muted">$</span> <span class="fn">gcloud</span> services enable run.googleapis.com
<span class="accent">✓</span> Operation finished successfully.</div>`,
  },
  {
    name: "pre-code",
    kind: "default",
    html: `<pre><code>npm install
npm run build
npm publish</code></pre>`,
  },
  {
    name: "cards",
    kind: "default",
    html: `
<div class="card"><h3 style="margin-top:0">Card title</h3><p>Card body text on a surface token.</p></div>
<div class="panel"><h3 style="margin-top:0">Panel title</h3><p>Panel body text.</p></div>`,
  },
  {
    name: "chips",
    kind: "default",
    html: `
<div style="display:flex;gap:10px;flex-wrap:wrap">
  <span class="chip bug">BUG</span>
  <span class="chip ux">UX</span>
  <span class="chip polish">POLISH</span>
  <span class="chip ok">OK</span>
  <span class="chip info">INFO</span>
  <span class="chip accent">ACCENT</span>
</div>`,
  },
  {
    name: "table",
    kind: "default",
    html: `
<table>
  <thead><tr><th>Primitive</th><th>Surface</th><th>Status</th></tr></thead>
  <tbody>
    <tr><td>.window</td><td>stable light</td><td>fixed</td></tr>
    <tr><td>.code</td><td>locked dark</td><td>ok</td></tr>
    <tr><td>.card</td><td>token</td><td>ok</td></tr>
  </tbody>
</table>`,
  },
  {
    name: "blockquote",
    kind: "default",
    html: `<blockquote>A mockup renders an app's own UI and should look the same to every viewer.</blockquote>`,
  },
  {
    name: "prose",
    kind: "default",
    html: `
<div class="wrap">
  <span class="kicker">Release notes</span>
  <h1>Render validation</h1>
  <p class="lede">A lede paragraph in the soft-ink token, capped to a comfortable reading width.</p>
  <h2>Section heading</h2>
  <p>Body copy with an <a href="#">inline link</a> and a bit of <code>inline code</code>.</p>
  <ul><li>First bullet point</li><li>Second bullet point</li></ul>
  <h3>Subsection</h3>
  <ol><li>Ordered one</li><li>Ordered two</li></ol>
</div>`,
  },
  {
    name: "full-bleed-window",
    kind: "mockup",
    html: `
<p>Intro prose above a full-bleed mockup.</p>
<div class="full-bleed">
  <div class="window" data-title="Full-bleed window">
    <div style="padding:28px"><span style="color:#8b94a3">Faint label inside a full-bleed window</span></div>
  </div>
</div>`,
  },
  {
    name: "composite-dashboard",
    kind: "mockup",
    html: `
<div class="full-bleed">
  <div class="window desktop" data-title="Performance Metrics — DVLA">
    <div style="padding:32px;display:flex;flex-direction:column;gap:20px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <h2 style="margin:0;font-size:20px">Performance metrics</h2>
        <span style="border:1px solid #e6e9ef;color:#7a8494;padding:7px 13px;border-radius:9px;font-size:13px">Date range · 1 May – 25 May</span>
      </div>
      <div style="display:flex;gap:10px">
        <span style="background:#0f7a3d;color:#fff;padding:7px 13px;border-radius:8px;font-size:13px">Month to date</span>
        <span style="background:#eef2f7;color:#8b94a3;padding:7px 13px;border-radius:8px;font-size:13px">Old system vs IPP Pro</span>
        <span style="background:#eef2f7;color:#8b94a3;padding:7px 13px;border-radius:8px;font-size:13px">Service group</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px">
        <div style="border:1px solid #e6e9ef;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:11px;letter-spacing:.05em">INVOICES · OLD</div>
          <div style="font-size:28px;font-weight:600;color:#16a34a">1,284</div>
          <div style="color:#9aa4b2;font-size:12px">842,300.00</div>
        </div>
        <div style="border:1px solid #e6e9ef;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:11px;letter-spacing:.05em">INVOICES · IPP</div>
          <div style="font-size:28px;font-weight:600;color:#dc2626">8,921</div>
          <div style="color:#9aa4b2;font-size:12px">4,193,220.00</div>
        </div>
        <div style="border:1px solid #e6e9ef;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:11px;letter-spacing:.05em">PAYMENTS · OLD</div>
          <div style="font-size:28px;font-weight:600;color:#16a34a">942</div>
          <div style="color:#9aa4b2;font-size:12px">615,900.00</div>
        </div>
        <div style="border:1px solid #e6e9ef;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:11px;letter-spacing:.05em">PAYMENTS · IPP</div>
          <div style="font-size:28px;font-weight:600;color:#dc2626">7,480</div>
          <div style="color:#9aa4b2;font-size:12px">3,910,600.00</div>
        </div>
      </div>
      <div style="color:#9aa4b2;font-size:12px">Click a service group to inspect fee lines.</div>
    </div>
  </div>
</div>`,
  },
  {
    name: "composite-dark-app",
    kind: "mockup",
    html: `
<div class="full-bleed">
  <div class="window dark desktop" data-title="Analytics — dark theme">
    <div style="padding:32px;display:flex;flex-direction:column;gap:20px">
      <h2 style="margin:0">Overview</h2>
      <div style="color:#9aa4b2;font-size:13px">Secondary copy on the dark canvas stays legible.</div>
      <div style="display:flex;gap:16px">
        <div style="flex:1;background:#1d222c;border:1px solid #2a2f3a;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:12px">ACTIVE USERS</div>
          <div style="font-size:28px;font-weight:600">12,408</div>
        </div>
        <div style="flex:1;background:#1d222c;border:1px solid #2a2f3a;border-radius:12px;padding:18px">
          <div style="color:#8b94a3;font-size:12px">REVENUE</div>
          <div style="font-size:28px;font-weight:600">$48,210</div>
        </div>
      </div>
    </div>
  </div>
</div>`,
  },
  {
    name: "composite-code-walkthrough",
    kind: "default",
    html: `
<div class="wrap">
  <span class="kicker">Walkthrough</span>
  <h1>Booting the test server</h1>
  <p class="lede">Three steps, each shown as a locked code block.</p>
  <h3>1. Build</h3>
  <div class="code"><span class="prop">npm</span> run build</div>
  <h3>2. Start on an isolated port</h3>
  <div class="terminal"><span class="muted">$</span> EASEL_PORT=<span class="num">7900</span> node dist/http-entry.js</div>
  <h3>3. Push a fixture</h3>
  <div class="code"><span class="fn">fetch</span>(<span class="string">"/api/push"</span>, { <span class="prop">method</span>: <span class="string">"POST"</span> })</div>
</div>`,
  },
];

export const fixtures = primitives;
