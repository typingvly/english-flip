import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getRank } from '../data/words';
import { db, handleFirestoreError, OperationType } from '../firebase';

const PLAYER_ID_STORAGE_KEY = 'flipTypingPlayerId';
const NICKNAME_STORAGE_KEY = 'flipTypingNickname';
const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣_-]+$/;

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  nicknameKey: string;
  bestFlips: number;
  rank: string;
  updatedAtMs: number;
}

export class NicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NicknameError';
  }
}

export function validateNickname(raw: string): { valid: boolean; trimmed: string; error?: string } {
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 16) {
    return {
      valid: false,
      trimmed,
      error: '닉네임은 2자 이상 16자 이하로 입력해 주세요.',
    };
  }
  if (!NICKNAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      trimmed,
      error: '한글, 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.',
    };
  }
  return { valid: true, trimmed };
}

export function getOrCreatePlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_ID_STORAGE_KEY);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(PLAYER_ID_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function loadSavedNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLocalNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
  } catch {
    // Ignore storage errors
  }
}

export async function registerOrRenameNickname(params: {
  playerId: string;
  nextNickname: string;
  initialBestFlips?: number;
}): Promise<{ nickname: string; bestFlips: number }> {
  const { playerId, nextNickname, initialBestFlips = 0 } = params;
  const check = validateNickname(nextNickname);
  if (!check.valid) {
    throw new NicknameError(check.error || '올바른 닉네임을 입력해 주세요.');
  }

  const trimmed = check.trimmed;
  const newKey = trimmed.toLowerCase();
  const safeInitialBest = Math.max(0, Math.min(500, Math.floor(initialBestFlips)));

  const leaderboardRef = doc(db, 'leaderboard', playerId);
  const newLockRef = doc(db, 'nicknames', newKey);

  try {
    const result = await runTransaction(db, async (tx) => {
      const [lbSnap, newLockSnap] = await Promise.all([
        tx.get(leaderboardRef),
        tx.get(newLockRef),
      ]);

      if (newLockSnap.exists()) {
        const lockData = newLockSnap.data();
        if (lockData.playerId !== playerId) {
          throw new NicknameError('이미 사용 중인 닉네임입니다.');
        }
      }

      if (!lbSnap.exists()) {
        tx.set(newLockRef, {
          playerId,
          nickname: trimmed,
          updatedAt: serverTimestamp(),
        });
        tx.set(leaderboardRef, {
          playerId,
          nickname: trimmed,
          nicknameKey: newKey,
          bestFlips: safeInitialBest,
          rank: getRank(safeInitialBest),
          updatedAt: serverTimestamp(),
        });
        return { nickname: trimmed, bestFlips: safeInitialBest };
      }

      const existingEntry = lbSnap.data();
      const oldKey = String(existingEntry.nicknameKey || '');
      const currentBest = Number(existingEntry.bestFlips || 0);

      if (oldKey !== newKey) {
        const oldLockRef = oldKey ? doc(db, 'nicknames', oldKey) : null;
        if (oldLockRef) {
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
        tx.update(leaderboardRef, {
          nickname: trimmed,
          nicknameKey: newKey,
          updatedAt: serverTimestamp(),
        });
      } else if (existingEntry.nickname !== trimmed) {
        tx.set(newLockRef, {
          playerId,
          nickname: trimmed,
          updatedAt: serverTimestamp(),
        });
        tx.update(leaderboardRef, {
          nickname: trimmed,
          updatedAt: serverTimestamp(),
        });
      }

      return { nickname: trimmed, bestFlips: currentBest };
    });

    saveLocalNickname(result.nickname);
    return result;
  } catch (error) {
    if (error instanceof NicknameError) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `leaderboard/${playerId}`);
  }
}

export async function syncPersonalBestToLeaderboard(params: {
  playerId: string;
  nickname: string;
  bestFlips: number;
}): Promise<void> {
  const { playerId, nickname, bestFlips } = params;
  if (!nickname) return;

  const safeFlips = Math.max(0, Math.min(500, Math.floor(bestFlips)));
  const leaderboardRef = doc(db, 'leaderboard', playerId);

  try {
    const snap = await getDoc(leaderboardRef);
    if (!snap.exists()) {
      await registerOrRenameNickname({
        playerId,
        nextNickname: nickname,
        initialBestFlips: safeFlips,
      });
      return;
    }

    const existingBest = Number(snap.data().bestFlips || 0);
    if (safeFlips > existingBest) {
      await updateDoc(leaderboardRef, {
        bestFlips: safeFlips,
        rank: getRank(safeFlips),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    if (error instanceof NicknameError) return;
    handleFirestoreError(error, OperationType.UPDATE, `leaderboard/${playerId}`);
  }
}

export async function fetchPlayerLeaderboardEntry(
  playerId: string,
): Promise<LeaderboardEntry | null> {
  const path = `leaderboard/${playerId}`;
  try {
    const snap = await getDoc(doc(db, 'leaderboard', playerId));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      playerId: String(data.playerId || playerId),
      nickname: String(data.nickname || ''),
      nicknameKey: String(data.nicknameKey || ''),
      bestFlips: Number(data.bestFlips || 0),
      rank: String(data.rank || getRank(Number(data.bestFlips || 0))),
      updatedAtMs:
        data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeLeaderboard(
  onData: (entries: LeaderboardEntry[]) => void,
  onError: (err: unknown) => void,
): () => void {
  const path = 'leaderboard';
  const q = query(
    collection(db, path),
    where('bestFlips', '>=', 0),
    orderBy('bestFlips', 'desc'),
    limit(100),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: LeaderboardEntry[] = snapshot.docs.map((d) => {
        const data = d.data();
        const flips = Number(data.bestFlips || 0);
        return {
          playerId: String(data.playerId || d.id),
          nickname: String(data.nickname || ''),
          nicknameKey: String(data.nicknameKey || ''),
          bestFlips: flips,
          rank: String(data.rank || getRank(flips)),
          updatedAtMs:
            data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : 0,
        };
      });

      // Deterministic tie-breaker: higher flips first, earlier achiever first
      entries.sort((a, b) => {
        if (b.bestFlips !== a.bestFlips) return b.bestFlips - a.bestFlips;
        return a.updatedAtMs - b.updatedAtMs;
      });

      onData(entries);
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
