import type { Profile } from '@splitpool/contracts';
import type { AvatarPerson } from '../components/people';

const PALETTE = ['#C4622D', '#2F7D6D', '#6D5BD0', '#B4536A', '#1F4E72', '#8A5A24'];

/** Map an API profile into the demo-style avatar person shape. */
export function avatarFromProfile(profile: Profile): AvatarPerson {
  const name = profile.displayName.trim() || profile.username;
  const initial = (name[0] || '?').toUpperCase();
  const color = PALETTE[Math.abs(hash(profile.userId)) % PALETTE.length];
  return {
    id: profile.userId,
    name,
    initial,
    color,
  };
}

function hash(value: string) {
  let total = 0;
  for (let index = 0; index < value.length; index += 1) total = (total * 31 + value.charCodeAt(index)) | 0;
  return total;
}
