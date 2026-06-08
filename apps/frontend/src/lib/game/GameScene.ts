// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GameSocket = any; // Phase 2 — socket types updated for Phase 1 chat
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
	getOutputVolume?: () => number;
}

type PhaserType = typeof import('phaser');
type Direction = 'down' | 'left' | 'right' | 'up' | 'down-right' | 'down-left' | 'up-right' | 'up-left';

const FRAME_W = 16;
const FRAME_H = 32;
const SCALE = 2;
const SPRITE_HALF_W = (FRAME_W * SCALE) / 2;
const SPRITE_HALF_H = (FRAME_H * SCALE) / 2;
const LABEL_OFFSET_Y = SPRITE_HALF_H + 8;

export function createGameScene(Phaser: PhaserType, socket: GameSocket, cfg: SceneConfig) {
	const {
		canvasW, canvasH, roomId, username,
		emitIntervalMs, lerpStiffness, playerSpeed,
		livekitRoom, proximityRadius = 200, getOutputVolume,
	} = cfg;

	return class GameScene extends Phaser.Scene {
		private local!: Phaser.GameObjects.Sprite;
		private localLabel!: Phaser.GameObjects.Text;
		private localIndicator!: Phaser.GameObjects.Arc;
		private proximityCircle!: Phaser.GameObjects.Arc;
		private localDir: Direction = 'down';
		private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
		private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
		private lastEmit = 0;

		private remote = new Map<string, {
			sprite: Phaser.GameObjects.Sprite;
			label: Phaser.GameObjects.Text;
			indicator: Phaser.GameObjects.Arc;
			targetX: number;
			targetY: number;
			username: string;
			speaking: boolean;
			dir: Direction;
		}>();

		constructor() { super({ key: 'GameScene' }); }

		preload() {
			// Placeholder: 20-frame spritesheet (5 dirs × 4 frames) drawn as colored rectangles.
			// Replace with a real spritesheet when available.
			const g = this.make.graphics({ x: 0, y: 0, add: false });
			g.fillStyle(0x5b8dd9, 1);
			for (let i = 0; i < 20; i++) {
				g.fillRoundedRect(i * FRAME_W + 1, 1, FRAME_W - 2, FRAME_H - 2, 2);
			}
			g.generateTexture('player', FRAME_W * 20, FRAME_H);
			g.destroy();
		}

		create() {
			this.buildGrid();
			this.createAnims();

			this.local = this.add.sprite(canvasW / 2, canvasH / 2, 'player').setScale(SCALE);
			this.local.play('idle-down');

			this.localLabel = this.add
				.text(canvasW / 2, canvasH / 2 - LABEL_OFFSET_Y, username, {
					fontSize: '11px', color: '#ffffff',
					stroke: '#000000', strokeThickness: 2,
				})
				.setOrigin(0.5);
			this.localIndicator = this.makeIndicator(canvasW / 2, canvasH / 2 - LABEL_OFFSET_Y);
			this.proximityCircle = this.add.arc(canvasW / 2, canvasH / 2, proximityRadius, 0, 360, false);
			this.proximityCircle.setStrokeStyle(1, 0x3b82f6, 0.25);
			this.proximityCircle.setFillStyle(0x3b82f6, 0.03);
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

		private createAnims() {
			const fps = 8;
			// Row 0: down (0–3), Row 1: down-right (4–7), Row 2: right (8–11)
			// Row 3: up-right (12–15), Row 4: up (16–19)
			// Left variants reuse right rows with flipX
			this.anims.create({ key: 'walk-down',       frames: this.anims.generateFrameNumbers('player', { start: 0,  end: 3  }), frameRate: fps, repeat: -1 });
			this.anims.create({ key: 'walk-down-right',  frames: this.anims.generateFrameNumbers('player', { start: 4,  end: 7  }), frameRate: fps, repeat: -1 });
			this.anims.create({ key: 'walk-right',       frames: this.anims.generateFrameNumbers('player', { start: 8,  end: 11 }), frameRate: fps, repeat: -1 });
			this.anims.create({ key: 'walk-up-right',    frames: this.anims.generateFrameNumbers('player', { start: 12, end: 15 }), frameRate: fps, repeat: -1 });
			this.anims.create({ key: 'walk-up',          frames: this.anims.generateFrameNumbers('player', { start: 16, end: 19 }), frameRate: fps, repeat: -1 });
			this.anims.create({ key: 'idle-down',        frames: [{ key: 'player', frame: 0  }], frameRate: 1 });
			this.anims.create({ key: 'idle-down-right',  frames: [{ key: 'player', frame: 4  }], frameRate: 1 });
			this.anims.create({ key: 'idle-right',       frames: [{ key: 'player', frame: 8  }], frameRate: 1 });
			this.anims.create({ key: 'idle-up-right',    frames: [{ key: 'player', frame: 12 }], frameRate: 1 });
			this.anims.create({ key: 'idle-up',          frames: [{ key: 'player', frame: 16 }], frameRate: 1 });
		}

		private playAnim(sprite: Phaser.GameObjects.Sprite, dir: Direction, moving: boolean) {
			const mirrorMap: Partial<Record<Direction, Direction>> = {
				'left': 'right', 'up-left': 'up-right', 'down-left': 'down-right',
			};
			const flip = dir in mirrorMap;
			const effectiveDir = mirrorMap[dir] ?? dir;
			const key = (moving ? 'walk-' : 'idle-') + effectiveDir;
			sprite.setFlipX(flip);
			if (sprite.anims.currentAnim?.key !== key) sprite.play(key);
		}

		update(time: number, delta: number) {
			const dt = delta / 1000;
			let vx = 0, vy = 0;
			if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx = -playerSpeed;
			else if (this.cursors.right.isDown || this.wasd.right.isDown) vx = playerSpeed;
			if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy = -playerSpeed;
			else if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy = playerSpeed;

			if      (vx < 0 && vy < 0) this.localDir = 'up-left';
			else if (vx > 0 && vy < 0) this.localDir = 'up-right';
			else if (vx < 0 && vy > 0) this.localDir = 'down-left';
			else if (vx > 0 && vy > 0) this.localDir = 'down-right';
			else if (vx < 0) this.localDir = 'left';
			else if (vx > 0) this.localDir = 'right';
			else if (vy < 0) this.localDir = 'up';
			else if (vy > 0) this.localDir = 'down';

			const moving = vx !== 0 || vy !== 0;
			this.playAnim(this.local, this.localDir, moving);

			this.local.x = Phaser.Math.Clamp(this.local.x + vx * dt, SPRITE_HALF_W, canvasW - SPRITE_HALF_W);
			this.local.y = Phaser.Math.Clamp(this.local.y + vy * dt, SPRITE_HALF_H, canvasH - SPRITE_HALF_H);
			this.localLabel.setPosition(this.local.x, this.local.y - LABEL_OFFSET_Y);
			this.localIndicator.setPosition(this.local.x - this.localLabel.width / 2 - 10, this.local.y - LABEL_OFFSET_Y);
			this.proximityCircle.setPosition(this.local.x, this.local.y);

			if (time - this.lastEmit >= emitIntervalMs && socket.connected) {
				socket.emit('player:move', { x: Math.round(this.local.x), y: Math.round(this.local.y), roomId });
				this.lastEmit = time;
			}

			const alpha = 1 - Math.pow(lerpStiffness, dt);
			for (const r of this.remote.values()) {
				const dx = r.targetX - r.sprite.x;
				const dy = r.targetY - r.sprite.y;
				const isMoving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;

				if (isMoving) {
					const adx = Math.abs(dx), ady = Math.abs(dy);
					const total = adx + ady;
					const diag = adx / total > 0.3 && ady / total > 0.3;
					if (diag) {
						r.dir = dx > 0 && dy < 0 ? 'up-right'
							: dx > 0 && dy > 0 ? 'down-right'
							: dx < 0 && dy < 0 ? 'up-left'
							: 'down-left';
					} else if (adx >= ady) {
						r.dir = dx > 0 ? 'right' : 'left';
					} else {
						r.dir = dy > 0 ? 'down' : 'up';
					}
				}

				this.playAnim(r.sprite, r.dir, isMoving);

				r.sprite.x = Phaser.Math.Linear(r.sprite.x, r.targetX, alpha);
				r.sprite.y = Phaser.Math.Linear(r.sprite.y, r.targetY, alpha);
				r.label.setPosition(r.sprite.x, r.sprite.y - LABEL_OFFSET_Y);
				r.indicator.setPosition(r.sprite.x - r.label.width / 2 - 10, r.sprite.y - LABEL_OFFSET_Y);
			}

			this.updateProximityVolumes();
			this.updateSpeakingIndicators();
		}

		private makeIndicator(x: number, y: number): Phaser.GameObjects.Arc {
			const arc = this.add.arc(x, y, 5, 0, 360, false, 0x3b82f6, 0);
			arc.setStrokeStyle(1.5, 0x3b82f6);
			return arc;
		}

		private updateSpeakingIndicators() {
			if (!livekitRoom) return;
			const speakerNames = new Set(livekitRoom.activeSpeakers.map((p) => p.name));

			const localSpeaking = speakerNames.has(username);
			this.localIndicator.setFillStyle(0x3b82f6, localSpeaking ? 1 : 0);

			for (const r of this.remote.values()) {
				const speaking = speakerNames.has(r.username);
				if (speaking !== r.speaking) {
					r.speaking = speaking;
					r.indicator.setFillStyle(0x3b82f6, speaking ? 1 : 0);
				}
			}
		}

		private updateProximityVolumes() {
			if (!livekitRoom) return;
			const masterVol = getOutputVolume?.() ?? 1;

			const participantByName = new Map<string, any>();
			for (const p of livekitRoom.remoteParticipants.values()) {
				if (p.name) participantByName.set(p.name, p);
			}

			for (const r of this.remote.values()) {
				const participant = participantByName.get(r.username);
				if (!participant) continue;
				const dist = Phaser.Math.Distance.Between(
					this.local.x, this.local.y, r.sprite.x, r.sprite.y,
				);
				const vol = Math.max(0, 1 - dist / proximityRadius) * masterVol;
				for (const pub of participant.audioTrackPublications.values()) {
					const track = pub.track as any;
					if (track) track.setVolume?.(vol);
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
			const sprite = this.add.sprite(x, y, 'player').setScale(SCALE);
			sprite.play('idle-down');
			const label = this.add
				.text(x, y - LABEL_OFFSET_Y, name, {
					fontSize: '11px', color: '#ffffff',
					stroke: '#000000', strokeThickness: 2,
				})
				.setOrigin(0.5);
			const indicator = this.makeIndicator(x, y - LABEL_OFFSET_Y);
			this.remote.set(id, { sprite, label, indicator, targetX: x, targetY: y, username: name, speaking: false, dir: 'down' });
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
			const onRoomState = ({ players }: { players: any[] }) => {
				players.forEach((p: any) => {
					if (p.playerId !== socket.id) this.spawnRemote(p.playerId, p.username, p.x, p.y);
				});
			};
			const onPlayerJoined = (p: any) => {
				if (p.playerId !== socket.id) this.spawnRemote(p.playerId, p.username, p.x, p.y);
			};
			const onPlayerMoved = (p: any) => {
				const r = this.remote.get(p.playerId);
				if (r) { r.targetX = p.x; r.targetY = p.y; }
			};
			const onPlayerLeft = ({ playerId }: { playerId: string }) => { this.despawnRemote(playerId); };

			socket.on('room:state', onRoomState);
			socket.on('player:joined', onPlayerJoined);
			socket.on('player:moved', onPlayerMoved);
			socket.on('player:left', onPlayerLeft);

			this.events.once('shutdown', () => {
				socket.off('room:state', onRoomState);
				socket.off('player:joined', onPlayerJoined);
				socket.off('player:moved', onPlayerMoved);
				socket.off('player:left', onPlayerLeft);
			});
		}
	};
}
