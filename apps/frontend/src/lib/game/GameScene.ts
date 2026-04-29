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
		canvasW, canvasH, roomId, username,
		emitIntervalMs, lerpStiffness, playerSpeed,
		livekitRoom, proximityRadius = 200,
	} = cfg;

	return class GameScene extends Phaser.Scene {
		private local!: Phaser.GameObjects.Rectangle;
		private localLabel!: Phaser.GameObjects.Text;
		private localIndicator!: Phaser.GameObjects.Arc;
		private proximityCircle!: Phaser.GameObjects.Arc;
		private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
		private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
		private lastEmit = 0;

		private remote = new Map<string, {
			sprite: Phaser.GameObjects.Rectangle;
			label: Phaser.GameObjects.Text;
			indicator: Phaser.GameObjects.Arc;
			targetX: number;
			targetY: number;
			username: string;
			speaking: boolean;
		}>();

		constructor() { super({ key: 'GameScene' }); }

		create() {
			this.buildGrid();

			this.local = this.add.rectangle(canvasW / 2, canvasH / 2, 32, 32, 0x22c55e);
			this.localLabel = this.add
				.text(canvasW / 2, canvasH / 2 - 26, username, {
					fontSize: '11px', color: '#ffffff',
					stroke: '#000000', strokeThickness: 2,
				})
				.setOrigin(0.5);
			this.localIndicator = this.makeIndicator(canvasW / 2, canvasH / 2);
			this.proximityCircle = this.add.arc(canvasW / 2, canvasH / 2, proximityRadius, 0, 360, false);
			this.proximityCircle.setStrokeStyle(1, 0x22c55e, 0.25);
			this.proximityCircle.setFillStyle(0x22c55e, 0.03);
			this.proximityCircle.setDepth(-1);

			this.cursors = this.input.keyboard!.createCursorKeys();
			this.wasd = {
				up:    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
				down:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
				left:  this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
				right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
			};

			this.bindSocketEvents();
			const join = () => socket.emit('room:join', { roomId, username });
			socket.connected ? join() : socket.once('connect', join);
		}

		update(time: number, delta: number) {
			const dt = delta / 1000;
			let vx = 0, vy = 0;
			if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx = -playerSpeed;
			else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = playerSpeed;
			if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy = -playerSpeed;
			else if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy = playerSpeed;

			this.local.x = Phaser.Math.Clamp(this.local.x + vx * dt, 16, canvasW - 16);
			this.local.y = Phaser.Math.Clamp(this.local.y + vy * dt, 16, canvasH - 16);
			this.localLabel.setPosition(this.local.x, this.local.y - 26);
			this.localIndicator.setPosition(this.local.x - this.localLabel.width / 2 - 10, this.local.y - 26);
			this.proximityCircle.setPosition(this.local.x, this.local.y);

			if (time - this.lastEmit >= emitIntervalMs && socket.connected) {
				socket.emit('player:move', { x: Math.round(this.local.x), y: Math.round(this.local.y), roomId });
				this.lastEmit = time;
			}

			const alpha = 1 - Math.pow(lerpStiffness, dt);
			for (const r of this.remote.values()) {
				r.sprite.x = Phaser.Math.Linear(r.sprite.x, r.targetX, alpha);
				r.sprite.y = Phaser.Math.Linear(r.sprite.y, r.targetY, alpha);
				r.label.setPosition(r.sprite.x, r.sprite.y - 26);
				r.indicator.setPosition(r.sprite.x - r.label.width / 2 - 10, r.sprite.y - 26);
			}

			this.updateProximityVolumes();
			this.updateSpeakingIndicators();
		}

		private makeIndicator(x: number, y: number): Phaser.GameObjects.Arc {
			const arc = this.add.arc(x, y, 5, 0, 360, false, 0x22c55e, 0);
			arc.setStrokeStyle(1.5, 0x22c55e);
			return arc;
		}

		private updateSpeakingIndicators() {
			if (!livekitRoom) return;
			const speakers = livekitRoom.activeSpeakers;

			// Local player
			const localSpeaking = speakers.some((p) => p.identity === username);
			this.localIndicator.setFillStyle(0x22c55e, localSpeaking ? 1 : 0);

			// Remote players
			for (const r of this.remote.values()) {
				const speaking = speakers.some((p) => p.identity === r.username);
				if (speaking !== r.speaking) {
					r.speaking = speaking;
					r.indicator.setFillStyle(0x22c55e, speaking ? 1 : 0);
				}
			}
		}

		private updateProximityVolumes() {
			if (!livekitRoom) return;
			for (const r of this.remote.values()) {
				const dist = Phaser.Math.Distance.Between(
					this.local.x, this.local.y, r.sprite.x, r.sprite.y,
				);
				const vol = Math.max(0, 1 - dist / proximityRadius);
				for (const participant of livekitRoom.remoteParticipants.values()) {
					if (participant.identity === r.username) {
						for (const pub of participant.audioTrackPublications.values()) {
							const track = pub.track as any;
							if (!track) continue;
							track.setVolume?.(vol);
							(track.attachedElements as HTMLMediaElement[] | undefined)
								?.forEach((el) => { el.muted = false; el.volume = vol; });
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
					fontSize: '11px', color: '#ffffff',
					stroke: '#000000', strokeThickness: 2,
				})
				.setOrigin(0.5);
			const indicator = this.makeIndicator(x, y - 26);
			this.remote.set(id, { sprite, label, indicator, targetX: x, targetY: y, username: name, speaking: false });
		}

		private despawnRemote(id: string) {
			const r = this.remote.get(id);
			if (!r) return;
			r.sprite.destroy();
			r.label.destroy();
			r.indicator.destroy();
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
				if (r) { r.targetX = p.x; r.targetY = p.y; }
			});
			socket.on('player:left', ({ playerId }) => { this.despawnRemote(playerId); });
		}
	};
}
