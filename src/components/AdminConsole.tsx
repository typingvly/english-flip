import { useEffect, useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  ArrowLeft,
  Check,
  Edit3,
  EyeOff,
  LogOut,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  Trash2,
  X,
} from 'lucide-react';
import {
  adminDeleteLeaderboardEntry,
  adminForceRenamePlayer,
  adminSetPlayerScore,
  adminSetTestAccount,
  approveModerationReport,
  isAdminUser,
  rejectModerationReport,
  signInAdminWithGoogle,
  signOutAdmin,
  subscribeModerationReports,
} from '../services/admin';
import {
  COPY,
  formatSpeedUnit,
  getDisplayRank,
} from '../i18n/translations';
import { LeaderboardEntry, subscribeLeaderboard } from '../services/leaderboard';
import { AppLanguage, ModerationReport, ThemeConfig } from '../types/game';
import { MAX_VERIFIED_FLIPS } from '../utils/antiCheat';

interface AdminConsoleProps {
  nickname: string;
  authUser: User | null;
  lang: AppLanguage;
  theme: ThemeConfig;
  onExit: () => void;
}

type AdminTab = 'reports' | 'users';
type ReportFilter = 'pending' | 'approved' | 'rejected' | 'all';
type UserFilter = 'all' | 'public' | 'test';

function formatTimestamp(ms?: number): string {
  if (!ms) return '-';
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${mm}/${dd} ${hh}:${min}`;
}

export function AdminConsole({
  nickname,
  authUser,
  lang,
  theme,
  onExit,
}: AdminConsoleProps) {
  const t = COPY[lang].admin;
  const [activeTab, setActiveTab] = useState<AdminTab>('reports');
  const [reportFilter, setReportFilter] = useState<ReportFilter>('pending');
  const [userFilter, setUserFilter] = useState<UserFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reports, setReports] = useState<ModerationReport[]>([]);
  const [users, setUsers] = useState<LeaderboardEntry[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Inline editor states (rename, score edit, delete confirmation)
  const [editingRenameId, setEditingRenameId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [editingScoreId, setEditingScoreId] = useState<string | null>(null);
  const [scoreDraft, setScoreDraft] = useState('0');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const authorized = isAdminUser(authUser);

  useEffect(() => {
    if (!authorized) {
      setReports([]);
      return;
    }

    const unsubReports = subscribeModerationReports(
      (list) => setReports(list),
      () => {
        setStatusBanner({
          type: 'error',
          message:
            lang === 'en'
              ? 'Missing permission or failed to load moderation reports.'
              : '리포트를 불러올 권한이 없거나 오류가 발생했습니다.',
        });
      },
    );

    const unsubUsers = subscribeLeaderboard(
      (list) => setUsers(list),
      () => {},
      { includeTestAccounts: true },
    );

    return () => {
      unsubReports();
      unsubUsers();
    };
  }, [authorized, lang]);

  const showFeedback = (type: 'success' | 'error', message: string) => {
    setStatusBanner({ type, message });
  };

  const handleGoogleAuth = async () => {
    setAuthError(null);
    setAuthLoading(true);
    try {
      await signInAdminWithGoogle();
    } catch (err) {
      setAuthError(
        err instanceof Error ? err.message : t.authFailed,
      );
    } finally {
      setAuthLoading(false);
    }
  };

  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === 'pending').length,
    [reports],
  );

  const filteredReports = useMemo(() => {
    return reports.filter((r) =>
      reportFilter === 'all' ? true : r.status === reportFilter,
    );
  }, [reports, reportFilter]);

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      if (userFilter === 'public' && u.isTestAccount) return false;
      if (userFilter === 'test' && !u.isTestAccount) return false;
      if (!q) return true;
      return (
        u.nickname.toLowerCase().includes(q) ||
        u.playerId.toLowerCase().includes(q)
      );
    });
  }, [users, userFilter, searchQuery]);

  const handleApprove = async (report: ModerationReport) => {
    setBusyId(report.reportId);
    try {
      await approveModerationReport(report);
      showFeedback(
        'success',
        `${report.nickname} (${report.flips}판) 기록이 승인되어 리더보드에 반영되었습니다.`,
      );
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '승인 처리에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (report: ModerationReport, resetScore: boolean) => {
    setBusyId(report.reportId);
    try {
      await rejectModerationReport(report, { resetLeaderboardScore: resetScore });
      showFeedback(
        'success',
        resetScore
          ? `${report.nickname} 리포트를 거절하고 리더보드 점수를 0판으로 초기화했습니다.`
          : `${report.nickname} 리포트를 거절 처리했습니다.`,
      );
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '거절 처리에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleForceRename = async (playerId: string) => {
    setBusyId(playerId);
    try {
      const updatedName = await adminForceRenamePlayer(playerId, renameDraft);
      setEditingRenameId(null);
      setRenameDraft('');
      showFeedback('success', `닉네임을 '${updatedName}'(으)로 강제 변경했습니다.`);
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '닉네임 강제 변경에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSetScore = async (playerId: string, nextScore: number) => {
    setBusyId(playerId);
    try {
      await adminSetPlayerScore(playerId, nextScore);
      setEditingScoreId(null);
      showFeedback(
        'success',
        `기록을 ${Math.max(0, Math.min(MAX_VERIFIED_FLIPS, Math.floor(nextScore)))}판으로 수정했습니다.`,
      );
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '점수 수정에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleTest = async (entry: LeaderboardEntry) => {
    setBusyId(entry.playerId);
    const nextVal = !entry.isTestAccount;
    try {
      await adminSetTestAccount(entry.playerId, nextVal);
      showFeedback(
        'success',
        nextVal
          ? `${entry.nickname} 계정을 테스트 계정으로 지정했습니다. 공개 리더보드에서 숨겨집니다.`
          : `${entry.nickname} 계정의 테스트 지정을 해제했습니다.`,
      );
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '테스트 계정 설정에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteEntry = async (entry: LeaderboardEntry) => {
    setBusyId(entry.playerId);
    try {
      await adminDeleteLeaderboardEntry(entry.playerId);
      setConfirmDeleteId(null);
      showFeedback(
        'success',
        `${entry.nickname} 계정의 리더보드 기록을 완전히 삭제했습니다.`,
      );
    } catch (err) {
      showFeedback(
        'error',
        err instanceof Error ? err.message : '리더보드 삭제에 실패했습니다.',
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div
      className="min-h-screen w-full transition-colors duration-200"
      style={{
        backgroundColor: theme.bg,
        color: theme.text,
      }}
    >
      <div className="w-full max-w-[1040px] mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {/* Top Admin Navigation (Game Board & Tiles completely hidden) */}
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: theme.accent,
                color: theme.accentText,
              }}
            >
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="text-lg sm:text-xl font-bold tracking-tight">
                  EnglishFlip Admin
                </h1>
                <span
                  className="font-mono-typing text-xs font-medium"
                  style={{ color: theme.accent }}
                >
                  @{nickname || 'Semistry'}
                </span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: theme.muted }}>
                {t.subtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {authorized && authUser?.email && (
              <button
                type="button"
                onClick={() => void signOutAdmin()}
                className="h-10 px-3.5 rounded-xl flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-85 cursor-pointer"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.muted,
                }}
                title={t.signOutTitle}
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{authUser.email}</span>
                <span>{t.signOut}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onExit}
              className="h-10 px-4 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-opacity hover:opacity-90 cursor-pointer"
              style={{
                backgroundColor: theme.surfaceElevated,
                color: theme.text,
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>{t.backToGame}</span>
            </button>
          </div>
        </header>

        {/* Gate: Google Admin Verification Required */}
        {!authorized ? (
          <div className="py-12 flex items-center justify-center">
            <div
              className="w-full max-w-[460px] rounded-2xl p-7 shadow-2xl space-y-5 text-center"
              style={{
                backgroundColor: theme.surfaceElevated,
              }}
            >
              <div
                className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center"
                style={{
                  backgroundColor: theme.surface,
                  color: theme.accent,
                }}
              >
                <Shield className="w-6 h-6" />
              </div>

              <div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {t.gateTitle}
                </h2>
                <p
                  className="text-xs mt-2 leading-relaxed"
                  style={{ color: theme.muted }}
                >
                  {t.gateDesc}
                </p>
              </div>

              {authError && (
                <div
                  className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                  style={{
                    backgroundColor: theme.surface,
                    color: theme.aiTile,
                  }}
                >
                  {authError}
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleGoogleAuth()}
                disabled={authLoading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-50"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.accentText,
                }}
              >
                {authLoading ? t.verifying : t.googleAuthBtn}
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Feedback Banner */}
            {statusBanner && (
              <div
                className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs"
                style={{
                  backgroundColor: theme.surfaceElevated,
                  color:
                    statusBanner.type === 'error' ? theme.aiTile : theme.accent,
                }}
              >
                <span>{statusBanner.message}</span>
                <button
                  type="button"
                  onClick={() => setStatusBanner(null)}
                  aria-label="알림 닫기"
                  className="opacity-75 hover:opacity-100 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Main Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div
                className="inline-flex rounded-xl p-1 gap-1"
                style={{ backgroundColor: theme.surface }}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab('reports')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
                  style={{
                    backgroundColor:
                      activeTab === 'reports' ? theme.accent : 'transparent',
                    color:
                      activeTab === 'reports' ? theme.accentText : theme.muted,
                  }}
                >
                  <span>{t.tabReports}</span>
                  <span className="font-mono-typing tabular-nums">
                    ({pendingCount})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className="px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-2"
                  style={{
                    backgroundColor:
                      activeTab === 'users' ? theme.accent : 'transparent',
                    color: activeTab === 'users' ? theme.accentText : theme.muted,
                  }}
                >
                  <span>{t.tabUsers}</span>
                  <span className="font-mono-typing tabular-nums">
                    ({users.length})
                  </span>
                </button>
              </div>
            </div>

            {/* TAB 1: Moderation Reports */}
            {activeTab === 'reports' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['pending', t.filterPending],
                      ['approved', t.filterApproved],
                      ['rejected', t.filterRejected],
                      ['all', t.filterAll],
                    ] as const
                  ).map(([key, label]) => {
                    const selected = reportFilter === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setReportFilter(key)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                        style={{
                          backgroundColor: selected
                            ? theme.surfaceElevated
                            : theme.surface,
                          color: selected ? theme.text : theme.muted,
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                {filteredReports.length === 0 ? (
                  <div
                    className="rounded-2xl py-16 text-center text-sm"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      color: theme.muted,
                    }}
                  >
                    {t.noReports}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredReports.map((report) => {
                      const isHighScore = report.category === 'high_score';
                      const isBusy = busyId === report.reportId || busyId === report.playerId;
                      const maxPace = Math.max(120, ...report.paceCpms);
                      const canApproveToBoard = report.flips <= MAX_VERIFIED_FLIPS;

                      return (
                        <div
                          key={report.reportId}
                          className="rounded-2xl p-5 shadow-lg space-y-4"
                          style={{ backgroundColor: theme.surfaceElevated }}
                        >
                          {/* Top Row */}
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="text-xs font-semibold px-2.5 py-1 rounded-lg"
                                  style={{
                                    backgroundColor: theme.surface,
                                    color: isHighScore
                                      ? theme.accent
                                      : theme.aiTile,
                                  }}
                                >
                                  {isHighScore ? t.badgeHighScore : t.badgeSuspicious}
                                </span>
                                <span className="font-mono-typing text-base font-semibold">
                                  {report.nickname}
                                </span>
                                <span
                                  className="font-mono-typing text-[11px]"
                                  style={{ color: theme.muted }}
                                >
                                  {report.playerId.slice(0, 14)}
                                </span>
                              </div>
                              <div
                                className="text-xs flex items-center gap-1.5"
                                style={{
                                  color: isHighScore ? theme.muted : theme.aiTile,
                                }}
                              >
                                {!isHighScore && (
                                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                )}
                                <span>{report.reason}</span>
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div
                                className="font-mono-typing text-xs"
                                style={{ color: theme.muted }}
                              >
                                {formatTimestamp(report.createdAtMs)}
                              </div>
                              <div
                                className="text-xs font-semibold mt-0.5"
                                style={{
                                  color:
                                    report.status === 'approved'
                                      ? theme.accent
                                      : report.status === 'rejected'
                                        ? theme.aiTile
                                        : theme.text,
                                }}
                              >
                                {report.status === 'pending'
                                  ? t.statusPending
                                  : report.status === 'approved'
                                    ? t.statusApproved
                                    : t.statusRejected}
                              </div>
                            </div>
                          </div>

                          {/* Key Stats Grid */}
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                            {[
                              [t.statFlips, `${report.flips} : ${report.aiFlips}`],
                              [t.statMode, formatSpeedUnit(report.aiSpeed, lang)],
                              ['CPM', `${report.cpm}`],
                              ['RAW', `${report.rawCpm}`],
                              ['ACC', `${report.accuracy.toFixed(1)}%`],
                              [t.statTime, `${report.elapsedSec.toFixed(1)}s`],
                            ].map(([label, val]) => (
                              <div
                                key={label}
                                className="rounded-xl px-3 py-2 text-center"
                                style={{ backgroundColor: theme.surface }}
                              >
                                <div
                                  className="text-[10px]"
                                  style={{ color: theme.muted }}
                                >
                                  {label}
                                </div>
                                <div className="font-mono-typing text-sm font-semibold tabular-nums mt-0.5">
                                  {val}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Anti-Cheat Telemetry + 10s Pace Mini Graph */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div
                              className="rounded-xl p-3 space-y-1.5 text-xs"
                              style={{ backgroundColor: theme.surface }}
                            >
                              <div
                                className="text-[11px] font-medium"
                                style={{ color: theme.muted }}
                              >
                                {t.integrityTitle}
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono-typing tabular-nums text-[11px]">
                                <div className="flex justify-between">
                                  <span style={{ color: theme.muted }}>{t.untrustedEvents}</span>
                                  <span
                                    style={{
                                      color:
                                        report.untrustedCount > 0
                                          ? theme.aiTile
                                          : theme.text,
                                    }}
                                  >
                                    {report.untrustedCount}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: theme.muted }}>{t.bulkInjection}</span>
                                  <span
                                    style={{
                                      color:
                                        report.bulkInjectionCount > 0
                                          ? theme.aiTile
                                          : theme.text,
                                    }}
                                  >
                                    {report.bulkInjectionCount}
                                  </span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: theme.muted }}>{t.pasteBlocked}</span>
                                  <span>{report.pasteBlockedCount}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span style={{ color: theme.muted }}>{t.keyInterval}</span>
                                  <span>
                                    {report.interKeyMeanMs}±{report.interKeyStdDevMs}ms
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div
                              className="rounded-xl p-3 flex flex-col justify-between"
                              style={{ backgroundColor: theme.surface }}
                            >
                              <div
                                className="text-[11px] font-medium mb-2"
                                style={{ color: theme.muted }}
                              >
                                {t.paceTitle}
                              </div>
                              <div className="grid grid-cols-6 gap-1.5 items-end h-12">
                                {report.paceCpms.map((cpm, idx) => {
                                  const hPct =
                                    cpm > 0
                                      ? Math.max(15, Math.round((cpm / maxPace) * 100))
                                      : 8;
                                  return (
                                    <div
                                      key={idx}
                                      className="flex flex-col items-center justify-end h-full gap-0.5"
                                    >
                                      <div className="w-full flex-1 flex items-end">
                                        <div
                                          className="w-full rounded-t"
                                          style={{
                                            height: `${hPct}%`,
                                            backgroundColor:
                                              cpm > 0 ? theme.accent : theme.bg,
                                          }}
                                        />
                                      </div>
                                      <span
                                        className="font-mono-typing text-[9px] tabular-nums"
                                        style={{ color: theme.muted }}
                                      >
                                        {cpm}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isBusy || !canApproveToBoard}
                                onClick={() => void handleApprove(report)}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-opacity hover:opacity-90 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{
                                  backgroundColor: theme.accent,
                                  color: theme.accentText,
                                }}
                                title={
                                  canApproveToBoard
                                    ? '리더보드에 정식 기록으로 반영'
                                    : `최대 상한(${MAX_VERIFIED_FLIPS}판) 초과 기록은 승인 불가`
                                }
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>{t.approveBtn}</span>
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleReject(report, false)}
                                className="px-3.5 py-2 rounded-xl text-xs font-medium transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-40"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.text,
                                }}
                              >
                                {t.rejectBtn}
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleReject(report, true)}
                                className="px-3.5 py-2 rounded-xl text-xs font-medium flex items-center gap-1.5 transition-opacity hover:opacity-85 cursor-pointer disabled:opacity-40"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.aiTile,
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{t.rejectResetBtn}</span>
                              </button>
                            </div>

                            {editingRenameId === report.playerId ? (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  value={renameDraft}
                                  onChange={(e) => setRenameDraft(e.target.value)}
                                  maxLength={16}
                                  placeholder={t.newNicknamePlaceholder}
                                  className="px-3 py-1.5 rounded-lg font-mono-typing text-xs outline-none w-36"
                                  style={{
                                    backgroundColor: theme.surface,
                                    color: theme.text,
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleForceRename(report.playerId)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                  style={{
                                    backgroundColor: theme.accent,
                                    color: theme.accentText,
                                  }}
                                >
                                  {t.save}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingRenameId(null)}
                                  className="px-2 py-1.5 rounded-lg text-xs cursor-pointer"
                                  style={{ color: theme.muted }}
                                >
                                  {t.cancel}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRenameId(report.playerId);
                                  setRenameDraft(report.nickname);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-opacity hover:opacity-85"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.muted,
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>{t.forceRenameBtn}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: Leaderboard & Users Management */}
            {activeTab === 'users' && (
              <div className="space-y-4">
                {/* Search & Filter Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div
                    className="flex-1 min-w-[220px] flex items-center gap-2 rounded-xl px-3.5 py-2.5"
                    style={{ backgroundColor: theme.surfaceElevated }}
                  >
                    <Search className="w-4 h-4 shrink-0" style={{ color: theme.muted }} />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t.searchPlaceholder}
                      className="w-full bg-transparent text-xs outline-none font-mono-typing"
                      style={{ color: theme.text }}
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        ['all', t.userFilterAll],
                        ['public', t.userFilterPublic],
                        ['test', t.userFilterTest],
                      ] as const
                    ).map(([key, label]) => {
                      const selected = userFilter === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setUserFilter(key)}
                          className="px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer"
                          style={{
                            backgroundColor: selected
                              ? theme.surfaceElevated
                              : theme.surface,
                            color: selected ? theme.text : theme.muted,
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {filteredUsers.length === 0 ? (
                  <div
                    className="rounded-2xl py-16 text-center text-sm"
                    style={{
                      backgroundColor: theme.surfaceElevated,
                      color: theme.muted,
                    }}
                  >
                    {t.noUsers}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUsers.map((entry) => {
                      const isBusy = busyId === entry.playerId;
                      const isEditingRename = editingRenameId === entry.playerId;
                      const isEditingScore = editingScoreId === entry.playerId;
                      const isConfirmDelete = confirmDeleteId === entry.playerId;

                      return (
                        <div
                          key={entry.playerId}
                          className="rounded-2xl p-4 shadow-md space-y-3"
                          style={{ backgroundColor: theme.surfaceElevated }}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-mono-typing text-sm font-semibold">
                                  {entry.nickname}
                                </span>
                                {entry.isTestAccount && (
                                  <span
                                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1"
                                    style={{
                                      backgroundColor: theme.surface,
                                      color: theme.accent,
                                    }}
                                  >
                                    <EyeOff className="w-3 h-3" />
                                    <span>{t.testBadge}</span>
                                  </span>
                                )}
                                <span
                                  className="font-mono-typing text-[11px]"
                                  style={{ color: theme.muted }}
                                >
                                  {entry.playerId.slice(0, 14)}
                                </span>
                              </div>
                              <div
                                className="font-mono-typing text-xs mt-1 tabular-nums flex flex-wrap items-center gap-3"
                                style={{ color: theme.muted }}
                              >
                                <span>
                                  {t.bestFlipsLabel}{' '}
                                  <strong style={{ color: theme.text }}>
                                    {entry.bestFlips}
                                  </strong>
                                </span>
                                <span>
                                  {t.rankLabel}{' '}
                                  <strong style={{ color: theme.accent }}>
                                    {getDisplayRank(entry.rank, lang)}
                                  </strong>
                                </span>
                                {entry.bestCpm !== undefined && (
                                  <span>CPM: {entry.bestCpm}</span>
                                )}
                                <span>{t.syncEpoch} v{entry.recordEpoch ?? 0}</span>
                              </div>
                            </div>

                            {/* Primary Action Strip */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleToggleTest(entry)}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-85 disabled:opacity-45"
                                style={{
                                  backgroundColor: entry.isTestAccount
                                    ? theme.accent
                                    : theme.surface,
                                  color: entry.isTestAccount
                                    ? theme.accentText
                                    : theme.text,
                                }}
                              >
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>
                                  {entry.isTestAccount ? t.unsetTest : t.setTest}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setEditingRenameId(
                                    isEditingRename ? null : entry.playerId,
                                  );
                                  setRenameDraft(entry.nickname);
                                  setEditingScoreId(null);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-85"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.text,
                                }}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>{t.editNickname}</span>
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setEditingScoreId(
                                    isEditingScore ? null : entry.playerId,
                                  );
                                  setScoreDraft(String(entry.bestFlips));
                                  setEditingRenameId(null);
                                  setConfirmDeleteId(null);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-85"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.text,
                                }}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                <span>{t.editScore}</span>
                              </button>

                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => {
                                  setConfirmDeleteId(
                                    isConfirmDelete ? null : entry.playerId,
                                  );
                                  setEditingRenameId(null);
                                  setEditingScoreId(null);
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 cursor-pointer transition-opacity hover:opacity-85"
                                style={{
                                  backgroundColor: theme.surface,
                                  color: theme.aiTile,
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t.delete}</span>
                              </button>
                            </div>
                          </div>

                          {/* Inline Editors */}
                          {isEditingRename && (
                            <div
                              className="rounded-xl p-3 flex flex-wrap items-center gap-2"
                              style={{ backgroundColor: theme.surface }}
                            >
                              <span className="text-xs" style={{ color: theme.muted }}>
                                {t.newNicknamePlaceholder}:
                              </span>
                              <input
                                type="text"
                                value={renameDraft}
                                onChange={(e) => setRenameDraft(e.target.value)}
                                maxLength={16}
                                className="px-3 py-1.5 rounded-lg font-mono-typing text-xs outline-none flex-1 min-w-[160px]"
                                style={{
                                  backgroundColor: theme.bg,
                                  color: theme.text,
                                }}
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleForceRename(entry.playerId)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                style={{
                                  backgroundColor: theme.accent,
                                  color: theme.accentText,
                                }}
                              >
                                {t.save}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingRenameId(null)}
                                className="px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                                style={{ color: theme.muted }}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          )}

                          {isEditingScore && (
                            <div
                              className="rounded-xl p-3 flex flex-wrap items-center gap-2"
                              style={{ backgroundColor: theme.surface }}
                            >
                              <span className="text-xs" style={{ color: theme.muted }}>
                                {t.scorePlaceholder}:
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={MAX_VERIFIED_FLIPS}
                                value={scoreDraft}
                                onChange={(e) => setScoreDraft(e.target.value)}
                                className="px-3 py-1.5 rounded-lg font-mono-typing text-xs outline-none w-24 tabular-nums"
                                style={{
                                  backgroundColor: theme.bg,
                                  color: theme.text,
                                }}
                              />
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  void handleSetScore(
                                    entry.playerId,
                                    Number(scoreDraft || 0),
                                  )
                                }
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                style={{
                                  backgroundColor: theme.accent,
                                  color: theme.accentText,
                                }}
                              >
                                {t.applyScore}
                              </button>
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() => void handleSetScore(entry.playerId, 0)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                style={{
                                  backgroundColor: theme.bg,
                                  color: theme.aiTile,
                                }}
                              >
                                {t.resetZero}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingScoreId(null)}
                                className="px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                                style={{ color: theme.muted }}
                              >
                                {t.cancel}
                              </button>
                            </div>
                          )}

                          {isConfirmDelete && (
                            <div
                              className="rounded-xl p-3 flex flex-wrap items-center justify-between gap-2"
                              style={{ backgroundColor: theme.surface }}
                            >
                              <span className="text-xs" style={{ color: theme.aiTile }}>
                                {t.deleteConfirmText(entry.nickname)}
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleDeleteEntry(entry)}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                                  style={{
                                    backgroundColor: theme.aiTile,
                                    color: theme.aiTileText,
                                  }}
                                >
                                  {t.confirmDelete}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2.5 py-1.5 rounded-lg text-xs cursor-pointer"
                                  style={{ color: theme.muted }}
                                >
                                  {t.cancel}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
