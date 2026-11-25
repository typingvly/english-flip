import { useEffect, useState } from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { History, LogIn, LogOut, User, X } from 'lucide-react';
import { getRank } from '../data/words';
import { COPY, formatSpeedUnit, getDisplayRank } from '../i18n/translations';
import { LegacyLeaderboardCandidate } from '../services/auth';
import { fetchPlayerProfile, loadLocalProfile } from '../services/profile';
import { AppLanguage, PlayerProfileStats, ThemeConfig } from '../types/game';

interface ProfileModalProps {
  open: boolean;
  playerId: string;
  nickname: string;
  authUser: FirebaseUser | null;
  authBusy?: boolean;
  legacyCandidate?: LegacyLeaderboardCandidate | null;
  lang: AppLanguage;
  theme: ThemeConfig;
  onSignInGoogle: () => void;
  onSignOutGoogle: () => void;
  onOpenNicknameSetup: () => void;
  onOpenNicknameEdit: () => void;
  onOpenLegacyClaim?: () => void;
  onClose: () => void;
}

const ELITE_RANKS = new Set(['L을가져가', 'L+', 'L', 'X+', 'X']);

function formatMatchDate(ms: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

export function ProfileModal({
  open,
  playerId,
  nickname,
  authUser,
  authBusy,
  legacyCandidate,
  lang,
  theme,
  onSignInGoogle,
  onSignOutGoogle,
  onOpenNicknameSetup,
  onOpenNicknameEdit,
  onOpenLegacyClaim,
  onClose,
}: ProfileModalProps) {
  const [profile, setProfile] = useState<PlayerProfileStats>(() => loadLocalProfile(playerId));
  const [loading, setLoading] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  const isSignedIn = Boolean(authUser && authUser.emailVerified);
  const t = COPY[lang].profile;

  useEffect(() => {
    setAvatarError(false);
  }, [authUser?.photoURL]);

  useEffect(() => {
    if (!open) return;
    setProfile(loadLocalProfile(playerId));
    if (!isSignedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let cancelled = false;

    void fetchPlayerProfile(playerId, true)
      .then((loaded) => {
        if (!cancelled) setProfile(loaded);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, playerId, isSignedIn]);

  if (!open) return null;

  const avgAccuracy =
    profile.totalGames > 0
      ? Math.round((profile.totalAccuracySum / profile.totalGames) * 10) / 10
      : 0;
  const bestRank = profile.bestFlips > 0 ? getRank(profile.bestFlips) : 'Unranked';
  const isElite = ELITE_RANKS.has(bestRank);
  const safePhotoUrl =
    authUser?.photoURL && authUser.photoURL.startsWith('https://') ? authUser.photoURL : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.48)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={t.dialogAria}
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
            <h2 className="text-base font-semibold tracking-tight">Player Profile</h2>
            <span className="text-xs" style={{ color: theme.muted }}>
              {t.subtitle}
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-80 cursor-pointer shrink-0"
            style={{
              backgroundColor: theme.surfaceElevated,
              color: theme.text,
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Google Account Card */}
          <div
            className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 font-semibold text-sm"
                style={{
                  backgroundColor: isSignedIn ? theme.accent : theme.bg,
                  color: isSignedIn ? theme.accentText : theme.muted,
                }}
              >
                {isSignedIn && safePhotoUrl && !avatarError ? (
                  <img
                    src={safePhotoUrl}
                    alt={authUser?.displayName || 'Google avatar'}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-4 h-4" />
                )}
              </div>

              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">
                  {isSignedIn
                    ? authUser?.displayName || authUser?.email || t.googleConnected
                    : t.guestMode}
                </div>
                <div className="text-[11px] truncate mt-0.5" style={{ color: theme.muted }}>
                  {isSignedIn ? authUser?.email || t.googleConnected : t.signInSync}
                </div>
              </div>
            </div>

            {isSignedIn ? (
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignOutGoogle}
                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: theme.bg,
                  color: theme.muted,
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>{t.signOut}</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={authBusy}
                onClick={onSignInGoogle}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50 shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                }}
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>{t.signInSync}</span>
              </button>
            )}
          </div>

          {/* Legacy / Guest Record Recovery Banner */}
          {isSignedIn && (!nickname || profile.bestFlips === 0) && legacyCandidate && onOpenLegacyClaim && (
            <div
              className="rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold" style={{ color: theme.accent }}>
                  {t.legacyAvailableTitle}
                </div>
                <div className="text-[11px] mt-0.5 leading-relaxed" style={{ color: theme.muted }}>
                  {t.legacyAvailableDesc(legacyCandidate.nickname, legacyCandidate.bestFlips)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenLegacyClaim();
                }}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                }}
              >
                <History className="w-3.5 h-3.5" />
                <span>{t.legacyClaimBtn}</span>
              </button>
            </div>
          )}

          {/* Player Identity Card */}
          <div
            className="rounded-xl p-4 flex items-center justify-between gap-4"
            style={{ backgroundColor: theme.surface }}
          >
            <div className="min-w-0">
              <div className="text-[11px] mb-0.5" style={{ color: theme.muted }}>
                {t.registeredNickname}
              </div>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="font-mono-typing text-lg font-semibold truncate">
                  {isSignedIn ? nickname || t.unregistered : t.guestNickname}
                </span>
                {isSignedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (nickname) {
                        onOpenNicknameEdit();
                      } else {
                        onOpenNicknameSetup();
                      }
                    }}
                    className="text-xs font-medium underline-offset-2 hover:underline cursor-pointer shrink-0"
                    style={{ color: theme.accent }}
                  >
                    {nickname ? t.change : t.register}
                  </button>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <div className="text-[11px] mb-0.5" style={{ color: theme.muted }}>
                {t.bestRank}
              </div>
              <div
                className="font-mono-typing text-2xl font-semibold leading-none"
                style={{ color: isElite ? theme.accent : theme.text }}
              >
                {getDisplayRank(bestRank, lang)}
              </div>
            </div>
          </div>

          {/* 4-Metric Career Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div
              className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="text-[11px]" style={{ color: theme.muted }}>
                {t.totalGames}
              </div>
              <div className="font-mono-typing text-base font-semibold tabular-nums mt-0.5">
                {profile.totalGames}
              </div>
            </div>

            <div
              className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="text-[11px]" style={{ color: theme.muted }}>
                {t.bestFlips}
              </div>
              <div
                className="font-mono-typing text-base font-semibold tabular-nums mt-0.5"
                style={{ color: theme.accent }}
              >
                {profile.bestFlips}
              </div>
            </div>

            <div
              className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="text-[11px]" style={{ color: theme.muted }}>
                {t.bestCpm}
              </div>
              <div className="font-mono-typing text-base font-semibold tabular-nums mt-0.5">
                {profile.bestCpm}
              </div>
            </div>

            <div
              className="rounded-xl px-3 py-2.5 text-center"
              style={{ backgroundColor: theme.surface }}
            >
              <div className="text-[11px]" style={{ color: theme.muted }}>
                {t.avgAccuracy}
              </div>
              <div className="font-mono-typing text-base font-semibold tabular-nums mt-0.5">
                {profile.totalGames > 0 ? `${avgAccuracy.toFixed(1)}%` : '-'}
              </div>
            </div>
          </div>

          {/* Recent Matches List */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-medium" style={{ color: theme.text }}>
                {t.recentMatches}
              </span>
              <span className="text-[11px]" style={{ color: theme.muted }}>
                {loading ? t.syncing : t.recentLimit}
              </span>
            </div>

            {profile.recentMatches.length === 0 ? (
              <div
                className="rounded-xl py-10 text-center text-xs px-4"
                style={{ backgroundColor: theme.surface, color: theme.muted }}
              >
                {t.emptyMatches}
              </div>
            ) : (
              <div className="space-y-1.5">
                {profile.recentMatches.map((m, idx) => {
                  const matchElite = ELITE_RANKS.has(m.rank);
                  return (
                    <div
                      key={m.matchId}
                      className="rounded-xl px-3.5 py-2.5 grid grid-cols-[54px_1fr_70px_68px_56px] items-center gap-2 text-xs"
                      style={{
                        backgroundColor: idx % 2 === 0 ? theme.surface : theme.bg,
                      }}
                    >
                      <span
                        className="font-semibold"
                        style={{
                          color: m.won
                            ? theme.accent
                            : m.flips === m.aiFlips
                              ? theme.muted
                              : theme.aiTile,
                        }}
                      >
                        {m.won ? t.win : m.flips === m.aiFlips ? t.draw : t.loss}
                      </span>

                      <div className="min-w-0">
                        <div className="font-mono-typing font-medium tabular-nums">
                          {m.flips} : {m.aiFlips}{' '}
                          <span className="text-[11px] font-normal" style={{ color: theme.muted }}>
                            · {formatSpeedUnit(m.aiSpeed, lang)}
                          </span>
                        </div>
                        <div className="font-mono-typing text-[10px]" style={{ color: theme.muted }}>
                          {formatMatchDate(m.createdAtMs)}
                        </div>
                      </div>

                      <div className="text-right font-mono-typing tabular-nums">
                        <div>{m.cpm}</div>
                        <div className="text-[10px]" style={{ color: theme.muted }}>
                          CPM
                        </div>
                      </div>

                      <div className="text-right font-mono-typing tabular-nums">
                        <div>{m.accuracy.toFixed(1)}%</div>
                        <div className="text-[10px]" style={{ color: theme.muted }}>
                          {t.accuracy}
                        </div>
                      </div>

                      <div
                        className="text-right font-mono-typing font-semibold"
                        style={{ color: matchElite ? theme.accent : theme.text }}
                      >
                        {getDisplayRank(m.rank, lang)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
