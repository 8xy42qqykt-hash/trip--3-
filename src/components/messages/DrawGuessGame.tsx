import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUp, Check, Crown, Palette, Play, X } from '@phosphor-icons/react';
import { Message, TripMember } from '../../types';
import { supabase } from '../../lib/supabase';
import { Avatar } from '../common/Avatar';

type DrawGame = {
  id: string;
  trip_id: string;
  creator_id: string;
  status: 'lobby' | 'playing' | 'finished' | 'cancelled';
  players: string[];
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

const COLORS = ['#ffffff', '#ff453a', '#ff9f0a', '#ffd60a', '#30d158', '#0a84ff', '#bf5af2'];

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
  const [game, setGame] = useState<DrawGame | null>(null);
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [secretWord, setSecretWord] = useState('');
  const [guessText, setGuessText] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [draftStroke, setDraftStroke] = useState<Stroke | null>(null);
  const [remoteDraft, setRemoteDraft] = useState<Stroke | null>(null);
  const [error, setError] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const draftRef = useRef<Stroke | null>(null);
  const lastBroadcastRef = useRef(0);
  const nextRoundTimerRef = useRef<number | null>(null);

  const memberName = useCallback((id: string) => (
    members.find((member) => member.user_id === id)?.profile?.display_name || 'Member'
  ), [members]);

  const loadGame = useCallback(async () => {
    if (!supabase) {
      setError('Draw and Guess needs an online connection.');
      return;
    }
    const { data, error: loadError } = await supabase
      .from('draw_games')
      .select('id, trip_id, creator_id, status, players, scores, round_number, drawer_id, drawing, winner_id')
      .eq('id', gameId)
      .maybeSingle();
    if (loadError) {
      console.error('Could not load Draw and Guess game:', loadError);
      setError('Could not load the game. Please try again.');
      return;
    }
    if (!data) {
      setError('This game is no longer available.');
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
        setError('Could not load your drawing word.');
      } else {
        setSecretWord(secret?.word || '');
      }
    } else {
      setSecretWord('');
    }
  }, [gameId, userId]);

  const loadGuesses = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from('draw_game_guesses')
      .select('id, user_id, guess, correct, created_at')
      .eq('game_id', gameId)
      .order('created_at', { ascending: true });
    if (loadError) {
      console.error('Could not load game guesses:', loadError);
      setError('Could not load the game chat.');
      return;
    }
    setGuesses((data || []) as Guess[]);
  }, [gameId]);

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
      setError('Could not start the next round.');
      return;
    }
    await loadGame();
  };

  const announceResults = async (scores: Record<string, number>) => {
    const results = Object.entries(scores)
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => `${memberName(id)}: ${score}`)
      .join(' · ');
    await sendMessage(
      `Draw and Guess finished${results ? ` — ${results}` : ''}`,
      undefined,
      undefined,
      'text',
      { gameId, gameSummary: true, scores },
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
            setError('Could not finish the game.');
            return;
          }
          await announceResults(game.scores || {});
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
      setError('Could not join this game. Check your connection and try again.');
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
        setError('Could not cancel the game.');
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
      setError('Could not leave the game. Please try again.');
      return;
    }
    if (finished) {
      await announceResults(game.scores || {});
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
      setError('Could not save the latest drawing stroke.');
    }
  };

  const submitGuess = async (event: React.FormEvent) => {
    event.preventDefault();
    const guess = guessText.trim();
    if (!guess || !game || !supabase) return;
    setGuessText('');
    const { error: guessError } = await supabase.rpc('submit_draw_game_guess', {
      p_game_id: game.id,
      p_guess: guess,
    });
    if (guessError) {
      console.error('Could not submit game guess:', guessError);
      setError('Could not send your guess.');
      setGuessText(guess);
      return;
    }
    await loadGame();
    await loadGuesses();
  };

  const isDrawer = game?.drawer_id === userId;
  const playerProfiles = game?.players.map((id) => members.find((member) => member.user_id === id)).filter(Boolean) || [];

  return (
    <div className="fixed inset-0 z-[12000] flex flex-col bg-[#08090c] text-white" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-white/10 px-4">
        <button type="button" onClick={() => void closeGame()} aria-label="Leave game" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10">
          <ArrowLeft size={21} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">Draw and Guess</p>
          <p className="text-xs text-white/55">{game?.status === 'playing' ? `Round ${game.round_number}` : game?.status || 'Loading'}</p>
        </div>
        {game?.status === 'lobby' && game.creator_id === userId && (
          <>
            <button
              type="button"
              onClick={() => void closeGame()}
              className="min-h-10 rounded-full bg-white/10 px-3 text-sm font-semibold"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={game.players.length < 2}
              onClick={() => void startRound()}
              className="flex min-h-10 items-center gap-2 rounded-full bg-[#0A84FF] px-4 text-sm font-bold disabled:opacity-40"
            >
              <Play size={17} weight="fill" /> Start
            </button>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto">
          {playerProfiles.map((member) => member?.profile && (
            <div key={member.user_id} className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1 pr-3">
              <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={28} />
              <span className="max-w-24 truncate text-xs">{member.profile.display_name}</span>
              {game?.creator_id === member.user_id && <Crown size={13} className="text-amber-300" />}
              <span className="text-xs text-white/60">{game?.scores?.[member.user_id] || 0}</span>
            </div>
          ))}
          {game?.status === 'lobby' && game.players.length < 2 && (
            <span className="shrink-0 text-xs text-white/55">Waiting for another player to join</span>
          )}
        </div>

        {game?.status === 'lobby' ? (
          <div className="flex flex-1 flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <Palette size={42} className="mb-3 text-[#0A84FF]" />
            <h2 className="text-xl font-bold">Ready to draw?</h2>
            <p className="mt-2 max-w-xs text-sm text-white/60">
              {game.creator_id === userId
                ? 'Wait for friends to join, then start the game.'
                : 'You joined the lobby. The host will start when everyone is ready.'}
            </p>
          </div>
        ) : game?.status === 'playing' ? (
          <>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/50">
                {isDrawer ? 'Draw this word' : game.drawer_id ? `${memberName(game.drawer_id)} is drawing` : 'Guess the word'}
              </p>
              <p className="min-h-8 pt-1 text-xl font-black tracking-wide">{isDrawer ? secretWord : game.winner_id ? `${memberName(game.winner_id)} guessed it!` : '\u00a0'}</p>
            </div>
            <canvas
              ref={canvasRef}
              onPointerDown={onCanvasDown}
              onPointerMove={onCanvasMove}
              onPointerUp={() => void onCanvasUp()}
              onPointerCancel={() => void onCanvasUp()}
              style={{ width: 'min(100%, 43vh)' }}
              className={`mx-auto aspect-square max-h-[43vh] shrink-0 rounded-2xl bg-white ${isDrawer && !game.winner_id ? 'touch-none' : 'pointer-events-none'}`}
              aria-label="Live drawing canvas"
            />
            {isDrawer && !game.winner_id && (
              <div className="flex shrink-0 items-center justify-center gap-3">
                {COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-label={`Choose ${swatch} pen`}
                    className={`h-9 w-9 rounded-full border-2 ${color === swatch ? 'scale-110 border-white' : 'border-white/20'}`}
                    style={{ backgroundColor: swatch }}
                  >
                    {color === swatch && <Check size={14} className={swatch === '#ffffff' ? 'text-black' : 'text-white'} />}
                  </button>
                ))}
              </div>
            )}
            <div className="flex min-h-24 flex-1 flex-col gap-1 overflow-y-auto rounded-2xl bg-white/[0.05] p-3">
              {guesses.map((item) => (
                <p key={item.id} className={`text-sm ${item.correct ? 'font-bold text-emerald-300' : 'text-white/80'}`}>
                  <span className="font-semibold">{memberName(item.user_id)}:</span> {item.guess}
                  {item.correct && ' ✓'}
                </p>
              ))}
              {guesses.length === 0 && <p className="text-center text-xs text-white/35">Guesses appear here</p>}
            </div>
            {!isDrawer && !game.winner_id && (
              <form onSubmit={(event) => void submitGuess(event)} className="flex min-h-12 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-[#1d1e22] px-4">
                <input
                  value={guessText}
                  onChange={(event) => setGuessText(event.target.value)}
                  placeholder="Type your guess"
                  className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-white/40"
                  enterKeyHint="send"
                />
                <button type="submit" disabled={!guessText.trim()} aria-label="Send guess" className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0A84FF] disabled:opacity-40">
                  <ArrowUp size={17} weight="bold" />
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <h2 className="text-xl font-bold">{game?.status === 'cancelled' ? 'Game cancelled' : 'Game over'}</h2>
            <p className="mt-2 text-sm text-white/60">
              {Object.entries(game?.scores || {}).sort((a, b) => b[1] - a[1]).map(([id, score]) => `${memberName(id)} ${score}`).join(' · ') || 'No points scored'}
            </p>
          </div>
        )}
        {error && <p role="alert" className="shrink-0 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">{error}</p>}
      </div>
      {game?.status === 'finished' && (
        <button type="button" onClick={onClose} className="mx-4 mb-3 flex min-h-12 items-center justify-center gap-2 rounded-full bg-white/10 font-semibold">
          <X size={18} /> Close
        </button>
      )}
    </div>
  );
};
