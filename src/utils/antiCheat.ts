export const APPROVAL_THRESHOLD_FLIPS = 220;
export const MAX_VERIFIED_FLIPS = 320;
export const MAX_VERIFIED_CPM = 1800;
export const MIN_VERIFIED_DURATION_SEC = 58.5;

export interface AntiCheatState {
  untrustedCount: number;
  pasteBlockedCount: number;
  bulkInjectionCount: number;
  interKeyIntervals: number[];
  lastKeyAt: number | null;
}

export interface AntiCheatTelemetry {
  untrustedCount: number;
  bulkInjectionCount: number;
  pasteBlockedCount: number;
  interKeyMeanMs: number;
  interKeyStdDevMs: number;
}

export function createAntiCheatState(): AntiCheatState {
  return {
    untrustedCount: 0,
    pasteBlockedCount: 0,
    bulkInjectionCount: 0,
    interKeyIntervals: [],
    lastKeyAt: null,
  };
}

export function recordKeyInputSample(
  state: AntiCheatState,
  params: {
    isTrusted: boolean;
    deltaChars: number;
    isComposing: boolean;
    nowMs: number;
  },
): void {
  if (!params.isTrusted) {
    state.untrustedCount += 1;
  }

  if (params.deltaChars > 1 && !params.isComposing) {
    state.bulkInjectionCount += 1;
  }

  if (params.deltaChars === 1) {
    if (state.lastKeyAt !== null) {
      const diff = params.nowMs - state.lastKeyAt;
      if (diff >= 0 && diff < 2500) {
        state.interKeyIntervals.push(diff);
      }
    }
    state.lastKeyAt = params.nowMs;
  }
}

export function getAntiCheatTelemetry(state: AntiCheatState): AntiCheatTelemetry {
  const intervals = state.interKeyIntervals;
  let interKeyMeanMs = 0;
  let interKeyStdDevMs = 0;

  if (intervals.length >= 3) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const trimmed = sorted.length >= 5 ? sorted.slice(1, sorted.length - 1) : sorted;
    const mean = trimmed.reduce((acc, v) => acc + v, 0) / trimmed.length;
    const variance =
      trimmed.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / trimmed.length;
    interKeyMeanMs = Math.round(mean * 10) / 10;
    interKeyStdDevMs = Math.round(Math.sqrt(variance) * 10) / 10;
  } else if (intervals.length > 0) {
    const mean = intervals.reduce((acc, v) => acc + v, 0) / intervals.length;
    interKeyMeanMs = Math.round(mean * 10) / 10;
  }

  return {
    untrustedCount: state.untrustedCount,
    bulkInjectionCount: state.bulkInjectionCount,
    pasteBlockedCount: state.pasteBlockedCount,
    interKeyMeanMs,
    interKeyStdDevMs,
  };
}

export function evaluateMatchIntegrity(
  state: AntiCheatState,
  params: {
    flips: number;
    cpm: number;
    elapsedSec: number;
    expectedDurationSec?: number;
    lang?: 'ko' | 'en';
  },
): { verified: boolean; reason: string | null } {
  const expectedDuration = params.expectedDurationSec ?? 60;
  const minDuration = Math.max(1, expectedDuration - 1.5);
  const maxFlipsForDuration = Math.ceil(MAX_VERIFIED_FLIPS * (expectedDuration / 60));
  const en = params.lang === 'en';

  if (state.untrustedCount > 0) {
    return {
      verified: false,
      reason: en
        ? 'Untrusted automated input events were detected; excluded from rankings.'
        : '비정상적인 자동화 입력 이벤트가 감지되어 랭킹 기록에서 제외되었습니다.',
    };
  }

  if (state.bulkInjectionCount >= 2) {
    return {
      verified: false,
      reason: en
        ? 'Bulk text injection was detected; excluded from rankings.'
        : '단어 일괄 삽입 입력이 감지되어 랭킹 기록에서 제외되었습니다.',
    };
  }

  if (params.elapsedSec < minDuration) {
    return {
      verified: false,
      reason: en
        ? 'Match elapsed time fell below the valid threshold; excluded from rankings.'
        : '경기 시간이 정상 기준보다 짧아 랭킹 기록에서 제외되었습니다.',
    };
  }

  if (params.flips > maxFlipsForDuration || params.cpm > MAX_VERIFIED_CPM) {
    return {
      verified: false,
      reason: en
        ? 'Score exceeded verified human thresholds; excluded from rankings.'
        : '허용 범위를 초과한 비정상 기록으로 판단되어 랭킹 기록에서 제외되었습니다.',
    };
  }

  // Statistical cadence check for robotic fixed-interval or impossibly fast macro input
  const intervals = state.interKeyIntervals;
  if (intervals.length >= 25) {
    const sorted = [...intervals].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, sorted.length - 1);
    const mean = trimmed.reduce((acc, v) => acc + v, 0) / trimmed.length;
    const variance =
      trimmed.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / trimmed.length;
    const stdDev = Math.sqrt(variance);

    if (mean < 14) {
      return {
        verified: false,
        reason: en
          ? 'Physically impossible typing cadence detected; excluded from rankings.'
          : '물리적으로 불가능한 연속 입력 속도가 감지되어 랭킹 기록에서 제외되었습니다.',
      };
    }

    if (mean < 45 && stdDev < 3.2) {
      return {
        verified: false,
        reason: en
          ? 'Fixed-interval macro typing cadence detected; excluded from rankings.'
          : '일정한 주기의 매크로 입력 패턴이 감지되어 랭킹 기록에서 제외되었습니다.',
      };
    }
  }

  return { verified: true, reason: null };
}
