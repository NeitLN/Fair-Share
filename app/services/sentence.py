"""What a quick add sentence actually says, checked without the model (specs/009-ai-custom-split).

The model fills every field of its schema, so on a short sentence it sometimes guesses: a payer the
sentence never names, a total that is the sum of the shares, a person for "the rest" when the
sentence says nothing about it. These checks look at the sentence itself, so a guess is dropped or
blocked instead of becoming a split that adds up but is not what was typed.

Pure: no database, no FastAPI.
"""

import dataclasses
import re
import unicodedata

from app.services.gemini import ExpenseDraft, Rest
from app.services.names import normalize

SPEAKER = "ME"  # how the model writes the person typing
# How people write themselves, accents kept
SPEAKER_WORDS = {"mình", "tôi", "tao", "tớ", "tui", "me", "i", "my", "mine", "myself"}
# Words that say something about what is left of the total, after normalize() (no accents)
REST_PHRASES = ["con lai", "phan con", "phan du", "con du", "phan kia", "rest", "remaining",
                "remainder", "leftover", "left over"]
# Words that ask for an equal split ("Lan với Duy Anh chia đều"), after normalize()
EQUAL_WORDS = {"chia", "split", "equal", "equally", "evenly"}
# A word of a longer name ("Duy" of "Duy Anh") counts as that name, except these everyday words
COMMON_WORDS = {"anh", "em", "chi", "co", "chu", "ba", "me", "ong", "ban"}

_MILLION = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|m)(?![^\W\d_])(\d{1,3})?")
_THOUSAND = re.compile(r"(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|nghin|ngàn|ngan)(?!\w)")
_GROUPED = re.compile(r"(?<![\d.,])\d{1,3}(?:[.,]\d{3})+(?![\d.,])")
_PLAIN = re.compile(r"(?<![\d.,])\d+(?![\d.,])")
# "1 triệu 2" is 1 200 000, unless the 2 is an amount of its own ("1 triệu 200k")
_MILLION_SPACED = re.compile(
    r"(\d+)\s*(?:tr|triệu|trieu)\s+(\d{1,3})(?![\d.,])(?!\s*(?:k|nghìn|nghin|ngàn|ngan|tr|triệu|trieu)(?!\w))"
)
_MILLION_HALF = re.compile(r"(\d+)\s*(?:tr|triệu|trieu)\s*(?:rưỡi|ruoi)(?!\w)")  # "2 triệu rưỡi"
_HALF_MILLION = re.compile(r"(?:nửa|nua)\s*(?:tr|triệu|trieu)(?!\w)")  # "nửa triệu"


def _words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", normalize(text))


def _decimal(number: str) -> float:
    return float(number.replace(",", "."))


def amounts_written(text: str) -> set[int]:
    """The amounts in đồng the sentence writes: "500k", "1tr2", "1,5 triệu", "1 triệu 2",
    "2 triệu rưỡi", "nửa triệu", "350.000", "200000"."""
    plain = unicodedata.normalize("NFC", text).casefold()
    found: set[int] = set()
    # Both readings of "1 triệu 2" are kept: 1 200 000, and 1 000 000 with a 2 after it
    found.update(int(a) * 1_000_000 + int(b.ljust(3, "0")) * 1_000
                 for a, b in _MILLION_SPACED.findall(plain))
    found.update(int(a) * 1_000_000 + 500_000 for a in _MILLION_HALF.findall(plain))
    if _HALF_MILLION.search(plain):
        found.add(500_000)
    for whole, tail in _MILLION.findall(plain):
        value = _decimal(whole) * 1_000_000
        if tail:  # "1tr2" = 1 200 000, "1tr25" = 1 250 000
            value += int(tail.ljust(3, "0")) * 1_000
        found.add(round(value))
    plain = _MILLION.sub(" ", plain)
    for number in _THOUSAND.findall(plain):
        found.add(round(_decimal(number) * 1_000))
    plain = _THOUSAND.sub(" ", plain)
    for number in _GROUPED.findall(plain):
        found.add(int(re.sub(r"[.,]", "", number)))
    plain = _GROUPED.sub(" ", plain)
    found.update(int(number) for number in _PLAIN.findall(plain))
    return found


def _own_words(text: str) -> list[str]:
    """Words as typed, lower case, accents kept."""
    return re.findall(r"\w+", unicodedata.normalize("NFC", text).casefold())


def _same_word(typed: str, wanted: str) -> bool:
    """A typed word is a word of a name when it is the same with its accents, or when it is typed
    without accents and matches the name without its accents ("tien" for "Tiến"). A word with other
    accents is another word: "tiền" is not "Tiến", "mình" is not "Minh"."""
    return typed == wanted or (typed == normalize(typed) and typed == normalize(wanted))


def name_written(name: str, text: str) -> bool:
    """True when the sentence writes this name ("Tiến", or "tien" typed without accents); one word
    of a longer name is enough ("Duy" for "Duy Anh") unless it is an everyday word."""
    wanted = _own_words(name)
    words = _own_words(text)
    if not wanted:
        return False
    n = len(wanted)
    for i in range(len(words) - n + 1):
        if all(_same_word(words[i + k], wanted[k]) for k in range(n)):
            return True
    return n > 1 and any(
        _same_word(typed, part)
        for part in wanted
        if normalize(part) not in COMMON_WORDS
        for typed in words
    )


def speaker_written(text: str) -> bool:
    """True when the person typing writes themselves ("còn lại mình", "rest me")."""
    return any(w in SPEAKER_WORDS for w in _own_words(text))


def rest_written(text: str) -> bool:
    """True when the sentence says something about what is left ("còn lại", "the rest")."""
    joined = f" {' '.join(_words(text))} "
    return any(f" {phrase} " in joined for phrase in REST_PHRASES)


def equal_written(text: str) -> bool:
    """True when the sentence asks for an equal split ("chia đều", "split")."""
    return any(w in EQUAL_WORDS for w in _words(text))


def held_to_sentence(found: ExpenseDraft, text: str) -> ExpenseDraft:
    """The reading of a sentence with named amounts, keeping only what the sentence writes:
    - a payer it never names is dropped (the user picks who paid);
    - a total it never writes is dropped (the split then waits for the total);
    - a person for the rest that it never writes, when it says nothing about the rest either, is
      dropped, so the rest goes to the payer as the spec says for a sentence silent about it;
    - a rest it says nothing about ("còn lại", or "chia đều" for an equal one) but whose people it
      does write is blocked, never handed to the payer: "Lan với Duy Anh chia đều" keeps Lan and
      Duy Anh, and a guessed "rest Lan" for a sentence where Lan only has her own amount stops;
    - a name, ME or amount in the shares that it never writes makes the shares unreadable, so the
      split is blocked and never repaired."""
    amounts = amounts_written(text)  # empty when the amounts are written in a way not read here

    def written(name: str) -> bool:
        return speaker_written(text) if name.upper() == SPEAKER else name_written(name, text)

    payer = found.payer
    if payer and payer.upper() != SPEAKER and not name_written(payer, text):
        payer = None
    amount = found.amount
    if amount is not None and amounts and amount not in amounts:
        amount = None
    rest = found.rest
    rest_cue = rest_written(text) or (rest.kind == "equal" and equal_written(text))
    rest_names_written = all(written(name) for name in rest.names)
    guessed_rest = rest.kind != "none" and not rest_cue
    if guessed_rest and rest.names and not rest_names_written:
        rest, guessed_rest = Rest(), False  # a taker made up for a rest never mentioned (#220)
    readable = (
        found.shares_readable
        and not guessed_rest
        and all(
            written(entry.name) and (not amounts or entry.amount in amounts)
            for entry in found.named_amounts
        )
        and all(written(name) for name in rest.names)
    )
    return dataclasses.replace(
        found, payer=payer, amount=amount, rest=rest, shares_readable=readable
    )
