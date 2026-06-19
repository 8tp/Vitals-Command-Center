export const HABIT_CATEGORIES = [
  'morning_checkin',
  'evening_checkin',
  'auto_tracked',
  'custom',
] as const;
export type HabitCategory = (typeof HABIT_CATEGORIES)[number];

export const HABIT_TYPES = ['boolean', 'scale_1_5', 'number', 'time', 'text'] as const;
export type HabitType = (typeof HABIT_TYPES)[number];

export interface Habit {
  id: string;
  name: string;
  category: HabitCategory;
  type: HabitType;
  unit: string | null;
  targetValue: number | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface HabitLog {
  id: string;
  habitId: string;
  date: string;
  value: string; // stored as text, interpreted by habit.type
  loggedAt: string;
}

export interface HabitStreak {
  habitId: string;
  habitName: string;
  currentStreak: number;
  longestStreak: number;
  lastLoggedDate: string | null;
}

export interface HabitCorrelation {
  habitId: string;
  habitName: string;
  metric: string;
  r: number; // Pearson correlation coefficient
  n: number; // sample size
  pValue: number | null;
  direction: 'positive' | 'negative';
  summary: string;
}
