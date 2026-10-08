# StreamCatch

Firefox extension + local helper that detects Cloudflare Stream / HLS links while you browse, lists them, and downloads them with `ffmpeg`.

**Author:** Ray Carioto ([@rcarioto](https://github.com/rcarioto))  
**License:** [GNU GPL v3.0](LICENSE)

## Features

- Captures Cloudflare Stream / HLS URLs from page network traffic
- Popup list with download, open, copy, and remove actions
- Single-file and bulk download via a local `ffmpeg` helper
- Filename templates for bulk downloads (for example `video_{n:3}`)
- Optional CLI: `StreamCatch.py`

## Requirements

- Firefox 115+
- Python 3.10+
- `ffmpeg` on your `PATH`

On Linux, Mozilla’s non-Snap Firefox build is more reliable for native messaging.

## Install

### 1. Native host

From `native-host/`:

```bash
# Linux / macOS
./install.sh
```

```bat
REM Windows
install.bat
```

Fully quit and restart Firefox afterward.

### 2. Extension

Firefox Release only permanently installs **signed** add-ons.

**Permanent (recommended):** sign with [web-ext](https://extensionworkshop.com/documentation/develop/web-ext-command-reference/#web-ext-sign) / AMO, then install the `.xpi` from `about:addons` → **Install Add-on From File…**.

**Temporary (testing):** `about:debugging` → **Load Temporary Add-on…** → select `extension/manifest.json`. Reload after each Firefox restart.

Keep extension id `streamcatch@local` aligned with the native host if you change it.

## Usage

1. Browse a page with Cloudflare Stream / HLS media
2. Open the StreamCatch toolbar button
3. Use **Download…** or **Download all…**

Default save folder: `Downloads/StreamCatch` in your home directory.

### Filename templates (Download all)

| Template | Example |
|---|---|
| `{###}` | `001.mp4`, `002.mp4` |
| `video_{n:3}` | `video_001.mp4`, `video_002.mp4` |
| `{a}_clip` | `a_clip.mp4`, `b_clip.mp4` |
| `test-{n:2}` | `test-01.mp4`, `test-02.mp4` |

Tokens: `{n}`, `{n:3}` / `{###}`, `{a}` / `{A}`.

### CLI

```bash
python3 StreamCatch.py
```

## Troubleshooting

**`No such native application com.streamcatch.host`**  
Re-run the native host installer, fully restart Firefox, and prefer a non-Snap Firefox build on Linux.

**Missing or wrong titles**  
Clear the list, then capture each video while it is the active selection in the page UI.

## Acknowledgments

The CLI is based on [cloudflare-stream-downloader](https://github.com/LovelyO0Sam/cloudflare-stream-downloader) by [LovelyO0Sam](https://github.com/LovelyO0Sam) (MIT). See [NOTICE](NOTICE).

## License

Copyright (C) 2026 Ray Carioto. Licensed under the GNU GPL v3.0; see [LICENSE](LICENSE). Third-party MIT notices are in [NOTICE](NOTICE).
