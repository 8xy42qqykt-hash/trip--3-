import React, { useEffect, useState } from 'react';
import { GameController } from '@phosphor-icons/react';
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
  const [game, setGame] = useState<{ status: string; players: string[]; winner_id: string | null; scores: Record<string, number> } | null>(null);

  useEffect(() => {
    if (!gameId || !supabase) return;
    const client = supabase;
    let disposed = false;
    const load = async () => {
      const { data, error } = await client
        .from('draw_games')
        .select('status, players, winner_id, scores')
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

  const winner = game?.winner_id && members.find((member) => member.user_id === game.winner_id);

  return (
    <div className="min-w-[220px] max-w-[280px]">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
          <GameController size={18} weight="fill" />
        </span>
        <p className="text-sm font-bold text-white">{t('Draw and Guess')}</p>
      </div>
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
          <span className="text-xs text-white/65">{game.players.length}</span>
        </div>
      )}
      {game?.status === 'finished' ? (
        <>
          <p className="mt-2 text-sm font-semibold text-white/85">
            {winner ? `${t('Finished, winner')}: ${winner.profile?.display_name || t('Member')}` : t('Game finished')}
          </p>
          {Object.entries(game.scores || {}).sort((left, right) => right[1] - left[1]).map(([id, score]) => (
            <p key={id} className="mt-1 flex justify-between gap-4 text-xs text-white/65">
              <span>{members.find((member) => member.user_id === id)?.profile?.display_name || t('Member')}</span>
              <span>{score}</span>
            </p>
          ))}
        </>
      ) : game?.status === 'cancelled' ? (
        <p className="mt-2 text-xs text-white/65">{t('Game cancelled')}</p>
      ) : game && gameId ? (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.(gameId);
          }}
          className="mt-2 min-h-11 rounded-full bg-white px-4 text-sm font-bold text-[#0A84FF]"
        >
          {game.status === 'lobby' ? `${t('Join game')} · ${game.players.length}` : t('In progress')}
        </button>
      ) : null}
    </div>
  );
};
