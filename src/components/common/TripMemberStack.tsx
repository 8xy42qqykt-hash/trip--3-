import React from 'react';
import { TripMember } from '../../types';
import { Avatar } from './Avatar';

interface TripMemberStackProps {
  members: TripMember[];
}

export const TripMemberStack: React.FC<TripMemberStackProps> = ({ members }) => (
  <div
    className="flex shrink-0 items-center"
    aria-label={`${members.length} trip ${members.length === 1 ? 'member' : 'members'}`}
  >
    {members.map((member, index) => (
      <Avatar
        key={member.user_id}
        name={member.profile?.display_name}
        avatarUrl={member.profile?.avatar_url}
        color={member.profile?.color}
        size={22}
        className={`relative ${index > 0 ? '-ml-[11px]' : ''}`}
      />
    ))}
  </div>
);
