// Copia de apps/backend/src/shared/types/permissions.ts — mantener sincronizado manualmente.

export interface ServerPermissions {
	manageServer: boolean;
	manageChannels: boolean;
	manageRoles: boolean;
	viewAuditLog: boolean;
	kickMembers: boolean;
	banMembers: boolean;
	manageNicknames: boolean;
	sendMessages: boolean;
	attachFiles: boolean;
	addReactions: boolean;
	manageMessages: boolean;
	mentionEveryone: boolean;
	connect: boolean;
	speak: boolean;
	video: boolean;
	shareScreen: boolean;
	muteMembers: boolean;
	deafenMembers: boolean;
	moveMembers: boolean;
}

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
