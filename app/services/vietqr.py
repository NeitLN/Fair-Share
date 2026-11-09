"""The rules behind paying by VietQR (specs/016-vietqr). No database, no network.

* The bank list (FR-016): a dated dataset bundled with the app; the page has an identical copy
  (frontend/src/data/vietqr-banks.json, checked by tests/test_vietqr_banks.py). Only banks marked as
  taking VietQR account transfers can be chosen or used in a code.
* Cleaning (FR-002, FR-003): the account number keeps its ASCII digits; the holder's name becomes
  capital ASCII letters, digits and single spaces, as banking apps show names.
* The transfer message (FR-014) and which code to show for how much (FR-015).

Nothing here logs: an account number or a name never reaches the server log (FR-006).
"""

import json
import re
import unicodedata
from pathlib import Path

BANKS_FILE = Path(__file__).resolve().parent.parent / "data" / "vietqr_banks.json"
BANKS: dict[str, dict] = {
    bank["bin"]: bank
    for bank in json.loads(BANKS_FILE.read_text(encoding="utf-8"))["banks"]
}

# NAPAS fast transfers (Chuyển nhanh NAPAS 247) carry less than this; from it no code is offered
FAST_TRANSFER_LIMIT = 500_000_000

# The parts of a transfer message: "FS <house> <payer>", at most 2 + 1 + 12 + 1 + 8 = 24 characters
HOUSE_PART = 12
PAYER_PART = 8

ACCOUNT_NUMBER = re.compile(r"[0-9]{6,19}")
ACCOUNT_SEPARATORS = re.compile(r"[ .\-]")


def bank_for(bin_code: str) -> dict | None:
    """The bank of a BIN, only when it takes VietQR account transfers."""
    bank = BANKS.get(bin_code)
    return bank if bank is not None and bank["transfer"] else None


def clean_ascii(text: str) -> str:
    """FR-003: NFD; combining marks dropped; Đ/đ → D; upper case; only A-Z, 0-9 and spaces kept;
    spaces collapsed and trimmed. "Đỗ Thị  Lan" → "DO THI LAN". Empty when nothing is left."""
    decomposed = unicodedata.normalize("NFD", text.replace("Đ", "D").replace("đ", "d"))
    letters = "".join(ch for ch in decomposed if not unicodedata.combining(ch)).upper()
    kept = "".join(ch for ch in letters if ("A" <= ch <= "Z") or ("0" <= ch <= "9") or ch == " ")
    return " ".join(kept.split())


def clean_account_number(text: str) -> str | None:
    """FR-002: spaces, dots and dashes removed; then 6 to 19 ASCII digits, leading zeros kept.
    None for anything else (letters, other digits, too short or too long)."""
    digits = ACCOUNT_SEPARATORS.sub("", text)
    return digits if ACCOUNT_NUMBER.fullmatch(digits) else None


def transfer_message(house_name: str, payer_name: str) -> str:
    """FR-014: "FS", the house (spaces removed, 12 characters) and the payer (8), each cleaned like
    a holder's name; an empty part is left out."""
    house = clean_ascii(house_name).replace(" ", "")[:HOUSE_PART]
    payer = clean_ascii(payer_name).replace(" ", "")[:PAYER_PART]
    return " ".join(part for part in ("FS", house, payer) if part)


def payment_state(suggested: int, notice: dict | None,
                  acknowledge: int | None) -> tuple[str, int | None]:
    """FR-015, in order. `suggested` (S) is what the server suggests the payer sends now; `notice`
    is the pair's "Tôi đã chuyển" (spec 014: status, amount T, version); `acknowledge` is the
    declined notice's version the payer pressed "Vẫn chuyển" for.

    Returns the state and the amount Q to put in the code (None when no code is offered)."""
    state = "ready"
    amount = suggested
    if notice is not None and notice["status"] == "sent":
        amount = suggested - notice["amount"]
        if amount <= 0:
            return "covered", None
        state = "partly_told"
    elif notice is not None and notice["status"] == "declined":
        if acknowledge != notice["version"]:
            return "declined", None
        state = "declined_acknowledged"
    if amount >= FAST_TRANSFER_LIMIT:
        return "too_large", amount
    return state, amount
