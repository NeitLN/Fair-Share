"""app/services/images.py: only a small still picture of an accepted kind is taken, and what is kept
is the server's own 256 × 256 JPEG with no metadata (specs/010-profile-page, FR-021)."""

import io

import pytest
from PIL import Image

from app.services import images
from app.services.images import MAX_STORED, PhotoRefused, clean_photo, data_url


def picture(kind="PNG", size=(300, 300), colour=(200, 40, 40), **save) -> bytes:
    out = io.BytesIO()
    Image.new("RGB", size, colour).save(out, kind, **save)
    return out.getvalue()


def opened(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


@pytest.mark.parametrize(
    ("kind", "declared"), [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")]
)
def test_each_accepted_kind_becomes_a_small_square_jpeg(kind, declared):
    stored = clean_photo(picture(kind, size=(512, 384)), declared)
    image = opened(stored)
    assert (image.format, image.size) == ("JPEG", (256, 256))
    assert len(stored) <= MAX_STORED


def test_camera_data_is_dropped_and_a_sideways_photo_stands_up():
    original = Image.new("RGB", (300, 200), (255, 0, 0))
    original.paste((0, 0, 255), (150, 0, 300, 200))  # left red, right blue
    exif = Image.Exif()
    exif[0x0112] = 6  # Orientation: turn 90° clockwise to show it
    exif[0x010F] = "SpyCam"  # Make
    exif.get_ifd(0x8825)[2] = (10.0, 45.0, 0.0)  # GPSLatitude
    out = io.BytesIO()
    original.save(out, "JPEG", exif=exif)
    assert b"SpyCam" in out.getvalue()

    stored = clean_photo(out.getvalue(), "image/jpeg")
    assert b"SpyCam" not in stored
    image = opened(stored)
    assert dict(image.getexif()) == {}
    top, bottom = image.getpixel((128, 20)), image.getpixel((128, 235))
    assert top[0] > 200 and top[2] < 60  # the red half is now on top
    assert bottom[2] > 200 and bottom[0] < 60


def test_a_transparent_png_gets_a_white_background():
    out = io.BytesIO()
    Image.new("RGBA", (100, 100), (0, 0, 0, 0)).save(out, "PNG")
    pixel = opened(clean_photo(out.getvalue(), "image/png")).getpixel((128, 128))
    assert min(pixel) > 240


@pytest.mark.parametrize(
    ("data", "declared"),
    [
        (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/svg+xml"),
        (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', "image/png"),
        (b"just some text, named photo.jpg", "image/jpeg"),
        (picture("PNG"), "image/jpeg"),  # declared type and content disagree
        (picture("PNG", size=(600, 600)), "image/png"),
        (picture("PNG", size=(513, 10)), "image/png"),
        (picture("JPEG")[:200], "image/jpeg"),  # cut off
        (picture("PNG"), "application/octet-stream"),
        (b"", "image/png"),
    ],
)
def test_anything_else_is_refused(data, declared):
    with pytest.raises(PhotoRefused):
        clean_photo(data, declared)


@pytest.mark.parametrize("kind", ["PNG", "WEBP"])
def test_an_animated_picture_is_refused(kind):
    frames = [Image.new("RGB", (64, 64), c) for c in ((255, 0, 0), (0, 0, 255))]
    out = io.BytesIO()
    frames[0].save(out, kind, save_all=True, append_images=frames[1:], duration=100, loop=0)
    with pytest.raises(PhotoRefused):
        clean_photo(out.getvalue(), f"image/{kind.lower()}")


def test_a_picture_too_big_is_refused_before_it_is_decoded(monkeypatch):
    tall = picture("PNG", size=(4000, 20))

    def no_decoding(self):
        raise AssertionError("decoded a picture that was too big")

    monkeypatch.setattr(Image.Image, "load", no_decoding)
    with pytest.raises(PhotoRefused):
        clean_photo(tall, "image/png")


def test_no_turn_to_decode_means_busy(monkeypatch):
    monkeypatch.setattr(images, "WAIT_FOR_A_TURN", 0.01)
    for _ in range(images.DECODING_AT_ONCE):
        images._decoding.acquire()
    try:
        with pytest.raises(images.PhotoBusy):
            clean_photo(picture("PNG"), "image/png")
    finally:
        for _ in range(images.DECODING_AT_ONCE):
            images._decoding.release()


def test_a_stored_picture_is_shown_as_a_data_url():
    assert data_url(b"\xff\xd8\xff").startswith("data:image/jpeg;base64,/9j/")
