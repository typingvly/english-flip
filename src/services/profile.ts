import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getRank } from '../data/words';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { DifficultySpeed, PlayerMatchRecord, PlayerProfileStats } from '../types/game';
import { MAX_VERIFIED_CPM, MAX_VERIFIED_FLIPS } from '../utils/antiCheat';

const PROFILE_STORAGE_PREFIX = 'flipTypingProfile_';
const MAX_RECENT_MATCHES = 20;

function getProfileStorageKey(playerId: string): string {
  return `${PROFILE_STORAGE_PREFIX}${playerId}`;
}

export function createEmptyProfile(playerId: string): PlayerProfileStats {
  return {
    playerId,
    totalGames: 0,
    wins: 0,
    bestFlips: 0,
    bestCpm: 0,
    totalAccuracySum: 0,
    recentMatches: [],
  };
}

export function loadLocalProfile(playerId: string): PlayerProfileStats {
  try {
    const raw = localStorage.getItem(getProfileStorageKey(playerId));
    if (!raw) return createEmptyProfile(playerId);
    const parsed = JSON.parse(raw) as Partial<PlayerProfileStats>;
    return {
      playerId,
      totalGames: typeof parsed.totalGames === 'number' ? Math.max(0, parsed.totalGames) : 0,
      wins: typeof parsed.wins === 'number' ? Math.max(0, parsed.wins) : 0,
      bestFlips: typeof parsed.bestFlips === 'number' ? Math.max(0, parsed.bestFlips) : 0,
      bestCpm: typeof parsed.bestCpm === 'number' ? Math.max(0, parsed.bestCpm) : 0,
      totalAccuracySum:
        typeof parsed.totalAccuracySum === 'number' ? Math.max(0, parsed.totalAccuracySum) : 0,
      recentMatches: Array.isArray(parsed.recentMatches)
        ? parsed.recentMatches.slice(0, MAX_RECENT_MATCHES)
        : [],
    };
  } catch {
    return createEmptyProfile(playerId);
  }
}

export function saveLocalProfile(profile: PlayerProfileStats): void {
  try {
    localStorage.setItem(getProfileStorageKey(profile.playerId), JSON.stringify(profile));
  } catch {
    // Ignore storage errors
  }
}

function generateReverseChronoMatchId(nowMs: number): string {
  const reverseTs = Math.max(0, 9999999999999 - nowMs);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${String(reverseTs).padStart(13, '0')}_${rand}`;
}

export async function recordVerifiedMatch(params: {
  playerId: string;
  flips: number;
  aiFlips: number;
  aiSpeed: DifficultySpeed;
  cpm: number;
  rawCpm: number;
  accuracy: number;
  syncToCloud?: boolean;
}): Promise<PlayerProfileStats> {
  const nowMs = Date.now();
  const safeFlips = Math.max(0, Math.min(MAX_VERIFIED_FLIPS, Math.floor(params.flips)));
  const safeAiFlips = Math.max(0, Math.min(500, Math.floor(params.aiFlips)));
  const safeCpm = Math.max(0, Math.min(MAX_VERIFIED_CPM, Math.round(params.cpm)));
  const safeRawCpm = Math.max(0, Math.min(2500, Math.round(params.rawCpm)));
  const safeAccuracy = Math.max(0, Math.min(100, Math.round(params.accuracy * 10) / 10));
  const won = safeFlips > safeAiFlips;
  const rank = getRank(safeFlips);
  const matchId = generateReverseChronoMatchId(nowMs);

  const newMatch: PlayerMatchRecord = {
    matchId,
    playerId: params.playerId,
    flips: safeFlips,
    aiFlips: safeAiFlips,
    aiSpeed: params.aiSpeed,
    won,
    cpm: safeCpm,
    rawCpm: safeRawCpm,
    accuracy: safeAccuracy,
    rank,
    createdAtMs: nowMs,
  };

  // Update local cache immediately
  const localPrev = loadLocalProfile(params.playerId);
  const nextLocal: PlayerProfileStats = {
    playerId: params.playerId,
    totalGames: localPrev.totalGames + 1,
    wins: localPrev.wins + (won ? 1 : 0),
    bestFlips: Math.max(localPrev.bestFlips, safeFlips),
    bestCpm: Math.max(localPrev.bestCpm, safeCpm),
    totalAccuracySum: Math.round((localPrev.totalAccuracySum + safeAccuracy) * 10) / 10,
    recentMatches: [newMatch, ...localPrev.recentMatches].slice(0, MAX_RECENT_MATCHES),
  };
  saveLocalProfile(nextLocal);

  if (!params.syncToCloud) {
    return nextLocal;
  }

  // Persist to Firestore atomically
  const statsRef = doc(db, 'playerStats', params.playerId);
  const matchRef = doc(db, 'playerStats', params.playerId, 'matches', matchId);

  try {
    await runTransaction(db, async (tx) => {
      const statsSnap = await tx.get(statsRef);
      if (!statsSnap.exists()) {
        tx.set(statsRef, {
          playerId: params.playerId,
          totalGames: 1,
          wins: won ? 1 : 0,
          bestFlips: safeFlips,
          bestCpm: safeCpm,
          totalAccuracySum: safeAccuracy,
          updatedAt: serverTimestamp(),
        });
      } else {
        const cur = statsSnap.data();
        const curGames = Number(cur.totalGames || 0);
        const curWins = Number(cur.wins || 0);
        const curBestFlips = Number(cur.bestFlips || 0);
        const curBestCpm = Number(cur.bestCpm || 0);
        const curAccSum = Number(cur.totalAccuracySum || 0);

        tx.update(statsRef, {
          totalGames: curGames + 1,
          wins: curWins + (won ? 1 : 0),
          bestFlips: Math.max(curBestFlips, safeFlips),
          bestCpm: Math.max(curBestCpm, safeCpm),
          totalAccuracySum: Math.round((curAccSum + safeAccuracy) * 10) / 10,
          updatedAt: serverTimestamp(),
        });
      }

      tx.set(matchRef, {
        matchId,
        playerId: params.playerId,
        flips: safeFlips,
        aiFlips: safeAiFlips,
        aiSpeed: params.aiSpeed,
        won,
        cpm: safeCpm,
        rawCpm: safeRawCpm,
        accuracy: safeAccuracy,
        rank,
        createdAt: serverTimestamp(),
      });
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `playerStats/${params.playerId}`);
  }

  return nextLocal;
}

export function applyServerProfileReset(playerId: string, forcedBestFlips: number, isRemoved: boolean): void {
  if (isRemoved) {
    saveLocalProfile(createEmptyProfile(playerId));
    return;
  }
  const local = loadLocalProfile(playerId);
  saveLocalProfile({
    ...local,
    bestFlips: Math.max(0, forcedBestFlips),
    bestCpm: forcedBestFlips === 0 ? 0 : local.bestCpm,
    recentMatches: forcedBestFlips === 0 ? [] : local.recentMatches,
  });
}

export async function fetchPlayerProfile(
  playerId: string,
  syncFromCloud = true,
): Promise<PlayerProfileStats> {
  const local = loadLocalProfile(playerId);
  if (!syncFromCloud) {
    return local;
  }

  const statsPath = `playerStats/${playerId}`;
  const matchesPath = `playerStats/${playerId}/matches`;

  try {
    const [statsSnap, matchesSnap] = await Promise.all([
      getDoc(doc(db, 'playerStats', playerId)),
      getDocs(
        query(
          collection(db, 'playerStats', playerId, 'matches'),
          where('playerId', '==', playerId),
          limit(MAX_RECENT_MATCHES),
        ),
      ),
    ]);

    if (!statsSnap.exists()) {
      return local;
    }

    const s = statsSnap.data();
    const remoteMatches: PlayerMatchRecord[] = matchesSnap.docs.map((d) => {
      const m = d.data();
      return {
        matchId: String(m.matchId || d.id),
        playerId: String(m.playerId || playerId),
        flips: Number(m.flips || 0),
        aiFlips: Number(m.aiFlips || 0),
        aiSpeed: (Number(m.aiSpeed) as DifficultySpeed) || 400,
        won: Boolean(m.won),
        cpm: Number(m.cpm || 0),
        rawCpm: Number(m.rawCpm || 0),
        accuracy: Number(m.accuracy || 0),
        rank: String(m.rank || getRank(Number(m.flips || 0))),
        createdAtMs: m.createdAt instanceof Timestamp ? m.createdAt.toMillis() : 0,
      };
    });

    remoteMatches.sort((a, b) => b.createdAtMs - a.createdAtMs);

    const authoritative: PlayerProfileStats = {
      playerId,
      totalGames: Number(s.totalGames || 0),
      wins: Number(s.wins || 0),
      bestFlips: Number(s.bestFlips || 0),
      bestCpm: Number(s.bestCpm || 0),
      totalAccuracySum: Number(s.totalAccuracySum || 0),
      recentMatches: remoteMatches.slice(0, MAX_RECENT_MATCHES),
    };

    saveLocalProfile(authoritative);
    return authoritative;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${statsPath} | ${matchesPath}`);
  }
}
