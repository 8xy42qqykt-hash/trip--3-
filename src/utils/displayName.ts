export function safeDisplayName(name: string | null | undefined): string {
  const value = name?.trim() || '';
  if (!value || value.includes('@') || /^\+?[\d\s().-]{7,}$/.test(value)) {
    return 'Trip member';
  }
  return value;
}
