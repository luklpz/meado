export interface ServerPermissions {
  // Servidor
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  viewAuditLog: boolean;
  // Miembros
  kickMembers: boolean;
  banMembers: boolean;
  manageNicknames: boolean;
  // Mensajes
  sendMessages: boolean;
  attachFiles: boolean;
  addReactions: boolean;
  manageMessages: boolean;
  mentionEveryone: boolean;
  // Voz
  connect: boolean;
  speak: boolean;
  video: boolean;
  shareScreen: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
  moveMembers: boolean;
}

export const PERMISSION_LABELS: Record<keyof ServerPermissions, string> = {
  manageServer: 'Gestionar servidor',
  manageChannels: 'Gestionar canales',
  manageRoles: 'Gestionar roles',
  viewAuditLog: 'Ver registro',
  kickMembers: 'Expulsar miembros',
  banMembers: 'Banear miembros',
  manageNicknames: 'Gestionar nicks',
  sendMessages: 'Enviar mensajes',
  attachFiles: 'Adjuntar archivos',
  addReactions: 'Añadir reacciones',
  manageMessages: 'Gestionar mensajes',
  mentionEveryone: 'Mencionar @everyone',
  connect: 'Conectarse a voz',
  speak: 'Hablar',
  video: 'Cámara',
  shareScreen: 'Pantalla compartida',
  muteMembers: 'Silenciar miembros',
  deafenMembers: 'Ensordecer miembros',
  moveMembers: 'Mover miembros',
};

export const PERMISSION_CATEGORIES: { label: string; keys: (keyof ServerPermissions)[] }[] = [
  { label: 'Servidor', keys: ['manageServer', 'manageChannels', 'manageRoles', 'viewAuditLog'] },
  { label: 'Miembros', keys: ['kickMembers', 'banMembers', 'manageNicknames'] },
  { label: 'Mensajes', keys: ['sendMessages', 'attachFiles', 'addReactions', 'manageMessages', 'mentionEveryone'] },
  { label: 'Voz', keys: ['connect', 'speak', 'video', 'shareScreen', 'muteMembers', 'deafenMembers', 'moveMembers'] },
];

export const DEFAULT_PERMISSIONS: ServerPermissions = {
  manageServer: false, manageChannels: false, manageRoles: false, viewAuditLog: false,
  kickMembers: false, banMembers: false, manageNicknames: false,
  sendMessages: true, attachFiles: true, addReactions: true, manageMessages: false, mentionEveryone: false,
  connect: true, speak: true, video: true, shareScreen: false, muteMembers: false, deafenMembers: false, moveMembers: false,
};

export const OWNER_PERMISSIONS: ServerPermissions = {
  manageServer: true, manageChannels: true, manageRoles: true, viewAuditLog: true,
  kickMembers: true, banMembers: true, manageNicknames: true,
  sendMessages: true, attachFiles: true, addReactions: true, manageMessages: true, mentionEveryone: true,
  connect: true, speak: true, video: true, shareScreen: true, muteMembers: true, deafenMembers: true, moveMembers: true,
};
