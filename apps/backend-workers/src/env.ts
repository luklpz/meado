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
}
