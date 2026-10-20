"""Match a name as someone wrote it ("tien", "Duy") to a household member ("Tiến", "Duy Anh").

Pure: no database, no FastAPI. Used by AI Quick add, where Gemini returns names as written.
"""

import unicodedata


def normalize(name: str) -> str:
    """Lower case, no diacritics, single spaces: "  Tiến  " and "TIEN" both give "tien"."""
    decomposed = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    plain = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return " ".join(plain.casefold().split())


def match_member(name: str, members: dict[int, str]) -> int | None:
    """The id of the one member this name means, or None if it means none or several.

    First an exact match ignoring case and accents; failing that, a member with a word equal to the
    name ("Duy" → "Duy Anh"), but only when exactly one member has it.
    """
    wanted = normalize(name)
    if not wanted:
        return None
    exact = [mid for mid, member in members.items() if normalize(member) == wanted]
    if len(exact) == 1:
        return exact[0]
    if exact:
        return None
    by_word = [mid for mid, member in members.items() if wanted in normalize(member).split()]
    return by_word[0] if len(by_word) == 1 else None
