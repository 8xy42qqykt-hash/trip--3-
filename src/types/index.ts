export interface Profile {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  color: string;
  language?: 'en' | 'fi';
  created_at?: string;
}

export interface Trip {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  invite_code: string;
  owner_id: string;
  created_at?: string;
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
  profile?: Profile;
}

export interface TripInvitation {
  id: string;
  trip_id: string;
  inviter_id: string;
  invitee_user_id: string | null;
  email: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
  trip?: Trip;
  inviter?: Profile;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  kind: 'Heart' | 'ThumbsUp' | 'ThumbsDown' | 'Smiley' | 'HandsClapping' | 'Question';
  created_at: string;
}

export interface Message {
  id: string;
  trip_id: string;
  user_id: string;
  type: 'text' | 'image' | 'poll_result' | 'grocery_list' | 'meal' | 'plan' | 'call' | 'draw_game' | 'game_session';
  content: string;
  image_url?: string | null;
  reply_to?: string | null;
  metadata?: Record<string, any> | null;
  created_at: string;
  reactions?: Reaction[];
  sender?: Profile;
  reply_message?: Message | null;
}

export interface PollOption {
  id: string;
  poll_id: string;
  text: string;
  sort_order: number;
  votes_count?: number;
  voters?: Profile[];
  has_voted?: boolean;
}

export interface Poll {
  id: string;
  trip_id: string;
  creator_id: string;
  question: string;
  multiple: boolean;
  is_closed: boolean;
  created_at: string;
  options: PollOption[];
  total_votes?: number;
}

export interface GroceryItem {
  id: string;
  trip_id: string;
  user_id: string;
  text: string;
  quantity?: string | null;
  category: string;
  is_done: boolean;
  created_at: string;
  creator?: Profile;
}

export interface Meal {
  id: string;
  trip_id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  slot: string; // 'Breakfast', 'Lunch', 'Dinner', 'Snacks', etc.
  name: string;
  cook_user_id?: string | null;
  created_at: string;
  votes?: string[]; // user_ids
  cook?: Profile;
}

export interface EventItem {
  id: string;
  trip_id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  time?: string | null; // "14:30" or null for Anytime
  title: string;
  location?: string | null;
  notes?: string | null;
  created_at: string;
  attendees?: string[]; // user_ids
  attendee_profiles?: Profile[];
}
