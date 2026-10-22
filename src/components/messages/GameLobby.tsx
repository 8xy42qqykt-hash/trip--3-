import React from 'react';
import { Play } from '@phosphor-icons/react';
import { TripMember } from '../../types';
import { Avatar } from '../common/Avatar';
import { useLanguage } from '../../context/LanguageContext';

interface GameLobbyProps {
  title: string;
  icon?: React.ReactNode;
  players: string[];
  hostId: string;
  userId: string;
  members: TripMember[];
  minPlayers: number;
  maxPlayers?: number;
  busy?: boolean;
  onStart?: () => void;
  onJoin?: () => void;
  onLeave: () => void;
  children?: React.ReactNode;
}

export const GameLobby: React.FC<GameLobbyProps> = ({
  title,
  icon,
  players,
  hostId,
  userId,
  members,
  minPlayers,
  maxPlayers,
  busy = false,
  onStart,
  onJoin,
  onLeave,
  children,
}) => {
  const { t } = useLanguage();
  const isHost = hostId === userId;
  const isFull = maxPlayers !== undefined && players.length >= maxPlayers;
  const playerProfiles = players
    .map((id) => members.find((member) => member.user_id === id))
    .filter((member): member is TripMember => Boolean(member?.profile));

  return (
    <section className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5">
      <div className="rounded-[24px] border border-white/[0.1] bg-[#1c1c1e] p-5">
        <h2 className="mb-4 flex items-center justify-center gap-2 text-center text-xl font-bold">
          {icon && <span className="text-[#0A84FF]">{icon}</span>}
          {title}
        </h2>
        <div className="space-y-3">
          {playerProfiles.map((member) => member.profile && (
            <div key={member.user_id} className="flex items-center gap-3">
              <Avatar
                name={member.profile.display_name}
                avatarUrl={member.profile.avatar_url}
                color={member.profile.color}
                size={38}
              />
              <span className="text-sm font-medium">{member.profile.display_name}</span>
              {member.user_id === hostId && <span className="ml-auto text-xs text-white/50">{t('Host')}</span>}
            </div>
          ))}
          {maxPlayers !== undefined && Array.from({ length: Math.max(0, maxPlayers - players.length) }).map((_, index) => (
            <div key={`open-slot-${index}`} className="flex min-h-10 items-center gap-3 text-sm text-white/40">
              <span className="h-[38px] w-[38px] rounded-full border border-dashed border-white/20" />
              {t('Waiting for player')}
            </div>
          ))}
        </div>
        {children}
        {isHost && onStart && (
          <button
            type="button"
            disabled={busy || players.length < minPlayers || (maxPlayers !== undefined && players.length !== maxPlayers)}
            onClick={onStart}
            className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#0A84FF] text-sm font-bold disabled:opacity-40"
          >
            <Play size={17} weight="fill" /> {t('Start')}
          </button>
        )}
        {!players.includes(userId) && onJoin && (
          <button
            type="button"
            disabled={busy || isFull}
            onClick={onJoin}
            className="mt-5 min-h-12 w-full rounded-full bg-white text-sm font-bold text-[#0A84FF] disabled:bg-white/15 disabled:text-white/45"
          >
            {isFull ? `${t('Game full')} (${players.length}/${maxPlayers})` : t('Join game')}
          </button>
        )}
      </div>
      <button type="button" onClick={onLeave} className="mx-auto min-h-11 px-5 text-sm font-semibold text-white/60">{t('Leave game')}</button>
    </section>
  );
};
