# Data Model: Wider desktop frame and a composed sign-in page

No data changes. No table, column, API field or stored preference is added, removed or changed; the
feature only changes how existing data is laid out on screens 1024 px and wider.

The values the layout uses, all already present:

| Value | Where it comes from |
|---|---|
| Tagline | `t.tagline` ("Rõ ai trả ai." / "See who owes who."), BRAND.md |
| Introduction | `t.auth.intro`, today's text under the sign-in title |
| Decorative avatars | four fixed `MemberLook`s built in the page (letters T, M, A, L, tints 1–4), not people |
| Screen width | `useWide()` (1024 px) and the existing 1280 px media query |
