import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from search_okru import (
    channel_url, extract_search_channels, extract_search_videos, hints,
    parse_count, parse_page, search_url,
)

ROOT = os.path.join(os.path.dirname(__file__), "..")

# Trimmed from a live https://ok.ru/video/search/<query> response.
SEARCH_VIDEO_CARD = (
    '<div class="video_search_result_video-card video_search_result___horizontal" data-tsid="video_card">'
    '<div class="video-card js-movie-card null" tsid="movie-card"><div class="video-card_img-w">'
    '<a href="/video/4658593663605?st._aid=VideoState_open_search" class="video-card_lk">'
    '<img onerror="OK.VVImageError(this);" src="https://iv.okcdn.ru/videoPreview?id=1&amp;type=37" '
    'alt="Shrek 4 Felices Para Siempre [1080p] [Latino]" loading="lazy" class="video-card_img">'
    '<div data-movie-id="4658593663605" class="h-mod video-card_preview"></div></a>'
    '<div class="video-card_duration-w"><div class="video-card_duration">1:33:13</div></div></div></div>'
    '<div class="video_search_result_content-wrapper">'
    '<h3 class="video_search_result_name" title="Shrek 4 Felices Para Siempre [1080p] [Latino]">'
    '<a href="/video/4658593663605" class="video_search_result_link" data-tsid="video-name">'
    'Shrek 4 Felices Para Siempre [1080p] [Latino]</a></h3>'
    '<div class="video_search_result_info-w"><span class="video_search_result_info-i" '
    'data-tsid="video-views-count"> 15.6K просмотров</span><span class="video_search_result_info-i" '
    'data-tsid="video-created-date"></span></div>'
    '<a href="/video/c7883079" class="video_search_result_link video_search_result_wrapper3" '
    'data-l="searchCtx,{&quot;target&quot;:&quot;VIDEO_ALBUM&quot;}" data-tsid="video-owner">'
    '<span class="video_search_result_avatar"><img src="x" alt="" class="video_search_result_img"/></span>'
    '<div class="video_search_result_name2">Peliculas &amp; Series</div></a>'
    '<div class="video_search_result_description2" data-tsid="video-description">Audio latino.\n'
    '00:00 - Ep 1</div></div></div>'
)
SEARCH_CHANNEL_CARD = (
    '<div class="video_search_result_channel-card video_search_result___small2">'
    '<a href="/video/c5765359" class="video_search_result_link video_search_result_title '
    'video_search_result___primary" data-uikit-old="Link">Футбол</a>'
    '<span class="video_search_result_subscribers-count" data-tsid="channel-subscribers-count">'
    '25.2K подписчик</span><span class="video_search_result_video-count" '
    'data-tsid="channel-video-count">89 видео</span></div>'
)


def test_search_url_joins_words_with_plus():
    # ok.ru returns no results when the spaces are sent as %20.
    assert search_url(" shrek 2 latino ") == "https://ok.ru/video/search/shrek+2+latino"


def test_channel_url_accepts_ids_paths_and_urls():
    assert channel_url("c5765359") == "https://ok.ru/video/c5765359"
    assert channel_url("/video/c5765359") == "https://ok.ru/video/c5765359"
    assert channel_url("group/70000044553643") == "https://ok.ru/group/70000044553643/video/all"
    assert channel_url("https://ok.ru/video/c1") == "https://ok.ru/video/c1"


def test_parse_count_reads_suffixes_and_separators():
    assert parse_count(" 15.6K просмотров") == 15600
    assert parse_count("1.2M views") == 1200000
    assert parse_count("10&nbsp;699 просмотров") == 10699
    assert parse_count("990 views") == 990
    assert parse_count("") == 0


def test_hints_read_quality_and_language_tags():
    assert hints("Shrek 4 [1080p] [Latino]") == (["1080p"], ["latino"])
    assert hints("Yu-Gi-Oh! GX 3x38 LAS dub") == ([], ["latino", "doblaje"])
    # Lowercase "las" is the Spanish article, not Latin American Spanish.
    assert hints("Las Mascotas Maravilla") == ([], [])


def test_extract_search_videos_reads_every_field():
    [video] = extract_search_videos(SEARCH_VIDEO_CARD + SEARCH_CHANNEL_CARD)
    assert video["video_id"] == "4658593663605"
    assert video["title"] == "Shrek 4 Felices Para Siempre [1080p] [Latino]"
    assert video["duration_raw"] == "1:33:13"
    assert video["views"] == 15600
    assert video["owner_name"] == "Peliculas & Series"
    assert video["owner_kind"] == "channel"
    assert video["owner_url"] == "https://ok.ru/video/c7883079"
    assert video["description"] == "Audio latino. 00:00 - Ep 1"
    assert video["thumbnail_url"] == "https://iv.okcdn.ru/videoPreview?id=1&type=37"


def test_extract_search_channels_reads_counts():
    assert extract_search_channels(SEARCH_VIDEO_CARD + SEARCH_CHANNEL_CARD) == [{
        "name": "Футбол",
        "kind": "channel",
        "url": "https://ok.ru/video/c5765359",
        "subscribers": 25200,
        "video_count": 89,
    }]


def test_parse_page_enriches_videos_and_flags_catalog_ones():
    page = parse_page(SEARCH_VIDEO_CARD, known_ids={"4658593663605"})
    assert page["kind"] == "search"
    [video] = page["videos"]
    assert video["in_catalog"] is True
    assert video["duration_seconds"] == 5593
    assert video["parsed"]["quality"] == "1080p"
    assert video["quality_hints"] == ["1080p"]
    assert video["language_hints"] == ["latino"]
    assert video["description_hints"] == ["latino"]
    assert video["embed_url"] == "https://ok.ru/videoembed/4658593663605"


def test_parse_page_keeps_a_zero_result_search_a_search():
    page = parse_page("<html>nothing found</html>", known_ids=set(), kind="search")
    assert page == {"kind": "search", "channel_name": "", "videos": [], "channels": []}


def test_parse_page_reads_a_saved_channel_page():
    html_text = open(os.path.join(ROOT, "yu-gi-oh-gx.html"), encoding="utf-8").read()
    page = parse_page(html_text, known_ids=set())
    assert page["kind"] == "channel"
    assert len(page["videos"]) == 154
    first = page["videos"][0]
    assert first["owner_name"] == "Goten Bel"
    assert first["episode"] == {"season": 3, "episode": 38}
    assert first["language_hints"] == ["latino", "doblaje"]


def _embed_page(metadata):
    import html as html_lib, json as json_lib
    options = {"flashvars": {"metadata": metadata}}
    return f'<div data-module="OKVideo" data-options="{html_lib.escape(json_lib.dumps(options))}"></div>'


def test_parse_embed_reads_real_resolution_and_duration():
    from search_okru import parse_embed
    page = _embed_page({
        "movie": {"status": "OK", "duration": "5593", "width": 1920, "height": 1080, "title": "Shrek 4"},
        "videos": [{"name": "mobile"}, {"name": "sd"}, {"name": "hd"}, {"name": "full"}],
    })
    assert parse_embed(page) == {
        "playable": True, "status": "OK", "width": 1920, "height": 1080,
        "best_variant": "full", "resolution": "1080p", "duration_seconds": 5593, "title": "Shrek 4",
    }


def test_parse_embed_reports_a_missing_video():
    from search_okru import parse_embed
    page = '<div class="vp_video_stub_txt">Видео не найдено</div>'
    assert parse_embed(page) == {
        "playable": False, "status": "Видео не найдено", "width": 0, "height": 0,
        "best_variant": "", "resolution": "", "duration_seconds": 0, "title": "",
    }
