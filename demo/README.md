# Demo data

## `raw-cosmetics-metrics.csv`

Synthetic performance data for **The Raw Cosmetics**, for uploading on the
Insights page. It is invented, not real trading data — it exists so the Analyst
has something to find patterns in during a demo.

**312 rows · 1 Jun – 30 Aug 2026 · four channels.**

| Column | Required | Notes |
|---|---|---|
| `date` | yes | ISO `YYYY-MM-DD` |
| `channel` | yes | Instagram, Facebook, TikTok, Email |
| `format` | no | Reel, Carousel, Story, Static, Newsletter |
| `pillar` | no | Ingredient proof, Customer results, Founder story, Education, Promotion |
| `impressions` `clicks` `spend` `conversions` | yes | whole numbers, spend to 2dp |

### What is in the numbers

The data has a deliberate, findable story, so the Analyst says something real
rather than shrugging:

- **Email converts far above everything else** — 12.1% of clicks, at no media
  cost, but reaches only 162k impressions. Small list, strongest closer.
- **TikTok has the widest reach and the weakest return** — 1.2m impressions for
  299 conversions. Cheap attention that does not buy.
- **Promotion posts travel furthest and convert worst** — 1.06m impressions at
  3.0%, against Customer results at 10.8% on a fifth of the reach.
- **Cost per conversion separates the channels sharply** — Instagram RM2.85
  against Facebook RM6.44.
- A gentle upward trend runs across the quarter, so month-on-month comparisons
  move.

Totals: 3.11m impressions · 76.8k clicks · RM6,933 spend · 3,730 conversions.

### Using it

1. Onboard **The Raw Cosmetics** so a brand workspace exists.
2. Insights → upload this file → preview → import.
3. Ask the CMO about performance; the Analyst reads these rows.

Regenerate or reshape it by editing the `mixes` table in the generator commit —
the seed is fixed, so the same numbers come out every time.


---

## `raw-cosmetics-catalogue.xlsx`

Product catalogue for the onboarding **Products** step. Ten products, validated
through the real parser: 10 products, no warnings.

### Required

Only **Product Name** is truly required — the header row is found by looking for
it. Without a **Price** column the sheet still imports, but every product lands
without pricing and the Brand Analyst raises a gap.

### Accepted column headers

Matching ignores case, underscores and hyphens, so `product_name` and
`Product Name` are the same. Any one of the alternatives works.

| Field | Accepted headers |
|---|---|
| **Product Name** *(required)* | `product`, `product name`, `name`, `item`, `item name`, `title` |
| Price | `price`, `selling price`, `sale price`, `retail price`, `unit price`, `msrp`, `rrp` |
| SKU | `sku`, `product id`, `product code`, `item code`, `code` |
| Category | `category`, `product category`, `collection`, `product type` |
| Description | `description`, `product description`, `details`, `summary` |
| Currency | `currency`, `currency code` |
| Compare at price | `compare at price`, `compare-at price`, `original price`, `list price`, `regular price` |
| Availability | `availability`, `stock`, `stock status`, `inventory status`, `status` |
| URL | `url`, `link`, `product url`, `product link`, `page url` |

### Limits

- Real `.xlsx` only — not `.xls`, not `.csv` renamed
- Header row must appear within the first **20 rows**
- Up to **1,000 products**, **50 columns**
- Every worksheet is read; sheets without a name column are skipped with a warning
