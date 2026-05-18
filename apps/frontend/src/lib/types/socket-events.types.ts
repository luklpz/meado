export interface MessageAuthor {
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
}

export interface MessageAttachment {
  id: string;
  url: string;
  name: string;
  size: number;
  mimeType: string;
}

export interface MessagePayload {
  id: string;
  content: string | null;
  channelId: string;
  createdAt: string;
  editedAt: string | null;
  author: MessageAuthor;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
}

export interface VoiceMember {
  userId: string;
  username: string;
  avatarUrl?: string | null;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  me: boolean;
}

export interface DmMessagePayload {
  id: string;
  content: string | null;
  conversationId: string;
  createdAt: string;
  editedAt: string | null;
  author: MessageAuthor;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
}

export interface ClientToServerEvents {
  'channel:join': (payload: { channelId: string }) => void;
  'channel:leave': (payload: { channelId: string }) => void;
  'message:send': (payload: { channelId: string; content: string }) => void;
  'server:subscribe': (payload: { serverId: string; channelIds: string[] }) => void;
  'voice:join': (payload: { channelId: string }) => void;
  'voice:leave': (payload: { channelId: string }) => void;
  'typing:start': (payload: { channelId: string }) => void;
  'typing:stop': (payload: { channelId: string }) => void;
  'reaction:toggle': (payload: { messageId: string; emoji: string }) => void;
  'dm:join': (payload: { conversationId: string }) => void;
  'dm:leave': (payload: { conversationId: string }) => void;
  'dm:send': (payload: { conversationId: string; content: string }) => void;
  'dm:typing:start': (payload: { conversationId: string }) => void;
  'dm:typing:stop': (payload: { conversationId: string }) => void;
}

export interface ServerToClientEvents {
  'message:created': (payload: MessagePayload) => void;
  'message:updated': (payload: MessagePayload) => void;
  'message:deleted': (payload: { messageId: string; channelId: string }) => void;
  'voice:state': (payload: { channelId: string; members: VoiceMember[] }) => void;
  'voice:joined': (payload: { channelId: string; member: VoiceMember }) => void;
  'voice:left': (payload: { channelId: string; userId: string }) => void;
  'typing:update': (payload: { channelId: string; usernames: string[] }) => void;
  'reaction:updated': (payload: { messageId: string; channelId: string; reactions: MessageReaction[] }) => void;
  'dm:message:created': (payload: DmMessagePayload) => void;
  'dm:message:updated': (payload: DmMessagePayload) => void;
  'dm:message:deleted': (payload: { messageId: string; conversationId: string }) => void;
  'dm:typing:update': (payload: { conversationId: string; usernames: string[] }) => void;
  'presence:update': (payload: { userId: string; online: boolean }) => void;
  'friend:request': (payload: { id: string; user: { id: string; username: string; avatarUrl?: string | null }; createdAt: string }) => void;
}
