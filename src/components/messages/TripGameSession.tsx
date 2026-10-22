import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, GameController, PaperPlaneTilt } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { Message, TripMember } from '../../types';
import { Avatar } from '../common/Avatar';
import { useLanguage } from '../../context/LanguageContext';
import { GameLobby } from './GameLobby';

type GameType = 'movie_trivia' | 'connect_four' | 'tic_tac_toe';
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
  config: { rounds?: number; timeLimit?: number; bestOf?: number };
  state: {
    board?: Array<string | null> | Array<Array<string | null>>;
    moveCount?: number;
    winningLine?: number[][] | number[][][];
    round?: number;
    rounds?: number;
    timeLimit?: number;
    prompt?: string;
    roundStartedAt?: string;
    revealedAnswer?: string | null;
    correctUsers?: Array<{ userId: string; points: number }>;
    scores?: Record<string, number>;
  };
  winner_id: string | null;
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
  movie_trivia: 'Movie Trivia',
  connect_four: 'Connect Four',
  tic_tac_toe: 'Tic-Tac-Toe',
};

const rpcErrorMessage = (message: string, t: (key: string) => string) => {
  if (message.includes('already full')) return t('This game is already full');
  if (message.includes('already in another active game')) return t('You are already in another active game');
  if (message.includes('not your turn')) return t('It is not your turn');
  if (message.includes('already answered')) return t('You already answered this round');
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
  const [answer, setAnswer] = useState('');
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [rounds, setRounds] = useState(5);
  const [timeLimit, setTimeLimit] = useState(30);
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const answerInputRef = useRef<HTMLInputElement>(null);

  const loadSession = useCallback(async () => {
    if (!supabase) {
      setError(t('Games require an online connection.'));
      return;
    }
    const client = supabase;
    const { data, error: loadError } = await client
      .from('trip_game_sessions')
      .select('id, trip_id, creator_id, host_id, game_type, status, players, participant_ids, config, state, winner_id')
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
    setRounds(loaded.config?.rounds || 5);
    setTimeLimit(loaded.config?.timeLimit || 30);
    if (loaded.game_type === 'movie_trivia' && loaded.status === 'playing' && loaded.state.round) {
      const { data: ownAnswers, error: answersError } = await client
        .from('trip_game_answers')
        .select('correct')
        .eq('session_id', gameId)
        .eq('round_number', loaded.state.round)
        .eq('user_id', userId);
      if (answersError) {
        console.error('Could not load the current trivia answer status:', answersError);
        setError(t('Could not load your answer status.'));
        return;
      }
      setAnsweredCorrectly(Boolean(ownAnswers?.some((item: { correct: boolean }) => item.correct)));
    } else {
      setAnsweredCorrectly(false);
    }
  }, [gameId, t, userId]);

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
    if (!session || session.status !== 'playing' || session.game_type !== 'movie_trivia') return;
    const updateTimer = () => {
      const startedAt = session.state.roundStartedAt ? new Date(session.state.roundStartedAt).getTime() : Date.now();
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setRemainingSeconds(Math.max(0, (session.state.timeLimit || 30) - elapsed));
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 250);
    return () => window.clearInterval(timer);
  }, [session?.status, session?.game_type, session?.state.roundStartedAt, session?.state.timeLimit]);

  useEffect(() => {
    setAnswer('');
    setError('');
  }, [session?.state.round]);

  useEffect(() => {
    const updateKeyboard = () => {
      const viewport = window.visualViewport;
      const offset = viewport
        ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
        : 0;
      const isOpen = document.activeElement === answerInputRef.current || offset > 30;
      setKeyboardOffset(offset);
      window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen } }));
    };
    updateKeyboard();
    window.visualViewport?.addEventListener('resize', updateKeyboard);
    window.visualViewport?.addEventListener('scroll', updateKeyboard);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboard);
      window.visualViewport?.removeEventListener('scroll', updateKeyboard);
      window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen: false } }));
    };
  }, []);

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

  useEffect(() => {
    if (
      !session || session.game_type !== 'movie_trivia' || session.status !== 'playing'
      || remainingSeconds > 0 || !session.players.includes(userId)
    ) return;
    if (!supabase) return;
    const deadline = new Date(session.state.roundStartedAt || 0).getTime()
      + (session.state.timeLimit || 30) * 1000;
    if (Date.now() < deadline) return;
    const client = supabase;
    const timer = window.setTimeout(() => {
      void client.rpc('advance_trip_trivia_round', {
        p_session_id: session.id,
        p_expected_round: session.state.round,
      }).then(({ error: advanceError }) => {
        if (advanceError) {
          console.error('Could not advance trivia round:', advanceError);
          setError(rpcErrorMessage(advanceError.message, t));
        }
      });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [session?.id, session?.status, session?.game_type, session?.players, session?.state.roundStartedAt, session?.state.timeLimit, remainingSeconds, userId, t]);

  const memberName = useCallback((id: string) => (
    members.find((member) => member.user_id === id)?.profile?.display_name || t('Member')
  ), [members, t]);
  const isHost = session?.host_id === userId;
  const winnerName = session?.winner_id ? memberName(session.winner_id) : null;
  const maxPlayers = session?.game_type === 'movie_trivia' ? null : 2;
  const full = Boolean(maxPlayers && session && session.players.length >= maxPlayers);
  const playerProfiles = useMemo(() => (
    (session?.players || []).map((id) => members.find((member) => member.user_id === id)).filter((member) => member?.profile)
  ), [members, session?.players]);
  const winningCells = useMemo(() => {
    const source = session?.state.winningLine || [];
    return new Set((source as number[][]).map((cell) => cell.join(',')));
  }, [session?.state.winningLine]);
  const currentPlayer = session?.players[((session.state.moveCount || 0) % 2)];

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
    if (session.game_type === 'movie_trivia') {
      const configured = await runAction(() => supabase!.rpc('update_trip_game_config', {
        p_session_id: session.id,
        p_config: { rounds, timeLimit },
      }));
      if (!configured) return;
    }
    await runAction(() => supabase!.rpc('start_trip_game_session', { p_session_id: session.id }));
  };

  const leaveGame = async () => {
    if (session && supabase && session.status !== 'finished' && session.status !== 'cancelled') {
      await runAction(() => supabase!.rpc('leave_trip_game_session', { p_session_id: session.id }));
    }
    onClose();
  };

  const submitAnswer = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase || !session || !answer.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: answerError } = await supabase.rpc('submit_trip_trivia_answer', {
        p_session_id: session.id,
        p_answer: answer,
      });
      if (answerError) {
        console.error('Could not submit trivia answer:', answerError);
        setError(rpcErrorMessage(answerError.message, t));
      } else {
        setAnswer('');
        if (data?.correct) {
          setAnsweredCorrectly(true);
          setError(`${t('Correct')} +${data.points}`);
        } else {
          setError(t('Not quite—try again.'));
        }
        await loadSession();
      }
    } finally {
      setBusy(false);
    }
  };

  const playMove = (position: number) => {
    if (!supabase || !session) return;
    void runAction(() => supabase!.rpc('play_trip_game_move', {
      p_session_id: session.id,
      p_position: position,
    }));
  };

  const rematch = async () => {
    if (!supabase || !session) return;
    const { data: newId, error: createError } = await supabase.rpc('create_trip_game_session', {
      p_trip_id: session.trip_id,
      p_game_type: session.game_type,
      p_config: session.config || {},
    });
    if (createError) {
      console.error('Could not create game rematch:', createError);
      setError(rpcErrorMessage(createError.message, t));
      return;
    }
    try {
      await sendMessage(
        `${t(GAME_NAMES[session.game_type])} — ${t('join the game!')}`,
        undefined,
        undefined,
        'game_session',
        { gameSessionId: newId, gameType: session.game_type },
      );
      onOpenGame(newId);
    } catch (sendError) {
      console.error('Could not post game rematch invitation:', sendError);
      setError(t('The game was created, but its chat invitation could not be sent.'));
    }
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
  const playerIndex = session.players.indexOf(userId);
  const hasAnswered = false;

  return (
    <div className="fixed inset-0 z-[12000] flex flex-col bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 px-4">
        <button type="button" onClick={() => void leaveGame()} aria-label={t('Leave game')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <ArrowLeft size={21} />
        </button>
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
            maxPlayers={maxPlayers ?? undefined}
            busy={busy}
            onStart={() => void startGame()}
            onJoin={() => void runAction(() => supabase!.rpc('join_trip_game_session', { p_session_id: session.id }))}
            onLeave={() => void leaveGame()}
          >
            {session.game_type === 'movie_trivia' && isHost && (
                <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
                  <label className="text-xs font-semibold text-white/60">
                    {t('Rounds')}
                    <select value={rounds} onChange={(event) => setRounds(Number(event.target.value))} className="mt-1.5 block h-11 w-full rounded-xl border border-white/10 bg-[#2a2a2e] px-3 text-sm text-white">
                      {[5, 10, 15].map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-white/60">
                    {t('Time per question')}
                    <select value={timeLimit} onChange={(event) => setTimeLimit(Number(event.target.value))} className="mt-1.5 block h-11 w-full rounded-xl border border-white/10 bg-[#2a2a2e] px-3 text-sm text-white">
                      {[15, 30, 45].map((value) => <option key={value} value={value}>{value}s</option>)}
                    </select>
                  </label>
                </div>
              )}
          </GameLobby>
        ) : session.game_type === 'movie_trivia' && session.status === 'playing' ? (
          <section className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 pb-24">
            <div className="flex items-center justify-between text-sm text-white/65">
              <span>{t('Round')} {session.state.round}/{session.state.rounds}</span>
              <span>{remainingSeconds}s</span>
            </div>
            <div className="rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-5">
              <h2 className="text-center text-xl font-bold">{session.state.prompt}</h2>
              {session.state.revealedAnswer && (
                <div className="mt-4 rounded-2xl bg-white/[0.06] p-3 text-center">
                  <p className="text-xs text-white/50">{t('Correct answer')}</p>
                  <p className="mt-1 font-bold text-emerald-300">{session.state.revealedAnswer}</p>
                  {session.state.correctUsers?.map((item) => (
                    <p key={item.userId} className="mt-1 text-xs text-white/75">{memberName(item.userId)} +{item.points}</p>
                  ))}
                </div>
              )}
            </div>
            <Scoreboard scores={session.state.scores || {}} players={session.participant_ids} memberName={memberName} title={t('Scoreboard')} />
            <div className="fixed left-3.5 right-3.5 z-[12001] mx-auto max-w-lg transition-[bottom] duration-150 ease-out" style={{ bottom: keyboardOffset > 0 ? `${Math.max(8, keyboardOffset + 6)}px` : 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
              <form onSubmit={(event) => void submitAnswer(event)} className="flex min-h-[46px] items-center gap-2 rounded-full border border-white/[0.12] bg-[#222226]/95 px-3.5 py-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]">
                <input
                  ref={answerInputRef}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onFocus={() => window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen: true } }))}
                  onBlur={() => window.setTimeout(() => {
                    if (document.activeElement !== answerInputRef.current) {
                      window.dispatchEvent(new CustomEvent('trip:keyboard-toggle', { detail: { isOpen: false } }));
                    }
                  }, 120)}
                  placeholder={t('Your answer…')}
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-white outline-none placeholder:text-white/40"
                  enterKeyHint="send"
                />
                <button type="submit" aria-label={t('Send')}                 disabled={busy || answeredCorrectly || !answer.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF] text-white disabled:opacity-40">
                  <PaperPlaneTilt size={17} weight="fill" />
                </button>
              </form>
            </div>
          </section>
        ) : session.status === 'playing' ? (
          <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 pb-4">
            <div className="flex w-full items-center justify-between">
              {session.players.slice(0, 2).map((id, index) => {
                const member = members.find((item) => item.user_id === id);
                return member?.profile ? (
                  <div key={id} className={`flex items-center gap-2 ${currentPlayer === id ? 'text-white' : 'text-white/50'}`}>
                    <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={34} />
                    <span className="text-sm font-semibold">{member.profile.display_name}</span>
                    <span className="text-xs text-white/55">{index === 0 ? 'X' : 'O'}</span>
                  </div>
                ) : null;
              })}
            </div>
            <p className="text-sm font-semibold text-white/70">
              {currentPlayer === userId ? t('Your turn') : `${memberName(currentPlayer || '')} ${t('is thinking…')}`}
            </p>
            {isTicTacToe ? (
              <div className="grid aspect-square w-full max-w-[min(84vw,390px)] grid-cols-3 gap-2 rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-3">
                {cells.map((cell, index) => (
                  <button key={index} type="button" disabled={session.status !== 'playing' || currentPlayer !== userId || Boolean(cell)} onClick={() => playMove(index)} className={`rounded-2xl bg-[#2a2a2e] text-5xl font-black transition-colors disabled:cursor-default ${winningCells.has(`${Math.floor(index / 3)},${index % 3}`) ? 'bg-[#0A84FF]/30 text-[#55a7ff]' : cell === 'X' ? 'text-[#0A84FF]' : 'text-[#FF453A]'}`}>
                    {cell}
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-full max-w-[min(94vw,560px)] rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-3">
                <div className="mb-2 grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }).map((_, column) => (
                    <button key={column} type="button" aria-label={`${t('Drop disc in column')} ${column + 1}`} disabled={session.status !== 'playing' || currentPlayer !== userId} onClick={() => playMove(column)} className="h-8 rounded-full text-xs text-white/60 active:bg-white/10">↓</button>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {connectBoard.flatMap((row, rowIndex) => row.map((cell, columnIndex) => (
                    <button
                      key={`${rowIndex}-${columnIndex}`}
                      type="button"
                      aria-label={`${t('Row')} ${rowIndex + 1}, ${t('Column')} ${columnIndex + 1}`}
                      disabled={session.status !== 'playing' || currentPlayer !== userId}
                      onClick={() => playMove(columnIndex)}
                      className={`relative aspect-square overflow-hidden rounded-full border border-white/10 bg-[#2a2a2e] ${winningCells.has(`${rowIndex},${columnIndex}`) ? 'ring-4 ring-yellow-300' : ''}`}
                    >
                      {cell && (
                        <motion.span
                          initial={{ y: -60, opacity: 0.8 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                          className={`absolute inset-1 rounded-full ${cell === 'X' ? 'bg-[#0A84FF]' : 'bg-[#FF453A]'}`}
                        />
                      )}
                    </button>
                  )))}
                </div>
              </div>
            )}
          </section>
        ) : (
          <section className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-5 text-center">
            <h2 className="text-2xl font-extrabold">{session.status === 'cancelled' ? t('Game cancelled') : winnerName ? `${winnerName} ${t('wins!')}` : t('It’s a draw')}</h2>
            {session.game_type === 'movie_trivia' && (
              <>
                {session.state.revealedAnswer && (
                  <div className="w-full rounded-[20px] border border-white/[0.1] bg-[#1c1c1e] p-4">
                    <p className="text-xs text-white/50">{t('Final answer')}</p>
                    <p className="mt-1 font-bold text-emerald-300">{session.state.revealedAnswer}</p>
                    {session.state.correctUsers?.map((item) => <p key={item.userId} className="mt-1 text-xs text-white/75">{memberName(item.userId)} +{item.points}</p>)}
                  </div>
                )}
                <Scoreboard scores={session.state.scores || {}} players={session.participant_ids} memberName={memberName} title={t('Final results')} />
              </>
            )}
            <div className="flex w-full gap-3">
              <button type="button" onClick={onClose} className="min-h-12 flex-1 rounded-full border border-white/15 bg-white/[0.06] text-sm font-semibold">{t('Back to games')}</button>
              {session.game_type !== 'movie_trivia' && (
                <button type="button" onClick={() => void rematch()} className="min-h-12 flex-1 rounded-full bg-[#0A84FF] text-sm font-bold">{t('Rematch')}</button>
              )}
            </div>
          </section>
        )}
        {error && <p role="alert" className={`mx-auto mt-3 max-w-lg rounded-xl px-3 py-2 text-sm ${error.startsWith(t('Correct')) ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>{error}</p>}
      </main>
    </div>
  );
};

const Scoreboard: React.FC<{
  scores: Record<string, number>;
  players: string[];
  memberName: (id: string) => string;
  title: string;
}> = ({ scores, players, memberName, title }) => (
  <div className="w-full rounded-[20px] border border-white/[0.1] bg-[#1c1c1e] p-4">
    <h3 className="mb-3 text-sm font-bold text-white/70">{title}</h3>
    <div className="space-y-2">
      {players.map((id) => (
        <div key={id} className="flex items-center justify-between text-sm">
          <span>{memberName(id)}</span>
          <span className="font-bold tabular-nums">{scores[id] || 0}</span>
        </div>
      ))}
    </div>
  </div>
);
