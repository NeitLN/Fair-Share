"""One small profile picture, checked and saved again as the server's own clean copy
(specs/010-profile-page, research R3).

The browser already crops and shrinks the photo, but a direct caller can send anything: a spoofed
type, camera and location data, a small file that decodes into a huge picture. So the server takes
only a small square-ish picture of a known kind, refuses it before decoding if it is too big, and
re-encodes it as a 256 × 256 still JPEG: re-encoding is what drops the metadata and anything hidden.
This is the one narrow exception to "no image processing" (constitution, Scope).

Pure: no database, no FastAPI.
"""

import base64
import io
import threading

from PIL import Image, ImageOps, UnidentifiedImageError

SIDE = 256  # the stored picture is SIDE × SIDE
MAX_SIDE = 512  # the largest picture accepted, checked from the header before decoding
MAX_STORED = 32 * 1024  # bytes of the stored JPEG
QUALITIES = (85, 75, 65, 60)  # tried in turn until the JPEG fits MAX_STORED
DECODING_AT_ONCE = 2  # decoding takes memory on the free instance: a burst waits instead
WAIT_FOR_A_TURN = 5.0  # seconds; then the upload is told to try again
_decoding = threading.BoundedSemaphore(DECODING_AT_ONCE)

# What the request says it is, the format Pillow must find, and how the file must start
KINDS = {
    "image/jpeg": "JPEG",
    "image/png": "PNG",
    "image/webp": "WEBP",
}


def data_url(image: bytes) -> str:
    """A stored picture as the page shows it: the API never serves a photo at its own address."""
    return "data:image/jpeg;base64," + base64.b64encode(image).decode("ascii")


class PhotoRefused(Exception):
    """Not one small still picture of an accepted kind."""


class PhotoBusy(Exception):
    """No decoding turn within WAIT_FOR_A_TURN seconds."""


def _starts_right(data: bytes, kind: str) -> bool:
    if kind == "JPEG":
        return data[:3] == b"\xff\xd8\xff"
    if kind == "PNG":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    return data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def clean_photo(data: bytes, declared: str) -> bytes:
    """The server's own 256 × 256 JPEG of `data`, or PhotoRefused / PhotoBusy."""
    kind = KINDS.get(declared.split(";")[0].strip().lower())
    if kind is None or not _starts_right(data, kind):
        raise PhotoRefused
    if not _decoding.acquire(timeout=WAIT_FOR_A_TURN):
        raise PhotoBusy
    try:
        return _reencode(data, kind)
    finally:
        _decoding.release()


def _reencode(data: bytes, kind: str) -> bytes:
    try:
        with Image.open(io.BytesIO(data), formats=[kind]) as image:
            width, height = image.size  # from the header: nothing is decoded yet
            if not (1 <= width <= MAX_SIDE and 1 <= height <= MAX_SIDE):
                raise PhotoRefused
            if getattr(image, "n_frames", 1) != 1:  # animated PNG or WebP
                raise PhotoRefused
            image.load()
            upright = ImageOps.exif_transpose(image)  # a phone photo turned sideways stands up
            if upright.mode in ("RGBA", "LA", "P"):
                upright = upright.convert("RGBA")
                background = Image.new("RGB", upright.size, (255, 255, 255))
                background.paste(upright, mask=upright.getchannel("A"))
                upright = background
            square = ImageOps.fit(upright.convert("RGB"), (SIDE, SIDE), Image.Resampling.LANCZOS)
    except PhotoRefused:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError, Image.DecompressionBombError):
        raise PhotoRefused from None
    for quality in QUALITIES:
        out = io.BytesIO()
        # No exif= argument: the new file carries no camera or location data
        square.save(out, "JPEG", quality=quality, optimize=True)
        if out.tell() <= MAX_STORED:
            return out.getvalue()
    raise PhotoRefused
