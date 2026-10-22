import React, { useEffect, useState } from 'react';
import { GameController } from '@phosphor-icons/react';
import { supabase } from '../../lib/supabase';
import { TripMember } from '../../types';
import { Avatar } from '../common/Avatar';
import { useLanguage } from '../../context/LanguageContext';

type SessionSummary = {
  game_type: 'connect_four' | 'tic_tac_toe';
  status: string;
  players: string[];
  participant_ids: string[];
  winner_id: string | null;
  state: { scores?: Record<string, number> };
};

const GAME_LABELS: Record<SessionSummary['game_type'], string> = {
  connect_four: 'Connect Four',
  tic_tac_toe: 'Tic-Tac-Toe',
};

interface GameSessionInviteCardProps {
  gameId?: string;
  members: TripMember[];
  currentUserId?: string;
  onOpen?: (gameId: string) => void;
}

export const GameSessionInviteCard: React.FC<GameSessionInviteCardProps> = ({ gameId, members, currentUserId, onOpen }) => {
  const { t } = useLanguage();
  const [session, setSession] = useState<SessionSummary | null>(null);

  useEffect(() => {
    if (!gameId || !supabase) return;
    const client = supabase;
    let disposed = false;
    const load = async () => {
      const { data, error } = await client
        .from('trip_game_sessions')
        .select('game_type, status, players, participant_ids, winner_id, state')
        .eq('id', gameId)
        .maybeSingle();
      if (error) {
        console.error('Could not load game invitation:', error);
        return;
      }
      if (!disposed) setSession(data as SessionSummary | null);
    };
    void load();
    const channel = client
      .channel(`trip-game-card:${gameId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trip_game_sessions',
        filter: `id=eq.${gameId}`,
      }, () => { void load(); })
      .subscribe();
    return () => {
      disposed = true;
      void client.removeChannel(channel);
    };
  }, [gameId]);

  if (!session || !gameId) return <p className="text-sm text-white/70">{t('Game invitation')}</p>;
  const title = t(GAME_LABELS[session.game_type] || 'Game invitation');
  const winner = session.winner_id && members.find((member) => member.user_id === session.winner_id);
  const maxPlayers = 2;
  const full = session.players.length >= maxPlayers;
  const canReopen = Boolean(currentUserId && session.participant_ids.includes(currentUserId));

  return (
    <div className="min-w-[220px] max-w-[280px]">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0A84FF]/15 text-[#0A84FF]">
          <GameController size={18} weight="fill" />
        </span>
        <p className="text-sm font-bold text-white">{title}</p>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="flex -space-x-2">
          {session.players.slice(0, 4).map((id) => {
            const member = members.find((item) => item.user_id === id);
            return member?.profile ? (
              <span key={id} className="rounded-full border-2 border-[#222226]">
                <Avatar
                  name={member.profile.display_name}
                  avatarUrl={member.profile.avatar_url}
                  color={member.profile.color}
                  size={25}
                />
              </span>
            ) : null;
          })}
        </div>
        <span className="text-xs text-white/65">
          {session.players.length}/{maxPlayers}
        </span>
      </div>
      {session.status === 'playing' ? (
        <>
          {canReopen
            ? <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onOpen?.(gameId); }} className="mt-2 min-h-11 rounded-full bg-white px-4 text-sm font-bold text-[#0A84FF]">{t('In progress')}</button>
            : <p className="mt-2 text-xs font-semibold text-emerald-300">{t('In progress')}</p>}
        </>
      ) : session.status === 'finished' ? (
        <>
          <p className="mt-2 text-sm font-semibold text-white/85">
            {winner ? `${t('Finished, winner')}: ${winner.profile?.display_name || t('Member')}` : t('Game finished')}
          </p>
          {session.state?.scores && Object.entries(session.state.scores)
            .sort((left, right) => right[1] - left[1])
            .map(([id, score]) => {
              const member = members.find((item) => item.user_id === id);
              return <p key={id} className="mt-1 flex justify-between gap-4 text-xs text-white/65"><span>{member?.profile?.display_name || t('Member')}</span><span>{score}</span></p>;
            })}
        </>
      ) : session.status === 'cancelled' ? (
        <p className="mt-2 text-xs text-white/65">{t('Game cancelled')}</p>
      ) : (
        <button
          type="button"
          disabled={full && !session.players.includes(currentUserId || '')}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onOpen?.(gameId);
          }}
          className="mt-2 min-h-10 rounded-full bg-white px-4 text-sm font-bold text-[#0A84FF] disabled:bg-white/15 disabled:text-white/45"
        >
          {full && !session.players.includes(currentUserId || '')
            ? `${t('Game full')} (${session.players.length}/${maxPlayers})`
            : `${t('Join game')} · ${session.players.length}/${maxPlayers}`}
        </button>
      )}
    </div>
  );
};
