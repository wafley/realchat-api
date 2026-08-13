export function toSender(
  user:
    | { username?: string | null; fullName?: string | null; avatarUrl?: string | null }
    | null
    | undefined,
) {
  if (!user) return null;
  return {
    username: user.username ?? null,
    fullName: user.fullName ?? null,
    avatarUrl: user.avatarUrl ?? null,
  };
}
