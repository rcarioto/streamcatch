const listEl = document.getElementById("linkList");
const emptyEl = document.getElementById("emptyState");
const clearBtn = document.getElementById("clearBtn");
const downloadAllBtn = document.getElementById("downloadAllBtn");
const debugBtn = document.getElementById("debugBtn");

function truncate(text, max = 72) {
  if (!text) {
    return "";
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function kindLabel(kind) {
  if (kind === "stream" || kind === "manifest" || kind === "thumbnail") {
    return "stream";
  }
  if (kind === "m3u8") {
    return "m3u8";
  }
  return "link";
}

function shortVideoId(videoId) {
  if (!videoId) {
    return "";
  }
  if (videoId.length <= 12) {
    return videoId;
  }
  return `${videoId.slice(0, 6)}…${videoId.slice(-4)}`;
}

function primaryTitle(item) {
  return (
    item.label ||
    item.pageTitle ||
    (item.videoId ? `Stream ${shortVideoId(item.videoId)}` : "") ||
    item.pageUrl ||
    "Captured link"
  );
}

function metaLine(item) {
  const parts = [];
  if (item.videoId) {
    parts.push(`id ${shortVideoId(item.videoId)}`);
  }
  if (item.label && item.pageTitle && item.label !== item.pageTitle) {
    parts.push(item.pageTitle);
  }
  if (item.documentUrl && item.documentUrl !== item.pageUrl) {
    parts.push(`frame: ${truncate(item.documentUrl, 48)}`);
  } else if (item.pageUrl) {
    parts.push(truncate(item.pageUrl, 48));
  }
  return parts.join(" · ");
}

function render(links) {
  listEl.innerHTML = "";
  emptyEl.classList.toggle("hidden", links.length > 0);
  downloadAllBtn.disabled = links.length === 0;

  for (const item of links) {
    const li = document.createElement("li");
    li.className = "link-item";

    const meta = document.createElement("div");
    meta.className = "link-meta";

    const badgeRow = document.createElement("div");
    badgeRow.className = "badge-row";

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = kindLabel(item.kind);
    badgeRow.appendChild(badge);

    if (item.videoId) {
      const idBadge = document.createElement("span");
      idBadge.className = "badge badge-id";
      idBadge.textContent = shortVideoId(item.videoId);
      idBadge.title = item.videoId;
      badgeRow.appendChild(idBadge);
    }

    const title = document.createElement("div");
    title.className = "link-title";
    title.textContent = truncate(primaryTitle(item), 80);
    title.title = primaryTitle(item);

    const details = document.createElement("div");
    details.className = "link-details";
    details.textContent = metaLine(item);
    details.title = [
      item.videoId ? `Video ID: ${item.videoId}` : "",
      item.labelSource ? `Label source: ${item.labelSource}` : "",
      item.pageUrl ? `Page: ${item.pageUrl}` : "",
      item.documentUrl ? `Document: ${item.documentUrl}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const url = document.createElement("div");
    url.className = "link-url";
    url.textContent = truncate(item.url, 90);
    url.title = item.url;

    meta.appendChild(badgeRow);
    meta.appendChild(title);
    if (details.textContent) {
      meta.appendChild(details);
    }
    meta.appendChild(url);

    const actions = document.createElement("div");
    actions.className = "actions";

    const downloadBtn = document.createElement("button");
    downloadBtn.className = "btn";
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download…";
    downloadBtn.addEventListener("click", () => {
      browser.runtime.sendMessage({ type: "openDownloadDialog", url: item.url });
      window.close();
    });

    const openTabBtn = document.createElement("button");
    openTabBtn.className = "btn btn-ghost";
    openTabBtn.type = "button";
    openTabBtn.textContent = "New tab";
    openTabBtn.addEventListener("click", () => {
      browser.runtime.sendMessage({ type: "openTab", url: item.url });
    });

    const openWinBtn = document.createElement("button");
    openWinBtn.className = "btn btn-ghost";
    openWinBtn.type = "button";
    openWinBtn.textContent = "New window";
    openWinBtn.addEventListener("click", () => {
      browser.runtime.sendMessage({ type: "openWindow", url: item.url });
    });

    const copyBtn = document.createElement("button");
    copyBtn.className = "btn btn-ghost";
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(item.url);
      copyBtn.textContent = "Copied";
      setTimeout(() => {
        copyBtn.textContent = "Copy";
      }, 1200);
    });

    const copyIdBtn = document.createElement("button");
    copyIdBtn.className = "btn btn-ghost";
    copyIdBtn.type = "button";
    copyIdBtn.textContent = "Copy ID";
    copyIdBtn.disabled = !item.videoId;
    copyIdBtn.addEventListener("click", async () => {
      if (!item.videoId) {
        return;
      }
      await navigator.clipboard.writeText(item.videoId);
      copyIdBtn.textContent = "Copied";
      setTimeout(() => {
        copyIdBtn.textContent = "Copy ID";
      }, 1200);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn btn-ghost";
    removeBtn.type = "button";
    removeBtn.textContent = "Remove";
    removeBtn.addEventListener("click", async () => {
      await browser.runtime.sendMessage({ type: "removeLink", url: item.url });
      await load();
    });

    actions.appendChild(downloadBtn);
    actions.appendChild(openTabBtn);
    actions.appendChild(openWinBtn);
    actions.appendChild(copyBtn);
    actions.appendChild(copyIdBtn);
    actions.appendChild(removeBtn);

    li.appendChild(meta);
    li.appendChild(actions);
    listEl.appendChild(li);
  }
}

async function load() {
  const data = await browser.storage.local.get("capturedLinks");
  render(data.capturedLinks || []);
}

clearBtn.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "clearLinks" });
  await load();
});

downloadAllBtn.addEventListener("click", () => {
  browser.runtime.sendMessage({ type: "openBulkDownloadDialog" });
  window.close();
});

debugBtn.addEventListener("click", async () => {
  debugBtn.disabled = true;
  debugBtn.textContent = "Copying…";
  try {
    const result = await browser.runtime.sendMessage({ type: "collectDebugInfo" });
    const text = JSON.stringify(result, null, 2);
    await navigator.clipboard.writeText(text);
    debugBtn.textContent = "Copied";
  } catch (error) {
    debugBtn.textContent = "Failed";
    console.error(error);
  }
  setTimeout(() => {
    debugBtn.disabled = false;
    debugBtn.textContent = "Copy debug";
  }, 1500);
});

load();
