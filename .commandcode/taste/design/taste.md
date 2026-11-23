# Design

- Wants light-mode only — no light/dark mode toggle. Confidence: 0.85
- Brand palette is `#0E3536` (deep pine) and `#F5A847` (amber); prefers the UI themed around exactly these two colors. Confidence: 0.75
- Logo should have no white background plate behind it — use the transparent dark logo asset directly on the pine surface. Confidence: 0.55
- New UI elements should reuse the existing styling/tokens of neighbouring items (e.g. a sidebar action should match the muted color of the nav links) rather than introducing a new accent color — consistency beats a novel shade even for semantically "special" items. Confidence: 0.6
- Prefers filters consolidated into a single compact control (e.g. one calendar-icon popover where a single click picks a day and a second click extends it to a range) over a mode dropdown plus separate date inputs — no mode switches the user has to reason about. Confidence: 0.6
- Avoids per-user pickers (dropdowns listing every person) in filter bars when the user base is or will be large; prefers coarse filters (department) plus free-text search instead. Confidence: 0.6
- Filter controls should sit on a single horizontal line on desktop (stacking only on narrow screens) rather than each taking its own row. Confidence: 0.5
- When a picker must target individual people from a large staff list, wants a cascading pair of dropdowns — Department first (defaults to "All") narrowing the People list, and picking a person with no department auto-fills that person's department — instead of one long scrollable list of everyone. Confidence: 0.65
- Expects open views to stay in sync on their own: other users' edits and deletions must appear without the user reloading the page — a manual refresh requirement reads as a bug. Confidence: 0.5
- Signals state with a filled surface, not with small dot/indicator markers — e.g. a day with content should have the whole cell's background colour change rather than tiny dots. Confidence: 0.55
- Completion should be non-destructive: finished items stay in history (the record is never dropped) — they only stop showing the "active" visual state, and stay reachable by opening that day/record. Confidence: 0.6
- Expects every main section/page to be reachable from the primary navigation: a page linked only inside the top-right user menu (behind a click) reads as missing/hidden. Confidence: 0.45
- Popovers/dropdowns (e.g. the notification bell panel) should dismiss on any outside click or navigation, not stay open until the trigger is clicked again — a panel that requires re-clicking the trigger reads as broken. Confidence: 0.5
- Wants actions with costly/quota-consuming side effects (e.g. blasting an announcement to every user's email) to be opt-in: a distinct checkbox, unchecked by default, with the safe behavior being "in-app only". Confidence: 0.6
- Dislikes explanatory helper/footnote copy under form controls (e.g. a muted line justifying why a checkbox is unchecked by default) — the control's own label is enough; rationale belongs in code comments or docs, not the UI. Confidence: 0.55
- Internal encoding/storage formats must never surface in the interface — input fields and rendered text should show human-readable content (e.g. `@Name`, not a token like `@[Name](id)`). Confidence: 0.5
