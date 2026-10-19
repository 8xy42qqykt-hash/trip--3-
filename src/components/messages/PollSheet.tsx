import React, { useState, useRef } from 'react';
import { BottomSheet } from '../common/BottomSheet';
import { CustomToggle } from '../common/CustomToggle';
import { Trash, Plus } from '@phosphor-icons/react';

interface PollSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onCreatePoll: (question: string, options: string[], multiple: boolean) => Promise<void>;
}

export const PollSheet: React.FC<PollSheetProps> = ({
  isOpen,
  onClose,
  onCreatePoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multiple, setMultiple] = useState(false);
  const [loading, setLoading] = useState(false);
  const questionRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const handleQuestionKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      optionRefs.current[0]?.focus();
    }
  };

  const handleOptionKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (idx < options.length - 1) {
        optionRefs.current[idx + 1]?.focus();
      } else {
        const cleanQ = question.trim();
        const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
        if (cleanQ && cleanOpts.length >= 2) {
          handleSubmit(e);
        } else if (options.length < 8) {
          setOptions((prev) => [...prev, '']);
          setTimeout(() => {
            optionRefs.current[options.length]?.focus();
          }, 50);
        }
      }
    }
  };

  const removeOption = (idx: number) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanQ = question.trim();
    const cleanOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!cleanQ || cleanOpts.length < 2) return;
    setLoading(true);
    await onCreatePoll(cleanQ, cleanOpts, multiple);
    setLoading(false);
    setQuestion('');
    setOptions(['', '']);
    setMultiple(false);
    onClose();
  };

  const canSubmit = question.trim() && options.filter((o) => o.trim()).length >= 2;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 py-1">
        <div className="text-lg font-bold text-white px-1">
          Create a Poll
        </div>

        <div>
          <input
            ref={questionRef}
            type="text"
            autoFocus
            inputMode="text"
            enterKeyHint="next"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck={true}
            placeholder="Ask question..."
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={handleQuestionKeyDown}
            className="w-full h-13 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-400 text-[17px] outline-none border border-white/[0.08]"
          />
        </div>

        <div className="flex flex-col gap-2.5 max-h-60 overflow-y-auto pr-0.5">
          {options.map((opt, idx) => {
            const isLast = idx === options.length - 1;
            return (
              <div key={idx} className="flex items-center gap-2">
                <input
                  ref={(el) => {
                    optionRefs.current[idx] = el;
                  }}
                  type="text"
                  inputMode="text"
                  enterKeyHint={isLast ? (canSubmit ? 'done' : 'next') : 'next'}
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  spellCheck={true}
                  placeholder={`Option ${idx + 1}`}
                  value={opt}
                  onChange={(e) => handleOptionChange(idx, e.target.value)}
                  onKeyDown={(e) => handleOptionKeyDown(idx, e)}
                  className="flex-1 h-12 px-4 rounded-[16px] bg-white/10 text-white placeholder:text-slate-400 text-[17px] outline-none border border-white/[0.08]"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-red-400 active-press cursor-pointer"
                  >
                    <Trash size={20} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {options.length < 8 && (
          <button
            type="button"
            onClick={() => setOptions([...options, ''])}
            className="text-sm font-semibold text-[#0A84FF] self-start py-1.5 flex items-center gap-1 active-press cursor-pointer"
          >
            <Plus size={16} weight="bold" />
            <span>Add option</span>
          </button>
        )}

        <div className="py-1">
          <CustomToggle
            checked={multiple}
            onChange={setMultiple}
            label="Multiple answers"
          />
        </div>

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full h-13 mt-1 mb-3 rounded-[22px] bg-[#0A84FF] text-white font-bold text-base flex items-center justify-center active-press cursor-pointer disabled:opacity-40 shadow-sm"
        >
          {loading ? 'Creating...' : 'Create Poll'}
        </button>
      </form>
    </BottomSheet>
  );
};
