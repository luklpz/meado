export interface MessageAuthor {
  id: string;
  username: string;
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

export interface ClientToServerEvents {
  'channel:join': (payload: { channelId: string }) => void;
  'channel:leave': (payload: { channelId: string }) => void;
  'message:send': (payload: { channelId: string; content: string }) => void;
  'voice:join': (payload: { channelId: string }) => void;
  'voice:leave': (payload: { channelId: string }) => void;
  'typing:start': (payload: { channelId: string }) => void;
  'typing:stop': (payload: { channelId: string }) => void;
  'reaction:toggle': (payload: { messageId: string; emoji: string }) => void;
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
}
