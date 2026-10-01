const NATIVE_HOST = "com.streamcatch.host";
const STORAGE_KEY = "capturedLinks";
const DOWNLOAD_DIR_KEY = "downloadDir";
const MAX_LINKS = 100;
const DEFAULT_DOWNLOAD_DIR = "";

const URL_PATTERNS = [
  /manifest\/video\.m3u8/i,
  /thumbnails\/thumbnail\.jpg/i,
  /\.m3u8(?:$|\?)/i,
];

function isInterestingUrl(url) {
  if (!url || typeof url !== "string") {
    return false;
  }
  return URL_PATTERNS.some((pattern) => pattern.test(url));
}

function linkKind(url) {
  if (/manifest\/video\.m3u8/i.test(url)) {
    return "manifest";
  }
  if (/thumbnails\/thumbnail\.jpg/i.test(url)) {
    return "thumbnail";
  }
  if (/\.m3u8(?:$|\?)/i.test(url)) {
    return "m3u8";
  }
  return "other";
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token).split(".");
    if (parts.length < 2) {
      return null;
    }
    let payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (payload.length % 4) {
      payload += "=";
    }
    return JSON.parse(atob(payload));
  } catch (error) {
    return null;
  }
}

function extractCloudflareVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.endsWith(".cloudflarestream.com") &&
      !host.endsWith("videodelivery.net") &&
      host !== "cloudflarestream.com"
    ) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 1) {
      return null;
    }

    const token = parts[0];
    const payload = decodeJwtPayload(token);
    if (payload && payload.sub) {
      return String(payload.sub);
    }

    // Unsigned / bare video-id paths only (not JWT-shaped tokens).
    if (
      parts.length >= 2 &&
      !token.includes(".") &&
      (parts[1] === "manifest" || parts[1] === "thumbnails" || parts[1] === "iframe")
    ) {
      return parts[0];
    }
  } catch (error) {
    return null;
  }
  return null;
}

function cloudflareVideoKey(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const videoId = extractCloudflareVideoId(url);
    if (videoId) {
      return `${host}::${videoId}`;
    }
  } catch (error) {
    return null;
  }
  return null;
}

/**
 * Same Cloudflare video (by id) collapses even when signed tokens differ.
 * Thumbnail + manifest for the same video also collapse.
 */
function streamIdentity(url) {
  const cloudflareKey = cloudflareVideoKey(url);
  if (cloudflareKey) {
    return cloudflareKey;
  }

  try {
    const parsed = new URL(url);
    let path = parsed.pathname;
    path = path.replace(/\/thumbnails\/thumbnail\.jpg$/i, "/manifest/video.m3u8");
    return `${parsed.origin}${path}`;
  } catch (error) {
    return url
      .split("#")[0]
      .split("?")[0]
      .replace(/\/thumbnails\/thumbnail\.jpg$/i, "/manifest/video.m3u8");
  }
}

function preferUrl(existingUrl, candidateUrl) {
  const existingKind = linkKind(existingUrl);
  const candidateKind = linkKind(candidateUrl);
  if (existingKind === "thumbnail" && candidateKind !== "thumbnail") {
    return candidateUrl;
  }
  if (candidateKind === "thumbnail" && existingKind !== "thumbnail") {
    return existingUrl;
  }
  return existingUrl || candidateUrl;
}

function displayKind(url) {
  const kind = linkKind(url);
  if (kind === "thumbnail" || kind === "manifest") {
    return "stream";
  }
  return kind;
}

async function getLinks() {
  const data = await browser.storage.local.get(STORAGE_KEY);
  return data[STORAGE_KEY] || [];
}

async function saveLinks(links) {
  await browser.storage.local.set({ [STORAGE_KEY]: links });
  updateBadge(links.length);
}

function updateBadge(count) {
  const text = count > 0 ? String(count) : "";
  browser.browserAction.setBadgeText({ text });
  browser.browserAction.setBadgeBackgroundColor({ color: "#1a5f4a" });
}

function mergeLinkRecord(previous, next) {
  const bestUrl = preferUrl(previous.url, next.url);
  // Once a stream has a label from capture-time active title, keep it.
  const keepPreviousLabel = Boolean(previous.label);
  return {
    ...previous,
    ...next,
    url: bestUrl,
    kind: displayKind(bestUrl),
    identity: streamIdentity(bestUrl),
    videoId: next.videoId || previous.videoId || extractCloudflareVideoId(bestUrl),
    label: keepPreviousLabel ? previous.label : next.label || "",
    labelConfidence: keepPreviousLabel
      ? previous.labelConfidence || 0
      : next.labelConfidence || 0,
    labelSource: keepPreviousLabel
      ? previous.labelSource || ""
      : next.labelSource || "",
    pageUrl: next.pageUrl || previous.pageUrl || "",
    pageTitle: next.pageTitle || previous.pageTitle || "",
    documentUrl: next.documentUrl || previous.documentUrl || "",
    originUrl: next.originUrl || previous.originUrl || "",
    requestType: next.requestType || previous.requestType || "",
    capturedAt: Math.max(previous.capturedAt || 0, next.capturedAt || 0),
  };
}

function dedupeLinks(links) {
  const byIdentity = new Map();

  for (const item of links) {
    const identity = item.identity || streamIdentity(item.url);
    const enriched = {
      ...item,
      identity,
      videoId: item.videoId || extractCloudflareVideoId(item.url),
      kind: displayKind(item.url),
    };
    const previous = byIdentity.get(identity);
    if (!previous) {
      byIdentity.set(identity, enriched);
      continue;
    }
    byIdentity.set(identity, mergeLinkRecord(previous, enriched));
  }

  return Array.from(byIdentity.values()).sort(
    (a, b) => (b.capturedAt || 0) - (a.capturedAt || 0)
  );
}

async function fetchActiveTitle(tabId) {
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      type: "getActiveTitle",
    });
    if (response && response.active && response.active.label) {
      return response.active;
    }
  } catch (error) {
    // Content script may not be injected yet.
  }
  return null;
}

async function applyActiveTitleToIdentity(identity, tabId) {
  const active = await fetchActiveTitle(tabId);
  if (!active || !active.label) {
    return;
  }

  const links = await getLinks();
  const index = links.findIndex(
    (item) => (item.identity || streamIdentity(item.url)) === identity
  );
  if (index < 0) {
    return;
  }

  const item = links[index];
  // Never overwrite a label once it has been assigned at capture time.
  if (item.label) {
    return;
  }

  links[index] = {
    ...item,
    label: active.label,
    labelSource: active.source || "active-title",
    labelConfidence: active.confidence || 90,
  };
  await saveLinks(dedupeLinks(links));
}

async function addLink(url, context = {}) {
  if (!isInterestingUrl(url)) {
    return;
  }

  const identity = streamIdentity(url);
  const videoId = extractCloudflareVideoId(url);
  const links = await getLinks();
  const tabId = context.tabId;

  let pageUrl = context.pageUrl || "";
  let pageTitle = context.pageTitle || "";
  if (typeof tabId === "number" && tabId >= 0 && (!pageUrl || !pageTitle)) {
    try {
      const tab = await browser.tabs.get(tabId);
      pageUrl = pageUrl || tab.url || "";
      pageTitle = pageTitle || tab.title || "";
    } catch (error) {
      // Tab may already be closed.
    }
  }

  const record = {
    url,
    kind: displayKind(url),
    identity,
    videoId: videoId || "",
    label: context.label || "",
    labelSource: context.labelSource || "",
    labelConfidence: context.labelConfidence || 0,
    pageUrl,
    pageTitle,
    documentUrl: context.documentUrl || "",
    originUrl: context.originUrl || "",
    requestType: context.requestType || "",
    capturedAt: Date.now(),
  };

  const existingIndex = links.findIndex(
    (item) => (item.identity || streamIdentity(item.url)) === identity
  );
  const isNew = existingIndex < 0;

  if (!isNew) {
    links[existingIndex] = mergeLinkRecord(links[existingIndex], record);
  } else {
    links.unshift(record);
  }

  await saveLinks(dedupeLinks(links).slice(0, MAX_LINKS));

  // Label newly seen streams with the active lesson title shortly after capture,
  // so the page has time to update the iframe/TOC title first.
  if (isNew && typeof tabId === "number" && tabId >= 0) {
    setTimeout(() => {
      applyActiveTitleToIdentity(identity, tabId).catch(() => {});
    }, 500);
    setTimeout(() => {
      applyActiveTitleToIdentity(identity, tabId).catch(() => {});
    }, 1500);
  }
}

function toM3u8Url(url) {
  if (url.includes("manifest/video.m3u8")) {
    return url;
  }
  if (url.includes("thumbnails/thumbnail.jpg")) {
    return url.replace("thumbnails/thumbnail.jpg", "manifest/video.m3u8");
  }
  return url;
}

function openDownloadDialog(url) {
  const params = new URLSearchParams({ url });
  browser.windows.create({
    url: `download.html?${params.toString()}`,
    type: "popup",
    width: 480,
    height: 420,
  });
}

function openBulkDownloadDialog() {
  browser.windows.create({
    url: "bulk-download.html",
    type: "popup",
    width: 540,
    height: 640,
  });
}

async function sendNative(message) {
  return browser.runtime.sendNativeMessage(NATIVE_HOST, message);
}

function captureFromDetails(details) {
  if (details.tabId < 0) {
    return;
  }
  addLink(details.url, {
    tabId: details.tabId,
    documentUrl: details.documentUrl || "",
    originUrl: details.originUrl || "",
    requestType: details.type || "",
  });
}

browser.webRequest.onCompleted.addListener(captureFromDetails, {
  urls: ["<all_urls>"],
});

browser.menus.create({
  id: "streamcatch-root",
  title: "StreamCatch",
  contexts: ["link", "video", "audio", "page"],
});

browser.menus.create({
  id: "streamcatch-capture-link",
  parentId: "streamcatch-root",
  title: "Add link to StreamCatch list",
  contexts: ["link"],
});

browser.menus.create({
  id: "streamcatch-download-link",
  parentId: "streamcatch-root",
  title: "Download with ffmpeg…",
  contexts: ["link"],
});

browser.menus.create({
  id: "streamcatch-open-link",
  parentId: "streamcatch-root",
  title: "Open link in new tab",
  contexts: ["link"],
});

browser.menus.onClicked.addListener(async (info, tab) => {
  const url = info.linkUrl || info.srcUrl || "";
  if (!url) {
    return;
  }

  if (info.menuItemId === "streamcatch-capture-link") {
    await addLink(url, { tabId: tab && tab.id });
    return;
  }

  if (info.menuItemId === "streamcatch-download-link") {
    openDownloadDialog(url);
    return;
  }

  if (info.menuItemId === "streamcatch-open-link") {
    browser.tabs.create({ url });
  }
});

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === "openDownloadDialog") {
    openDownloadDialog(message.url);
    return Promise.resolve({ ok: true });
  }

  if (message.type === "openBulkDownloadDialog") {
    openBulkDownloadDialog();
    return Promise.resolve({ ok: true });
  }

  if (message.type === "getLinks") {
    return getLinks().then((links) => ({ ok: true, links }));
  }

  if (message.type === "streamLabels") {
    // Legacy message from older content scripts; ignore.
    return Promise.resolve({ ok: true });
  }

  if (message.type === "openTab") {
    return browser.tabs.create({ url: message.url }).then(() => ({ ok: true }));
  }

  if (message.type === "openWindow") {
    return browser.windows
      .create({ url: message.url, type: "normal" })
      .then(() => ({ ok: true }));
  }

  if (message.type === "clearLinks") {
    return saveLinks([]).then(() => ({ ok: true }));
  }

  if (message.type === "removeLink") {
    return getLinks().then((links) => {
      const identity = streamIdentity(message.url);
      const next = links.filter(
        (item) => (item.identity || streamIdentity(item.url)) !== identity
      );
      return saveLinks(next).then(() => ({ ok: true }));
    });
  }

  if (message.type === "dedupeLinks") {
    return getLinks().then((links) =>
      saveLinks(dedupeLinks(links)).then(() => ({ ok: true }))
    );
  }

  if (message.type === "toM3u8Url") {
    return Promise.resolve({ url: toM3u8Url(message.url) });
  }

  if (message.type === "getDownloadDir") {
    return browser.storage.local.get(DOWNLOAD_DIR_KEY).then((data) => ({
      downloadDir: data[DOWNLOAD_DIR_KEY] || DEFAULT_DOWNLOAD_DIR,
    }));
  }

  if (message.type === "setDownloadDir") {
    return browser.storage.local
      .set({ [DOWNLOAD_DIR_KEY]: message.downloadDir })
      .then(() => ({ ok: true }));
  }

  if (message.type === "collectDebugInfo") {
    return getLinks().then(async (links) => {
      const videoIds = links
        .map((item) => item.videoId || extractCloudflareVideoId(item.url))
        .filter(Boolean);
      const stored = links.map((item) => ({
        videoId: item.videoId || extractCloudflareVideoId(item.url) || "",
        label: item.label || "",
        labelSource: item.labelSource || "",
        labelConfidence: item.labelConfidence || 0,
        pageTitle: item.pageTitle || "",
        pageUrl: item.pageUrl || "",
        documentUrl: item.documentUrl || "",
        url: item.url,
        capturedAt: item.capturedAt || 0,
      }));

      let pageDebug = null;
      try {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (tab && tab.id != null) {
          pageDebug = await browser.tabs.sendMessage(tab.id, {
            type: "collectDebugInfo",
            videoIds,
          });
        }
      } catch (error) {
        pageDebug = { ok: false, error: String(error) };
      }

      return {
        ok: true,
        generatedAt: new Date().toISOString(),
        storedLinks: stored,
        pageDebug,
      };
    });
  }

  if (message.type === "native") {
    return sendNative(message.payload).catch((error) => ({
      ok: false,
      error: String(error),
    }));
  }

  return undefined;
});

getLinks()
  .then((links) => {
    // Clear labels produced by older, incorrect strategies.
    const cleaned = links.map((item) => {
      const source = item.labelSource || "";
      if (
        source.includes("nearby") ||
        source === "dom-explicit" ||
        source.startsWith("json-") ||
        source === "text-window" ||
        ((item.labelConfidence || 0) > 0 && (item.labelConfidence || 0) < 70)
      ) {
        return {
          ...item,
          label: "",
          labelConfidence: 0,
          labelSource: "",
        };
      }
      return item;
    });
    return saveLinks(dedupeLinks(cleaned));
  })
  .then(() => getLinks())
  .then((links) => updateBadge(links.length));
