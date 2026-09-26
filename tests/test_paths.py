import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

import build_aniyomi_feed
import detect_chapters
import parse_catalog

WEB_PUBLIC = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "apps", "web", "public"))


def test_catalog_outputs_live_in_the_web_app():
    """The scripts must write where the web app serves from (apps/web/public), not a stale root public/."""
    for path in (parse_catalog.OUTPUT_CSV, build_aniyomi_feed.CATALOG_CSV, detect_chapters.OUTPUT_CSV):
        assert os.path.normpath(path) == os.path.join(WEB_PUBLIC, "data", "catalog.csv")
        assert os.path.isfile(path), path
    assert os.path.normpath(build_aniyomi_feed.OUTPUT_DIR) == os.path.join(WEB_PUBLIC, "data", "aniyomi")
    assert os.path.isdir(build_aniyomi_feed.OUTPUT_DIR)
