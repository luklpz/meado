import type { ChannelDO } from './durable-objects/channel-do.js';
import type { DmDO } from './durable-objects/dm-do.js';
import type { UserRegistryDO } from './durable-objects/user-registry-do.js';

export interface Env {
	CHANNEL_DO: DurableObjectNamespace<ChannelDO>;
	DM_DO: DurableObjectNamespace<DmDO>;
	USER_REGISTRY_DO: DurableObjectNamespace<UserRegistryDO>;
	DATABASE_URL: string;
	JWT_SECRET: string;
	FRONTEND_URL: string;
	CORS_ORIGIN: string;
	NODE_ENV?: string;
	RESEND_API_KEY: string;
	RESEND_FROM: string;
	CLOUDINARY_CLOUD_NAME: string;
	CLOUDINARY_API_KEY: string;
	CLOUDINARY_API_SECRET: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_REFRESH_TOKEN: string;
	GOOGLE_DRIVE_FOLDER_ID?: string;
	LIVEKIT_URL: string;
	LIVEKIT_API_KEY: string;
	LIVEKIT_API_SECRET: string;
}
