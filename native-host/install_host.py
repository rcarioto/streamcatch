#!/usr/bin/env python3
"""Install the StreamCatch native messaging host for Firefox on Linux, macOS, or Windows."""

from __future__ import annotations

import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HOST_NAME = "com.streamcatch.host"
EXTENSION_ID = "streamcatch@local"
ROOT = Path(__file__).resolve().parent
HOST_SCRIPT = ROOT / "streamcatch_host.py"
MIN_VERSION = (3, 10)


def version_of(command: list[str]) -> tuple[int, int] | None:
    try:
        result = subprocess.run(
            command
            + [
                "-c",
                "import sys; print('%d.%d' % (sys.version_info[0], sys.version_info[1]))",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
            check=False,
        )
        if result.returncode != 0:
            return None
        major_s, minor_s = result.stdout.strip().split(".", 1)
        return int(major_s), int(minor_s)
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return None


def is_usable_python(command: list[str]) -> bool:
    version = version_of(command)
    return version is not None and version >= MIN_VERSION


def find_python() -> list[str]:
    """Return a command list that launches a usable Python 3 interpreter."""
    # Prefer the interpreter that is already running this installer, if it qualifies.
    if sys.version_info[:2] >= MIN_VERSION:
        return [str(Path(sys.executable).resolve())]

    candidates: list[list[str]] = []

    if platform.system() == "Windows":
        py_launcher = shutil.which("py")
        if py_launcher:
            candidates.append([py_launcher, "-3"])
        for name in ("python3.exe", "python3", "python.exe", "python"):
            found = shutil.which(name)
            if found:
                candidates.append([found])
    else:
        for name in ("python3", "python"):
            found = shutil.which(name)
            if found:
                candidates.append([found])

    seen: set[str] = set()
    for command in candidates:
        key = " ".join(command).lower()
        if key in seen:
            continue
        seen.add(key)
        if is_usable_python(command):
            return command

    raise SystemExit(
        "Python 3.10+ was not found on PATH.\n"
        "Install Python 3, or run this installer with python3 / py -3 explicitly.\n"
        "Note: a bare `python` command that points at Python 2 will be ignored."
    )


def create_launcher(python_cmd: list[str]) -> Path:
    quoted = " ".join(f'"{part}"' if " " in part else part for part in python_cmd)

    if platform.system() == "Windows":
        launcher = ROOT / "streamcatch_host.bat"
        # Keep python_cmd parts quoted so `py -3` and paths with spaces both work.
        parts = " ".join(f'"{part}"' for part in python_cmd)
        launcher.write_text(
            "\r\n".join(
                [
                    "@echo off",
                    f'{parts} "{HOST_SCRIPT}" %*',
                    "",
                ]
            ),
            encoding="utf-8",
        )
        return launcher

    launcher = ROOT / "streamcatch_host"
    launcher.write_text(
        "\n".join(
            [
                "#!/bin/sh",
                f"exec {quoted} \"{HOST_SCRIPT}\" \"$@\"",
                "",
            ]
        ),
        encoding="utf-8",
    )
    launcher.chmod(launcher.stat().st_mode | 0o111)
    HOST_SCRIPT.chmod(HOST_SCRIPT.stat().st_mode | 0o111)
    return launcher


def write_manifest(path: Path, launcher: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "name": HOST_NAME,
        "description": "StreamCatch native messaging host",
        "path": str(launcher),
        "type": "stdio",
        "allowed_extensions": [EXTENSION_ID],
    }
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Installed: {path}")


def linux_manifest_dirs() -> list[Path]:
    home = Path.home()
    return [
        home / ".mozilla" / "native-messaging-hosts",
        home / "snap" / "firefox" / "common" / ".mozilla" / "native-messaging-hosts",
        home
        / ".var"
        / "app"
        / "org.mozilla.firefox"
        / ".mozilla"
        / "native-messaging-hosts",
        home / ".librewolf" / "native-messaging-hosts",
    ]


def macos_manifest_dirs() -> list[Path]:
    home = Path.home()
    return [
        home
        / "Library"
        / "Application Support"
        / "Mozilla"
        / "NativeMessagingHosts",
        home
        / "Library"
        / "Application Support"
        / "LibreWolf"
        / "NativeMessagingHosts",
    ]


def install_windows_registry(manifest_path: Path) -> None:
    try:
        import winreg  # type: ignore
    except ImportError as exc:
        raise SystemExit(f"winreg unavailable: {exc}") from exc

    key_path = rf"Software\Mozilla\NativeMessagingHosts\{HOST_NAME}"
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
        winreg.SetValueEx(key, None, 0, winreg.REG_SZ, str(manifest_path))
    print(f"Registry: HKCU\\{key_path} -> {manifest_path}")


def install() -> None:
    if sys.version_info[:2] < MIN_VERSION:
        raise SystemExit(
            f"This installer is running under Python {sys.version_info.major}.{sys.version_info.minor}.\n"
            f"StreamCatch requires Python {MIN_VERSION[0]}.{MIN_VERSION[1]}+.\n"
            "Re-run with: python3 install_host.py   or   py -3 install_host.py"
        )

    if not HOST_SCRIPT.exists():
        raise SystemExit(f"Missing host script: {HOST_SCRIPT}")

    python_cmd = find_python()
    launcher = create_launcher(python_cmd)
    system = platform.system()
    manifest_name = f"{HOST_NAME}.json"

    local_manifest = ROOT / manifest_name
    write_manifest(local_manifest, launcher)

    if system == "Windows":
        appdata = Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming"))
        mozilla_dir = appdata / "Mozilla" / "NativeMessagingHosts"
        write_manifest(mozilla_dir / manifest_name, launcher)
        install_windows_registry(mozilla_dir / manifest_name)
    elif system == "Darwin":
        for directory in macos_manifest_dirs():
            write_manifest(directory / manifest_name, launcher)
    elif system == "Linux":
        for directory in linux_manifest_dirs():
            write_manifest(directory / manifest_name, launcher)
    else:
        raise SystemExit(f"Unsupported platform: {system}")

    default_downloads = Path.home() / "Downloads" / "StreamCatch"
    print()
    print("StreamCatch native host installed.")
    print(f"  Platform:      {system}")
    print(f"  Host name:     {HOST_NAME}")
    print(f"  Extension ID:  {EXTENSION_ID}")
    print(f"  Python:        {' '.join(python_cmd)}")
    print(f"  Launcher:      {launcher}")
    print(f"  Default saves: {default_downloads}")
    print()
    if system == "Linux" and (Path.home() / "snap" / "firefox").exists():
        print("Snap Firefox detected.")
        print("  Fully quit Firefox and reopen it after install.")
        print("  If native messaging still fails, use Mozilla's non-snap Firefox build.")
        print()
    print("Next:")
    print("  1. Fully quit and restart Firefox")
    print("  2. about:debugging -> Load Temporary Add-on -> extension/manifest.json")
    print("  3. Ensure Python 3 and ffmpeg are installed and on PATH")


if __name__ == "__main__":
    install()
