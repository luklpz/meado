export interface ServerPermissions {
  manageServer: boolean;
  manageChannels: boolean;
  manageRoles: boolean;
  manageMembers: boolean;
  sendMessages: boolean;
  attachFiles: boolean;
  manageMessages: boolean;
  connect: boolean;
  speak: boolean;
  shareScreen: boolean;
  shareCamera: boolean;
  muteMembers: boolean;
  deafenMembers: boolean;
}

export const DEFAULT_PERMISSIONS: ServerPermissions = {
  manageServer: false,
  manageChannels: false,
  manageRoles: false,
  manageMembers: false,
  sendMessages: true,
  attachFiles: true,
  manageMessages: false,
  connect: true,
  speak: true,
  shareScreen: false,
  shareCamera: true,
  muteMembers: false,
  deafenMembers: false,
};

export const ADMIN_PERMISSIONS: ServerPermissions = {
  manageServer: true,
  manageChannels: true,
  manageRoles: true,
  manageMembers: true,
  sendMessages: true,
  attachFiles: true,
  manageMessages: true,
  connect: true,
  speak: true,
  shareScreen: true,
  shareCamera: true,
  muteMembers: true,
  deafenMembers: true,
};
