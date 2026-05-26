/**
 * Remote-image inlining: pushes that embed cross-origin images (mobbin
 * screenshots, etc.) can't be exported client-side — the images are CORS-
 * blocked from canvas rasterisation. inlineRemoteImages() fetches them server-
 * side at push time and rewrites them to self-contained data: URLs. These
 * tests lock down: only remote http(s) images are touched, non-images and
 * fetch failures are left intact (graceful), dedup, and CSS url() coverage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { inlineRemoteImages } from "../../dist/inline-images.js";

const PNG = "iVBORw0KGgo="; // token base64 body — content is irrelevant here

/** Build a fake fetch from a url→response map. Unmapped urls reject. */
function fakeFetch(routes) {
  return async (url) => {
    const r = routes[url];
    if (!r) throw new Error("ECONNREFUSED");
    return {
      ok: r.ok ?? true,
      status: r.status ?? 200,
      headers: { get: (h) => (h.toLowerCase() === "content-type" ? r.type ?? "image/png" : null) },
      arrayBuffer: async () => Buffer.from(r.body ?? PNG, "base64"),
    };
  };
}

test("inlines a remote <img src> to a data: URL", async () => {
  const html = '<img src="https://mobbin.com/a.png" alt="x">';
  const fetchImpl = fakeFetch({ "https://mobbin.com/a.png": { type: "image/png" } });
  const { html: out, inlined, failed } = await inlineRemoteImages(html, fetchImpl);
  assert.equal(inlined, 1);
  assert.equal(failed.length, 0);
  assert.match(out, /src="data:image\/png;base64,/);
  assert.ok(!out.includes("https://mobbin.com/a.png"));
});

test("inlines a CSS background-image url()", async () => {
  const html = '<div style="background-image: url(https://cdn.test/bg.jpg)"></div>';
  const fetchImpl = fakeFetch({ "https://cdn.test/bg.jpg": { type: "image/jpeg" } });
  const { html: out, inlined } = await inlineRemoteImages(html, fetchImpl);
  assert.equal(inlined, 1);
  assert.match(out, /url\(data:image\/jpeg;base64,/);
});

test("leaves un-fetchable URLs untouched and reports them", async () => {
  const html = '<img src="https://dead.link/x.png">';
  const { html: out, inlined, failed } = await inlineRemoteImages(html, fakeFetch({}));
  assert.equal(inlined, 0);
  assert.equal(out, html);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].url, "https://dead.link/x.png");
});

test("leaves non-image responses untouched", async () => {
  const html = '<img src="https://x.com/login.html">';
  const fetchImpl = fakeFetch({ "https://x.com/login.html": { type: "text/html" } });
  const { html: out, inlined, failed } = await inlineRemoteImages(html, fetchImpl);
  assert.equal(inlined, 0);
  assert.equal(out, html);
  assert.match(failed[0].reason, /not an image/);
});

test("does not touch data:, blob:, or relative URLs (no fetch)", async () => {
  const html =
    '<img src="data:image/png;base64,AAAA"><img src="/local.png"><img src="blob:abc">';
  let fetchCalls = 0;
  const fetchImpl = async () => {
    fetchCalls++;
    throw new Error("should not fetch");
  };
  const { html: out, inlined } = await inlineRemoteImages(html, fetchImpl);
  assert.equal(fetchCalls, 0);
  assert.equal(inlined, 0);
  assert.equal(out, html);
});

test("fetches a repeated URL once and replaces every occurrence", async () => {
  const url = "https://mobbin.com/dup.png";
  const html = `<img src="${url}"><img src="${url}"><img src="${url}">`;
  let fetchCalls = 0;
  const fetchImpl = async (u) => {
    fetchCalls++;
    return {
      ok: true,
      status: 200,
      headers: { get: () => "image/png" },
      arrayBuffer: async () => Buffer.from(PNG, "base64"),
    };
  };
  const { html: out, inlined } = await inlineRemoteImages(html, fetchImpl);
  assert.equal(fetchCalls, 1, "deduped to one fetch");
  assert.equal(inlined, 1);
  assert.ok(!out.includes(url), "all occurrences replaced");
  assert.equal((out.match(/data:image\/png/g) || []).length, 3);
});

test("returns html unchanged when there are no remote images", async () => {
  const html = "<h1>hello</h1><p>no images here</p>";
  let fetchCalls = 0;
  const { html: out, inlined } = await inlineRemoteImages(html, async () => {
    fetchCalls++;
    throw new Error("nope");
  });
  assert.equal(fetchCalls, 0);
  assert.equal(inlined, 0);
  assert.equal(out, html);
});
