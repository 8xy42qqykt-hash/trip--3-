import React from 'react';
import { Avatar } from '../common/Avatar';

interface PollResultMessageProps {
  metadata: any;
  isOwn: boolean;
}

export const PollResultMessage: React.FC<PollResultMessageProps> = ({ metadata, isOwn }) => {
  if (!metadata) return null;
  const options = metadata.options || [];
  const totalVotes = metadata.total_votes || 1;
  const cleanQuestion = metadata.question || 'Poll Results';

  return (
    <div className="flex flex-col gap-2.5 min-w-[260px] max-w-sm py-1.5 select-none">
      {/* Header: Poll name only */}
      <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-2">
        <span className="font-bold text-sm truncate text-white">
          {cleanQuestion}
        </span>
        <span className="text-xs opacity-75 shrink-0 text-white font-medium">
          {metadata.total_votes || 0} {metadata.total_votes === 1 ? 'vote' : 'votes'}
        </span>
      </div>

      {/* Options: Thin sliders, percentage above in right, voter pfps on left */}
      <div className="space-y-3 mt-1">
        {options.map((opt: any) => {
          const isWinner = opt.text === metadata.winner && opt.votes > 0;
          const pct = Math.round(((opt.votes || 0) / totalVotes) * 100);
          const voters = opt.voters || [];

          return (
            <div key={opt.id} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`text-sm truncate text-white ${isWinner ? 'font-bold' : 'font-medium'}`}>
                    {opt.text}
                  </span>
                  {voters.length > 0 && (
                    <div className="flex -space-x-1.5 items-center shrink-0">
                      {voters.map((voter: any) => (
                        <div
                          key={voter.id}
                          className={`rounded-full ring-2 overflow-hidden ${
                            isOwn ? 'ring-[#0A84FF]' : 'ring-[#262629]'
                          }`}
                        >
                          <Avatar
                            name={voter.display_name}
                            avatarUrl={voter.avatar_url}
                            color={voter.color}
                            size={20}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <span className="text-xs font-bold opacity-90 shrink-0 text-white">
                  {pct}%
                </span>
              </div>

              {/* Slider bar */}
              <div className="w-full h-2 rounded-full overflow-hidden bg-white/20">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    isWinner
                      ? 'bg-white'
                      : 'bg-white/60'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pt-1.5 text-[11px] opacity-75 flex justify-between items-center text-white">
        <span>Ended by {metadata.ended_by || 'Creator'}</span>
        {metadata.winner && metadata.winner !== 'No votes' && (
          <span className="font-bold">
            Winner: {metadata.winner}
          </span>
        )}
      </div>
    </div>
  );
};
