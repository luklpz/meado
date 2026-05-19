import { writable } from 'svelte/store';

export const serverUnread = writable<Map<string, number>>(new Map());

export function setServerUnread(serverId: string, count: number) {
  serverUnread.update(m => {
    const n = new Map(m);
    if (count === 0) n.delete(serverId);
    else n.set(serverId, count);
    return n;
  });
}

export function incrementServerUnread(serverId: string) {
  serverUnread.update(m => {
    const n = new Map(m);
    n.set(serverId, (n.get(serverId) ?? 0) + 1);
    return n;
  });
}

export function clearServerUnread(serverId: string) {
  serverUnread.update(m => {
    const n = new Map(m);
    n.delete(serverId);
    return n;
  });
}
