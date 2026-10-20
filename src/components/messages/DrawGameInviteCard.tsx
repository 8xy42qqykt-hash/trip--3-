import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../context/LanguageContext';

let gameCardSubscriptionSequence = 0;

interface DrawGameInviteCardProps {
  gameId?: string;
  onOpen?: (gameId: string) => void;
}

export const DrawGameInviteCard: React.FC<DrawGameInviteCardProps> = ({ gameId, onOpen }) => {
  const { t } = useLanguage();
  const [game, setGame] = useState<{ status: string; players: string[] } | null>(null);

  useEffect(() => {
    if (!gameId || !supabase) return;
    const client = supabase;
    let disposed = false;
    const load = async () => {
      const { data, error } = await client
        .from('draw_games')
        .select('status, players')
        .eq('id', gameId)
        .maybeSingle();
      if (error) {
        console.error('Could not load Draw and Guess game card:', error);
        return;
      }
      if (!disposed) setGame(data);
    };
    void load();
    const subscriptionId = ++gameCardSubscriptionSequence;
    const channel = client
      .channel(`draw-game-card:${gameId}:${subscriptionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'draw_games',
        filter: `id=eq.${gameId}`,
      }, () => { void load(); })
      .subscribe();
    return () => {
      disposed = true;
      void client.removeChannel(channel);
    };
  }, [gameId]);

  return (
    <div className="min-w-[200px]">
      <p className="mb-1 text-xs font-semibold text-white/70">{t('Draw and Guess')}</p>
      <p className="text-sm text-white">
        {t(game?.status === 'finished' ? 'Game finished'
          : game?.status === 'cancelled' ? 'Game cancelled'
            : game?.status === 'playing' ? 'Game in progress'
              : 'A game is ready to join')}
      </p>
      {game && game.status !== 'finished' && game.status !== 'cancelled' && gameId && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.(gameId);
          }}
          className="mt-2 min-h-10 rounded-full bg-white px-4 text-sm font-bold text-[#0A84FF]"
        >
          {game.status === 'lobby' ? `${t('Join game')} · ${game.players.length} ${t('joined')}` : t('Open game')}
        </button>
      )}
    </div>
  );
};
