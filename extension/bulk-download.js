const form = document.getElementById("bulkForm");
const downloadDirEl = document.getElementById("downloadDir");
const useTitleEl = document.getElementById("useTitle");
const titleExampleEl = document.getElementById("titleExample");
const templateFieldsEl = document.getElementById("templateFields");
const nameTemplateEl = document.getElementById("nameTemplate");
const templatePresetsEl = document.getElementById("templatePresets");
const startAtEl = document.getElementById("startAt");
const conflictModeEl = document.getElementById("conflictMode");
const previewHintEl = document.getElementById("previewHint");
const countSubtitleEl = document.getElementById("countSubtitle");
const statusEl = document.getElementById("status");
const progressListEl = document.getElementById("progressList");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");

const FALLBACK_DIR = "Downloads/StreamCatch";
const TEMPLATE_KEY = "bulkNameTemplate";
const START_KEY = "bulkStartAt";
const USE_TITLE_KEY = "bulkUseTitle";

let links = [];
let cancelled = false;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function lettersToIndex(letters) {
  let n = 0;
  for (const ch of String(letters).toLowerCase()) {
    if (ch < "a" || ch > "z") {
      return null;
    }
    n = n * 26 + (ch.charCodeAt(0) - 96);
  }
  return n || null;
}

function indexToLetters(index, uppercase = false) {
  let n = Math.max(1, index);
  let result = "";
  while (n > 0) {
    n -= 1;
    const code = (n % 26) + (uppercase ? 65 : 97);
    result = String.fromCharCode(code) + result;
    n = Math.floor(n / 26);
  }
  return result;
}

function parseStartAt(value) {
  const text = String(value || "").trim();
  if (/^[a-z]+$/i.test(text)) {
    const index = lettersToIndex(text);
    if (index) {
      return { index, display: text };
    }
  }
  const number = Number.parseInt(text, 10);
  return {
    index: Number.isFinite(number) && number > 0 ? number : 1,
    display: text,
  };
}

function sanitizeFilenamePart(text) {
  let cleaned = String(text || "");
  for (const bad of '<>:"/\\|?*') {
    cleaned = cleaned.split(bad).join("_");
  }
  return cleaned;
}

function sanitizeTitleFilename(title) {
  let cleaned = String(title || "")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");

  cleaned = cleaned.replace(/\s*:\s*/g, " - ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

/**
 * Template tokens:
 *   {n}      -> 1, 2, 3
 *   {n:3}    -> 001, 002
 *   {###}    -> 001, 002  (hash count = width)
 *   ###      -> same, bare hash run (2+ hashes)
 *   {a} / {A}-> a, b, c / A, B, C (then aa, ab, …)
 */
function applyTemplate(template, sequenceIndex) {
  let result = String(template || "").trim() || "{n}";
  result = result.replace(/\.mp4$/i, "");

  result = result.replace(/\{n:(\d+)\}/gi, (_, width) =>
    String(sequenceIndex).padStart(Number(width), "0")
  );
  result = result.replace(/\{n\}/gi, () => String(sequenceIndex));
  result = result.replace(/\{(#{2,})\}/g, (_, hashes) =>
    String(sequenceIndex).padStart(hashes.length, "0")
  );
  result = result.replace(/#{2,}/g, (hashes) =>
    String(sequenceIndex).padStart(hashes.length, "0")
  );
  result = result.replace(/\{a\}/g, () => indexToLetters(sequenceIndex, false));
  result = result.replace(/\{A\}/g, () => indexToLetters(sequenceIndex, true));

  result = sanitizeFilenamePart(result);
  if (!result.toLowerCase().endsWith(".mp4")) {
    result += ".mp4";
  }
  return result;
}

function buildFilename(template, startIndex, offset) {
  return applyTemplate(template, startIndex + offset);
}

function filenameFromTitle(item, fallbackTemplate, startIndex, offset) {
  const stem = sanitizeTitleFilename(item && item.label);
  if (stem) {
    return `${stem}.mp4`;
  }
  return buildFilename(fallbackTemplate, startIndex, offset);
}

function updateTitleExample() {
  const titled = links
    .map((item) => sanitizeTitleFilename(item.label))
    .filter(Boolean);

  if (!titled.length) {
    useTitleEl.disabled = true;
    if (useTitleEl.checked) {
      useTitleEl.checked = false;
    }
    titleExampleEl.textContent = "Example: (no titles available; use a template)";
    applyTitleMode();
    return;
  }

  useTitleEl.disabled = false;
  const samples = titled.slice(0, 2).map((name) => `${name}.mp4`);
  const more = titled.length > 2 ? ", …" : "";
  titleExampleEl.textContent = `Example: ${samples.join(", ")}${more}`;
  applyTitleMode();
}

function applyTitleMode() {
  const usingTitles = useTitleEl.checked && !useTitleEl.disabled;
  templateFieldsEl.classList.toggle("is-disabled", usingTitles);
  nameTemplateEl.disabled = usingTitles;
  templatePresetsEl.disabled = usingTitles;
  startAtEl.disabled = usingTitles;
  nameTemplateEl.required = !usingTitles;
  startAtEl.required = !usingTitles;
}

function updatePreview() {
  const template = nameTemplateEl.value.trim() || "video_{n:3}";
  const start = parseStartAt(startAtEl.value).index;
  const first = buildFilename(template, start, 0);
  const second = buildFilename(template, start, 1);
  const third = buildFilename(template, start, 2);
  previewHintEl.textContent = `Preview: ${first}, ${second}, ${third}, …`;
}

async function native(payload) {
  const response = await browser.runtime.sendMessage({
    type: "native",
    payload,
  });
  if (!response || response.ok === false) {
    throw new Error(
      (response && response.error) ||
        "Native host is unavailable. Is StreamCatch host installed?"
    );
  }
  return response;
}

async function resolveM3u8Url(url) {
  const result = await browser.runtime.sendMessage({ type: "toM3u8Url", url });
  return result.url;
}

function addProgressItem(label) {
  const li = document.createElement("li");
  li.className = "progress-item";
  li.textContent = label;
  progressListEl.appendChild(li);
  li.scrollIntoView({ block: "nearest" });
  return li;
}

async function uniqueRename(downloadDir, filename) {
  const stem = filename.replace(/\.mp4$/i, "");
  let candidate = filename;
  let suffix = 2;

  while (true) {
    const check = await native({
      action: "check_file",
      filename: candidate,
      download_dir: downloadDir,
    });
    if (!check.exists) {
      return candidate;
    }
    candidate = `${stem}_${suffix}.mp4`;
    suffix += 1;
  }
}

async function loadDownloadDir() {
  const stored = await browser.runtime.sendMessage({ type: "getDownloadDir" });
  if (stored && stored.downloadDir) {
    downloadDirEl.value = stored.downloadDir;
    return;
  }

  try {
    const ping = await native({ action: "ping" });
    downloadDirEl.value =
      ping.default_download_dir || ping.download_dir || FALLBACK_DIR;
  } catch (error) {
    downloadDirEl.value = FALLBACK_DIR;
    setStatus(
      `${error.message} Install the native host, restart Firefox, then reload the add-on.`,
      true
    );
  }
}

async function loadTemplatePrefs() {
  const data = await browser.storage.local.get([
    TEMPLATE_KEY,
    START_KEY,
    USE_TITLE_KEY,
  ]);
  if (data[TEMPLATE_KEY]) {
    nameTemplateEl.value = data[TEMPLATE_KEY];
  }
  if (data[START_KEY]) {
    startAtEl.value = data[START_KEY];
  }
  if (data[USE_TITLE_KEY]) {
    useTitleEl.checked = true;
  }
  updatePreview();
  applyTitleMode();
}

async function saveTemplatePrefs(template, startAt, useTitle) {
  await browser.storage.local.set({
    [TEMPLATE_KEY]: template,
    [START_KEY]: startAt,
    [USE_TITLE_KEY]: Boolean(useTitle),
  });
}

async function loadLinks() {
  const result = await browser.runtime.sendMessage({ type: "getLinks" });
  // Oldest first so the start number/letter applies to the earliest capture.
  links = ((result && result.links) || [])
    .slice()
    .sort((a, b) => (a.capturedAt || 0) - (b.capturedAt || 0));
  countSubtitleEl.textContent =
    links.length === 1
      ? "1 captured link ready to download"
      : `${links.length} captured links ready to download (oldest → newest)`;
  if (!links.length) {
    setStatus("No links in the list.", true);
    submitBtn.disabled = true;
  }
  updateTitleExample();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!links.length) {
    setStatus("No links in the list.", true);
    return;
  }

  const downloadDir = (downloadDirEl.value || "").trim() || FALLBACK_DIR;
  const useTitles = useTitleEl.checked && !useTitleEl.disabled;
  const template = nameTemplateEl.value.trim() || "video_{n:3}";
  const startIndex = parseStartAt(startAtEl.value).index;
  const conflictMode = conflictModeEl.value;
  nameTemplateEl.value = template;

  await saveTemplatePrefs(template, startAtEl.value.trim() || "1", useTitles);

  cancelled = false;
  submitBtn.disabled = true;
  cancelBtn.textContent = "Stop after current";
  progressListEl.innerHTML = "";
  setStatus("Checking native host…");

  try {
    await browser.runtime.sendMessage({
      type: "setDownloadDir",
      downloadDir,
    });

    const ping = await native({ action: "ping", download_dir: downloadDir });
    if (!ping.ffmpeg) {
      setStatus("ffmpeg was not found on PATH. Install ffmpeg and try again.", true);
      submitBtn.disabled = false;
      cancelBtn.textContent = "Cancel";
      return;
    }

    let completed = 0;
    let skipped = 0;
    let failed = 0;

    for (let i = 0; i < links.length; i += 1) {
      if (cancelled) {
        setStatus(
          `Stopped. Completed ${completed}, skipped ${skipped}, failed ${failed}, remaining ${links.length - i}.`
        );
        break;
      }

      const item = links[i];
      let filename = useTitles
        ? filenameFromTitle(item, template, startIndex, i)
        : buildFilename(template, startIndex, i);
      const label = addProgressItem(`[${i + 1}/${links.length}] ${filename}…`);

      try {
        const check = await native({
          action: "check_file",
          filename,
          download_dir: downloadDir,
        });

        if (check.exists) {
          if (conflictMode === "skip") {
            label.textContent = `[${i + 1}/${links.length}] Skipped (exists): ${filename}`;
            label.classList.add("is-skipped");
            skipped += 1;
            continue;
          }
          if (conflictMode === "rename") {
            filename = await uniqueRename(downloadDir, filename);
            label.textContent = `[${i + 1}/${links.length}] ${filename}…`;
          }
        }

        const m3u8Url = await resolveM3u8Url(item.url);
        const result = await native({
          action: "download",
          url: m3u8Url,
          filename,
          download_dir: downloadDir,
          overwrite: conflictMode === "overwrite" || conflictMode === "rename",
        });

        if (result.ok) {
          label.textContent = `[${i + 1}/${links.length}] Saved: ${result.path}`;
          label.classList.add("is-ok");
          completed += 1;
        } else {
          label.textContent = `[${i + 1}/${links.length}] Failed: ${result.error || "unknown error"}`;
          label.classList.add("is-error");
          failed += 1;
        }
      } catch (error) {
        label.textContent = `[${i + 1}/${links.length}] Failed: ${error.message || error}`;
        label.classList.add("is-error");
        failed += 1;
      }
    }

    if (!cancelled) {
      setStatus(
        `Finished. Completed ${completed}, skipped ${skipped}, failed ${failed}.`
      );
    }

    submitBtn.textContent = "Close";
    submitBtn.disabled = false;
    submitBtn.onclick = () => window.close();
    cancelBtn.textContent = "Close";
    cancelBtn.onclick = () => window.close();
  } catch (error) {
    setStatus(String(error.message || error), true);
    submitBtn.disabled = false;
    cancelBtn.textContent = "Cancel";
  }
});

cancelBtn.addEventListener("click", () => {
  if (submitBtn.disabled && submitBtn.textContent !== "Close") {
    cancelled = true;
    setStatus("Stopping after the current download finishes…");
    return;
  }
  window.close();
});

useTitleEl.addEventListener("change", () => {
  applyTitleMode();
});

templatePresetsEl.addEventListener("change", () => {
  if (!templatePresetsEl.value) {
    return;
  }
  nameTemplateEl.value = templatePresetsEl.value;
  if (/\{a\}|\{A\}/.test(templatePresetsEl.value) && /^\d+$/.test(startAtEl.value.trim())) {
    startAtEl.value = "a";
  } else if (!/\{a\}|\{A\}/.test(templatePresetsEl.value) && /^[a-z]+$/i.test(startAtEl.value.trim())) {
    startAtEl.value = "1";
  }
  templatePresetsEl.value = "";
  updatePreview();
});

nameTemplateEl.addEventListener("input", updatePreview);
startAtEl.addEventListener("input", updatePreview);
updatePreview();

Promise.all([loadDownloadDir(), loadTemplatePrefs(), loadLinks()]).then(() => {
  if (useTitleEl.checked) {
    useTitleEl.focus();
  } else {
    nameTemplateEl.focus();
  }
});
