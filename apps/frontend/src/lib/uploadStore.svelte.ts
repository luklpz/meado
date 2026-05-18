export interface Upload {
	id: string;
	filename: string;
	progress: number;
	speed: number;
	resuming: boolean;
	error: string | null;
	done: boolean;
}

export const uploadStore = (() => {
	let uploads = $state<Upload[]>([]);
	return {
		get list() { return uploads; },
		add(id: string, filename: string) {
			uploads = [...uploads, { id, filename, progress: 0, speed: 0, resuming: false, error: null, done: false }];
		},
		update(id: string, patch: Partial<Omit<Upload, 'id'>>) {
			uploads = uploads.map(u => u.id === id ? { ...u, ...patch } : u);
		},
		remove(id: string) {
			uploads = uploads.filter(u => u.id !== id);
		},
	};
})();

export function formatSpeed(bps: number): string {
	if (bps < 1024) return `${Math.round(bps)} B/s`;
	if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
	return `${(bps / (1024 * 1024)).toFixed(2)} MB/s`;
}
