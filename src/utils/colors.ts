export const PROFILE_COLOR_PALETTE = [
  '#007AFF', // Vibrant Blue
  '#34C759', // Vibrant Green
  '#FF9500', // Vibrant Orange
  '#AF52DE', // Vibrant Purple
  '#FF2D55', // Vibrant Pink
  '#5856D6', // Deep Indigo
  '#00C7BE', // Vibrant Teal
  '#30B0C7', // Deep Cyan
  '#FF3B30', // Coral Red
  '#5AC8FA', // Sky Blue
  '#5352ed', // Royal Blue
  '#E056FD', // Soft Orchid
];

export function getRandomProfileColor(existingColors?: string[]): string {
  if (existingColors && existingColors.length > 0) {
    const existingSet = new Set(existingColors.map((c) => c.toLowerCase()));
    const available = PROFILE_COLOR_PALETTE.filter(
      (color) => !existingSet.has(color.toLowerCase())
    );
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
  }
  return PROFILE_COLOR_PALETTE[Math.floor(Math.random() * PROFILE_COLOR_PALETTE.length)];
}
