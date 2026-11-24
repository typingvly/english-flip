# Security Specification — Unified Leaderboard & Unique Nicknames

## 1. Data Invariants

1. **One Entry Per Player**: Each `playerId` may own at most one document at `/leaderboard/{playerId}` (`data.playerId == playerId`), and `playerId` is immutable after creation.
2. **Global Nickname Uniqueness (Case-Insensitive)**: Every `/leaderboard/{playerId}` document must have an atomic counterpart at `/nicknames/{nicknameKey}` where `nicknameKey == data.nickname.lower()` and `lock.playerId == playerId`.
3. **No Orphaned Locks or Hijacked Nicknames**: Creating `/nicknames/{nicknameKey}` requires `/leaderboard/{playerId}` to point to that `nicknameKey` in the same atomic transaction (`existsAfter` / `getAfter`). Updating a lock cannot change `playerId`. Deleting an old lock is only allowed in a rename transaction where `/leaderboard/{playerId}` now points to a different `nicknameKey`.
4. **Monotonic High Scores & Bounded Values**: `bestFlips` must be an integer between `0` and `500`. Updates to `bestFlips` may only increase (`incoming().bestFlips > existing().bestFlips`), and `rank` must belong to the valid rank enum set.
5. **Strict Schema & Volumetric Bounds**: No extra/ghost fields are permitted (`hasAll` + `hasOnly`). Strings (`playerId`, `nickname`, `nicknameKey`, `rank`) are strictly bounded in size and character regex. All `updatedAt` timestamps must equal `request.time`.
6. **No Blanket Scrapes of Nickname Locks**: `/nicknames` disallows `allow list`, permitting only single-key `allow get` lookups.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)

1. **Shadow Field Injection on Leaderboard Create**: `{ playerId: "p1_valid_id", nickname: "Hero", nicknameKey: "hero", bestFlips: 10, rank: "E", updatedAt: SERVER_TIME, isAdmin: true }`
2. **Orphan Leaderboard Entry Without Nickname Lock**: Writing `/leaderboard/p1_valid_id` without atomically creating `/nicknames/hero`.
3. **Orphan Nickname Lock Without Leaderboard Entry**: Writing `/nicknames/hero` without atomically creating `/leaderboard/p1_valid_id`.
4. **Case-Insensitive Mismatch Spoof**: `{ playerId: "p1_valid_id", nickname: "Hero", nicknameKey: "other", bestFlips: 10, rank: "E", updatedAt: SERVER_TIME }`.
5. **Nickname Too Short (1 char)**: `{ playerId: "p1_valid_id", nickname: "A", nicknameKey: "a", bestFlips: 0, rank: "E", updatedAt: SERVER_TIME }`.
6. **Nickname Invalid Characters / XSS**: `{ playerId: "p1_valid_id", nickname: "<script>", nicknameKey: "<script>", bestFlips: 0, rank: "E", updatedAt: SERVER_TIME }`.
7. **Out-of-Bounds / Negative Score**: `{ playerId: "p1_valid_id", nickname: "Hero", nicknameKey: "hero", bestFlips: -5, rank: "E", updatedAt: SERVER_TIME }`.
8. **Absurd Score Poisoning (> 500)**: `{ playerId: "p1_valid_id", nickname: "Hero", nicknameKey: "hero", bestFlips: 999999, rank: "L을가져가", updatedAt: SERVER_TIME }`.
9. **Score Downgrade / Reset**: Updating `/leaderboard/p1_valid_id` with `bestFlips: 5` when existing `bestFlips` is `50`.
10. **Invalid Rank Enum Injection**: `{ playerId: "p1_valid_id", nickname: "Hero", nicknameKey: "hero", bestFlips: 50, rank: "GOD_TIER", updatedAt: SERVER_TIME }`.
11. **Forged Client Timestamp**: Creating or updating with `updatedAt: "2020-01-01T00:00:00Z"` instead of `request.time`.
12. **Arbitrary Delete / Nickname Lock List Scrape**: `deleteDoc(doc(db, "leaderboard", "p1_valid_id"))` or `getDocs(collection(db, "nicknames"))`.
