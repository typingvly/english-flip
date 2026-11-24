import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  fetchPlayerLeaderboardEntry,
  LeaderboardEntry,
  subscribeLeaderboard,
} from '../services/leaderboard';
import { ThemeConfig } from '../types/game';

interface LeaderboardModalProps {
  open: boolean;
  playerId: string;
  nickname: string;
  theme: ThemeConfig;
  onClose: () => void;
}

const ELITE_RANKS = new Set(['L을가져가', 'L+', 'L', 'X+', 'X']);

export function LeaderboardModal({
  open,
  playerId,
  nickname,
  theme,
  onClose,
}: LeaderboardModalProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myEntry, setMyEntry] = useState<LeaderboardEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!open) return;

    setLoading(true);
    setErrorMessage(null);

    const unsubscribe = subscribeLeaderboard(
      (list) => {
        setEntries(list);
        setLoading(false);
      },
      () => {
        setErrorMessage('리더보드 데이터를 불러오지 못했습니다.');
        setLoading(false);
      },
    );

    void fetchPlayerLeaderboardEntry(playerId)
      .then((entry) => setMyEntry(entry))
      .catch(() => {});

    return () => unsubscribe();
  }, [open, playerId, retryKey]);

  if (!open) return null;

  const myIndex = entries.findIndex((e) => e.playerId === playerId);
  const myPosition = myIndex >= 0 ? myIndex + 1 : null;
  const topEntries = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="리더보드"
    >
      <div
        className="w-full max-w-[580px] max-h-[86vh] flex flex-col rounded-2xl overflow-hidden shadow-2xl transition-colors"
        style={{
          backgroundColor: theme.surfaceElevated,
          color: theme.text,
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between gap-3"
          style={{ backgroundColor: theme.surface }}
        >
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-base font-semibold tracking-tight">Leaderboard</h2>
            <span className="text-xs" style={{ color: theme.muted }}>
              통합 최고 뒤집기 순위
            </span>
          </div>

          <div className="flex items-center gap-3">
            {!loading && !errorMessage && entries.length > 0 && (
              <span
                className="font-mono-typing text-xs tabular-nums"
                style={{ color: theme.muted }}
              >
                {entries.length}명
              </span>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer shrink-0"
              style={{
                backgroundColor: theme.surfaceElevated,
                color: theme.text,
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* My Current Record Summary */}
          {nickname && (
            <div
              className="rounded-xl px-4 py-3.5 flex items-center justify-between gap-4"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="min-w-0">
                <div className="text-[11px] mb-0.5" style={{ color: theme.muted }}>
                  내 최고 기록
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono-typing text-sm font-semibold truncate">
                    {nickname}
                  </span>
                  <span
                    className="font-mono-typing text-xs tabular-nums shrink-0"
                    style={{ color: myPosition !== null ? theme.accent : theme.muted }}
                  >
                    {myPosition !== null ? `#${myPosition}` : '순위 외'}
                  </span>
                </div>
              </div>

              <div className="flex items-baseline gap-4 font-mono-typing tabular-nums shrink-0">
                <div className="text-right">
                  <span className="text-xl font-semibold">
                    {myEntry ? myEntry.bestFlips : 0}
                  </span>
                  <span className="text-[11px] ml-1" style={{ color: theme.muted }}>
                    flips
                  </span>
                </div>
                <span
                  className="text-base font-semibold min-w-[36px] text-right"
                  style={{
                    color:
                      myEntry && ELITE_RANKS.has(myEntry.rank) ? theme.accent : theme.muted,
                  }}
                >
                  {myEntry ? myEntry.rank : 'E'}
                </span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-14 text-center text-sm" style={{ color: theme.muted }}>
              리더보드를 불러오는 중...
            </div>
          ) : errorMessage ? (
            <div className="py-14 text-center space-y-3.5">
              <div className="text-sm" style={{ color: theme.aiTile }}>
                {errorMessage}
              </div>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                className="px-4 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-85 cursor-pointer"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                }}
              >
                다시 시도
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-14 text-center text-sm" style={{ color: theme.muted }}>
              아직 등록된 기록이 없습니다. 첫 게임을 완료하면 자동으로 순위에 등록됩니다.
            </div>
          ) : (
            <>
              {/* Top 3 Showcase */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {topEntries.map((entry, idx) => {
                  const pos = idx + 1;
                  const isFirst = pos === 1;
                  const isSelf = entry.playerId === playerId;
                  const isElite = ELITE_RANKS.has(entry.rank);

                  return (
                    <div
                      key={entry.playerId}
                      className="rounded-xl p-4 flex flex-col justify-between gap-3 transition-colors"
                      style={{
                        backgroundColor: isFirst ? theme.accent : theme.surface,
                        color: isFirst ? theme.accentText : theme.text,
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="font-mono-typing text-xs font-semibold tabular-nums"
                          style={{
                            color: isFirst ? theme.accentText : theme.accent,
                            opacity: isFirst ? 0.85 : 1,
                          }}
                        >
                          #{pos}
                        </span>
                        <span
                          className="font-mono-typing text-xs font-semibold"
                          style={{
                            color: isFirst
                              ? theme.accentText
                              : isElite
                                ? theme.accent
                                : theme.muted,
                            opacity: isFirst ? 0.9 : 1,
                          }}
                        >
                          {entry.rank}
                        </span>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-mono-typing text-sm font-semibold truncate">
                            {entry.nickname}
                          </span>
                          {isSelf && (
                            <span
                              className="text-[11px] font-medium shrink-0"
                              style={{
                                color: isFirst ? theme.accentText : theme.accent,
                                opacity: isFirst ? 0.85 : 1,
                              }}
                            >
                              · 나
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-baseline gap-1 font-mono-typing tabular-nums">
                        <span className="text-2xl font-semibold leading-none">
                          {entry.bestFlips}
                        </span>
                        <span
                          className="text-[11px]"
                          style={{
                            color: isFirst ? theme.accentText : theme.muted,
                            opacity: isFirst ? 0.78 : 1,
                          }}
                        >
                          flips
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* #4+ Rankings List */}
              {restEntries.length > 0 && (
                <div>
                  <div
                    className="px-3.5 pb-2 grid grid-cols-[48px_1fr_88px_72px] items-center text-[11px] tracking-wide"
                    style={{ color: theme.muted }}
                  >
                    <span>순위</span>
                    <span>닉네임</span>
                    <span className="text-right">최고 뒤집기</span>
                    <span className="text-right">랭크</span>
                  </div>

                  <div className="space-y-1">
                    {restEntries.map((entry, idx) => {
                      const pos = idx + 4;
                      const isSelf = entry.playerId === playerId;
                      const isElite = ELITE_RANKS.has(entry.rank);

                      return (
                        <div
                          key={entry.playerId}
                          className="grid grid-cols-[48px_1fr_88px_72px] items-center px-3.5 py-2.5 text-sm rounded-xl transition-colors"
                          style={{
                            backgroundColor: isSelf
                              ? theme.surface
                              : idx % 2 === 0
                                ? theme.bg
                                : 'transparent',
                          }}
                        >
                          <span
                            className="font-mono-typing tabular-nums text-xs font-medium"
                            style={{ color: isSelf ? theme.accent : theme.muted }}
                          >
                            {pos}
                          </span>

                          <div className="flex items-center gap-2 min-w-0 pr-2">
                            <span
                              className={`font-mono-typing truncate ${
                                isSelf ? 'font-semibold' : 'font-normal'
                              }`}
                            >
                              {entry.nickname}
                            </span>
                            {isSelf && (
                              <span
                                className="text-[11px] font-medium shrink-0"
                                style={{ color: theme.accent }}
                              >
                                나
                              </span>
                            )}
                          </div>

                          <span className="font-mono-typing text-right tabular-nums font-medium">
                            {entry.bestFlips}
                          </span>

                          <span
                            className="font-mono-typing text-right font-semibold"
                            style={{ color: isElite ? theme.accent : theme.muted }}
                          >
                            {entry.rank}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
