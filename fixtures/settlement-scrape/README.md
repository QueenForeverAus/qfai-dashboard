# Settlement / remittance email scrape (staging)

Accept Comms `settlement-scrape-packet-v1` packets and apply attachment lines onto Settlements (venue actuals) or Remittance.

Live tours@ inbox scrape stays parked. This folder is the apply contract so Comms/Lead can POST. Same machine-auth pattern as travel-scrape.

Canonical packets: `lib/settlement-scrape/fixtures.ts`.

## Apply

```
POST /api/settlements/:runId/email-scrape/apply
```

- Session: owner/admin cookie
- Staging machine token: `Authorization: Bearer $TRAVEL_SCRAPE_APPLY_SECRET` **or** `x-qfai-travel-scrape-key: $TRAVEL_SCRAPE_APPLY_SECRET`
- Body: `{ "packet": { "schema_version": "settlement-scrape-packet-v1", "...": "..." } }` or `{ "fixture_id": "samp04-northwharf-settlement" }`
- `preview: true` plans without writes
- `send: true` is **400** — never auto-send
- Money / PAID: `money_action: confirm` needs `confirm_money=true` or `money_confirmed_by`. Scrape still writes `paid: false` on venue / remittance lines.

`apply_env=production` is refused.

## Fixture ids

| id | kind |
| --- | --- |
| `bnz-shaped-settlement` | settlement (classifier / deposit netting) |
| `harbour-geelong-settlement` | settlement (former Harbour UI fixture) |
| `samp04-northwharf-settlement` | settlement |
| `samp04-northwharf-remittance` | remittance |

## Removed

Load Harbour fixture, Load BNZ-shaped venue statement, and any Settlements paste / fixture-load buttons.
