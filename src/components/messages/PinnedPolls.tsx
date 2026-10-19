import React, { useState } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import { Poll } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../common/Avatar';

interface PinnedPollsProps {
  polls: Poll[];
  onVote: (pollId: string, optionId: string) => Promise<void>;
  onEndPoll: (pollId: string) => Promise<void>;
}

export const PinnedPolls: React.FC<PinnedPollsProps> = ({
  polls,
  onVote,
  onEndPoll,
}) => {
  const { user } = useAuth();
  const openPolls = polls.filter((p) => !p.is_closed);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedOptionVotersId, setExpandedOptionVotersId] = useState<string | null>(null);
  const [endingPollId, setEndingPollId] = useState<string | null>(null);

  if (openPolls.length === 0) return null;

  const activeIndex = Math.min(currentIndex, openPolls.length - 1);
  const poll = openPolls[activeIndex];
  const isCreator = user && poll.creator_id === user.id;
  const totalVotes = poll.total_votes || 0;

  // Find max votes to identify winner(s)
  let maxVotes = 0;
  for (const opt of poll.options) {
    if ((opt.votes_count || 0) > maxVotes) {
      maxVotes = opt.votes_count || 0;
    }
  }

  const handleEnd = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setEndingPollId(poll.id);
    await onEndPoll(poll.id);
    setEndingPollId(null);
  };

  const toggleShowVoters = (optId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedOptionVotersId((prev) => (prev === optId ? null : optId));
  };

  return (
    <>
      {/* Backdrop overlay when poll is expanded */}
      {isExpanded && (
        <div
          onClick={() => {
            setIsExpanded(false);
            setExpandedOptionVotersId(null);
          }}
          className="fixed inset-0 z-25 bg-black/40 backdrop-blur-xs pointer-events-auto transition-opacity duration-250"
        />
      )}

      {/* Floating Overlay container - Positioned below the top safe-area header */}
      <div
        style={{
          top: 'calc(env(safe-area-inset-top, 0px) + 58px)',
        }}
        className="absolute left-0 right-0 z-30 pointer-events-none px-3.5 pt-1"
      >
        <div
          style={{
            backdropFilter: 'blur(28px) saturate(190%)',
            WebkitBackdropFilter: 'blur(28px) saturate(190%)',
          }}
          className="pointer-events-auto w-full max-w-lg mx-auto bg-[#1e1e22]/90 border border-white/[0.12] rounded-[24px] p-3.5 shadow-[0_12px_36px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out select-none"
        >
          {/* Header Bar */}
          <div
            onClick={() => {
              setIsExpanded(!isExpanded);
              setExpandedOptionVotersId(null);
            }}
            className="flex items-center justify-between cursor-pointer select-none"
          >
            <div className="flex-1 pr-3 truncate">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-white truncate">
                  {poll.question}
                </span>
              </div>
              {/* Thin preview bar */}
              <div className="w-full h-1.5 bg-white/10 rounded-full mt-2 flex overflow-hidden">
                {poll.options.map((opt) => {
                  const count = opt.votes_count || 0;
                  const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
                  if (pct <= 0) return null;
                  const isWinning = count === maxVotes && maxVotes > 0;
                  return (
                    <div
                      key={opt.id}
                      style={{ width: `${pct}%` }}
                      className={`h-full transition-all duration-300 ${
                        isWinning
                          ? 'bg-[#0A84FF]'
                          : 'bg-slate-500'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-semibold text-slate-300">
                {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
              </span>
              <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-slate-300">
                <CaretDown
                  size={15}
                  weight="bold"
                  className={`transition-transform duration-300 ease-out ${isExpanded ? 'rotate-180' : ''}`}
                />
              </div>
            </div>
          </div>

          {/* Swipe dots if multiple open polls */}
          {openPolls.length > 1 && (
            <div className="flex items-center justify-center gap-2 mt-2.5">
              {openPolls.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`h-2 rounded-full transition-all duration-200 ${
                    idx === activeIndex
                      ? 'w-5 bg-[#0A84FF]'
                      : 'w-2 bg-white/20'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Smoothly Animated Expanded Voting Options */}
          <div
            className={`transition-all duration-300 ease-out overflow-hidden ${
              isExpanded ? 'max-h-[65vh] opacity-100 mt-3 pt-1.5' : 'max-h-0 opacity-0 mt-0 pt-0'
            }`}
          >
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[50vh] pr-0.5">
              {poll.options.map((opt) => {
                const count = opt.votes_count || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const hasVoted = Boolean(opt.has_voted);
                const isWinning = totalVotes > 0 && count === maxVotes && maxVotes > 0;
                const isLosing = totalVotes > 0 && !isWinning;
                const isVotersOpen = expandedOptionVotersId === opt.id;
                const voters = opt.voters || [];

                return (
                  <div key={opt.id} className="flex flex-col gap-1.5">
                    <button
                      type="button"
                      onClick={() => onVote(poll.id, opt.id)}
                      className={`relative w-full min-h-[48px] rounded-[18px] overflow-hidden px-4 py-2 flex items-center justify-between text-left active:scale-[0.99] cursor-pointer transition-all ${
                        isLosing
                          ? 'bg-white/5 opacity-75'
                          : 'bg-white/10'
                      }`}
                    >
                      {/* Bar fill */}
                      <div
                        className={`absolute inset-y-0 left-0 transition-all duration-300 ease-out ${
                          isWinning
                            ? 'bg-[#0A84FF]/25'
                            : 'bg-white/10'
                        }`}
                        style={{ width: `${pct}%` }}
                      />

                      <div className="relative z-10 flex items-center gap-2.5 flex-1 pr-2 truncate">
                        <div
                          className={`w-5 h-5 rounded-full flex items-center justify-center transition-all duration-200 ${
                            hasVoted
                              ? 'bg-[#0A84FF] text-white shadow-xs'
                              : 'border-2 border-white/30'
                          }`}
                        >
                          {hasVoted && <Check size={12} weight="bold" />}
                        </div>
                        <span
                          className={`text-sm truncate ${
                            isWinning
                              ? 'font-bold text-white'
                              : isLosing
                              ? 'text-slate-400 font-medium'
                              : 'font-semibold text-slate-200'
                          }`}
                        >
                          {opt.text}
                        </span>
                      </div>

                      {/* Right side: ALL voter profile icons + pct */}
                      <div className="relative z-10 flex items-center gap-2.5 shrink-0">
                        {voters.length > 0 && (
                          <div
                            onClick={(e) => toggleShowVoters(opt.id, e)}
                            className="flex -space-x-2 overflow-hidden p-0.5 rounded-full hover:opacity-80 active:scale-95 transition-transform"
                            title="View all voters"
                          >
                            {voters.map((voter) => (
                              <Avatar
                                key={voter.id}
                                name={voter.display_name}
                                avatarUrl={voter.avatar_url}
                                color={voter.color}
                                size={22}
                              />
                            ))}
                          </div>
                        )}
                        <span
                          className={`text-xs font-bold ${
                            isWinning
                              ? 'text-[#0A84FF]'
                              : 'text-slate-400'
                          }`}
                        >
                          {pct}%
                        </span>
                      </div>
                    </button>

                    {/* Expanded Voter Names List */}
                    {isVotersOpen && voters.length > 0 && (
                      <div className="pl-7 pr-3 py-2 flex flex-wrap gap-2 bg-white/5 rounded-[14px] animate-calm-fade-in text-xs">
                        {voters.map((voter) => (
                          <div key={voter.id} className="flex items-center gap-1.5 bg-black/50 px-2.5 py-1 rounded-full border border-white/10">
                            <Avatar
                              name={voter.display_name}
                              avatarUrl={voter.avatar_url}
                              color={voter.color}
                              size={16}
                            />
                            <span className="text-slate-200 font-medium">
                              {voter.display_name}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Total votes & Creator End Poll action */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-3 mt-2 border-t border-white/10 px-1">
              <span>Total votes: {totalVotes}</span>
              {isCreator && (
                <button
                  type="button"
                  onClick={handleEnd}
                  disabled={endingPollId === poll.id}
                  className="px-3.5 py-1.5 rounded-[14px] text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500/20 active:scale-95 cursor-pointer transition-transform"
                >
                  {endingPollId === poll.id ? 'Ending...' : 'End poll'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
