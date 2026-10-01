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
    if (!url) {
      return null;
    }
    const parsed = new URL(url, document.baseURI);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.endsWith(".cloudflarestream.com") &&
      !host.endsWith("videodelivery.net") &&
      host !== "cloudflarestream.com"
    ) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (!parts.length) {
      return null;
    }

    const payload = decodeJwtPayload(parts[0]);
    if (payload && payload.sub) {
      return String(payload.sub);
    }

    if (
      parts.length >= 2 &&
      !parts[0].includes(".") &&
      (parts[1] === "manifest" ||
        parts[1] === "thumbnails" ||
        parts[1] === "iframe" ||
        parts[1] === "watch")
    ) {
      return parts[0];
    }
  } catch (error) {
    return null;
  }
  return null;
}

function cleanLabel(text) {
  return String(text || "")
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    )
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericSiteLabel(text) {
  const cleaned = cleanLabel(text).toLowerCase();
  if (!cleaned || cleaned.length < 4 || cleaned.length > 180) {
    return true;
  }
  const pageTitle = cleanLabel(document.title).toLowerCase();
  if (pageTitle && cleaned === pageTitle) {
    return true;
  }
  if (
    cleaned === "sans ondemand" ||
    cleaned === "ondemand" ||
    cleaned === "video" ||
    cleaned === "stream" ||
    cleaned === "play" ||
    cleaned === "pause"
  ) {
    return true;
  }
  return false;
}

/**
 * Title for whatever lesson/clip is currently selected in the page UI.
 * On SANS OnDemand the Cloudflare iframe title tracks the active lesson,
 * even when iframe.src still points at a previously loaded video id.
 */
function getActiveTitle() {
  const iframe = document.querySelector(
    'iframe[src*="cloudflarestream"], iframe[src*="videodelivery"], iframe[data-src*="cloudflarestream"]'
  );
  if (iframe) {
    const iframeTitle = cleanLabel(
      iframe.getAttribute("title") || iframe.getAttribute("aria-label") || ""
    );
    if (iframeTitle && !isGenericSiteLabel(iframeTitle)) {
      return {
        label: iframeTitle,
        source: "active-iframe-title",
        confidence: 90,
      };
    }
  }

  const tocSelectors = [
    '[aria-current="page"]',
    '[aria-current="true"]',
    '[aria-selected="true"]',
    '[data-state="active"]',
    ".active",
    ".selected",
    ".is-active",
    ".current",
  ];

  for (const selector of tocSelectors) {
    const nodes = document.querySelectorAll(selector);
    for (const node of nodes) {
      const labeledChild = node.querySelector
        ? node.querySelector('[class*="title"], [class*="name"], h1, h2, h3, h4')
        : null;
      const raw =
        (node.getAttribute && (node.getAttribute("title") || node.getAttribute("aria-label"))) ||
        (labeledChild && labeledChild.textContent) ||
        node.textContent;
      const title = cleanLabel(raw);
      if (title && !isGenericSiteLabel(title)) {
        return {
          label: title,
          source: `active-toc:${selector}`,
          confidence: 85,
        };
      }
    }
  }

  return null;
}

function collectDebugInfo(videoIds = []) {
  const knownIds = Array.from(new Set((videoIds || []).filter(Boolean)));
  const activeTitle = getActiveTitle();

  const domPlayers = [];
  document
    .querySelectorAll(
      'iframe[src*="cloudflarestream"], iframe[src*="videodelivery"], iframe[data-src*="cloudflarestream"], video, source, [data-cf-stream]'
    )
    .forEach((el, index) => {
      const src =
        el.currentSrc ||
        el.src ||
        (el.getAttribute &&
          (el.getAttribute("src") ||
            el.getAttribute("data-src") ||
            el.getAttribute("data-cf-stream"))) ||
        "";
      domPlayers.push({
        index,
        tag: el.tagName,
        videoId: extractCloudflareVideoId(src),
        src: String(src).slice(0, 300),
        title: el.getAttribute && el.getAttribute("title"),
        ariaLabel: el.getAttribute && el.getAttribute("aria-label"),
      });
    });

  const idSnippets = {};
  const html = document.documentElement ? document.documentElement.innerHTML : "";
  for (const videoId of knownIds) {
    const snippets = [];
    const sources = [
      ...Array.from(document.querySelectorAll("script")).map((script, index) => ({
        name: `script[${index}]`,
        text: script.textContent || "",
      })),
      { name: "html", text: html.slice(0, 1_500_000) },
    ];
    for (const source of sources) {
      let fromIndex = 0;
      let hits = 0;
      while (hits < 2 && fromIndex < source.text.length) {
        const idx = source.text.indexOf(videoId, fromIndex);
        if (idx < 0) {
          break;
        }
        snippets.push({
          source: source.name,
          excerpt: source.text.slice(Math.max(0, idx - 180), idx + videoId.length + 180),
        });
        hits += 1;
        fromIndex = idx + videoId.length;
      }
    }
    idSnippets[videoId] = snippets;
  }

  return {
    pageUrl: location.href,
    pageTitle: document.title,
    activeTitle,
    // Intentionally empty: we no longer map iframe.src -> iframe.title.
    labels: activeTitle
      ? [
          {
            note: "active title only; assigned to whichever stream is newly captured",
            ...activeTitle,
          },
        ]
      : [],
    domPlayers,
    idSnippets,
  };
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "getActiveTitle") {
    return Promise.resolve({ ok: true, active: getActiveTitle() });
  }
  if (message.type === "collectDebugInfo") {
    return Promise.resolve({
      ok: true,
      debug: collectDebugInfo(message.videoIds || []),
    });
  }
  // Legacy no-op so older background code does not throw.
  if (message.type === "collectStreamLabels") {
    const active = getActiveTitle();
    return Promise.resolve({
      ok: true,
      labels: [],
      active,
    });
  }
  return undefined;
});
