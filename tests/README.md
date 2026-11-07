# Review regression coverage

This test-only branch captures the two P2 findings in the [review of b0ba99e](https://github.com/guoxinyi0811/brain-off/commit/b0ba99e1b67cb587558cada65da52e8c1ee625d7#commitcomment-208583720). Product implementation is unchanged. The regression tests express desired behavior and currently fail; they are not skipped, marked TODO, or rewritten to accept the defects. Keep this PR in draft until the implementation is fixed in a separately authorized change.

| Scenario | Expected behavior | Current result |
| --- | --- | --- |
| `和牛` | Preserve the single food name without inventing quantity | Fail: rejected as multiple foods |
| `一盒和牛，还有七天` | Preserve name, one box and seven remaining days | Fail: rejected as multiple foods |
| Actual multi-food expressions, including `和牛和鸡蛋` | Reject instead of silently recording a partial list | Pass |
| First reminder click | Select, focus and request scrolling to the correct region | Pass |
| Click the same reminder again after returning focus to reminders | Focus and request scrolling again | Fail: no second scroll request |
| Click a different reminder | Update selection, focus and scroll target | Pass |

## Run

Requires Node.js 24+ and the locked development dependencies:

```sh
npm ci
npm test
npm run typecheck
```

Focused reproduction:

```sh
node --test tests/review-entry-regressions.test.ts tests/review-location-regressions.test.ts
```

Measured result on the unchanged implementation: **103 tests, 100 pass, 3 fail, 0 skipped, 0 TODO; TypeScript passes**. The original 97 tests and the three new control tests pass. `npm test` intentionally returns exit code 1 until the two product defects are fixed.

## What the interaction tests exercise

`helpers/mount-review-app.ts` mounts the real `App` under React `StrictMode`, runs its real state/effect hooks, and dispatches DOM clicks inside React `act`. It uses jsdom and a fresh fake IndexedDB factory for each test. Fixture data never enters a real browser or user database. Stock is checked after navigation to guard against accidental writes.

Only the environment is simulated: `scrollIntoView` records requests because jsdom has no physical layout, and a no-op BroadcastChannel isolates the fixture from other processes. React hooks, `locateItem`, reminder handlers and IndexedDB repository behavior are not mocked. These tests prove the repeated-request logic and DOM focus, not pixel scrolling, responsive layout, live microphone recognition or full browser compatibility.

The added packages are development-only. Existing runtime dependencies and every file under `src/` remain unchanged. This covers the review scenarios, not a claim of 100% application coverage.
