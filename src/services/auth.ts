import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { getRank } from '../data/words';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { COPY } from '../i18n/translations';
import { AppLanguage } from '../types/game';
import { ADMIN_NICKNAME_KEY, isAdminUser } from './admin';
import {
  clearLegacyLocalNickname,
  loadLocalBestFlips,
  loadLocalRecordEpoch,
  loadSavedNickname,
  NicknameError,
  saveLocalBestFlips,
  saveLocalNickname,
  saveLocalRecordEpoch,
  validateNickname,
} from './leaderboard';
import { loadLocalProfile, saveLocalProfile } from './profile';

const LEGACY_CLAIM_DISMISSED_PREFIX = 'flipTypingLegacyDismissed_';

export interface LegacyLeaderboardCandidate {
  source: 'firestore' | 'local';
  legacyPlayerId: string;
  nickname: string;
  nicknameKey: string;
  bestFlips: number;
  bestCpm?: number;
  bestAccuracy?: number;
  rank: string;
  isTestAccount?: boolean;
  recordEpoch?: number;
}

export function isLegacyClaimDismissed(uid: string, legacyPlayerId: string): boolean {
  try {
    return localStorage.getItem(`${LEGACY_CLAIM_DISMISSED_PREFIX}${uid}_${legacyPlayerId}`) === '1';
  } catch {
    return false;
  }
}

export function dismissLegacyClaim(uid: string, legacyPlayerId: string): void {
  try {
    localStorage.setItem(`${LEGACY_CLAIM_DISMISSED_PREFIX}${uid}_${legacyPlayerId}`, '1');
  } catch {
    // Ignore storage errors
  }
}

export function clearLegacyClaimDismissed(uid: string, legacyPlayerId: string): void {
  try {
    localStorage.removeItem(`${LEGACY_CLAIM_DISMISSED_PREFIX}${uid}_${legacyPlayerId}`);
  } catch {
    // Ignore storage errors
  }
}

export async function signInPlayerWithGoogle(lang: AppLanguage = 'ko'): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(auth, provider);
    if (!result.user.emailVerified) {
      await signOut(auth).catch(() => {});
      throw new Error(
        lang === 'en'
          ? 'Only verified Google accounts can sign in.'
          : '이메일 인증이 완료된 Google 계정만 로그인할 수 있습니다.',
      );
    }
    return result.user;
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'auth/popup-blocked') {
      throw new Error(COPY[lang].app.authPopupBlocked);
    }
    if (code === 'auth/unauthorized-domain') {
      throw new Error(COPY[lang].app.authUnauthorizedDomain);
    }
    throw err;
  }
}

export async function signOutPlayer(): Promise<void> {
  await signOut(auth);
}

function buildLocalGuestCandidate(legacyPlayerId: string): LegacyLeaderboardCandidate | null {
  const localBest = loadLocalBestFlips(legacyPlayerId, true);
  const localProfile = loadLocalProfile(legacyPlayerId);
  const rawBest = Math.max(localBest, localProfile.bestFlips || 0);
  if (rawBest <= 0 && localProfile.totalGames <= 0) {
    return null;
  }

  const cappedBest = Math.min(219, Math.max(0, Math.floor(rawBest)));
  const rawLocalNick = loadSavedNickname(legacyPlayerId, true).trim();
  const nickCheck = validateNickname(rawLocalNick, 'ko', false);
  const validNick = nickCheck.valid ? nickCheck.trimmed : '';

  return {
    source: 'local',
    legacyPlayerId,
    nickname: validNick,
    nicknameKey: validNick.toLowerCase(),
    bestFlips: cappedBest,
    bestCpm: localProfile.bestCpm > 0 ? Math.min(1800, Math.round(localProfile.bestCpm)) : undefined,
    bestAccuracy:
      localProfile.totalGames > 0
        ? Math.min(100, Math.round((localProfile.totalAccuracySum / localProfile.totalGames) * 10) / 10)
        : undefined,
    rank: getRank(cappedBest),
  };
}

/**
 * Checks if the local browser's pre-Google-Auth playerId holds an unclaimed
 * Firestore leaderboard entry or a local guest record that the signed-in user can claim.
 */
export async function fetchUnclaimedLegacyEntry(
  legacyPlayerId: string,
): Promise<LegacyLeaderboardCandidate | null> {
  if (!legacyPlayerId || !/^[a-zA-Z0-9_-]{8,64}$/.test(legacyPlayerId)) {
    return null;
  }

  try {
    const snap = await getDoc(doc(db, 'leaderboard', legacyPlayerId));
    if (!snap.exists()) {
      return buildLocalGuestCandidate(legacyPlayerId);
    }

    const data = snap.data();
    if (data.ownerUid) {
      return null;
    }

    const nickname = String(data.nickname || '').trim();
    const nicknameKey = String(data.nicknameKey || nickname.toLowerCase());
    if (!nickname || !nicknameKey || nicknameKey === ADMIN_NICKNAME_KEY) {
      return null;
    }

    const bestFlips = Number(data.bestFlips || 0);
    return {
      source: 'firestore',
      legacyPlayerId,
      nickname,
      nicknameKey,
      bestFlips,
      bestCpm: typeof data.bestCpm === 'number' ? data.bestCpm : undefined,
      bestAccuracy: typeof data.bestAccuracy === 'number' ? data.bestAccuracy : undefined,
      rank: String(data.rank || getRank(bestFlips)),
      isTestAccount: typeof data.isTestAccount === 'boolean' ? data.isTestAccount : undefined,
      recordEpoch: typeof data.recordEpoch === 'number' ? data.recordEpoch : undefined,
    };
  } catch {
    return buildLocalGuestCandidate(legacyPlayerId);
  }
}

/**
 * Atomically migrates an unclaimed pre-Google-Auth leaderboard entry OR imports
 * a local guest browser record into the signed-in user's verified UID.
 */
export async function claimLegacyPlayerEntry(params: {
  user: User;
  legacyPlayerId: string;
  chosenNickname?: string;
  source?: 'firestore' | 'local';
  lang?: AppLanguage;
}): Promise<{ nickname: string; bestFlips: number }> {
  const { user, legacyPlayerId, chosenNickname, source = 'firestore', lang = 'ko' } = params;
  if (!user.emailVerified) {
    throw new Error(
      lang === 'en'
        ? 'Verified Google account required.'
        : '이메일 인증이 완료된 Google 계정이 필요합니다.',
    );
  }
  if (!legacyPlayerId || legacyPlayerId === user.uid) {
    throw new Error(
      lang === 'en'
        ? 'No legacy record available to claim.'
        : '가져올 기존 기록이 없습니다.',
    );
  }

  const targetLbRef = doc(db, 'leaderboard', user.uid);
  const legacyLbRef = doc(db, 'leaderboard', legacyPlayerId);
  const targetStatsRef = doc(db, 'playerStats', user.uid);
  const targetCtrlRef = doc(db, 'playerControls', user.uid);
  const localLegacyProfile = loadLocalProfile(legacyPlayerId);

  interface ClaimedStatsSummary {
    totalGames: number;
    wins: number;
    bestFlips: number;
    bestCpm: number;
    totalAccuracySum: number;
  }

  if (source === 'local') {
    const localBest = loadLocalBestFlips(legacyPlayerId, true);
    const rawBest = Math.max(localBest, localLegacyProfile.bestFlips || 0);
    const cappedBest = Math.min(219, Math.max(0, Math.floor(rawBest)));
    const allowAdminNick = isAdminUser(user);

    try {
      const txResult = await runTransaction(db, async (tx) => {
        const [freshTarget, freshStats, freshCtrl] = await Promise.all([
          tx.get(targetLbRef),
          tx.get(targetStatsRef),
          tx.get(targetCtrlRef),
        ]);

        let finalNickname = '';
        let finalBestFlips = cappedBest;

        if (freshTarget.exists()) {
          const existing = freshTarget.data();
          const existingBest = Number(existing.bestFlips || 0);
          if (existingBest > 0 || freshCtrl.exists()) {
            throw new Error(
              lang === 'en'
                ? 'This Google account already has a registered leaderboard record.'
                : '이 Google 계정에는 이미 등록된 리더보드 기록이 있습니다.',
            );
          }

          finalNickname = String(existing.nickname || '').trim();
          if (cappedBest > 0) {
            const updatePayload: Record<string, unknown> = {
              bestFlips: cappedBest,
              rank: getRank(cappedBest),
              updatedAt: serverTimestamp(),
            };
            if (localLegacyProfile.bestCpm > 0) {
              updatePayload.bestCpm = Math.min(1800, Math.round(localLegacyProfile.bestCpm));
            }
            if (localLegacyProfile.totalGames > 0) {
              updatePayload.bestAccuracy = Math.min(
                100,
                Math.round((localLegacyProfile.totalAccuracySum / localLegacyProfile.totalGames) * 10) / 10,
              );
            }
            tx.update(targetLbRef, updatePayload);
          }
        } else {
          const nickCheck = validateNickname(chosenNickname || '', lang, allowAdminNick);
          if (!nickCheck.valid) {
            throw new NicknameError(
              nickCheck.error ||
                (lang === 'en' ? 'Please enter a valid nickname.' : '올바른 닉네임을 입력해 주세요.'),
            );
          }
          finalNickname = nickCheck.trimmed;
          const newKey = finalNickname.toLowerCase();
          const lockRef = doc(db, 'nicknames', newKey);
          const freshLock = await tx.get(lockRef);

          if (freshLock.exists() && freshLock.data().playerId !== user.uid) {
            throw new NicknameError(
              lang === 'en' ? 'That nickname is already taken.' : '이미 사용 중인 닉네임입니다.',
            );
          }

          finalBestFlips = freshCtrl.exists() ? 0 : cappedBest;
          const lbPayload: Record<string, unknown> = {
            playerId: user.uid,
            ownerUid: user.uid,
            nickname: finalNickname,
            nicknameKey: newKey,
            bestFlips: finalBestFlips,
            rank: getRank(finalBestFlips),
            updatedAt: serverTimestamp(),
          };
          if (localLegacyProfile.bestCpm > 0) {
            lbPayload.bestCpm = Math.min(1800, Math.round(localLegacyProfile.bestCpm));
          }
          if (localLegacyProfile.totalGames > 0) {
            lbPayload.bestAccuracy = Math.min(
              100,
              Math.round((localLegacyProfile.totalAccuracySum / localLegacyProfile.totalGames) * 10) / 10,
            );
          }

          tx.set(lockRef, {
            playerId: user.uid,
            nickname: finalNickname,
            updatedAt: serverTimestamp(),
          });
          tx.set(targetLbRef, lbPayload);
        }

        let statsSummary: ClaimedStatsSummary | null = null;
        if (!freshStats.exists() && (localLegacyProfile.totalGames >= 1 || finalBestFlips > 0)) {
          const totalGames = Math.max(1, Math.min(100000, Math.floor(localLegacyProfile.totalGames || 0)));
          const wins = Math.max(
            0,
            Math.min(
              totalGames,
              Math.floor(localLegacyProfile.totalGames >= 1 ? localLegacyProfile.wins : finalBestFlips > 0 ? 1 : 0),
            ),
          );
          const statsBestFlips = Math.max(finalBestFlips, Math.min(219, Math.floor(localLegacyProfile.bestFlips || 0)));
          const statsBestCpm = Math.max(0, Math.min(1800, Math.round(localLegacyProfile.bestCpm || 0)));
          const rawAccSum =
            localLegacyProfile.totalGames >= 1 ? localLegacyProfile.totalAccuracySum : 100;
          const statsAccSum = Math.max(0, Math.min(totalGames * 100, Math.round(rawAccSum * 10) / 10));

          tx.set(targetStatsRef, {
            playerId: user.uid,
            totalGames,
            wins,
            bestFlips: statsBestFlips,
            bestCpm: statsBestCpm,
            totalAccuracySum: statsAccSum,
            updatedAt: serverTimestamp(),
          });

          statsSummary = {
            totalGames,
            wins,
            bestFlips: statsBestFlips,
            bestCpm: statsBestCpm,
            totalAccuracySum: statsAccSum,
          };
        }

        return {
          claimedNickname: finalNickname,
          claimedBestFlips: finalBestFlips,
          claimedStats: statsSummary,
        };
      });

      saveLocalNickname(txResult.claimedNickname, user.uid);
      saveLocalBestFlips(txResult.claimedBestFlips, user.uid);
      clearLegacyLocalNickname();
      clearLegacyClaimDismissed(user.uid, legacyPlayerId);
      if (txResult.claimedStats) {
        saveLocalProfile({
          playerId: user.uid,
          totalGames: txResult.claimedStats.totalGames,
          wins: txResult.claimedStats.wins,
          bestFlips: txResult.claimedStats.bestFlips,
          bestCpm: txResult.claimedStats.bestCpm,
          totalAccuracySum: txResult.claimedStats.totalAccuracySum,
          recentMatches: localLegacyProfile.recentMatches.map((m) => ({
            ...m,
            playerId: user.uid,
          })),
        });
      }

      return {
        nickname: txResult.claimedNickname,
        bestFlips: txResult.claimedBestFlips,
      };
    } catch (error) {
      if (error instanceof Error && !('code' in error)) {
        throw error;
      }
      handleFirestoreError(error, OperationType.WRITE, `leaderboard/${user.uid}`);
    }
  }

  try {
    const txResult = await runTransaction(db, async (tx) => {
      const [freshTarget, freshLegacy, freshStats] = await Promise.all([
        tx.get(targetLbRef),
        tx.get(legacyLbRef),
        tx.get(targetStatsRef),
      ]);

      if (freshTarget.exists()) {
        throw new Error(
          lang === 'en'
            ? 'This Google account already has a registered leaderboard profile.'
            : '이 Google 계정에는 이미 등록된 리더보드 기록이 있습니다.',
        );
      }
      if (!freshLegacy.exists()) {
        throw new Error(
          lang === 'en'
            ? 'The legacy record was already migrated or removed.'
            : '기존 기록이 이미 이전되었거나 삭제되었습니다.',
        );
      }

      const legacy = freshLegacy.data();
      if (legacy.ownerUid) {
        throw new Error(
          lang === 'en'
            ? 'This legacy record is already linked to another Google account.'
            : '이미 다른 Google 계정에 연동된 기록입니다.',
        );
      }

      const nickname = String(legacy.nickname || '').trim();
      const nicknameKey = String(legacy.nicknameKey || nickname.toLowerCase());
      if (!nickname || !nicknameKey || nicknameKey === ADMIN_NICKNAME_KEY) {
        throw new Error(
          lang === 'en'
            ? 'This legacy record cannot be claimed automatically.'
            : '이 기록은 자동으로 이전할 수 없습니다.',
        );
      }

      const bestFlips = Math.max(0, Math.min(320, Math.floor(Number(legacy.bestFlips || 0))));
      const rank = String(legacy.rank || getRank(bestFlips));
      const lockRef = doc(db, 'nicknames', nicknameKey);

      const lbPayload: Record<string, unknown> = {
        playerId: user.uid,
        ownerUid: user.uid,
        migratedFromId: legacyPlayerId,
        nickname,
        nicknameKey,
        bestFlips,
        rank,
        updatedAt: serverTimestamp(),
      };
      if (typeof legacy.bestCpm === 'number') lbPayload.bestCpm = legacy.bestCpm;
      if (typeof legacy.bestAccuracy === 'number') lbPayload.bestAccuracy = legacy.bestAccuracy;
      if (typeof legacy.isTestAccount === 'boolean') lbPayload.isTestAccount = legacy.isTestAccount;
      if (typeof legacy.recordEpoch === 'number') lbPayload.recordEpoch = legacy.recordEpoch;

      tx.set(targetLbRef, lbPayload);
      tx.set(lockRef, {
        playerId: user.uid,
        nickname,
        updatedAt: serverTimestamp(),
      });
      tx.delete(legacyLbRef);

      let statsSummary: ClaimedStatsSummary | null = null;
      if (!freshStats.exists() && (localLegacyProfile.totalGames >= 1 || bestFlips > 0)) {
        const totalGames = Math.max(1, Math.min(100000, Math.floor(localLegacyProfile.totalGames || 0)));
        const wins = Math.max(
          0,
          Math.min(
            totalGames,
            Math.floor(localLegacyProfile.totalGames >= 1 ? localLegacyProfile.wins : bestFlips > 0 ? 1 : 0),
          ),
        );
        const statsBestFlips =
          bestFlips > 219
            ? bestFlips
            : Math.max(bestFlips, Math.min(219, Math.floor(localLegacyProfile.bestFlips || 0)));
        const rawCpm =
          typeof legacy.bestCpm === 'number'
            ? Math.max(legacy.bestCpm, localLegacyProfile.bestCpm || 0)
            : localLegacyProfile.bestCpm || 0;
        const statsBestCpm = Math.max(0, Math.min(1800, Math.round(rawCpm)));
        const rawAccSum =
          localLegacyProfile.totalGames >= 1
            ? localLegacyProfile.totalAccuracySum
            : typeof legacy.bestAccuracy === 'number'
              ? legacy.bestAccuracy
              : 100;
        const statsAccSum = Math.max(0, Math.min(totalGames * 100, Math.round(rawAccSum * 10) / 10));

        tx.set(targetStatsRef, {
          playerId: user.uid,
          totalGames,
          wins,
          bestFlips: statsBestFlips,
          bestCpm: statsBestCpm,
          totalAccuracySum: statsAccSum,
          updatedAt: serverTimestamp(),
        });

        statsSummary = {
          totalGames,
          wins,
          bestFlips: statsBestFlips,
          bestCpm: statsBestCpm,
          totalAccuracySum: statsAccSum,
        };
      }

      return {
        claimedNickname: nickname,
        claimedBestFlips: bestFlips,
        claimedStats: statsSummary,
      };
    });

    saveLocalNickname(txResult.claimedNickname, user.uid);
    clearLegacyLocalNickname();
    clearLegacyClaimDismissed(user.uid, legacyPlayerId);
    const prevLocalEpoch = loadLocalRecordEpoch(legacyPlayerId);
    if (prevLocalEpoch > 0) {
      saveLocalRecordEpoch(
        user.uid,
        Math.max(loadLocalRecordEpoch(user.uid), prevLocalEpoch),
      );
    }
    if (txResult.claimedStats) {
      saveLocalProfile({
        playerId: user.uid,
        totalGames: txResult.claimedStats.totalGames,
        wins: txResult.claimedStats.wins,
        bestFlips: txResult.claimedStats.bestFlips,
        bestCpm: txResult.claimedStats.bestCpm,
        totalAccuracySum: txResult.claimedStats.totalAccuracySum,
        recentMatches: localLegacyProfile.recentMatches.map((m) => ({
          ...m,
          playerId: user.uid,
        })),
      });
    }

    return {
      nickname: txResult.claimedNickname,
      bestFlips: txResult.claimedBestFlips,
    };
  } catch (error) {
    if (error instanceof Error && !('code' in error)) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `leaderboard/${user.uid}`);
  }
}

function migrateAdminLocalProfileIfEmpty(uid: string, legacyPlayerId: string): void {
  if (!legacyPlayerId || legacyPlayerId === uid) return;
  const currentProfile = loadLocalProfile(uid);
  const legacyProfile = loadLocalProfile(legacyPlayerId);
  if (currentProfile.totalGames === 0 && legacyProfile.totalGames > 0) {
    saveLocalProfile({
      ...legacyProfile,
      playerId: uid,
      recentMatches: legacyProfile.recentMatches.map((m) => ({
        ...m,
        playerId: uid,
      })),
    });
  }
  const prevEpoch = loadLocalRecordEpoch(legacyPlayerId);
  if (prevEpoch > loadLocalRecordEpoch(uid)) {
    saveLocalRecordEpoch(uid, prevEpoch);
  }
}

/**
 * If the verified Semistry admin previously played before Google Auth was introduced,
 * seamlessly migrate their legacy unclaimed guest entry (from local legacyPlayerId or
 * the /nicknames/semistry lock) to their verified Firebase UID.
 */
export async function migrateLegacyAdminEntryIfNeeded(
  user: User,
  legacyPlayerId: string,
): Promise<boolean> {
  if (!isAdminUser(user)) {
    return false;
  }

  const targetLbRef = doc(db, 'leaderboard', user.uid);

  try {
    const targetSnap = await getDoc(targetLbRef);
    if (targetSnap.exists()) {
      clearLegacyLocalNickname();
      migrateAdminLocalProfileIfEmpty(user.uid, legacyPlayerId);
      return false;
    }

    let sourceLegacyId: string | null = null;
    if (legacyPlayerId && legacyPlayerId !== user.uid) {
      const localLegacySnap = await getDoc(doc(db, 'leaderboard', legacyPlayerId));
      if (localLegacySnap.exists() && !localLegacySnap.data().ownerUid) {
        sourceLegacyId = legacyPlayerId;
      }
    }

    if (!sourceLegacyId) {
      const semistryLockSnap = await getDoc(doc(db, 'nicknames', ADMIN_NICKNAME_KEY));
      if (semistryLockSnap.exists()) {
        const lockOwnerId = String(semistryLockSnap.data().playerId || '');
        if (lockOwnerId && lockOwnerId !== user.uid) {
          const lockOwnerLbSnap = await getDoc(doc(db, 'leaderboard', lockOwnerId));
          if (lockOwnerLbSnap.exists() && !lockOwnerLbSnap.data().ownerUid) {
            sourceLegacyId = lockOwnerId;
          }
        }
      }
    }

    if (!sourceLegacyId) {
      migrateAdminLocalProfileIfEmpty(user.uid, legacyPlayerId);
      return false;
    }

    const legacyLbRef = doc(db, 'leaderboard', sourceLegacyId);
    let migratedNickname = '';

    await runTransaction(db, async (tx) => {
      const [freshTarget, freshLegacy] = await Promise.all([
        tx.get(targetLbRef),
        tx.get(legacyLbRef),
      ]);
      if (freshTarget.exists() || !freshLegacy.exists()) return;

      const legacy = freshLegacy.data();
      if (legacy.ownerUid && legacy.ownerUid !== user.uid) return;

      const nickname = String(legacy.nickname || '').trim();
      const nicknameKey = String(legacy.nicknameKey || nickname.toLowerCase());
      if (!nickname || !nicknameKey) return;

      const bestFlips = Number(legacy.bestFlips || 0);
      const lockRef = doc(db, 'nicknames', nicknameKey);

      const payload: Record<string, unknown> = {
        playerId: user.uid,
        ownerUid: user.uid,
        nickname,
        nicknameKey,
        bestFlips,
        rank: String(legacy.rank || getRank(bestFlips)),
        updatedAt: serverTimestamp(),
      };
      if (typeof legacy.bestCpm === 'number') payload.bestCpm = legacy.bestCpm;
      if (typeof legacy.bestAccuracy === 'number') payload.bestAccuracy = legacy.bestAccuracy;
      if (typeof legacy.isTestAccount === 'boolean') payload.isTestAccount = legacy.isTestAccount;
      if (typeof legacy.recordEpoch === 'number') payload.recordEpoch = legacy.recordEpoch;

      tx.set(targetLbRef, payload);
      tx.set(lockRef, {
        playerId: user.uid,
        nickname,
        updatedAt: serverTimestamp(),
      });
      tx.delete(legacyLbRef);
      migratedNickname = nickname;
    });

    if (migratedNickname) {
      saveLocalNickname(migratedNickname, user.uid);
      clearLegacyLocalNickname();
      migrateAdminLocalProfileIfEmpty(user.uid, sourceLegacyId);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
