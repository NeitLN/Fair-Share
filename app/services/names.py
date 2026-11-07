"""Match a name as someone wrote it ("tien", "Duy") to a household member ("Tiến", "Duy Anh").

Pure: no database, no FastAPI. Used by AI Quick add, where Gemini returns names as written.
"""

import unicodedata


def normalize(name: str) -> str:
    """Lower case, no diacritics, single spaces: "  Tiến  " and "TIEN" both give "tien"."""
    decomposed = unicodedata.normalize("NFD", name.replace("đ", "d").replace("Đ", "D"))
    plain = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return " ".join(plain.casefold().split())


def match_candidates(name: str, members: dict[int, str]) -> list[int]:
    """Every member this name could mean: [] for nobody, two or more when it is ambiguous.

    First an exact match ignoring case and accents; failing that, the members with a word equal to
    the name ("Duy" → "Duy Anh").
    """
    wanted = normalize(name)
    if not wanted:
        return []
    exact = [mid for mid, member in members.items() if normalize(member) == wanted]
    if exact:
        return exact
    return [mid for mid, member in members.items() if wanted in normalize(member).split()]


def match_member(name: str, members: dict[int, str]) -> int | None:
    """The id of the one member this name means, or None if it means none or several."""
    candidates = match_candidates(name, members)
    return candidates[0] if len(candidates) == 1 else None
