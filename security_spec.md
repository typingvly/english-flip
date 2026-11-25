# Security Specification — Google Auth Ownership, 220+ Approval Gate & Admin Moderation

## 1. Data Invariants

1. **Verified Google Auth for All Player Writes**: Guests can read public leaderboard rankings and play locally, while creating/updating `/leaderboard/{playerId}`, `/nicknames/{nicknameKey}`, `/playerStats/{playerId}`, `/playerStats/{playerId}/matches/{matchId}`, and `/moderationReports/{reportId}` strictly requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Strict Ownership (`request.auth.uid == playerId`)**: Non-admin players can only create/update records where `playerId == request.auth.uid` (and `ownerUid == request.auth.uid`), preventing cross-account spoofing or tampering. One-time legacy migration into `request.auth.uid` is permitted only from an unclaimed pre-auth entry (`!('ownerUid' in legacy)` and `nicknameKey != 'semistry'`) with exact field parity and atomic deletion of the legacy document.
3. **Admin Authority (`isAdmin`)**: Only an authenticated Google account with verified email `semajinpark@gmail.com` (`request.auth.token.email_verified == true`) may read `moderationReports`, toggle `isTestAccount`, approve `bestFlips >= 220`, delete/reset leaderboard records, force-rename players, or write `/playerControls/{playerId}`.
4. **220+ Approval Gate & Replay Guard**: Non-admin clients cannot write `bestFlips >= 220` directly to `/leaderboard/{playerId}` or `/playerStats/{playerId}`. On leaderboard creation, non-admin `bestFlips` must be `0` if `/playerControls/{playerId}` exists (preventing post-reset replay) or at most `219` for first-time guest record import. Matches with `flips >= 220` or suspicious anti-cheat flags create a `status: 'pending'` record in `/moderationReports/{reportId}`.
5. **Private Collection Isolation**: `/nicknames`, `/playerStats`, and `/playerControls` disallow `allow list`; `/playerStats` and `/playerControls` `allow get` are restricted to `isOwnerOrAdmin(playerId)`. `/moderationReports` allows `list` and `get` exclusively for `isAdmin()`.

## 2. The "Dirty Dozen" Attack Payloads (Expected: PERMISSION_DENIED)

1. **Unauthenticated Guest Leaderboard Write**: Calling `setDoc` or `updateDoc` on `/leaderboard/{playerId}` without Firebase Auth.
2. **Cross-User Spoofing**: Signing in as `uid_A` and writing `/leaderboard/uid_B`, `/playerStats/uid_B`, or `/moderationReports` with `playerId: "uid_B"`.
3. **Spoofed Admin Email (Unverified)**: Reading `/moderationReports` with `email: "semajinpark@gmail.com"` and `email_verified: false`.
4. **Non-Admin Impersonating Semistry Nickname**: Signing in with a different email and attempting to delete `/leaderboard/{playerId}` or update `isTestAccount: true`.
5. **220+ Self-Approval Bypass**: Updating `/leaderboard/{uid}` as a non-admin with `bestFlips: 245`.
6. **Post-Reset LocalStorage Replay on Create**: Creating `/leaderboard/{uid}` as a non-admin with `bestFlips: 180` when `/playerControls/{uid}` exists.
7. **Self-Hiding as Test Account**: Non-admin updating `/leaderboard/{uid}` with `isTestAccount: true`.
8. **Pre-Approved Report Injection**: Non-admin creating `/moderationReports/rep_1` with `status: 'approved'` or `reviewedAt: SERVER_TIME`.
9. **Shadow Field Injection**: Writing `/leaderboard/{uid}` with an unlisted field (`isAdmin: true`).
10. **Score Poisoning (> 320 flips)**: Payload exceeding `bestFlips: 350` on `/leaderboard/{uid}`.
11. **Blanket Scrape on Private Collections**: Non-admin running `getDocs(collection(db, "moderationReports"))`, `getDocs(collection(db, "playerControls"))`, or `getDoc(doc(db, "playerStats", "other_uid"))`.
12. **Forged Client Timestamp**: Submitting any document with a client-supplied timestamp instead of `request.time`.
