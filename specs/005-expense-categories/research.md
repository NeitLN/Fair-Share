# Research: Expense categories and a chart per month

No open questions were left in the Technical Context; these are the design decisions and why.

## R1. Where the category lives

- **Decision**: A `text` column `category` on `expenses`, `NOT NULL DEFAULT 'other'`, with
  `CHECK (category IN ('food', 'groceries', 'utilities', 'rent', 'transport', 'household', 'other'))`,
  in a new migration `005_expense_categories.sql`. Stable English codes in the database and the API; the
  page shows the name in its language.
- **Rationale**: Seven fixed values (FR-001) do not need a table; a check constraint keeps bad values out
  even if a request slips past the API (constitution III, the same pattern as `source` and the notices'
  `status`). The default fills every existing row with `other` in the same statement (FR-002), and keeps
  an old client that sends no category working (FR-006).
- **Alternatives considered**: A `categories` table with a foreign key (only useful for per-house
  categories, which are out of scope); a PostgreSQL enum (harder to change later than a check); storing
  Vietnamese names (the API would change with the wording).

## R2. The API contract

- **Decision**: `ExpenseIn.category: Literal[...] = "other"`; every expense response carries `category`.
  An unknown value is the usual `422 validation_error` with `loc: ["body", "category"]`. The AI draft
  (`ExpenseDraft`) does not change.
- **Rationale**: One optional field with a default is backwards compatible; the error shape already names
  the field (FR-006). Rights stay where they are: the same `PUT` decides who may change the expense and so
  its category (FR-005).
- **Alternatives considered**: A separate `PATCH /expenses/{id}/category` (a second route to secure for
  the same right); asking Gemini for a category (changes the prompt, the parser and the quota, FR-007).

## R3. The guess from the description

- **Decision**: `guessCategory(description)` in `lib/categories.ts`: lower-case, strip accents (NFD,
  remove marks, đ → d), then look for whole words or phrases from a fixed list per category, checked in
  the order of FR-001; first hit wins, else `other`. The lists:

  | Category | Words (accent-free) |
  |---|---|
  | food | an uong, an sang, an trua, an toi, an vat, di an, tien an, lau, nuong, com, bun, pho, tra sua, cafe, ca phe, nhau, pizza, ga ran |
  | groceries | di cho, tien cho, sieu thi, mi goi, trung ga, trung vit, mua trung, rau, thit, mua ca, ca loc, ca thu, gao, dau an, nuoc mam |
  | utilities | dien, tien dien, tien nuoc, hoa don nuoc, internet, wifi, tien mang, gas, binh ga |
  | rent | tien nha, thue nha, tien phong, nha tro |
  | transport | xang, grab, xe, taxi, gui xe, ve xe, bus |
  | household | do dung, bong den, giay ve sinh, xa phong, nuoc rua chen, bot giat, sua chua, chen bat |

  Words that mean several things alone stay out or only count in a phrase: "quan" (quán / quần),
  "nuoc" (tiền nước / nước suối), "ga" (gas / gà), "mang" (mạng / mang), and since the review of #199
  "cho" (chợ / the preposition cho), "ca" (cá / cả), "an" (ăn / the name An), "trung" (trứng / the name
  Trung): "Tiền điện cho cả nhà" had read Đi chợ.

  The form keeps a flag "picked by hand"; while it is false the category follows the description, once
  the user picks it stays. Editing an expense starts with the flag set (its stored category is kept).
- **Rationale**: Zero extra steps in the usual case (SC-001); runs in the page with no request; whole
  words avoid "ca" matching inside "cafe" being read as fish only by order (food is checked first). The
  demo seed's five descriptions all land right: Tiền nhà → rent, Đi chợ cuối tuần → groceries, Tiền điện
  → utilities, Lẩu thứ sáu → food, Mì gói và trứng → groceries (SC-002).
- **Alternatives considered**: Asking the AI (FR-007); the server guessing on save (the user would not see
  it before saving); learning from past expenses (more code for a small gain).

## R4. The chart

- **Decision**: A list, not a canvas: one `<li>` per category used in the month, largest first (ties in
  FR-001 order), each a link with the name, the amount (`Money`) and the percentage as text, and a bar
  (`aria-hidden`) whose width is the share of the largest category. Bars use one token (`--primary`, the
  taro) on `--surface-2`, so colour carries no meaning (FR-012). Percentages by largest remainder over
  whole percents, so they sum to 100; a non-zero share that rounds to 0 reads "<1%" and keeps a 4 px bar.
- **Rationale**: Text values pass the a11y walk and screen readers with no chart library; bars scaled to
  the largest category are easier to compare than to the total. The pattern matches the app's other lists.
- **Alternatives considered**: A donut (hard to compare, colour-coded by nature); a chart library (new
  dependency, canvas text not reachable); bars scaled to 100% (the biggest category, rent, dwarfs the rest).

## R5. Where it shows

- **Decision**: The chart sits in the monthly report under the housemates' lines (spec 004), on a
  `.report` section of its own with the heading "Chi theo danh mục". A line links to
  `/households/:id/expenses` with state `{ month, category }`. In Chi tiêu, each row's meta line ends with
  the category name ("Minh trả · chia đều 3 người · Ăn uống"), and the filters gain *Danh mục* after
  *Người*. The form shows a fold row *Danh mục* between *Ngày* and *Cách chia*, opening seven chips
  (radio group).
- **Rationale**: FR-009, FR-011, FR-013; the fold row is the form's existing pattern for optional choices
  (DESIGN §6.3), so the 90% case still needs only description, amount and Lưu.

## R6. Tests

- **Decision**: pytest: migration on a fresh database leaves old rows `other`; create without category →
  `other`; create and update with one → returned and stored; unknown → 422 naming `category`; a member
  who may not change an expense cannot change its category (403/404 as today); balances identical with
  and without categories. Vitest: the guess table above and the seed descriptions; totals sum and
  percentages sum to 100 on tricky splits (⅓ each, one tiny category); form keeps a hand pick; filter;
  CSV column; chart text and links. E2E on a local stack: add "Tiền điện" and see Điện nước, the report's
  chart, the filter; a11y walk on the report with the chart.
