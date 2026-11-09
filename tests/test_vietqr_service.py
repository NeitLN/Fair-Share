"""The rules behind a VietQR payment, without the database (specs/016-vietqr).

FR-002 (account number), FR-003 (holder's name), FR-014 (transfer message), FR-015 (which code, for
how much). The cleaning cases are shared with the page's live preview
(frontend/src/lib/clean-ascii-cases.json, which the page's own test reads too).
"""

import json
from pathlib import Path

import pytest

from app.services.vietqr import (
    FAST_TRANSFER_LIMIT,
    bank_for,
    clean_account_number,
    clean_ascii,
    payment_state,
    transfer_message,
)

CASES_FILE = Path(__file__).resolve().parent.parent / "frontend/src/lib/clean-ascii-cases.json"
CASES = json.loads(CASES_FILE.read_text(encoding="utf-8"))


@pytest.mark.parametrize("raw, cleaned", CASES)
def test_names_are_cleaned_like_banking_apps_show_them(raw, cleaned):
    assert clean_ascii(raw) == cleaned


@pytest.mark.parametrize(
    "raw, cleaned",
    [("0123 456.789", "0123456789"), ("0123-456-789", "0123456789"), ("000123", "000123"),
     ("1" * 19, "1" * 19)],
)
def test_an_account_number_keeps_its_digits_and_leading_zeros(raw, cleaned):
    assert clean_account_number(raw) == cleaned


@pytest.mark.parametrize("raw", ["12a45678", "12345", "1" * 20, "", " ", "０１２３４５６"])
def test_anything_else_is_not_an_account_number(raw):
    assert clean_account_number(raw) is None


def test_only_banks_taking_transfers_are_known():
    assert bank_for("970436")["name"] == "Vietcombank"
    assert bank_for("999999") is None


@pytest.mark.parametrize(
    "house, payer, message",
    [("Nhà trọ Q7", "Lan", "FS NHATROQ7 LAN"),
     ("Nhà trọ Quận 7 đường Nguyễn Thị Thập", "Nguyễn Văn Phúc", "FS NHATROQUAN7D NGUYENVA"),
     ("😀", "Lan", "FS LAN"),
     ("Nhà trọ Q7", "😀", "FS NHATROQ7"),
     ("😀", "😀", "FS")],
)
def test_the_transfer_message_is_short_ascii_and_names_house_and_payer(house, payer, message):
    built = transfer_message(house, payer)
    assert built == message
    assert len(built) <= 24 and built.isascii()


def notice(status, amount, version=7):
    return {"status": status, "amount": amount, "version": version}


@pytest.mark.parametrize(
    "suggested, told, acknowledge, state, amount",
    [
        (120_000, None, None, "ready", 120_000),
        (120_000, notice("sent", 100_000), None, "partly_told", 20_000),
        (80_000, notice("sent", 100_000), None, "covered", None),
        (100_000, notice("sent", 100_000), None, "covered", None),
        (120_000, notice("declined", 100_000), None, "declined", None),
        (120_000, notice("declined", 100_000), 6, "declined", None),  # an old version
        (120_000, notice("declined", 100_000), 7, "declined_acknowledged", 120_000),
        (FAST_TRANSFER_LIMIT - 1, None, None, "ready", FAST_TRANSFER_LIMIT - 1),
        (FAST_TRANSFER_LIMIT, None, None, "too_large", FAST_TRANSFER_LIMIT),
        (FAST_TRANSFER_LIMIT + 10, notice("sent", 10), None, "too_large", FAST_TRANSFER_LIMIT),
        (FAST_TRANSFER_LIMIT, notice("declined", 5), 7, "too_large", FAST_TRANSFER_LIMIT),
    ],
)
def test_which_code_and_how_much(suggested, told, acknowledge, state, amount):
    assert payment_state(suggested, told, acknowledge) == (state, amount)


def test_the_fast_transfer_limit_is_half_a_billion():
    assert FAST_TRANSFER_LIMIT == 500_000_000
