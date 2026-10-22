import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useLanguage } from '../../context/LanguageContext';
import { TripMember } from '../../types';
import { Avatar } from '../common/Avatar';

let gameCardSubscriptionSequence = 0;

interface DrawGameInviteCardProps {
  gameId?: string;
  members: TripMember[];
  onOpen?: (gameId: string) => void;
}

export const DrawGameInviteCard: React.FC<DrawGameInviteCardProps> = ({ gameId, members, onOpen }) => {
  const { t } = useLanguage();
  const [game, setGame] = useState<{ status: string; players: string[]; creator_id: string; winner_id: string | null } | null>(null);

  useEffect(() => {
    if (!gameId || !supabase) return;
    const client = supabase;
    let disposed = false;
    const load = async () => {
      const { data, error } = await client
        .from('draw_games')
        .select('status, players, creator_id, winner_id')
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

  const creator = game && members.find((member) => member.user_id === game.creator_id);
  const winner = game?.winner_id && members.find((member) => member.user_id === game.winner_id);

  return (
    <div className="min-w-[200px]">
      <p className="mb-1 text-sm font-bold text-white">{t('Draw and Guess')}</p>
      {creator && <p className="text-xs text-white/65">{t('Started by')} {creator.profile?.display_name || t('Member')}</p>}
      {game && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex -space-x-2">
            {game.players.slice(0, 4).map((id) => {
              const member = members.find((item) => item.user_id === id);
              return member?.profile ? (
                <span key={id} className="rounded-full border-2 border-[#222226]">
                  <Avatar name={member.profile.display_name} avatarUrl={member.profile.avatar_url} color={member.profile.color} size={24} />
                </span>
              ) : null;
            })}
          </div>
          <span className="text-xs text-white/65">{game.players.length} {t('joined')}</span>
        </div>
      )}
      <p className="text-sm text-white">
        {t(game?.status === 'finished' ? 'Game finished'
          : game?.status === 'cancelled' ? 'Game cancelled'
            : game?.status === 'playing' ? 'Game in progress'
              : 'A game is ready to join')}
      </p>
      {game?.status === 'finished' && winner && (
        <p className="mt-1 text-xs font-semibold text-white/80">{t('Finished, winner')}: {winner.profile?.display_name || t('Member')}</p>
      )}
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
