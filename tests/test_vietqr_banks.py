"""The bank list for VietQR (specs/016-vietqr, research R3): one dataset, two copies.

The web image is built from frontend/ alone, so the page has its own copy; this test keeps the two
identical, so the API and the page never disagree about which banks can be chosen (FR-016).
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API_COPY = ROOT / "app" / "data" / "vietqr_banks.json"
PAGE_COPY = ROOT / "frontend" / "src" / "data" / "vietqr-banks.json"


def test_the_api_and_the_page_have_the_same_list():
    assert API_COPY.read_bytes() == PAGE_COPY.read_bytes()


def test_every_bank_is_well_formed_and_listed_once():
    data = json.loads(API_COPY.read_text(encoding="utf-8"))
    assert data["version"] and data["source"]
    bins = [bank["bin"] for bank in data["banks"]]
    assert len(bins) == len(set(bins))
    for bank in data["banks"]:
        assert len(bank["bin"]) == 6 and bank["bin"].isdigit(), bank
        assert bank["name"].strip(), bank
        assert isinstance(bank["transfer"], bool), bank
