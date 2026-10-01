const params = new URLSearchParams(window.location.search);
const sourceUrl = params.get("url") || "";

const form = document.getElementById("downloadForm");
const sourceUrlEl = document.getElementById("sourceUrl");
const downloadDirEl = document.getElementById("downloadDir");
const filenameEl = document.getElementById("filename");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");
const cancelBtn = document.getElementById("cancelBtn");

const FALLBACK_DIR = "Downloads/StreamCatch";

sourceUrlEl.value = sourceUrl;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
}

function normalizeFilename(name) {
  let cleaned = (name || "").trim();
  if (!cleaned) {
    cleaned = "downloaded_video";
  }
  if (!cleaned.toLowerCase().endsWith(".mp4")) {
    cleaned += ".mp4";
  }
  return cleaned;
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
      `${error.message} Re-run native-host/install.sh, fully restart Firefox, then reload the add-on.`,
      true
    );
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!sourceUrl) {
    setStatus("Missing source URL.", true);
    return;
  }

  const downloadDir = (downloadDirEl.value || "").trim() || FALLBACK_DIR;
  const filename = normalizeFilename(filenameEl.value);
  filenameEl.value = filename.replace(/\.mp4$/i, "");

  submitBtn.disabled = true;
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
      return;
    }

    setStatus("Checking whether the file already exists…");
    const check = await native({
      action: "check_file",
      filename,
      download_dir: downloadDir,
    });

    if (check.exists) {
      const overwrite = window.confirm(
        `'${check.path}' already exists.\n\nOK = overwrite\nCancel = choose a different name`
      );
      if (!overwrite) {
        setStatus("Choose a different filename.");
        filenameEl.focus();
        submitBtn.disabled = false;
        return;
      }
    }

    const m3u8Url = await resolveM3u8Url(sourceUrl);
    setStatus("Downloading with ffmpeg… this window will stay open until finished.");

    const result = await native({
      action: "download",
      url: m3u8Url,
      filename,
      download_dir: downloadDir,
      overwrite: true,
    });

    if (result.ok) {
      setStatus(`Done. Saved as ${result.path}`);
      submitBtn.textContent = "Close";
      submitBtn.disabled = false;
      submitBtn.onclick = () => window.close();
    } else {
      setStatus(result.error || "Download failed.", true);
      submitBtn.disabled = false;
    }
  } catch (error) {
    setStatus(String(error.message || error), true);
    submitBtn.disabled = false;
  }
});

cancelBtn.addEventListener("click", () => window.close());
loadDownloadDir().then(() => filenameEl.focus());
