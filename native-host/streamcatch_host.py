#!/usr/bin/env python3
"""StreamCatch native messaging host for Firefox (Linux, macOS, Windows)."""

from __future__ import annotations

import json
import os
import struct
import subprocess
import sys
import urllib.parse
from pathlib import Path

if sys.platform == "win32":
    # Firefox native messaging is binary; Windows text-mode pipes corrupt the framing.
    import msvcrt

    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)


DEFAULT_DOWNLOAD_DIR = Path.home() / "Downloads" / "StreamCatch"


def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    message_length = struct.unpack("@I", raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode("utf-8")
    return json.loads(message)


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def ffmpeg_search_paths():
    home = Path.home()
    paths = [
        str(home / ".local" / "bin"),
        "/usr/local/bin",
        "/usr/bin",
        "/opt/homebrew/bin",  # Apple Silicon Homebrew
        "/opt/local/bin",  # MacPorts
    ]

    if sys.platform == "win32":
        local = home / "AppData" / "Local"
        paths.extend(
            [
                str(Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "ffmpeg" / "bin"),
                str(
                    Path(os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"))
                    / "ffmpeg"
                    / "bin"
                ),
                str(local / "Microsoft" / "WinGet" / "Links"),
                r"C:\ffmpeg\bin",
                r"C:\ProgramData\chocolatey\bin",
            ]
        )

    return [p for p in paths if p]


def ffmpeg_env():
    env = os.environ.copy()
    env["PATH"] = os.pathsep.join(ffmpeg_search_paths() + [env.get("PATH", "")])
    return env


def check_ffmpeg_installed():
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=ffmpeg_env(),
        )
        return "ffmpeg version" in result.stdout or "ffmpeg version" in result.stderr
    except (FileNotFoundError, OSError):
        return False


def convert_to_m3u8_url(url: str) -> str:
    if "manifest/video.m3u8" in url:
        new_url = url
    elif "thumbnails/thumbnail.jpg" in url:
        new_url = url.replace("thumbnails/thumbnail.jpg", "manifest/video.m3u8")
    else:
        new_url = url

    parsed = urllib.parse.urlparse(new_url)
    return urllib.parse.urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            parsed.query,
            None,
        )
    )


def normalize_filename(name: str) -> str:
    cleaned = (name or "").strip() or "downloaded_video"
    cleaned = Path(cleaned).name
    # Strip characters that are illegal in Windows filenames.
    for bad in '<>:"/\\|?*':
        cleaned = cleaned.replace(bad, "_")
    if not cleaned.lower().endswith(".mp4"):
        cleaned += ".mp4"
    return cleaned


def resolve_download_dir(raw_dir: str | None) -> Path:
    if raw_dir and str(raw_dir).strip():
        text = str(raw_dir).strip()
        # Accept Unix-style ~/... from the extension on any OS.
        if text.startswith("~/") or text == "~":
            path = Path(text).expanduser()
        else:
            path = Path(text).expanduser()
    else:
        path = DEFAULT_DOWNLOAD_DIR

    if not path.is_absolute():
        path = Path.home() / path

    path = path.resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def resolve_output_path(filename: str, download_dir: str | None = None) -> Path:
    directory = resolve_download_dir(download_dir)
    return directory / normalize_filename(filename)


def run_ffmpeg_download(m3u8_url: str, output_path: Path) -> dict:
    command = [
        "ffmpeg",
        "-i",
        m3u8_url,
        "-c",
        "copy",
        "-y",
        str(output_path),
    ]

    try:
        process = subprocess.run(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env=ffmpeg_env(),
        )
        if process.returncode == 0:
            return {"ok": True, "path": str(output_path)}
        return {
            "ok": False,
            "error": f"ffmpeg failed with code {process.returncode}",
            "log": (process.stdout or "")[-2000:],
        }
    except Exception as exc:  # noqa: BLE001 - surface to extension
        return {"ok": False, "error": str(exc)}


def handle_message(message: dict) -> dict:
    action = message.get("action")
    download_dir = message.get("download_dir")

    if action == "ping":
        directory = resolve_download_dir(download_dir)
        return {
            "ok": True,
            "ffmpeg": check_ffmpeg_installed(),
            "download_dir": str(directory),
            "default_download_dir": str(DEFAULT_DOWNLOAD_DIR),
            "platform": sys.platform,
        }

    if action == "check_file":
        path = resolve_output_path(message.get("filename", ""), download_dir)
        return {
            "ok": True,
            "exists": path.exists(),
            "path": str(path),
            "download_dir": str(path.parent),
        }

    if action == "download":
        if not check_ffmpeg_installed():
            return {
                "ok": False,
                "error": "ffmpeg was not found on PATH",
            }

        filename = message.get("filename", "")
        output_path = resolve_output_path(filename, download_dir)
        overwrite = bool(message.get("overwrite", False))

        if output_path.exists() and not overwrite:
            return {
                "ok": False,
                "error": "file_exists",
                "path": str(output_path),
            }

        url = convert_to_m3u8_url(message.get("url", ""))
        if not url:
            return {"ok": False, "error": "Missing URL"}

        return run_ffmpeg_download(url, output_path)

    return {"ok": False, "error": f"Unknown action: {action}"}


def main():
    while True:
        message = get_message()
        if message is None:
            break
        send_message(handle_message(message))


if __name__ == "__main__":
    main()
