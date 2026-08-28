# Analyst research sources

The Analyst keeps public market research separate from owned performance data.
Public evidence is timestamped and passed to the Strategist as a temporary
signal; it is never written into Brand Memory as a permanent fact.

## Source modes

| Source | Mode | Credential | Evidence |
| --- | --- | --- | --- |
| Google grounded search | Active | `GOOGLE_GENERATIVE_AI_API_KEY` | Recent public pages and returned citations |
| YouTube Data API | Direct | `YOUTUBE_DATA_API_KEY` | Public video title, publication date, views, likes, and comments |
| Meta Ad Library | Direct when eligible | `META_AD_LIBRARY_ACCESS_TOKEN` | Eligible active-ad creative and snapshot URL |
| TikTok Creative Center | Grounded search only | None | Public official Creative Center pages when Google can ground them |
| Google Trends | Grounded search only | Alpha access is not assumed | Public Trends evidence when Google can ground it |

`RESEARCH_DEFAULT_COUNTRY` supplies an ISO two-letter country code when the CMO
request does not name a market. A market named in the assignment takes priority.

Meta Ad Library API availability depends on Meta approval, ad category, and
region. An active ad proves only that an advertiser is testing that creative;
it does not prove the creative performed well.

TikTok Creative Center does not expose a supported public data API. Northwind
does not call undocumented endpoints or scrape authenticated platform pages.

Google Trends API remains limited-access alpha. Until access and stable endpoint
documentation are supplied, Northwind uses only grounded public Trends evidence.

## Runtime behavior

Direct connectors execute concurrently with grounded Google search. Every
connector returns an explicit status: `active`, `search-only`, `unavailable`,
`skipped`, or `failed`. Missing credentials and provider failures become
`missingData` entries instead of fabricated research.

YouTube and Meta calls are made only when the assignment requests their evidence,
which protects API quota and avoids irrelevant source material.
