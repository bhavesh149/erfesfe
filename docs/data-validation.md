# Elexon validation — 27 October 2026

## Source meaning and comparison rule

[Elexon's wind page](https://bmrs.elexon.co.uk/wind-generation) describes an hourly
MW forecast for operationally metered GB wind and compares it with FUELHH outturn.
[The developer portal](https://developer.data.elexon.co.uk/) documents publication-time
queries for superseded forecasts. Neither establishes that an hourly target value
is an average over the following hour. Older WINDFOR interface documentation also
uses half-hour period terminology; we do not infer an hourly energy block from it.

The implemented baseline, `exact_start_time_hourly_v1`, compares each hourly
WINDFOR target to FUELHH/WIND with identical `startTime`. No averaging, filling or
interpolation is applied. Half-past actuals count toward actual-data completeness
but not accuracy. These metrics describe the sampled matching timestamps, not all
settlement periods, all renewable generation, or customer procurement exposure.

## Observed coverage

Downloaded 68 daily publication windows: WINDFOR from 29 December 2025 through
31 January 2026, and FUELHH from 1 January through 3 February 2026. Local window
filtering is `[from, to)`; Elexon returned overlapping inclusive boundaries.

- 19,856 distinct WINDFOR records: 272 publications, eight per UTC publication day.
- Every publication contains 73 hourly targets; all target minutes are `00`.
- 1,632 distinct WIND actuals retained across the wider boundary window.
- Both analysis windows below contain all 1,488 expected half-hourly actuals and
  all 744 eligible hourly forecast–actual pairs. No conflicting pairs were found.

Assumption: latest forecast published **at or before 10:00 Europe/London on the
previous day**. This is configurable, not a verified market auction deadline.

| Window | Delivery dates, inclusive | Pairs | MAE MW | RMSE MW | Bias MW |
| --- | --- | ---: | ---: | ---: | ---: |
| January decisions | 2 Jan–1 Feb 2026 | 744 | 1,995.57 | 2,498.82 | +1,727.98 |
| January deliveries | 1–31 Jan 2026 | 744 | 2,107.18 | 2,611.24 | +1,839.92 |

Error is `forecast − actual`. Paired hourly coverage is 100%; evaluated half-hours
are 50%. These results are conditional on the stated cutoff and matching policy.
January-decision results and source fingerprints agree between PostgreSQL and SQLite.

## Reproduction and evidence

See the root README for migrations, downloads and report commands. Generated reports
under `data/reports/` include source fingerprints, publication cadence, sample counts,
coverage, selected source hashes and a replayable ingestion snapshot. They are ignored
by Git, as are the full raw archives. The database retains original wind payloads.
`data/fixtures/elexon-wind.json` is a small real sample used in an end-to-end test:
the 09:30 publication predicts 15,828 MW for 15 January 00:00; actual is 14,602 MW.
The 11:30 revision is correctly excluded at a 10:00 cutoff.

Snapshots represent source publications retrieved by completed imports, not a claim
that a production feed was observed live in January. Same-publication conflicting
values are excluded rather than resolved arbitrarily. Actuals use the latest source
publication visible in the selected ingestion snapshot.
