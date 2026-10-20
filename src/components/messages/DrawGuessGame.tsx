import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwise, ArrowLeft, ArrowUp, Check, Play } from '@phosphor-icons/react';
import { Message, TripMember } from '../../types';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../common/Avatar';
import { useLanguage } from '../../context/LanguageContext';
import { getDrawGameWordLabel } from '../../utils/drawGameWords';

type DrawGame = {
  id: string;
  trip_id: string;
  creator_id: string;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  players: string[];
  participant_ids: string[];
  scores: Record<string, number>;
  round_number: number;
  drawer_id: string | null;
  drawing: Stroke[];
  winner_id: string | null;
};

type Stroke = {
  color: string;
  points: Array<{ x: number; y: number }>;
};

type Guess = {
  id: string;
  user_id: string;
  guess: string;
  correct: boolean;
  created_at: string;
};

const COLORS = ['#000000', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];

interface DrawGuessGameProps {
  gameId: string;
  userId: string;
  members: TripMember[];
  onClose: () => void;
  sendMessage: (
    content: string,
    imageUrl?: string,
    replyToId?: string,
    type?: Message['type'],
    metadata?: Message['metadata'],
  ) => Promise<void>;
}

export const DrawGuessGame: React.FC<DrawGuessGameProps> = ({
  gameId,
  userId,
  members,
  onClose,
  sendMessage,
}) => {
  const { language, t } = useLanguage();
  const [game, setGame] = useState<DrawGame | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [secretWord, setSecretWord] = useState('');
  const [guessText, setGuessText] = useState('');
  const [color, setColor] = useState(COLORS[1]);
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);
  const [remoteDraft, setRemoteDraft] = useState<Stroke | null>(null);
  const [error, setError] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const guessInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const draftRef = useRef<Stroke | null>(null);
  const lastBroadcastRef = useRef(0);
  const nextRoundTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const updateKeyboardOffset = () => {
      const viewport = window.visualViewport;
      if (!viewport) return setKeyboardOffset(0);
      setKeyboardOffset(Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop)));
    };
    window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardOffset);
      window.visualViewport?.removeEventListener('scroll', updateKeyboardOffset);
    };
  }, []);

  const memberName = useCallback((id: string) => (
    members.find((member) => member.user_id === id)?.profile?.display_name || t('Member')
  ), [members, t]);

  const loadGame = useCallback(async () => {
    if (!supabase) {
      setError(t('Draw and Guess needs an online connection.'));
      return;
    }
    const { data, error: loadError } = await supabase
      .from('draw_games')
      .select('id, trip_id, creator_id, status, players, participant_ids, scores, round_number, drawer_id, drawing, winner_id')
      .eq('id', gameId)
      .maybeSingle();
    if (loadError) {
      console.error('Could not load Draw and Guess game:', loadError);
      setError(t('Could not load the game. Please try again.'));
      return;
    }
    if (!data) {
      setError(t('This game is no longer available.'));
      return;
    }
    const loaded = data as DrawGame;
    setGame(loaded);
    strokesRef.current = loaded.drawing || [];
    if (loaded.drawer_id === userId && loaded.status === 'playing') {
      const { data: secret, error: secretError } = await supabase
        .from('draw_game_round_secrets')
        .select('word')
        .eq('game_id', gameId)
        .eq('round_number', loaded.round_number)
        .maybeSingle();
      if (secretError) {
        console.error('Could not load the private drawing word:', secretError);
        setError(t('Could not load your drawing word.'));
      } else {
        setSecretWord(secret?.word || '');
      }
    } else {
      setSecretWord('');
    }
  }, [gameId, t, userId]);

  const loadGuesses = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from('draw_game_guesses')
      .select('id, user_id, guess, correct, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    if (loadError) {
      console.error('Could not load game guesses:', loadError);
      setError(t('Could not load the game chat.'));
      return;
    }
    setGuesses((data || []) as Guess[]);
  }, [gameId, t]);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    void loadGame();
    void loadGuesses();
    const channel = client
      .channel(`draw-game:${gameId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'draw_games', filter: `id=eq.${gameId}`,
      }, () => { void loadGame(); })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'draw_game_guesses', filter: `game_id=eq.${gameId}`,
      }, () => { void loadGuesses(); })
      .on('broadcast', { event: 'drawing' }, ({ payload }) => {
        setRemoteDraft(payload.stroke as Stroke);
      })
      .on('broadcast', { event: 'stroke_complete' }, ({ payload }) => {
        const stroke = payload.stroke as Stroke;
        setRemoteDraft(null);
        strokesRef.current = [...strokesRef.current, stroke];
        setGame((current) => current ? { ...current, drawing: strokesRef.current } : current);
      })
      .on('broadcast', { event: 'drawing_undo' }, ({ payload }) => {
        const drawing = payload.drawing as Stroke[];
        strokesRef.current = drawing;
        setGame((current) => current ? { ...current, drawing } : current);
      })
      .subscribe();
    channelRef.current = channel;
    return () => {
      if (nextRoundTimerRef.current !== null) window.clearTimeout(nextRoundTimerRef.current);
      void client.removeChannel(channel);
      channelRef.current = null;
    };
  }, [gameId, loadGame, loadGuesses]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const render = () => {
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      const context = canvas.getContext('2d');
      if (!context) return;
      context.scale(ratio, ratio);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      const drawStroke = (stroke: Stroke) => {
        if (stroke.points.length < 1) return;
        context.strokeStyle = stroke.color;
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(stroke.points[0].x * bounds.width, stroke.points[0].y * bounds.height);
        for (const point of stroke.points.slice(1)) {
          context.lineTo(point.x * bounds.width, point.y * bounds.height);
        }
        if (stroke.points.length === 1) {
          context.lineTo(stroke.points[0].x * bounds.width + 0.1, stroke.points[0].y * bounds.height + 0.1);
        }
        context.stroke();
      };
      for (const stroke of game?.drawing || []) drawStroke(stroke);
      if (draftStroke) drawStroke(draftStroke);
      if (remoteDraft) drawStroke(remoteDraft);
    };
    render();
    const observer = new ResizeObserver(render);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [game?.drawing, draftStroke, remoteDraft]);

  const startRound = async () => {
    if (!game || !supabase || game.players.length < 2) return;
    setError('');
    const { error: startError } = await supabase.rpc('start_draw_game_round', {
      p_game_id: game.id,
    });
    if (startError) {
      console.error('Could not start Draw and Guess round:', startError);
      setError(t('Could not start the next round.'));
      return;
    }
    await loadGame();
  };

  const announceResults = async (scores: Record<string, number>, participants: string[]) => {
    const results = participants
      .map((id) => [id, scores[id] || 0] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => `${memberName(id)}: ${score}`)
      .join(' · ');
    await sendMessage(
      `Draw and Guess results — ${results}`,
      undefined,
      undefined,
      'text',
      { gameId, gameSummary: true, scores, participants },
    );
  };

  useEffect(() => {
    if (!game || game.status !== 'playing' || !game.winner_id || game.creator_id !== userId) return;
    if (nextRoundTimerRef.current !== null) window.clearTimeout(nextRoundTimerRef.current);
    nextRoundTimerRef.current = window.setTimeout(() => {
      if (game.players.length < 2) {
        void (async () => {
          const { error: finishError } = await supabase!.rpc('finish_draw_game', { p_game_id: game.id });
          if (finishError) {
            console.error('Could not finish Draw and Guess game:', finishError);
            setError(t('Could not finish the game.'));
            return;
          }
          await announceResults(game.scores || {}, game.participant_ids || game.players);
        })();
      } else {
        void startRound();
      }
    }, 3000);
    return () => {
      if (nextRoundTimerRef.current !== null) window.clearTimeout(nextRoundTimerRef.current);
    };
  }, [game?.winner_id, game?.round_number, game?.creator_id, game?.players, game?.status, userId]);

  const openGame = async () => {
    if (!game || !supabase) return;
    setError('');
    const { error: joinError } = await supabase.rpc('join_draw_game', { p_game_id: game.id });
    if (joinError) {
      console.error('Could not join Draw and Guess game:', joinError);
      setError(t('Could not join this game. Check your connection and try again.'));
      return;
    }
    await loadGame();
  };

  const closeGame = async () => {
    if (!game || !supabase) {
      onClose();
      return;
    }
    if (game.status === 'finished' || game.status === 'cancelled') {
      onClose();
      return;
    }
    if (game.status === 'lobby' && game.creator_id === userId) {
      const { error: cancelError } = await supabase.rpc('cancel_draw_game', { p_game_id: game.id });
      if (cancelError) {
        console.error('Could not cancel Draw and Guess game:', cancelError);
        setError(t('Could not cancel the game.'));
        return;
      }
      onClose();
      return;
    }
    const { data: finished, error: leaveError } = await supabase.rpc('leave_draw_game', {
      p_game_id: game.id,
    });
    if (leaveError) {
      console.error('Could not leave Draw and Guess game:', leaveError);
      setError(t('Could not leave the game. Please try again.'));
      return;
    }
    if (finished) {
      await announceResults(game.scores || {}, game.participant_ids || game.players);
    }
    onClose();
  };

  useEffect(() => {
    if (
      game
      && (game.status === 'lobby' || game.status === 'playing')
      && !game.players.includes(userId)
    ) {
      void openGame();
    }
  }, [game?.id, game?.status, game?.players, userId]);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  };

  const onCanvasDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (game?.drawer_id !== userId || game.winner_id) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke = { color, points: [pointFromEvent(event)] };
    draftRef.current = stroke;
    setDraftStroke(stroke);
  };

  const onCanvasMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draftRef.current || game?.drawer_id !== userId) return;
    const stroke = { ...draftRef.current, points: [...draftRef.current.points, pointFromEvent(event)] };
    draftRef.current = stroke;
    setDraftStroke(stroke);
    if (Date.now() - lastBroadcastRef.current > 90) {
      lastBroadcastRef.current = Date.now();
      void channelRef.current?.send({ type: 'broadcast', event: 'drawing', payload: { stroke } });
    }
  };

  const onCanvasUp = async () => {
    const stroke = draftRef.current;
    if (!stroke || !game || !supabase) return;
    draftRef.current = null;
    setDraftStroke(null);
    setRemoteDraft(null);
    const updatedDrawing = [...strokesRef.current, stroke];
    strokesRef.current = updatedDrawing;
    setGame({ ...game, drawing: updatedDrawing });
    void channelRef.current?.send({ type: 'broadcast', event: 'stroke_complete', payload: { stroke } });
    const { error: drawingError } = await supabase.rpc('save_draw_game_drawing', {
      p_game_id: game.id,
      p_drawing: updatedDrawing,
    });
    if (drawingError) {
      console.error('Could not save drawing stroke:', drawingError);
      setError(t('Could not save the latest drawing stroke.'));
    }
  };

  const undoLastStroke = async () => {
    if (!game || !supabase || game.drawer_id !== userId || strokesRef.current.length === 0) return;
    const updatedDrawing = strokesRef.current.slice(0, -1);
    const { error: undoError } = await supabase.rpc('save_draw_game_drawing', {
      p_game_id: game.id,
      p_drawing: updatedDrawing,
    });
    if (undoError) {
      console.error('Could not undo the latest drawing stroke:', undoError);
      setError(t('Could not undo the latest drawing stroke.'));
      return;
    }
    strokesRef.current = updatedDrawing;
    setGame((current) => current ? { ...current, drawing: updatedDrawing } : current);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'drawing_undo',
      payload: { drawing: updatedDrawing },
    });
  };

  useEffect(() => {
    if (!game || game.status !== 'playing' || game.drawer_id === userId || game.winner_id) return;
    const focusInput = () => guessInputRef.current?.focus({ preventScroll: true });
    const frame = window.requestAnimationFrame(focusInput);
    return () => window.cancelAnimationFrame(frame);
  }, [game?.id, game?.status, game?.drawer_id, game?.round_number, game?.winner_id, userId]);

  const submitGuess = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const guess = guessText.trim();
    if (!guess || !game || !supabase) return;
    setGuessText('');
    const { error: guessError } = await supabase.rpc('submit_draw_game_guess', {
      p_game_id: game.id,
      p_guess: guess,
    });
    if (guessError) {
      console.error('Could not submit game guess:', guessError);
      setError(t('Could not send your guess.'));
      setGuessText(guess);
      return;
    }
    await loadGame();
    await loadGuesses();
    guessInputRef.current?.focus({ preventScroll: true });
  };

  const isDrawer = game?.drawer_id === userId;
  const playerProfiles = game?.players.map((id) => members.find((member) => member.user_id === id)).filter(Boolean) || [];
  const drawingSize = Math.max(
    120,
    Math.min(
      window.innerHeight * 0.4,
      window.innerWidth - 88,
      keyboardOffset > 0 ? window.innerHeight - keyboardOffset - 430 : Number.POSITIVE_INFINITY,
    ),
  );

  return (
    <div className="fixed inset-0 z-[12000] flex flex-col bg-black text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 px-4">
        <button type="button" onClick={() => void closeGame()} aria-label={t('Cancel game or leave game')} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
          <ArrowLeft size={21} />
        </button>
        {game?.status === 'playing' && (
          <div className="flex min-w-0 flex-1 items-center -space-x-2 overflow-hidden">
            {playerProfiles.map((member) => member?.profile && (
              <span key={member.user_id} className="shrink-0 rounded-full border-2 border-black">
                <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={30} />
              </span>
            ))}
          </div>
        )}
        {game?.status === 'lobby' && <div className="flex-1" />}
        {game?.status === 'lobby' && game.creator_id === userId && (
          <button
            type="button"
            disabled={game.players.length < 2}
            onClick={() => void startRound()}
            aria-label={t('Start game')}
            className="flex min-h-10 items-center gap-2 rounded-full bg-[#0A84FF] px-4 text-sm font-bold disabled:opacity-40"
          >
            <Play size={17} weight="fill" /> {t('Start')}
          </button>
        )}
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col px-4 pt-3"
        style={{ paddingBottom: game?.status === 'playing' && !isDrawer && !game.winner_id ? '62px' : '12px' }}
      >
        {game?.status === 'lobby' ? (
          <div className="flex flex-col items-start gap-3">
            {playerProfiles.map((member) => member?.profile && (
              <div key={member.user_id} className="flex items-center gap-3">
                <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={38} />
                <span className="text-sm font-medium">{member.profile.display_name}</span>
              </div>
            ))}
          </div>
        ) : game?.status === 'playing' ? (
          <>
            <div className="shrink-0 py-1 text-center">
              <p className="min-h-8 text-xl font-black tracking-wide">{isDrawer ? getDrawGameWordLabel(secretWord, language) : game.winner_id ? `${memberName(game.winner_id)} ${t('guessed it!')}` : '\u00a0'}</p>
            </div>
            <div
              className="mx-auto flex w-full min-w-0 flex-none items-stretch justify-center gap-3 px-1"
              style={{ height: `${drawingSize}px` }}
            >
              {isDrawer && !game.winner_id && (
                <div className="flex shrink-0 flex-col justify-between py-1">
                  {COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setColor(swatch)}
                      aria-label={`Choose ${swatch} pen`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform ${color === swatch ? 'scale-110 border-white' : 'border-white/30'}`}
                      style={{ backgroundColor: swatch }}
                    >
                      {color === swatch && <Check size={14} className="text-white" />}
                    </button>
                  ))}
                </div>
              )}
              <div className="relative shrink-0" style={{ width: `${drawingSize}px`, height: `${drawingSize}px` }}>
                <canvas
                  ref={canvasRef}
                  onPointerDown={onCanvasDown}
                  onPointerMove={onCanvasMove}
                  onPointerUp={() => void onCanvasUp()}
                  onPointerCancel={() => void onCanvasUp()}
                  className={`block h-full w-full rounded-xl bg-white ${isDrawer && !game.winner_id ? 'touch-none' : 'pointer-events-none'}`}
                  aria-label={t('Live drawing canvas')}
                />
                {isDrawer && !game.winner_id && (
                  <button
                    type="button"
                    onClick={() => void undoLastStroke()}
                    disabled={game.drawing.length === 0}
                    aria-label={t('Undo drawing')}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-35"
                  >
                    <ArrowCounterClockwise size={18} weight="bold" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2">
              {guesses.map((item) => (
                <p key={item.id} className={`text-sm ${item.correct ? 'font-bold text-emerald-300' : 'text-white/80'}`}>
                  <span className="font-semibold">{memberName(item.user_id)}:</span> {item.guess}
                  {item.correct && ' ✓'}
                </p>
              ))}
            </div>
            {!isDrawer && !game.winner_id && (
              <form
                onSubmit={(event) => void submitGuess(event)}
                style={{
                  bottom: keyboardOffset > 0
                    ? `${Math.max(8, keyboardOffset + 6)}px`
                    : 'calc(8px + env(safe-area-inset-bottom, 0px))',
                }}
                className="fixed left-3.5 right-3.5 z-[12001] mx-auto flex min-h-[46px] max-w-2xl items-center gap-2 rounded-full border border-white/[0.12] bg-[#222226]/95 px-3.5 py-0.5 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
              >
                <div className="flex min-w-0 flex-1 items-center">
                  <input
                    ref={guessInputRef}
                    value={guessText}
                    onChange={(event) => setGuessText(event.target.value)}
                    placeholder={t('Type your guess')}
                    className="w-full min-w-0 bg-transparent py-2.5 text-base outline-none placeholder:text-white/40"
                    enterKeyHint="send"
                  />
                </div>
                <div className={`flex shrink-0 items-center justify-end overflow-hidden transition-[width,opacity] duration-200 ease-out ${guessText.trim() ? 'w-10 opacity-100' : 'w-0 opacity-0'}`}>
                  <button
                    type="submit"
                    aria-label={t('Send guess')}
                    tabIndex={guessText.trim() ? 0 : -1}
                    onMouseDown={(event) => event.preventDefault()}
                    onTouchStart={(event) => {
                      event.preventDefault();
                      void submitGuess();
                    }}
                    className={`flex h-10 w-10 shrink-0 origin-right items-center justify-center rounded-full bg-[#0A84FF] transition-transform duration-200 ${guessText.trim() ? 'scale-100' : 'scale-0'}`}
                  >
                    <ArrowUp size={17} weight="bold" />
                  </button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center">
            <div className="w-full max-w-sm space-y-2">
              <h2 className="mb-4 text-center text-xl font-bold">{t('Draw and Guess')}</h2>
              {(game?.participant_ids || game?.players || []).map((id) => (
                <p key={id} className="text-sm">{memberName(id)}:{game?.scores?.[id] || 0}</p>
              ))}
            </div>
          </div>
        )}
        {error && <p role="alert" className="shrink-0 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
      </div>
    </div>
  );
};
