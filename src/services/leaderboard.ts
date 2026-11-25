import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
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
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { AppLanguage, PlayerControlState } from '../types/game';
import {
  APPROVAL_THRESHOLD_FLIPS,
  MAX_VERIFIED_CPM,
} from '../utils/antiCheat';

const PLAYER_ID_STORAGE_KEY = 'flipTypingPlayerId';
const BEST_STORAGE_KEY = 'flipTypingBest';
const NICKNAME_STORAGE_KEY = 'flipTypingNickname';
const NICKNAME_STORAGE_PREFIX = 'flipTypingNickname_';
const EPOCH_STORAGE_PREFIX = 'flipTypingRecordEpoch_';
const NICKNAME_REGEX = /^[a-zA-Z0-9가-힣_-]+$/;
const RESERVED_ADMIN_EMAIL = 'semajinpark@gmail.com';
const RESERVED_ADMIN_NICKNAME_KEY = 'semistry';

function isCurrentUserVerifiedAdmin(): boolean {
  const user = auth.currentUser;
  return Boolean(
    user &&
      user.emailVerified &&
      user.email &&
      user.email.toLowerCase() === RESERVED_ADMIN_EMAIL,
  );
}

export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  nicknameKey: string;
  bestFlips: number;
  bestCpm?: number;
  bestAccuracy?: number;
  rank: string;
  isTestAccount?: boolean;
  recordEpoch?: number;
  updatedAtMs: number;
}

export class NicknameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NicknameError';
  }
}

export function validateNickname(
  raw: string,
  lang: AppLanguage = 'ko',
  allowReservedAdmin: boolean = isCurrentUserVerifiedAdmin(),
): { valid: boolean; trimmed: string; error?: string } {
  const trimmed = raw.trim();
  const en = lang === 'en';
  if (trimmed.length < 2 || trimmed.length > 16) {
    return {
      valid: false,
      trimmed,
      error: en
        ? 'Nickname must be between 2 and 16 characters.'
        : '닉네임은 2자 이상 16자 이하로 입력해 주세요.',
    };
  }
  if (!NICKNAME_REGEX.test(trimmed)) {
    return {
      valid: false,
      trimmed,
      error: en
        ? 'Only English letters, Korean, numbers, _, and - are allowed.'
        : '한글, 영문, 숫자, 밑줄(_), 하이픈(-)만 사용할 수 있습니다.',
    };
  }
  if (!allowReservedAdmin && trimmed.toLowerCase() === RESERVED_ADMIN_NICKNAME_KEY) {
    return {
      valid: false,
      trimmed,
      error: en
        ? 'This nickname is reserved for the administrator.'
        : '이 닉네임은 관리자 전용으로 예약되어 있습니다.',
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

export function loadLocalBestFlips(playerId?: string, allowLegacyFallback = true): number {
  try {
    if (playerId) {
      const scoped = localStorage.getItem(`${BEST_STORAGE_KEY}_${playerId}`);
      if (scoped !== null) {
        const val = Number(scoped || 0);
        return Number.isFinite(val) ? val : 0;
      }
      if (!allowLegacyFallback) return 0;
    }
    const val = Number(localStorage.getItem(BEST_STORAGE_KEY) || 0);
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

export function saveLocalBestFlips(flips: number, playerId?: string): void {
  try {
    if (playerId) {
      localStorage.setItem(`${BEST_STORAGE_KEY}_${playerId}`, String(flips));
    } else {
      localStorage.setItem(BEST_STORAGE_KEY, String(flips));
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadSavedNickname(playerId?: string, allowLegacyFallback = false): string {
  try {
    if (playerId) {
      const scoped = localStorage.getItem(`${NICKNAME_STORAGE_PREFIX}${playerId}`);
      if (scoped !== null) return scoped;
      if (!allowLegacyFallback) return '';
    }
    return localStorage.getItem(NICKNAME_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function saveLocalNickname(nickname: string, playerId?: string): void {
  try {
    if (playerId) {
      if (nickname) {
        localStorage.setItem(`${NICKNAME_STORAGE_PREFIX}${playerId}`, nickname);
      } else {
        localStorage.removeItem(`${NICKNAME_STORAGE_PREFIX}${playerId}`);
      }
    } else if (nickname) {
      localStorage.setItem(NICKNAME_STORAGE_KEY, nickname);
    } else {
      localStorage.removeItem(NICKNAME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function clearLegacyLocalNickname(): void {
  try {
    localStorage.removeItem(NICKNAME_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function loadLocalRecordEpoch(playerId: string): number {
  try {
    const raw = Number(localStorage.getItem(`${EPOCH_STORAGE_PREFIX}${playerId}`) || 0);
    return Number.isFinite(raw) ? raw : 0;
  } catch {
    return 0;
  }
}

export function saveLocalRecordEpoch(playerId: string, epoch: number): void {
  try {
    localStorage.setItem(`${EPOCH_STORAGE_PREFIX}${playerId}`, String(Math.max(0, Math.floor(epoch))));
  } catch {
    // Ignore storage errors
  }
}

export async function registerOrRenameNickname(params: {
  playerId: string;
  ownerUid?: string;
  nextNickname: string;
  lang?: AppLanguage;
}): Promise<{ nickname: string; bestFlips: number }> {
  const { playerId, ownerUid, nextNickname, lang = 'ko' } = params;
  const check = validateNickname(nextNickname, lang);
  if (!check.valid) {
    throw new NicknameError(
      check.error || (lang === 'en' ? 'Please enter a valid nickname.' : '올바른 닉네임을 입력해 주세요.'),
    );
  }

  const trimmed = check.trimmed;
  const newKey = trimmed.toLowerCase();

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
          let canAdminReclaim = false;
          if (isCurrentUserVerifiedAdmin() && newKey === RESERVED_ADMIN_NICKNAME_KEY) {
            const ownerLbSnap = await tx.get(doc(db, 'leaderboard', String(lockData.playerId)));
            if (!ownerLbSnap.exists() || !ownerLbSnap.data().ownerUid) {
              canAdminReclaim = true;
            }
          }
          if (!canAdminReclaim) {
            throw new NicknameError(
              lang === 'en' ? 'That nickname is already taken.' : '이미 사용 중인 닉네임입니다.',
            );
          }
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
          ownerUid: ownerUid || playerId,
          nickname: trimmed,
          nicknameKey: newKey,
          bestFlips: 0,
          rank: getRank(0),
          updatedAt: serverTimestamp(),
        });
        return { nickname: trimmed, bestFlips: 0 };
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

    saveLocalNickname(result.nickname, playerId);
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
  ownerUid?: string;
  nickname: string;
  matchFlips: number;
  cpm?: number;
  accuracy?: number;
}): Promise<{ serverBestFlips: number }> {
  const { playerId, ownerUid, nickname, matchFlips, cpm, accuracy } = params;
  if (!nickname) return { serverBestFlips: 0 };

  const safeFlips = Math.max(0, Math.min(APPROVAL_THRESHOLD_FLIPS - 1, Math.floor(matchFlips)));
  const safeCpm =
    typeof cpm === 'number' && Number.isFinite(cpm)
      ? Math.max(0, Math.min(MAX_VERIFIED_CPM, Math.round(cpm)))
      : undefined;
  const safeAccuracy =
    typeof accuracy === 'number' && Number.isFinite(accuracy)
      ? Math.max(0, Math.min(100, Math.round(accuracy * 10) / 10))
      : undefined;

  const leaderboardRef = doc(db, 'leaderboard', playerId);

  try {
    let snap;
    try {
      snap = await getDocFromServer(leaderboardRef);
    } catch {
      snap = await getDoc(leaderboardRef);
    }

    if (!snap.exists()) {
      await registerOrRenameNickname({
        playerId,
        ownerUid,
        nextNickname: nickname,
      });
      if (safeFlips > 0) {
        const updatePayload: Record<string, unknown> = {
          bestFlips: safeFlips,
          rank: getRank(safeFlips),
          updatedAt: serverTimestamp(),
        };
        if (safeCpm !== undefined) updatePayload.bestCpm = safeCpm;
        if (safeAccuracy !== undefined) updatePayload.bestAccuracy = safeAccuracy;
        await updateDoc(leaderboardRef, updatePayload);
      }
      return { serverBestFlips: safeFlips };
    }

    const existingData = snap.data();
    const existingBest = Number(existingData.bestFlips || 0);
    if (safeFlips > existingBest) {
      const updatePayload: Record<string, unknown> = {
        bestFlips: safeFlips,
        rank: getRank(safeFlips),
        updatedAt: serverTimestamp(),
      };
      if (safeCpm !== undefined) {
        updatePayload.bestCpm = safeCpm;
      }
      if (safeAccuracy !== undefined) {
        updatePayload.bestAccuracy = safeAccuracy;
      }
      await updateDoc(leaderboardRef, updatePayload);
      return { serverBestFlips: safeFlips };
    }

    return { serverBestFlips: existingBest };
  } catch (error) {
    if (error instanceof NicknameError) return { serverBestFlips: 0 };
    handleFirestoreError(error, OperationType.UPDATE, `leaderboard/${playerId}`);
  }
}

function mapLeaderboardDoc(
  playerId: string,
  data: Record<string, unknown>,
): LeaderboardEntry {
  const flips = Number(data.bestFlips || 0);
  return {
    playerId: String(data.playerId || playerId),
    nickname: String(data.nickname || ''),
    nicknameKey: String(data.nicknameKey || ''),
    bestFlips: flips,
    bestCpm: typeof data.bestCpm === 'number' ? data.bestCpm : undefined,
    bestAccuracy: typeof data.bestAccuracy === 'number' ? data.bestAccuracy : undefined,
    rank: String(data.rank || getRank(flips)),
    isTestAccount: Boolean(data.isTestAccount),
    recordEpoch: typeof data.recordEpoch === 'number' ? data.recordEpoch : 0,
    updatedAtMs:
      data.updatedAt instanceof Timestamp ? data.updatedAt.toMillis() : Date.now(),
  };
}

export async function fetchPlayerLeaderboardEntry(
  playerId: string,
): Promise<LeaderboardEntry | null> {
  const path = `leaderboard/${playerId}`;
  try {
    const ref = doc(db, 'leaderboard', playerId);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return null;
    return mapLeaderboardDoc(playerId, snap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function fetchPlayerControlState(
  playerId: string,
): Promise<PlayerControlState | null> {
  const path = `playerControls/${playerId}`;
  try {
    const ref = doc(db, 'playerControls', playerId);
    let snap;
    try {
      snap = await getDocFromServer(ref);
    } catch {
      snap = await getDoc(ref);
    }
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      playerId: String(data.playerId || playerId),
      recordEpoch: Number(data.recordEpoch || 0),
      forcedBestFlips: Number(data.forcedBestFlips || 0),
      isRemoved: Boolean(data.isRemoved),
      forcedNickname:
        typeof data.forcedNickname === 'string' ? data.forcedNickname : undefined,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export function subscribeOwnPlayerControl(
  playerId: string,
  onControl: (control: PlayerControlState) => void,
): () => void {
  const path = `playerControls/${playerId}`;
  return onSnapshot(
    doc(db, 'playerControls', playerId),
    (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      onControl({
        playerId: String(data.playerId || playerId),
        recordEpoch: Number(data.recordEpoch || 0),
        forcedBestFlips: Number(data.forcedBestFlips || 0),
        isRemoved: Boolean(data.isRemoved),
        forcedNickname:
          typeof data.forcedNickname === 'string' ? data.forcedNickname : undefined,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Ignore transient offline listeners
      }
    },
  );
}

export function subscribeOwnLeaderboardEntry(
  playerId: string,
  onEntry: (entry: LeaderboardEntry | null) => void,
): () => void {
  const path = `leaderboard/${playerId}`;
  return onSnapshot(
    doc(db, 'leaderboard', playerId),
    (snap) => {
      if (!snap.exists()) {
        onEntry(null);
        return;
      }
      onEntry(mapLeaderboardDoc(playerId, snap.data()));
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.GET, path);
      } catch {
        // Ignore transient offline listeners
      }
    },
  );
}

export function subscribeLeaderboard(
  onData: (entries: LeaderboardEntry[]) => void,
  onError: (err: unknown) => void,
  options?: { includeTestAccounts?: boolean },
): () => void {
  const includeTestAccounts = Boolean(options?.includeTestAccounts);
  const path = 'leaderboard';
  const q = query(
    collection(db, path),
    where('bestFlips', '>=', 0),
    orderBy('bestFlips', 'desc'),
    limit(200),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const entries: LeaderboardEntry[] = snapshot.docs
        .map((d) => mapLeaderboardDoc(d.id, d.data()))
        .filter((entry) => includeTestAccounts || !entry.isTestAccount);

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
