"""The app's brand images: sizes, backgrounds, and the adaptive icon's safe zone."""
import importlib.util
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "apps/mobile/scripts/brand_images.py"
FONT = ROOT / "node_modules/@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf"

pytestmark = pytest.mark.skipif(not FONT.exists(), reason="needs npm install (the wordmark font)")

BG = (8, 9, 12, 255)


def load():
    spec = importlib.util.spec_from_file_location("brand_images", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def images(tmp_path_factory):
    from PIL import Image

    paths = load().render(tmp_path_factory.mktemp("brand"))
    return {name: Image.open(path) for name, path in paths.items()}


def test_sizes(images):
    assert images["icon"].size == (1024, 1024)
    assert images["adaptive"].size == (1024, 1024)
    assert images["splash"].size == (512, 512)
    assert images["banner"].size == (640, 360)


def test_icon_and_banner_are_opaque_on_the_app_background(images):
    for name in ("icon", "banner"):
        image = images[name].convert("RGBA")
        assert image.getpixel((0, 0)) == BG
        assert image.getpixel((image.width - 1, image.height - 1)) == BG


def test_foregrounds_are_transparent_around_the_mark(images):
    for name in ("adaptive", "splash"):
        assert images[name].convert("RGBA").getpixel((0, 0))[3] == 0


def test_keeps_the_adaptive_foreground_inside_the_safe_zone(images):
    # Android masks adaptive icons to the centre 66 %: 1024 * 0.17 = 174 px margin each side.
    left, top, right, bottom = images["adaptive"].getchannel("A").getbbox()
    assert left >= 174 and top >= 174 and right <= 1024 - 174 and bottom <= 1024 - 174


def test_the_mark_is_drawn_in_the_brand_colours(images):
    colours = {pixel for _, pixel in images["banner"].convert("RGBA").getcolors(1 << 20)}
    assert (198, 242, 78, 255) in colours  # the accent dot
    assert (242, 244, 240, 255) in colours  # the wordmark
