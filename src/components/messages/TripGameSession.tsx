import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Circle, GameController, X } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { Message, TripMember } from '../../types';
import { Avatar } from '../common/Avatar';
import { useLanguage } from '../../context/LanguageContext';
import { GameLobby } from './GameLobby';
import { GameConfetti } from './GameConfetti';

type GameType = 'connect_four' | 'tic_tac_toe';
type GameStatus = 'lobby' | 'playing' | 'finished' | 'cancelled';
type GameSession = {
  id: string;
  trip_id: string;
  creator_id: string;
  host_id: string;
  game_type: GameType;
  status: GameStatus;
  players: string[];
  participant_ids: string[];
  config: { bestOf?: number };
  state: {
    board?: Array<string | null> | Array<Array<string | null>>;
    moveCount?: number;
    winningLine?: number[][] | number[][][];
    scores?: Record<string, number>;
  };
  winner_id: string | null;
  rematch_votes: string[];
  rematch_declines: string[];
  rematch_game_id: string | null;
};

interface TripGameSessionProps {
  gameId: string;
  userId: string;
  members: TripMember[];
  sendMessage: (
    content: string,
    imageUrl?: string,
    replyToId?: string,
    type?: Message['type'],
    metadata?: Message['metadata'],
  ) => Promise<void>;
  onClose: () => void;
  onOpenGame: (gameId: string) => void;
}

const GAME_NAMES: Record<GameType, string> = {
  connect_four: 'Connect Four',
  tic_tac_toe: 'Tic-Tac-Toe',
};

const rpcErrorMessage = (message: string, t: (key: string) => string) => {
  if (message.includes('already full')) return t('This game is already full');
  if (message.includes('already in another active game')) return t('You are already in another active game');
  if (message.includes('not your turn')) return t('It is not your turn');
  return message;
};

export const TripGameSession: React.FC<TripGameSessionProps> = ({
  gameId,
  userId,
  members,
  sendMessage,
  onClose,
  onOpenGame,
}) => {
  const { t } = useLanguage();
  const [session, setSession] = useState<GameSession | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadSession = useCallback(async () => {
    if (!supabase) {
      setError(t('Games require an online connection.'));
      return;
    }
    const client = supabase;
    const { data, error: loadError } = await client
      .from('trip_game_sessions')
      .select('id, trip_id, creator_id, host_id, game_type, status, players, participant_ids, config, state, winner_id, rematch_votes, rematch_declines, rematch_game_id')
      .eq('id', gameId)
      .maybeSingle();
    if (loadError) {
      console.error('Could not load game session:', loadError);
      setError(t('Could not load the game. Please try again.'));
      return;
    }
    if (!data) {
      setError(t('This game is no longer available.'));
      return;
    }
    const loaded = data as GameSession;
    setSession(loaded);
  }, [gameId, t]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void loadSession();
    const channel = client
      .channel(`trip-game-session:${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_game_sessions',
        filter: `id=eq.${gameId}`,
      }, () => { void loadSession(); })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [gameId, loadSession]);

  useEffect(() => {
    if (session?.rematch_game_id) onOpenGame(session.rematch_game_id);
  }, [session?.rematch_game_id, onOpenGame]);

  useEffect(() => {
    if (!session || session.status !== 'lobby' || session.players.includes(userId)) return;
    let cancelled = false;
    const join = async () => {
      if (!supabase) return;
      const { error: joinError } = await supabase.rpc('join_trip_game_session', { p_session_id: session.id });
      if (cancelled) return;
      if (joinError) {
        console.error('Could not join game session:', joinError);
        setError(rpcErrorMessage(joinError.message, t));
      } else {
        await loadSession();
      }
    };
    void join();
    return () => { cancelled = true; };
  }, [session?.id, session?.status, session?.players, userId, loadSession, t]);

  const memberName = useCallback((id: string) => (
    members.find((member) => member.user_id === id)?.profile?.display_name || t('Member')
  ), [members, t]);
  const winnerName = session?.winner_id ? memberName(session.winner_id) : null;
  const maxPlayers = 2;
  const playerProfiles = useMemo(() => (
    (session?.players || []).map((id) => members.find((member) => member.user_id === id)).filter((member) => member?.profile)
  ), [members, session?.players]);
  const winningCells = useMemo(() => {
    const source = session?.state.winningLine || [];
    return new Set((source as number[][]).map((cell) => cell.join(',')));
  }, [session?.state.winningLine]);
  const winningLine = (session?.state.winningLine as number[][] | undefined) || [];
  const currentPlayer = session?.players[((session.state.moveCount || 0) % 2)];

  const rematchResolved = Boolean(session
    && session.rematch_votes.length + session.rematch_declines.length >= session.participant_ids.length);
  const myRematchVote = session?.rematch_votes.includes(userId)
    ? true
    : session?.rematch_declines.includes(userId) ? false : null;

  const runAction = async (action: () => PromiseLike<{ error: { message: string } | null }>) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    let succeeded = false;
    try {
      const result = await action();
      if (result.error) {
        console.error('Game action failed:', result.error);
        setError(rpcErrorMessage(result.error.message, t));
      } else {
        succeeded = true;
        await loadSession();
      }
    } finally {
      setBusy(false);
    }
    return succeeded;
  };

  const startGame = async () => {
    if (!supabase || !session) return;
    await runAction(() => supabase!.rpc('start_trip_game_session', { p_session_id: session.id }));
  };

  const leaveGame = async () => {
    if (session && supabase && session.status !== 'finished' && session.status !== 'cancelled') {
      await runAction(() => supabase!.rpc('leave_trip_game_session', { p_session_id: session.id }));
    }
    onClose();
  };

  const playMove = (position: number) => {
    if (!supabase || !session) return;
    void runAction(() => supabase!.rpc('play_trip_game_move', {
      p_session_id: session.id,
      p_position: position,
    }));
  };

  const voteRematch = async (rematch: boolean) => {
    if (!supabase || !session || session.status !== 'finished' || busy || rematchResolved) return false;
    setBusy(true);
    setError('');
    try {
      const { data: newGameId, error: voteError } = await supabase.rpc('vote_trip_game_rematch', {
        p_session_id: session.id,
        p_rematch: rematch,
      });
      if (voteError) {
        console.error('Could not submit rematch vote:', voteError);
        setError(rpcErrorMessage(voteError.message, t));
        return false;
      }
      await loadSession();
      if (newGameId) {
        try {
          await sendMessage(
            `${t(GAME_NAMES[session.game_type])} — ${t('join the game!')}`,
            undefined,
            undefined,
            'game_session',
            { gameSessionId: newGameId, gameType: session.game_type },
          );
        } catch (sendError) {
          console.error('Could not post rematch invitation:', sendError);
          setError(t('The rematch was created, but its chat invitation could not be sent.'));
        }
        onOpenGame(newGameId);
      }
      return true;
    } catch (voteError) {
      console.error('Could not submit rematch vote:', voteError);
      setError(t('Could not submit your rematch vote.'));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const handleBackToGames = async () => {
    if (!rematchResolved && myRematchVote === null) {
      const saved = await voteRematch(false);
      if (!saved) return;
    }
    onClose();
  };

  if (!session) {
    return (
      <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-black/95 px-6 text-white">
        <div className="max-w-sm text-center">
          <p role="alert" className="text-sm text-red-200">{error || t('Loading game…')}</p>
          <button type="button" onClick={onClose} className="mt-4 min-h-11 rounded-full bg-white/10 px-5 text-sm font-semibold">{t('Back to games')}</button>
        </div>
      </div>
    );
  }

  const lobby = session.status === 'lobby';
  const board = session.state.board;
  const isTicTacToe = session.game_type === 'tic_tac_toe';
  const cells = isTicTacToe ? (board as Array<string | null> | undefined) || [] : [];
  const connectBoard = !isTicTacToe ? (board as Array<Array<string | null>> | undefined) || [] : [];
  const winningMarker = winningLine.length > 0
    ? isTicTacToe
      ? cells[winningLine[0][0] * 3 + winningLine[0][1]]
      : connectBoard[winningLine[0][0]]?.[winningLine[0][1]]
    : null;
  const winningColor = winningMarker === 'O' ? '#FF453A' : '#0A84FF';
  return (
    <div data-no-edge-swipe className="fixed inset-0 z-[12000] flex flex-col bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 px-4">
        {session.status !== 'finished' && session.status !== 'cancelled' && (
          <button type="button" onClick={() => void leaveGame()} aria-label={t('Leave game')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <ArrowLeft size={21} />
          </button>
        )}
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
          <GameController size={20} weight="fill" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{t(GAME_NAMES[session.game_type])}</h1>
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-5">
        {lobby ? (
          <GameLobby
            title={t('Game lobby')}
            icon={<GameController size={20} weight="fill" />}
            players={session.players}
            hostId={session.host_id}
            userId={userId}
            members={members}
            minPlayers={2}
            maxPlayers={maxPlayers}
            busy={busy}
            onStart={() => void startGame()}
            onJoin={() => void runAction(() => supabase!.rpc('join_trip_game_session', { p_session_id: session.id }))}
            onLeave={() => void leaveGame()}
          >
          </GameLobby>
        ) : (session.status === 'playing' || session.status === 'finished') ? (
          <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 pb-4">
            <div className="flex w-full items-center justify-between">
              {session.players.slice(0, 2).map((id, index) => {
                const member = members.find((item) => item.user_id === id);
                return member?.profile ? (
                  <div key={id} className={`flex items-center gap-2 ${currentPlayer === id ? 'text-white' : 'text-white/50'}`}>
                    <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={34} />
                    <span className="text-sm font-semibold">{member.profile.display_name}</span>
                    <span
                      aria-label={index === 0 ? t('Blue player') : t('Red player')}
                      className={`h-3.5 w-3.5 shrink-0 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.45)] ${index === 0 ? 'bg-[#0A84FF]' : 'bg-[#FF453A]'}`}
                    />
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-sm font-semibold text-white/70">
              {session.status === 'finished'
                ? winnerName ? `${winnerName} ${t('wins!')}` : t('It’s a draw')
                : currentPlayer === userId ? t('Your turn') : `${memberName(currentPlayer || '')} ${t('is thinking…')}`}
            </p>
            {isTicTacToe ? (
              <div className="relative aspect-square w-full max-w-[min(84vw,390px)] rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-3">
                <div className="absolute inset-3 grid grid-cols-3 grid-rows-3 gap-0 overflow-hidden rounded-2xl">
                  {cells.map((cell, index) => (
                    <button
                      key={index}
                      type="button"
                      disabled={session.status !== 'playing' || currentPlayer !== userId || Boolean(cell)}
                      onClick={() => playMove(index)}
                      className={`relative flex min-h-0 min-w-0 items-center justify-center border border-black/40 bg-[#2a2a2e] transition-colors disabled:cursor-default ${winningCells.has(`${Math.floor(index / 3)},${index % 3}`) ? 'bg-[#0A84FF]/30' : ''}`}
                    >
                      {cell === 'X' && <X size={44} weight="bold" className="h-11 w-11 shrink-0 text-[#0A84FF]" />}
                      {cell === 'O' && <Circle size={42} weight="bold" className="h-11 w-11 shrink-0 text-[#FF453A]" />}
                    </button>
                  ))}
                </div>
                {winningLine.length === 3 && (
                  <motion.svg
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="pointer-events-none absolute inset-3 z-10 h-[calc(100%-24px)] w-[calc(100%-24px)] overflow-visible"
                    aria-hidden="true"
                  >
                    <motion.path
                      d={`M ${(winningLine[0][1] + 0.5) * 100 / 3} ${(winningLine[0][0] + 0.5) * 100 / 3} L ${(winningLine[2][1] + 0.5) * 100 / 3} ${(winningLine[2][0] + 0.5) * 100 / 3}`}
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.65, ease: 'easeInOut' }}
                      fill="none"
                      stroke={winningColor}
                      strokeWidth="6"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </motion.svg>
                )}
              </div>
            ) : (
              <div className="w-full max-w-[min(94vw,560px)] rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-3">
                <div className="relative">
                  <div className="grid aspect-[7/6] grid-cols-7 grid-rows-6 gap-0 overflow-hidden rounded-xl">
                    {connectBoard.flatMap((row, rowIndex) => row.map((cell, columnIndex) => (
                      <div
                        key={`${rowIndex}-${columnIndex}`}
                        className={`relative min-h-0 min-w-0 overflow-hidden border border-[#1c1c1e] bg-[#2a2a2e] ${winningCells.has(`${rowIndex},${columnIndex}`) ? 'bg-[#0A84FF]/25' : ''}`}
                      >
                        {cell && (
                          <motion.span
                            initial={{ y: -60, opacity: 0.8 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                            className={`pointer-events-none absolute inset-1 rounded-full ${cell === 'X' ? 'bg-[#0A84FF]' : 'bg-[#FF453A]'}`}
                          />
                        )}
                      </div>
                    )))}
                  </div>
                  {winningLine.length === 4 && (
                    <motion.svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
                      <motion.path
                        d={`M ${(winningLine[0][1] + 0.5) * 100 / 7} ${(winningLine[0][0] + 0.5) * 100 / 6} L ${(winningLine[3][1] + 0.5) * 100 / 7} ${(winningLine[3][0] + 0.5) * 100 / 6}`}
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.75, ease: 'easeInOut' }}
                        fill="none"
                        stroke={winningColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    </motion.svg>
                  )}
                  <div className="absolute inset-0 grid grid-cols-7" aria-label={t('Choose a column')}>
                    {Array.from({ length: 7 }).map((_, column) => (
                      <button
                        key={column}
                        type="button"
                        aria-label={`${t('Drop disc in column')} ${column + 1}`}
                        disabled={session.status !== 'playing' || currentPlayer !== userId || connectBoard[0]?.[column] !== null}
                        onClick={() => playMove(column)}
                        className="min-w-0 cursor-pointer disabled:cursor-default"
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {session.status === 'finished' && (
              <div className="pointer-events-none fixed inset-0 z-[12003] flex items-center justify-center px-5">
                <GameConfetti />
                <div className="text-center">
                  <h2 className="inline-block rounded-full bg-black/55 px-5 py-3 text-2xl font-extrabold shadow-xl backdrop-blur-sm">{winnerName ? `${winnerName} ${t('wins!')}` : t('It’s a draw')}</h2>
                  {session.rematch_votes.length > 0 && !session.rematch_game_id && (
                    <p className="mx-auto mt-3 max-w-sm text-sm text-white/75">
                      {session.rematch_votes.map(memberName).join(', ')} {t('want a rematch')}
                    </p>
                  )}
                  {rematchResolved && !session.rematch_game_id && (
                    <p className="mt-2 text-sm font-semibold text-white/75">{t('Rematch declined')}</p>
                  )}
                  <div className="pointer-events-auto fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-4 right-4 mx-auto flex max-w-sm flex-wrap justify-center gap-2">
                    <button type="button" disabled={busy || rematchResolved || myRematchVote !== null} onClick={() => void voteRematch(true)} className={`min-h-12 min-w-[120px] flex-1 rounded-full text-sm font-bold disabled:opacity-60 ${myRematchVote === true ? 'bg-[#0A84FF] text-white' : 'bg-white/[0.08] text-white'}`}>
                      {t('Rematch')}
                    </button>
                    <button type="button" disabled={busy} onClick={() => void handleBackToGames()} className="min-h-12 min-w-[120px] flex-1 rounded-full border border-white/15 bg-white/[0.06] text-sm font-semibold disabled:opacity-60">{t('Back to games')}</button>
                  </div>
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 text-center">
            <h2 className="text-2xl font-extrabold">{session.status === 'cancelled' ? t('Game cancelled') : winnerName ? `${winnerName} ${t('wins!')}` : t('It’s a draw')}</h2>
            <div className="flex w-full gap-3">
              <button type="button" onClick={onClose} className="min-h-12 w-full rounded-full border border-white/15 bg-white/[0.06] text-sm font-semibold">{t('Back to games')}</button>
            </div>
          </section>
        )}
        {error && <p role="alert" className={`mx-auto mt-3 max-w-lg rounded-xl px-3 py-2 text-sm ${error.startsWith(t('Correct')) ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>{error}</p>}
      </main>
    </div>
  );
};
