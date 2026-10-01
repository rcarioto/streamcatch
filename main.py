import subprocess
import urllib.parse
from pathlib import Path


def check_ffmpeg_installed():
    """Checks if FFmpeg is available on the system PATH."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        return "ffmpeg version" in result.stdout or "ffmpeg version" in result.stderr
    except (FileNotFoundError, OSError):
        return False


def convert_to_m3u8_url(url):
    """Converts a Cloudflare Stream URL to a downloadable m3u8 format."""
    if "manifest/video.m3u8" in url:
        new_url = url
    elif "thumbnails/thumbnail.jpg" in url:
        new_url = url.replace("thumbnails/thumbnail.jpg", "manifest/video.m3u8")
    else:
        raise ValueError(
            "URL must contain 'thumbnails/thumbnail.jpg' or 'manifest/video.m3u8'"
        )

    parsed = urllib.parse.urlparse(new_url)
    clean_url = urllib.parse.urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        parsed.query,
        None
    ))

    return clean_url


def prompt_for_output_filename():
    """Ask for an output filename, and if it already exists, offer overwrite or a new name."""
    while True:
        output_file = input(
            "Please enter the output filename (no extension needed, .mp4 will be added automatically): "
        ).strip()

        if not output_file:
            output_file = "downloaded_video"

        if not output_file.lower().endswith(".mp4"):
            output_file += ".mp4"

        if not Path(output_file).exists():
            return output_file

        while True:
            choice = input(
                f"'{output_file}' already exists. Overwrite? (y/n): "
            ).strip().lower()
            if choice in ("y", "yes"):
                return output_file
            if choice in ("n", "no"):
                print("Please choose a different filename.\n")
                break
            print("Please enter 'y' or 'n'.")


def run_ffmpeg_download(m3u8_url, output_file):
    """Runs the FFmpeg download command."""
    command = [
        "ffmpeg",
        "-i", m3u8_url,
        "-c", "copy",
        "-y",  # overwrite when user already confirmed
        output_file
    ]

    print("\n" + "-" * 50)
    print("Executing download command:")
    print(" ".join(command))
    print("-" * 50 + "\n")

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )

        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                if "time=" in output and "speed=" in output:
                    print(output.strip())

        if process.returncode == 0:
            print(f"\nDownload complete! File saved as: {output_file}")
            return True
        else:
            print(f"\nDownload failed! FFmpeg returned error code: {process.returncode}")
            print("Possible solutions:")
            print("1. Check if the URL is correct and accessible")
            print("2. Try a different network connection")
            print("3. Ensure sufficient disk space")
            return False

    except Exception as e:
        print(f"Error executing FFmpeg: {e}")
        return False


def main():
    print("Cloudflare Stream Video Downloader")
    print("=" * 50)

    if not check_ffmpeg_installed():
        print("\nFFmpeg was not found on your system.")
        print("Please install FFmpeg and make sure it is available on your PATH, then run this tool again.")
        print("Download: https://ffmpeg.org/download.html")
        return

    print("\nFFmpeg is ready")

    original_url = input(
        "Please enter the Cloudflare Stream URL "
        "(containing thumbnails/thumbnail.jpg or manifest/video.m3u8): "
    ).strip()
    output_file = prompt_for_output_filename()

    try:
        m3u8_url = convert_to_m3u8_url(original_url)
        print("\nConverted video stream URL:")
        print(m3u8_url)

        run_ffmpeg_download(m3u8_url, output_file)

    except ValueError as e:
        print(f"\nError: {e}")
        print(
            "Please ensure the input URL contains "
            "'thumbnails/thumbnail.jpg' or 'manifest/video.m3u8'"
        )
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


if __name__ == "__main__":
    main()
