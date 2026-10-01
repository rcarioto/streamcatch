# StreamCatch

Firefox extension + local helper that detects Cloudflare Stream / HLS links while you browse, lists them, and downloads them with `ffmpeg`.

**Author:** Ray Carioto ([@rcarioto](https://github.com/rcarioto))  
**License:** [GNU General Public License v3.0](LICENSE)

---

## Features

- Captures Cloudflare Stream `manifest/video.m3u8` and related HLS URLs from page network traffic
- Collapses thumbnail + manifest pairs for the same video
- Shows lesson/clip titles when the page exposes an active title (for example SANS OnDemand)
- Popup list with download, open, copy, and remove actions
- Right-click menu integration
- Single-file download with folder + filename prompts and overwrite protection
- **Download all** with filename templates such as `{###}-720`, `{a}-720`, `test-{n:2}-720`
- Cross-platform native messaging host for Linux, macOS, and Windows
- Optional CLI (`main.py`) for pasting a URL directly

## Requirements

- **Firefox** 115+ (non-Snap builds are more reliable for native messaging on Linux)
- **Python** 3.10+
- **ffmpeg** on your `PATH`
- Permission to install a native messaging host for Firefox

## Repository layout

```text
extension/          Firefox add-on (load this folder)
native-host/        Python native messaging host + installers
main.py             Standalone CLI downloader
LICENSE             GPL-3.0
```

## Install

### 1. Install the native host

From the `native-host` directory:

**Linux / macOS**

```bash
./install.sh
# or
python3 install_host.py
```

**Windows**

```bat
install.bat
```

or:

```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

This registers the host name `com.streamcatch.host` for the extension id `streamcatch@local`.

Fully quit and restart Firefox after installing the host.

### 2. Load the extension

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `extension/manifest.json`

Temporary add-ons are removed when Firefox restarts; reload the extension after each browser restart. The native host registration persists.

### 3. Confirm ffmpeg

```bash
ffmpeg -version
```

If that fails, install ffmpeg and ensure it is on your `PATH`.

## Usage

1. Browse a page that plays Cloudflare Stream / HLS media
2. Open the **StreamCatch** toolbar button to see captured links
3. Use **Download…** for one file, or **Download all…** for the whole list
4. Default save folder: `Downloads/StreamCatch` under your home directory (editable per download)

### Filename templates (Download all)

| Template | Example outputs |
|---|---|
| `{###}-720` | `001-720.mp4`, `002-720.mp4` |
| `{a}-720` | `a-720.mp4`, `b-720.mp4` |
| `test-{n:2}-720` | `test-01-720.mp4`, `test-02-720.mp4` |
| `video_{n:3}` | `video_001.mp4`, `video_002.mp4` |

Tokens: `{n}`, `{n:3}` / `{###}` / `###` for numbers; `{a}` / `{A}` for letters.

### CLI

```bash
python3 main.py
```

Paste a Cloudflare Stream URL containing `thumbnails/thumbnail.jpg` or `manifest/video.m3u8`, then choose an output name.

## Troubleshooting

**`No such native application com.streamcatch.host`**

- Re-run the native host installer
- Fully quit and restart Firefox
- On Ubuntu Snap Firefox, the host is installed under `~/snap/firefox/common/.mozilla/native-messaging-hosts/`
- If Snap still blocks native messaging, use Mozilla’s `.deb` / official Firefox build

**Titles look wrong or missing**

- Clear the StreamCatch list, then play each clip while it is the active lesson in the page UI
- Titles are taken from the page’s active lesson label at capture time

**Python 2 vs Python 3**

- Installers prefer `py -3` / `python3` and ignore a `python` alias that points at Python 2

## Development

1. Edit files under `extension/` and/or `native-host/`
2. Reload the temporary add-on in `about:debugging`
3. Re-run `native-host/install_host.py` after host script changes
4. Use **Copy debug** in the popup when investigating capture/label issues

Extension id (fixed for native messaging): `streamcatch@local`  
Native host name: `com.streamcatch.host`

## Publishing to GitHub

This repository is prepared for GitHub under [@rcarioto](https://github.com/rcarioto).

```bash
# if the remote is not set yet:
gh repo create streamcatch --public --source=. --remote=origin --push
```

Or create the empty repo on GitHub, then:

```bash
git remote add origin https://github.com/rcarioto/streamcatch.git
git push -u origin main
```

## License

This project is licensed under the **GNU General Public License v3.0**. See [LICENSE](LICENSE) for the full text.

```text
Copyright (C) 2026 Ray Carioto
```

You may redistribute and modify this software under the terms of the GPL-3.0. There is no warranty.
