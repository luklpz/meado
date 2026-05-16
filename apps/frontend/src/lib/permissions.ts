export const PERMISSION_LABELS: Record<string, string> = {
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

export const PERMISSION_CATEGORIES: { label: string; keys: string[] }[] = [
  { label: 'Servidor', keys: ['manageServer', 'manageChannels', 'manageRoles', 'viewAuditLog'] },
  { label: 'Miembros', keys: ['kickMembers', 'banMembers', 'manageNicknames'] },
  { label: 'Mensajes', keys: ['sendMessages', 'attachFiles', 'addReactions', 'manageMessages', 'mentionEveryone'] },
  { label: 'Voz', keys: ['connect', 'speak', 'video', 'shareScreen', 'muteMembers', 'deafenMembers', 'moveMembers'] },
];
