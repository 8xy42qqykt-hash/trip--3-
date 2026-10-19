import React, { useState, useMemo, useRef } from 'react';
import { Plus, Heart, CookingPot, ShoppingCart, Trash, Check } from '@phosphor-icons/react';
import { useTrip } from '../../context/TripContext';
import { useAuth } from '../../context/AuthContext';
import { Meal } from '../../types';
import { TripDaySelector } from '../common/TripDaySelector';
import { BottomSheet } from '../common/BottomSheet';
import { Avatar } from '../common/Avatar';
import { getInitialTripDate } from '../../utils/date';
import { CollapsingHeaderLayout } from '../common/CollapsingHeaderLayout';
import { handleEnterKeyNavigation } from '../../utils/formNavigation';

export const MealsView: React.FC = () => {
  const { currentTrip, meals, addMeal, toggleMealVote, assignCooking, sendMealToGroceries, deleteMeal } = useTrip();
  const { user } = useAuth();

  const initialDate = useMemo(() => {
    if (!currentTrip) return '';
    return getInitialTripDate(currentTrip.start_date, currentTrip.end_date);
  }, [currentTrip]);

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);

  const [isAddMealSheetOpen, setIsAddMealSheetOpen] = useState(false);
  const [isAddSlotSheetOpen, setIsAddSlotSheetOpen] = useState(false);
  const [mealNameInput, setMealNameInput] = useState('');
  const [selectedSlotForMeal, setSelectedSlotForMeal] = useState('');
  const [newSlotInput, setNewSlotInput] = useState('');
  const [actionMeal, setActionMeal] = useState<Meal | null>(null);

  const [customSlotsByDate, setCustomSlotsByDate] = useState<Record<string, string[]>>({});

  const daysWithMeals = useMemo(() => {
    return new Set(meals.map((m) => m.date));
  }, [meals]);

  if (!currentTrip) return null;

  const dayMeals = meals.filter((m) => m.date === selectedDate);
  const slotsFromData = Array.from(new Set(dayMeals.map((m) => m.slot)));
  const customSlots = customSlotsByDate[selectedDate] || [];
  const activeDaySlots = Array.from(new Set([...slotsFromData, ...customSlots]));

  const openAddSlot = () => {
    setNewSlotInput('');
    setIsAddSlotSheetOpen(true);
  };

  const handleCreateSlot = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSlot = newSlotInput.trim();
    if (!cleanSlot) return;
    if (!activeDaySlots.includes(cleanSlot)) {
      setCustomSlotsByDate((prev) => ({
        ...prev,
        [selectedDate]: [...(prev[selectedDate] || []), cleanSlot],
      }));
    }
    setNewSlotInput('');
    setIsAddSlotSheetOpen(false);
  };

  const openAddMeal = (presetSlot?: string) => {
    const slotToUse = presetSlot || activeDaySlots[0] || 'Meal';
    setSelectedSlotForMeal(slotToUse);
    setMealNameInput('');
    setIsAddMealSheetOpen(true);
  };

  const handleCreateMeal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = mealNameInput.trim();
    if (!cleanName) return;
    const targetSlot = selectedSlotForMeal || activeDaySlots[0] || 'Meal';
    if (!activeDaySlots.includes(targetSlot)) {
      setCustomSlotsByDate((prev) => ({
        ...prev,
        [selectedDate]: [...(prev[selectedDate] || []), targetSlot],
      }));
    }
    await addMeal(selectedDate, targetSlot, cleanName);
    setMealNameInput('');
    setIsAddMealSheetOpen(false);
  };

  return (
    <CollapsingHeaderLayout
      title="Meals"
      headerSubContent={
        <div className="flex items-center justify-between pb-1.5 pt-1 gap-2">
          <TripDaySelector
            startDate={currentTrip.start_date}
            endDate={currentTrip.end_date}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            daysWithItems={daysWithMeals}
          />

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={openAddSlot}
              className="text-xs font-bold text-slate-200 active-press cursor-pointer flex items-center gap-1.5 py-2 px-3.5 rounded-full bg-white/10 hover:bg-white/15 transition-colors border border-white/[0.08]"
            >
              <Plus size={15} weight="bold" />
              <span>Slot</span>
            </button>
            <button
              type="button"
              onClick={() => openAddMeal()}
              className="text-xs font-bold text-white active-press cursor-pointer flex items-center gap-1.5 py-2 px-4 rounded-full bg-[#0A84FF] shadow-sm hover:bg-[#007AFF] transition-colors"
            >
              <Plus size={15} weight="bold" />
              <span>Meal</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        {activeDaySlots.length > 0 ? (
          activeDaySlots.map((slot) => {
            const slotMeals = dayMeals.filter((m) => m.slot === slot);
            return (
              <div key={slot} className="space-y-1 animate-spring-in">
                <div className="flex items-center justify-between px-2 pt-0.5">
                  <span className="text-xs font-bold text-slate-400">
                    {slot}
                  </span>
                  <button
                    type="button"
                    onClick={() => openAddMeal(slot)}
                    className="text-xs font-bold text-[#0A84FF] active-press cursor-pointer flex items-center gap-1 py-1 px-2"
                  >
                    <Plus size={14} weight="bold" />
                    <span>Add</span>
                  </button>
                </div>

                {/* Direct divided list (NO heavy card panel) */}
                <div className="divide-y divide-white/[0.08] overflow-hidden">
                  {slotMeals.length > 0 ? (
                    slotMeals.map((meal) => {
                      const votes = meal.votes || [];
                      const hasVoted = user ? votes.includes(user.id) : false;
                      const isCook = user ? meal.cook_user_id === user.id : false;
                      return (
                        <MealItemRow
                          key={meal.id}
                          meal={meal}
                          hasVoted={hasVoted}
                          voteCount={votes.length}
                          isCook={isCook}
                          onTapVote={() => toggleMealVote(meal.id)}
                          onLongPress={() => setActionMeal(meal)}
                        />
                      );
                    })
                  ) : (
                    <div
                      onClick={() => openAddMeal(slot)}
                      className="px-2 py-3 text-xs text-slate-500 cursor-pointer hover:text-slate-300 transition-colors flex items-center justify-between"
                    >
                      <span>No meals added</span>
                      <span className="text-[#0A84FF] font-bold">+ Add</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center animate-spring-in">
            <p className="text-sm font-semibold text-white">
              No meal slots for this day
            </p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                type="button"
                onClick={openAddSlot}
                className="inline-flex items-center gap-1.5 px-4.5 py-2.5 rounded-full bg-white/10 hover:bg-white/15 text-white text-xs font-bold active-press border border-white/[0.08] cursor-pointer"
              >
                <Plus size={16} weight="bold" />
                <span>Add Slot</span>
              </button>
              <button
                type="button"
                onClick={() => openAddMeal()}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full bg-[#0A84FF] text-white text-xs font-bold active-press shadow-md cursor-pointer hover:bg-[#007AFF]"
              >
                <Plus size={16} weight="bold" />
                <span>Add Meal</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Slot Popup */}
      <BottomSheet isOpen={isAddSlotSheetOpen} onClose={() => setIsAddSlotSheetOpen(false)}>
        <form onSubmit={handleCreateSlot} className="flex flex-col gap-3.5 py-1">
          <div className="px-1">
            <h3 className="text-lg font-bold text-white">Add Meal Slot</h3>
          </div>
          <div className="space-y-1.5">
            <input
              type="text"
              autoFocus
              inputMode="text"
              enterKeyHint="done"
              autoCapitalize="words"
              autoCorrect="on"
              spellCheck={true}
              placeholder="Slot Name (e.g. Breakfast, Lunch, Dinner)"
              value={newSlotInput}
              onChange={(e) => setNewSlotInput(e.target.value)}
              onKeyDown={(e) => handleEnterKeyNavigation(e)}
              className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-500 text-[17px] outline-none border border-white/[0.08]"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {['Breakfast', 'Lunch', 'Dinner', 'Snacks', 'BBQ'].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setNewSlotInput(suggestion)}
                className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white/10 text-slate-300 hover:bg-white/15 active-press cursor-pointer border border-white/[0.06]"
              >
                {suggestion}
              </button>
            ))}
          </div>
          <div className="pt-2 mb-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddSlotSheetOpen(false)}
              className="flex-1 h-12 rounded-[20px] bg-white/10 text-slate-300 font-bold text-sm flex items-center justify-center active-press cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newSlotInput.trim()}
              className="flex-1 h-12 rounded-[20px] bg-[#0A84FF] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
            >
              Create Slot
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Add Meal Popup */}
      <BottomSheet isOpen={isAddMealSheetOpen} onClose={() => setIsAddMealSheetOpen(false)}>
        <form onSubmit={handleCreateMeal} className="flex flex-col gap-3.5 py-1">
          <div className="px-1">
            <h3 className="text-lg font-bold text-white">Add Meal</h3>
          </div>

          <div className="space-y-1.5">
            {activeDaySlots.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {activeDaySlots.map((slot) => {
                  const isSelected = selectedSlotForMeal === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlotForMeal(slot)}
                      className={`text-xs px-3.5 py-2 rounded-[14px] font-semibold transition-colors cursor-pointer flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-[#0A84FF] text-white shadow-sm'
                          : 'bg-white/10 text-slate-300 hover:bg-white/15 border border-white/[0.06]'
                      }`}
                    >
                      {isSelected && <Check size={14} weight="bold" />}
                      <span>{slot}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                type="text"
                inputMode="text"
                enterKeyHint="next"
                autoCapitalize="words"
                placeholder="Slot name"
                value={selectedSlotForMeal}
                onChange={(e) => setSelectedSlotForMeal(e.target.value)}
                onKeyDown={(e) => handleEnterKeyNavigation(e)}
                className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-500 text-[17px] outline-none border border-white/[0.08]"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <input
              type="text"
              autoFocus
              inputMode="text"
              enterKeyHint="done"
              autoCapitalize="words"
              autoCorrect="on"
              spellCheck={true}
              placeholder="Meal Name (e.g. Homemade Tacos)"
              value={mealNameInput}
              onChange={(e) => setMealNameInput(e.target.value)}
              onKeyDown={(e) => handleEnterKeyNavigation(e)}
              className="w-full h-12 px-4 rounded-[18px] bg-white/10 text-white placeholder:text-slate-500 text-[17px] outline-none border border-white/[0.08]"
            />
          </div>

          <div className="pt-2 mb-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => setIsAddMealSheetOpen(false)}
              className="flex-1 h-12 rounded-[20px] bg-white/10 text-slate-300 font-bold text-sm flex items-center justify-center active-press cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!mealNameInput.trim()}
              className="flex-1 h-12 rounded-[20px] bg-[#0A84FF] disabled:opacity-50 text-white font-bold text-sm flex items-center justify-center active-press cursor-pointer shadow-sm hover:bg-[#007AFF]"
            >
              Save Meal
            </button>
          </div>
        </form>
      </BottomSheet>

      {/* Meal Long-Press Action Sheet */}
      <BottomSheet isOpen={Boolean(actionMeal)} onClose={() => setActionMeal(null)}>
        {actionMeal && (
          <div className="flex flex-col gap-2.5 pb-6">
            <div className="px-1 pb-1">
              <span className="text-xs text-slate-400 font-semibold">
                {actionMeal.slot}
              </span>
              <h3 className="text-lg font-bold text-white">
                {actionMeal.name}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                assignCooking(actionMeal.id);
                setActionMeal(null);
              }}
              className="h-12 px-4 rounded-[20px] bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-between active-press cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <CookingPot size={18} weight="bold" className="text-[#0A84FF]" />
                <span>{actionMeal.cook_user_id === user?.id ? "I'm not cooking this" : "I'll cook this"}</span>
              </span>
              {actionMeal.cook && (
                <span className="text-xs text-slate-400">
                  Cook: {actionMeal.cook.display_name}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                sendMealToGroceries(actionMeal.name);
                setActionMeal(null);
              }}
              className="h-12 px-4 rounded-[20px] bg-white/10 hover:bg-white/15 text-white font-bold text-sm flex items-center justify-between active-press cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <ShoppingCart size={18} weight="bold" className="text-emerald-400" />
                <span>Send to Groceries</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                deleteMeal(actionMeal.id);
                setActionMeal(null);
              }}
              className="h-12 px-4 rounded-[20px] bg-red-500/15 hover:bg-red-500/25 text-red-400 font-bold text-sm flex items-center justify-between active-press cursor-pointer transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <Trash size={18} weight="bold" />
                <span>Delete Meal</span>
              </span>
            </button>
          </div>
        )}
      </BottomSheet>
    </CollapsingHeaderLayout>
  );
};

interface MealItemRowProps {
  meal: Meal;
  hasVoted: boolean;
  voteCount: number;
  isCook: boolean;
  onTapVote: () => void;
  onLongPress: () => void;
}

const MealItemRow: React.FC<MealItemRowProps> = ({
  meal,
  hasVoted,
  voteCount,
  isCook,
  onTapVote,
  onLongPress,
}) => {
  const pressTimer = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = () => {
    pressTimer.current = setTimeout(() => {
      onLongPress();
    }, 450);
  };

  const handlePointerUp = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="flex items-center justify-between min-h-[48px] py-1.5 px-2 hover:bg-white/5 active:bg-white/10 transition-colors select-none cursor-pointer"
    >
      <div className="flex items-center gap-3 flex-1 pr-2 truncate">
        <span className="text-[15px] font-semibold text-white truncate">
          {meal.name}
        </span>
        {meal.cook && (
          <div className="flex items-center gap-1.5 bg-[#0A84FF]/20 px-2.5 py-1 rounded-full shrink-0">
            <Avatar
              name={meal.cook.display_name}
              avatarUrl={meal.cook.avatar_url}
              color={meal.cook.color}
              size={18}
            />
            <span className="text-[11px] font-bold text-[#0A84FF]">
              {isCook ? 'You' : meal.cook.display_name}
            </span>
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTapVote();
        }}
        className={`min-h-[44px] px-3 py-1.5 rounded-full text-xs font-bold active-press cursor-pointer flex items-center gap-1.5 transition-colors ${
          hasVoted
            ? 'bg-rose-500/20 text-rose-400'
            : 'text-slate-400 hover:bg-white/10'
        }`}
      >
        <Heart size={18} weight={hasVoted ? 'fill' : 'regular'} />
        {voteCount > 0 && <span>{voteCount}</span>}
      </button>
    </div>
  );
};
