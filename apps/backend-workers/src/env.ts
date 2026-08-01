export interface Env {
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
