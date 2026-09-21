# Vanta Paper Trader — Integration Test Results

## Summary

- **Total endpoints analyzed:** 41
- **Passed:** 31
- **Failed:** 10
- **Issues found:** 13

## Auth Coverage

- **Session auth only:** 11
- **API key auth only:** 1
- **Both:** 5
- **No auth:** 20

## All Endpoints

| Path | Auth | Validation | Error Handling | Cache | Issues |
|------|------|------------|----------------|-------|--------|
| `/account/route.ts` | session | ❌ | ✅ | ❌ | missing input validation; no force-dynamic (will be cached by Next.js) |
| `/admin/competitions/route.ts` | session | ✅ | ✅ | ✅ | ✅ |
| `/admin/route.ts` | session | ❌ | ✅ | ✅ | missing input validation |
| `/alerts/route.ts` | none | ✅ | ✅ | ✅ | ✅ |
| `/assets/route.ts` | session | ❌ | ✅ | ✅ | missing input validation |
| `/auth/google/route.ts` | session | ❌ | ✅ | ❌ | missing input validation; no force-dynamic (will be cached by Next.js) |
| `/auth/login/route.ts` | session | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/auth/logout/route.ts` | session | ❌ | ✅ | ❌ | missing input validation; no force-dynamic (will be cached by Next.js) |
| `/auth/refresh/route.ts` | session | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/auth/signup/route.ts` | session | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/businesses/route.ts` | both | ✅ | ✅ | ✅ | ✅ |
| `/businesses/[id]` | none | ❌ | ❌ | ❌ | ✅ |
| `/chart/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/competitions/route.ts` | both | ✅ | ✅ | ✅ | ✅ |
| `/cron/predictions/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/cron/predictions-settle/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/cron/snapshot/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/cron/tick/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/instruments/search/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/keys/route.ts` | session | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/keys/[id]` | none | ❌ | ❌ | ❌ | ✅ |
| `/leaderboard/route.ts` | session | ❌ | ✅ | ✅ | missing input validation |
| `/live/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/me/route.ts` | both | ❌ | ✅ | ✅ | missing input validation |
| `/messages/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/prediction-markets/route.ts` | apiKey | ❌ | ✅ | ✅ | missing input validation |
| `/prediction-markets/[id]` | none | ❌ | ❌ | ❌ | ✅ |
| `/predictions/close/route.ts` | none | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/predictions/refresh/route.ts` | both | ❌ | ✅ | ✅ | missing input validation |
| `/predictions/settle/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/predictions/trade/route.ts` | none | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/profile/avatar/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/quests/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/quote/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/quotes/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/rank/route.ts` | both | ❌ | ✅ | ✅ | missing input validation |
| `/social/block/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/social/report/route.ts` | none | ❌ | ✅ | ✅ | ✅ |
| `/trade/route.ts` | none | ✅ | ✅ | ❌ | no force-dynamic (will be cached by Next.js) |
| `/trader/[accountId]` | none | ❌ | ❌ | ❌ | ✅ |
| `/watchlists/route.ts` | none | ✅ | ✅ | ✅ | ✅ |

## Issues Found

1. /account/route.ts: missing input validation
2. /account/route.ts: no force-dynamic (will be cached by Next.js)
3. /admin/route.ts: missing input validation
4. /assets/route.ts: missing input validation
5. /auth/google/route.ts: missing input validation
6. /auth/google/route.ts: no force-dynamic (will be cached by Next.js)
7. /auth/logout/route.ts: missing input validation
8. /auth/logout/route.ts: no force-dynamic (will be cached by Next.js)
9. /leaderboard/route.ts: missing input validation
10. /me/route.ts: missing input validation
11. /prediction-markets/route.ts: missing input validation
12. /predictions/refresh/route.ts: missing input validation
13. /rank/route.ts: missing input validation

## Recommendations

1. **Rate limiting:** No rate limiting exists on any endpoint. Add rate limiting middleware.
2. **CORS:** CORS is configurable (was hardcoded to '*' — now via env var).
3. **Input validation:** Some endpoints lack Zod validation — add for all POST/PUT.
4. **force-dynamic:** Some endpoints missing force-dynamic — Next.js will cache them.
5. **Auth gaps:** Some endpoints have no auth — verify this is intentional.
