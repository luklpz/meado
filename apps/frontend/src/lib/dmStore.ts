import { writable } from 'svelte/store';

export const dmUnread = writable<Map<string, number>>(new Map());

export function incrementUnread(convId: string) {
  dmUnread.update(m => {
    const n = new Map(m);
    n.set(convId, (n.get(convId) ?? 0) + 1);
    return n;
  });
}

export function clearUnread(convId: string) {
  dmUnread.update(m => {
    const n = new Map(m);
    n.delete(convId);
    return n;
  });
}
