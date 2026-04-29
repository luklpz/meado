import type { GameSocket } from '$lib/socket.js';
import type { Room } from 'livekit-client';

export interface SceneConfig {
	canvasW: number;
	canvasH: number;
	roomId: string;
	username: string;
	emitIntervalMs: number;
	lerpStiffness: number;
	playerSpeed: number;
	livekitRoom?: Room;
	proximityRadius?: number;
}

type PhaserType = typeof import('phaser');

export function createGameScene(Phaser: PhaserType, socket: GameSocket, cfg: SceneConfig) {
	const {
		canvasW,
		canvasH,
		roomId,
		username,
		emitIntervalMs,
		lerpStiffness,
		playerSpeed,
		livekitRoom,
		proximityRadius = 200,
	} = cfg;

	return class GameScene extends Phaser.Scene {
		private local!: Phaser.GameObjects.Rectangle;
		private localLabel!: Phaser.GameObjects.Text;
		private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
		private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
		private lastEmit = 0;

		private remote = new Map<
			string,
			{
				sprite: Phaser.GameObjects.Rectangle;
				label: Phaser.GameObjects.Text;
				targetX: number;
				targetY: number;
				username: string;
			}
		>();

		constructor() {
			super({ key: 'GameScene' });
		}

		create() {
			this.buildGrid();

			this.local = this.add.rectangle(canvasW / 2, canvasH / 2, 32, 32, 0x22c55e);
			this.localLabel = this.add
				.text(canvasW / 2, canvasH / 2 - 26, username, {
					fontSize: '11px',
					color: '#ffffff',
					stroke: '#000000',
					strokeThickness: 2
				})
				.setOrigin(0.5);

			this.cursors = this.input.keyboard!.createCursorKeys();
			this.wasd = {
				up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
				down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
				left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
				right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D)
			};

			this.bindSocketEvents();

			const join = () => socket.emit('room:join', { roomId, username });
			socket.connected ? join() : socket.once('connect', join);
		}

		update(time: number, delta: number) {
			const dt = delta / 1000;
			let vx = 0;
			let vy = 0;

			if (this.cursors.left.isDown || this.wasd.left.isDown) vx = -playerSpeed;
			else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = playerSpeed;
			if (this.cursors.up.isDown || this.wasd.up.isDown) vy = -playerSpeed;
			else if (this.cursors.down.isDown || this.wasd.down.isDown) vy = playerSpeed;

			this.local.x = Phaser.Math.Clamp(this.local.x + vx * dt, 16, canvasW - 16);
			this.local.y = Phaser.Math.Clamp(this.local.y + vy * dt, 16, canvasH - 16);
			this.localLabel.setPosition(this.local.x, this.local.y - 26);

			if (time - this.lastEmit >= emitIntervalMs && socket.connected) {
				socket.emit('player:move', {
					x: Math.round(this.local.x),
					y: Math.round(this.local.y),
					roomId
				});
				this.lastEmit = time;
			}

			const alpha = 1 - Math.pow(lerpStiffness, dt);
			for (const r of this.remote.values()) {
				r.sprite.x = Phaser.Math.Linear(r.sprite.x, r.targetX, alpha);
				r.sprite.y = Phaser.Math.Linear(r.sprite.y, r.targetY, alpha);
				r.label.setPosition(r.sprite.x, r.sprite.y - 26);
			}

			this.updateProximityVolumes();
		}

		private updateProximityVolumes() {
			if (!livekitRoom) return;
			for (const r of this.remote.values()) {
				const dist = Phaser.Math.Distance.Between(
					this.local.x,
					this.local.y,
					r.sprite.x,
					r.sprite.y
				);
				const vol = Math.max(0, 1 - dist / proximityRadius);
				for (const participant of livekitRoom.remoteParticipants.values()) {
					if (participant.identity === r.username) {
						for (const pub of participant.audioTrackPublications.values()) {
							(pub.track as { setVolume?: (v: number) => void } | undefined)?.setVolume?.(vol);
						}
					}
				}
			}
		}

		private buildGrid() {
			const g = this.add.graphics();
			g.lineStyle(1, 0x1a3320, 0.6);
			for (let x = 0; x <= canvasW; x += 40) g.lineBetween(x, 0, x, canvasH);
			for (let y = 0; y <= canvasH; y += 40) g.lineBetween(0, y, canvasW, y);
		}

		private spawnRemote(id: string, name: string, x: number, y: number) {
			if (this.remote.has(id)) return;
			const sprite = this.add.rectangle(x, y, 32, 32, 0x3b82f6);
			const label = this.add
				.text(x, y - 26, name, {
					fontSize: '11px',
					color: '#ffffff',
					stroke: '#000000',
					strokeThickness: 2
				})
				.setOrigin(0.5);
			this.remote.set(id, { sprite, label, targetX: x, targetY: y, username: name });
		}

		private despawnRemote(id: string) {
			const r = this.remote.get(id);
			if (!r) return;
			r.sprite.destroy();
			r.label.destroy();
			this.remote.delete(id);
		}

		private bindSocketEvents() {
			socket.on('room:state', ({ players }) => {
				players.forEach((p) => {
					if (p.playerId !== socket.id) this.spawnRemote(p.playerId, p.username, p.x, p.y);
				});
			});

			socket.on('player:joined', (p) => {
				if (p.playerId !== socket.id) this.spawnRemote(p.playerId, p.username, p.x, p.y);
			});

			socket.on('player:moved', (p) => {
				const r = this.remote.get(p.playerId);
				if (r) {
					r.targetX = p.x;
					r.targetY = p.y;
				}
			});

			socket.on('player:left', ({ playerId }) => {
				this.despawnRemote(playerId);
			});
		}
	};
}
