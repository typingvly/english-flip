import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getRank } from '../data/words';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import {
  DifficultySpeed,
  ModerationCategory,
  ModerationReport,
  ModerationStatus,
} from '../types/game';
import { MAX_VERIFIED_CPM, MAX_VERIFIED_FLIPS } from '../utils/antiCheat';
import { NicknameError, validateNickname } from './leaderboard';

export const ADMIN_EMAIL = 'semajinpark@gmail.com';
export const ADMIN_NICKNAME_KEY = 'semistry';

export function isAdminNickname(nickname: string): boolean {
  return nickname.trim().toLowerCase() === ADMIN_NICKNAME_KEY;
}

export function isAdminUser(user: User | null): boolean {
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.toLowerCase() === ADMIN_EMAIL,
  );
}

export async function signInAdminWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  if (!isAdminUser(result.user)) {
    await signOut(auth).catch(() => {});
    throw new Error('관리자(Semistry) 권한이 없는 Google 계정입니다.');
  }
  return result.user;
}

export async function signOutAdmin(): Promise<void> {
  await signOut(auth);
}

function generateReportId(): string {
  const reverseTs = Math.max(0, 9999999999999 - Date.now());
  const rand = Math.random().toString(36).slice(2, 8);
  return `rep_${String(reverseTs).padStart(13, '0')}_${rand}`;
}

export async function submitModerationReport(params: {
  playerId: string;
  nickname: string;
  category: ModerationCategory;
  reason: string;
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  cpm: number;
  rawCpm: number;
  accuracy: number;
  elapsedSec: number;
  untrustedCount: number;
  bulkInjectionCount: number;
  pasteBlockedCount: number;
  interKeyMeanMs: number;
  interKeyStdDevMs: number;
  paceCpms: number[];
}): Promise<string> {
  const reportId = generateReportId();
  const path = `moderationReports/${reportId}`;

  const safeNickname = (params.nickname || '').trim().slice(0, 16) || '미등록';
  const safeReason = (params.reason || '').trim().slice(0, 200) || '검수 필요';
  const safePaceCpms = Array.from({ length: 6 }, (_, idx) => {
    const val = Number(params.paceCpms[idx] ?? 0);
    return Number.isFinite(val) ? Math.max(0, Math.min(10000, Math.round(val))) : 0;
  });

  try {
    await setDoc(doc(db, 'moderationReports', reportId), {
      reportId,
      playerId: params.playerId,
      nickname: safeNickname,
      category: params.category,
      status: 'pending',
      reason: safeReason,
      flips: Math.max(0, Math.min(1000, Math.round(params.flips))),
      aiFlips: Math.max(0, Math.min(1000, Math.round(params.aiFlips))),
      aiSpeed: params.aiSpeed,
      cpm: Math.max(0, Math.min(10000, Math.round(params.cpm))),
      rawCpm: Math.max(0, Math.min(15000, Math.round(params.rawCpm))),
      accuracy: Math.max(0, Math.min(100, Math.round(params.accuracy * 10) / 10)),
      elapsedSec: Math.max(0, Math.min(120, Math.round(params.elapsedSec * 10) / 10)),
      untrustedCount: Math.max(0, Math.min(10000, Math.round(params.untrustedCount))),
      bulkInjectionCount: Math.max(0, Math.min(10000, Math.round(params.bulkInjectionCount))),
      pasteBlockedCount: Math.max(0, Math.min(10000, Math.round(params.pasteBlockedCount))),
      interKeyMeanMs: Math.max(0, Math.min(10000, Math.round(params.interKeyMeanMs * 10) / 10)),
      interKeyStdDevMs: Math.max(0, Math.min(10000, Math.round(params.interKeyStdDevMs * 10) / 10)),
      paceCpms: safePaceCpms,
      createdAt: serverTimestamp(),
    });
    return reportId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeModerationReports(
  onData: (reports: ModerationReport[]) => void,
  onError: (err: unknown) => void,
): () => void {
  const path = 'moderationReports';
  const q = query(
    collection(db, path),
    where('status', 'in', ['pending', 'approved', 'rejected']),
    limit(150),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ModerationReport[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          reportId: String(data.reportId || d.id),
          playerId: String(data.playerId || ''),
          nickname: String(data.nickname || '미등록'),
          category: (data.category === 'high_score' ? 'high_score' : 'suspicious') as ModerationCategory,
          status: (['pending', 'approved', 'rejected'].includes(String(data.status))
            ? String(data.status)
            : 'pending') as ModerationStatus,
          reason: String(data.reason || ''),
          flips: Number(data.flips || 0),
          aiFlips: Number(data.aiFlips || 0),
          aiSpeed: (Number(data.aiSpeed) as DifficultySpeed) || 400,
          cpm: Number(data.cpm || 0),
          rawCpm: Number(data.rawCpm || 0),
          accuracy: Number(data.accuracy || 0),
          elapsedSec: Number(data.elapsedSec || 0),
          untrustedCount: Number(data.untrustedCount || 0),
          bulkInjectionCount: Number(data.bulkInjectionCount || 0),
          pasteBlockedCount: Number(data.pasteBlockedCount || 0),
          interKeyMeanMs: Number(data.interKeyMeanMs || 0),
          interKeyStdDevMs: Number(data.interKeyStdDevMs || 0),
          paceCpms: Array.isArray(data.paceCpms)
            ? data.paceCpms.slice(0, 6).map((v) => Number(v || 0))
            : [0, 0, 0, 0, 0, 0],
          createdAtMs:
            data.createdAt instanceof Timestamp ? data.createdAt.toMillis() : 0,
          reviewedAtMs:
            data.reviewedAt instanceof Timestamp ? data.reviewedAt.toMillis() : undefined,
          adminAction: typeof data.adminAction === 'string' ? data.adminAction : undefined,
        };
      });

      items.sort((a, b) => b.createdAtMs - a.createdAtMs);
      onData(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onError(wrapped);
      }
    },
  );
}

export async function approveModerationReport(report: ModerationReport): Promise<void> {
  if (report.flips > MAX_VERIFIED_FLIPS) {
    throw new Error(`허용 상한(${MAX_VERIFIED_FLIPS}판)을 초과한 기록은 승인할 수 없습니다.`);
  }

  const safeFlips = Math.max(0, Math.min(MAX_VERIFIED_FLIPS, Math.floor(report.flips)));
  const safeCpm = Math.max(0, Math.min(MAX_VERIFIED_CPM, Math.round(report.cpm)));
  const safeAcc = Math.max(0, Math.min(100, Math.round(report.accuracy * 10) / 10));

  const reportRef = doc(db, 'moderationReports', report.reportId);
  const lbRef = doc(db, 'leaderboard', report.playerId);
  const statsRef = doc(db, 'playerStats', report.playerId);
  const ctrlRef = doc(db, 'playerControls', report.playerId);

  try {
    await runTransaction(db, async (tx) => {
      const [lbSnap, statsSnap, ctrlSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(statsRef),
        tx.get(ctrlRef),
      ]);

      const curCtrlEpoch = ctrlSnap.exists() ? Number(ctrlSnap.data().recordEpoch || 0) : 0;

      tx.update(reportRef, {
        status: 'approved',
        reviewedAt: serverTimestamp(),
        adminAction: 'approved_to_leaderboard',
      });

      if (lbSnap.exists()) {
        const cur = lbSnap.data();
        const curBest = Number(cur.bestFlips || 0);
        const nextBest = Math.max(curBest, safeFlips);
        const nextEpoch = Math.max(curCtrlEpoch, Number(cur.recordEpoch || 0)) + 1;

        const lbUpdate: Record<string, unknown> = {
          bestFlips: nextBest,
          rank: getRank(nextBest),
          recordEpoch: nextEpoch,
          updatedAt: serverTimestamp(),
        };
        if (safeFlips >= curBest) {
          lbUpdate.bestCpm = safeCpm;
          lbUpdate.bestAccuracy = safeAcc;
        }
        tx.update(lbRef, lbUpdate);

        tx.set(ctrlRef, {
          playerId: report.playerId,
          recordEpoch: nextEpoch,
          forcedBestFlips: nextBest,
          isRemoved: false,
          updatedAt: serverTimestamp(),
        });
      } else {
        const rawReportNick = String(report.nickname || '').trim();
        const isPlaceholderNick =
          !rawReportNick ||
          rawReportNick === '미등록' ||
          rawReportNick.toLowerCase() === 'unregistered';
        const nickCheck = validateNickname(rawReportNick, 'ko', false);
        if (isPlaceholderNick || !nickCheck.valid) {
          throw new Error(
            '아직 리더보드 닉네임을 등록하지 않은 유저입니다. 유저가 닉네임을 설정한 뒤 승인해 주세요.',
          );
        }

        const nickKey = nickCheck.trimmed.toLowerCase();
        const lockRef = doc(db, 'nicknames', nickKey);
        const lockSnap = await tx.get(lockRef);
        if (lockSnap.exists() && lockSnap.data().playerId !== report.playerId) {
          throw new Error(
            `닉네임 '${nickCheck.trimmed}'이(가) 이미 다른 유저에게 사용 중이라 리더보드에 자동 등록할 수 없습니다.`,
          );
        }

        const nextEpoch = curCtrlEpoch + 1;
        tx.set(lockRef, {
          playerId: report.playerId,
          nickname: nickCheck.trimmed,
          updatedAt: serverTimestamp(),
        });
        tx.set(lbRef, {
          playerId: report.playerId,
          ownerUid: report.playerId,
          nickname: nickCheck.trimmed,
          nicknameKey: nickKey,
          bestFlips: safeFlips,
          bestCpm: safeCpm,
          bestAccuracy: safeAcc,
          rank: getRank(safeFlips),
          recordEpoch: nextEpoch,
          updatedAt: serverTimestamp(),
        });
        tx.set(ctrlRef, {
          playerId: report.playerId,
          recordEpoch: nextEpoch,
          forcedBestFlips: safeFlips,
          isRemoved: false,
          updatedAt: serverTimestamp(),
        });
      }

      if (statsSnap.exists()) {
        const st = statsSnap.data();
        const curGames = Number(st.totalGames || 0);
        const curWins = Number(st.wins || 0);
        const curBest = Number(st.bestFlips || 0);
        const curBestCpm = Number(st.bestCpm || 0);
        const curAccSum = Number(st.totalAccuracySum || 0);
        const won = safeFlips > report.aiFlips;

        tx.update(statsRef, {
          totalGames: curGames + 1,
          wins: curWins + (won ? 1 : 0),
          bestFlips: Math.max(curBest, safeFlips),
          bestCpm: Math.max(curBestCpm, safeCpm),
          totalAccuracySum: Math.round((curAccSum + safeAcc) * 10) / 10,
          updatedAt: serverTimestamp(),
        });
      } else {
        const won = safeFlips > report.aiFlips;
        tx.set(statsRef, {
          playerId: report.playerId,
          totalGames: 1,
          wins: won ? 1 : 0,
          bestFlips: safeFlips,
          bestCpm: safeCpm,
          totalAccuracySum: safeAcc,
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `moderationReports/${report.reportId}`);
  }
}

export async function rejectModerationReport(
  report: ModerationReport,
  options: { resetLeaderboardScore: boolean },
): Promise<void> {
  const reportRef = doc(db, 'moderationReports', report.reportId);
  const lbRef = doc(db, 'leaderboard', report.playerId);
  const statsRef = doc(db, 'playerStats', report.playerId);
  const ctrlRef = doc(db, 'playerControls', report.playerId);

  try {
    await runTransaction(db, async (tx) => {
      const [lbSnap, statsSnap, ctrlSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(statsRef),
        tx.get(ctrlRef),
      ]);

      tx.update(reportRef, {
        status: 'rejected',
        reviewedAt: serverTimestamp(),
        adminAction: options.resetLeaderboardScore ? 'rejected_and_reset' : 'rejected_only',
      });

      if (options.resetLeaderboardScore) {
        const curCtrlEpoch = ctrlSnap.exists() ? Number(ctrlSnap.data().recordEpoch || 0) : 0;
        const curLbEpoch = lbSnap.exists() ? Number(lbSnap.data().recordEpoch || 0) : 0;
        const nextEpoch = Math.max(curCtrlEpoch, curLbEpoch) + 1;

        if (lbSnap.exists()) {
          tx.update(lbRef, {
            bestFlips: 0,
            bestCpm: 0,
            bestAccuracy: 0,
            rank: getRank(0),
            recordEpoch: nextEpoch,
            updatedAt: serverTimestamp(),
          });
        }

        if (statsSnap.exists()) {
          tx.update(statsRef, {
            bestFlips: 0,
            bestCpm: 0,
            updatedAt: serverTimestamp(),
          });
        }

        tx.set(ctrlRef, {
          playerId: report.playerId,
          recordEpoch: nextEpoch,
          forcedBestFlips: 0,
          isRemoved: !lbSnap.exists(),
          updatedAt: serverTimestamp(),
        });
      }
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `moderationReports/${report.reportId}`);
  }
}

export async function adminSetPlayerScore(
  playerId: string,
  nextBestFlips: number,
): Promise<void> {
  const safeFlips = Math.max(0, Math.min(MAX_VERIFIED_FLIPS, Math.floor(nextBestFlips)));
  const lbRef = doc(db, 'leaderboard', playerId);
  const statsRef = doc(db, 'playerStats', playerId);
  const ctrlRef = doc(db, 'playerControls', playerId);

  try {
    await runTransaction(db, async (tx) => {
      const [lbSnap, statsSnap, ctrlSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(statsRef),
        tx.get(ctrlRef),
      ]);

      const curCtrlEpoch = ctrlSnap.exists() ? Number(ctrlSnap.data().recordEpoch || 0) : 0;
      const curLbEpoch = lbSnap.exists() ? Number(lbSnap.data().recordEpoch || 0) : 0;
      const nextEpoch = Math.max(curCtrlEpoch, curLbEpoch) + 1;

      if (lbSnap.exists()) {
        const updatePayload: Record<string, unknown> = {
          bestFlips: safeFlips,
          rank: getRank(safeFlips),
          recordEpoch: nextEpoch,
          updatedAt: serverTimestamp(),
        };
        if (safeFlips === 0) {
          updatePayload.bestCpm = 0;
          updatePayload.bestAccuracy = 0;
        }
        tx.update(lbRef, updatePayload);
      }

      if (statsSnap.exists()) {
        const stUpdate: Record<string, unknown> = {
          bestFlips: safeFlips,
          updatedAt: serverTimestamp(),
        };
        if (safeFlips === 0) {
          stUpdate.bestCpm = 0;
        }
        tx.update(statsRef, stUpdate);
      }

      tx.set(ctrlRef, {
        playerId,
        recordEpoch: nextEpoch,
        forcedBestFlips: safeFlips,
        isRemoved: false,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `leaderboard/${playerId}`);
  }
}

export async function adminDeleteLeaderboardEntry(playerId: string): Promise<void> {
  const lbRef = doc(db, 'leaderboard', playerId);
  const statsRef = doc(db, 'playerStats', playerId);
  const ctrlRef = doc(db, 'playerControls', playerId);

  try {
    await runTransaction(db, async (tx) => {
      const [lbSnap, statsSnap, ctrlSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(statsRef),
        tx.get(ctrlRef),
      ]);

      const curCtrlEpoch = ctrlSnap.exists() ? Number(ctrlSnap.data().recordEpoch || 0) : 0;
      const curLbEpoch = lbSnap.exists() ? Number(lbSnap.data().recordEpoch || 0) : 0;
      const nextEpoch = Math.max(curCtrlEpoch, curLbEpoch) + 1;

      if (lbSnap.exists()) {
        const oldKey = String(lbSnap.data().nicknameKey || '');
        if (oldKey) {
          const oldLockRef = doc(db, 'nicknames', oldKey);
          const oldLockSnap = await tx.get(oldLockRef);
          if (oldLockSnap.exists() && oldLockSnap.data().playerId === playerId) {
            tx.delete(oldLockRef);
          }
        }
        tx.delete(lbRef);
      }

      if (statsSnap.exists()) {
        tx.update(statsRef, {
          bestFlips: 0,
          bestCpm: 0,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(ctrlRef, {
        playerId,
        recordEpoch: nextEpoch,
        forcedBestFlips: 0,
        isRemoved: true,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `leaderboard/${playerId}`);
  }
}

export async function adminForceRenamePlayer(
  playerId: string,
  nextNickname: string,
): Promise<string> {
  const check = validateNickname(nextNickname);
  if (!check.valid) {
    throw new NicknameError(check.error || '올바른 닉네임을 입력해 주세요.');
  }

  const trimmed = check.trimmed;
  const newKey = trimmed.toLowerCase();

  const lbRef = doc(db, 'leaderboard', playerId);
  const newLockRef = doc(db, 'nicknames', newKey);
  const ctrlRef = doc(db, 'playerControls', playerId);

  try {
    await runTransaction(db, async (tx) => {
      const [lbSnap, newLockSnap, ctrlSnap] = await Promise.all([
        tx.get(lbRef),
        tx.get(newLockRef),
        tx.get(ctrlRef),
      ]);

      if (!lbSnap.exists()) {
        throw new Error('해당 플레이어의 리더보드 문서가 존재하지 않습니다.');
      }

      if (newLockSnap.exists() && newLockSnap.data().playerId !== playerId) {
        throw new NicknameError('이미 사용 중인 닉네임입니다.');
      }

      const existingEntry = lbSnap.data();
      const oldKey = String(existingEntry.nicknameKey || '');
      const curBest = Number(existingEntry.bestFlips || 0);
      const curCtrlEpoch = ctrlSnap.exists() ? Number(ctrlSnap.data().recordEpoch || 0) : 0;
      const curLbEpoch = Number(existingEntry.recordEpoch || 0);
      const nextEpoch = Math.max(curCtrlEpoch, curLbEpoch) + 1;

      if (oldKey && oldKey !== newKey) {
        const oldLockRef = doc(db, 'nicknames', oldKey);
        const oldLockSnap = await tx.get(oldLockRef);
        if (oldLockSnap.exists() && oldLockSnap.data().playerId === playerId) {
          tx.delete(oldLockRef);
        }
      }

      tx.set(newLockRef, {
        playerId,
        nickname: trimmed,
        updatedAt: serverTimestamp(),
      });

      tx.update(lbRef, {
        nickname: trimmed,
        nicknameKey: newKey,
        recordEpoch: nextEpoch,
        updatedAt: serverTimestamp(),
      });

      tx.set(ctrlRef, {
        playerId,
        recordEpoch: nextEpoch,
        forcedBestFlips: curBest,
        isRemoved: false,
        forcedNickname: trimmed,
        updatedAt: serverTimestamp(),
      });
    });

    return trimmed;
  } catch (error) {
    if (error instanceof NicknameError) throw error;
    handleFirestoreError(error, OperationType.UPDATE, `leaderboard/${playerId}`);
  }
}

export async function adminSetTestAccount(
  playerId: string,
  isTestAccount: boolean,
): Promise<void> {
  const path = `leaderboard/${playerId}`;
  try {
    await updateDoc(doc(db, 'leaderboard', playerId), {
      isTestAccount,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
