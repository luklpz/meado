/* MEADO · overlays.js — registro, perfil popout, ajustes de usuario y de
   servidor, desplegable del servidor y modal explorar/crear servidores.
   Las funciones se llaman desde render() en app.js (mismo scope global). */

/* ───────────────────────────────────── helpers ── */
function personFor(name) {
	if (name === ME.name) return ME;
	const f = FRIENDS.find(x => x.name === name) || MEMBERS_ONLINE.find(x => x.name === name) || {};
	return {
		name, tag: name.toLowerCase().replace(/\s+/g, '_'),
		status: f.status || 'online',
		pronouns: '',
		bio: 'Miembro de La Cabaña 🏡 — por aquí de vez en cuando.',
		memberSince: '2024',
		roles: f.role ? [f.role, 'Miembro'] : ['Miembro'],
	};
}
function roleColor(name) { const r = ROLES.find(x => x.name === name); return r ? r.color : 'var(--text-muted)'; }
function relationOf(name) {
	if (name in state.relations) return state.relations[name];
	return FRIENDS.some(f => f.name === name) ? 'friend' : 'none';
}
function mutualFriends(name) { return FRIENDS.filter(f => f.name !== name).slice(0, 5); }
function mutualServers(name) { return SERVERS.slice(0, 3); }
function roleChips(roles) {
	return `<div class="role-chips">${roles.map(r => `<span class="role-chip"><span class="role-dot" style="background:${roleColor(r)}"></span>${r}</span>`).join('')}</div>`;
}

/* controles de apariencia (reutilizados en la tarjeta y en ajustes) */
function appearanceControlsHTML() {
	return `
		<div class="set-field">
			<div class="set-field-head"><span class="set-field-label">Fondo</span><span class="set-field-sub">Claro u oscuro, a tu gusto</span></div>
			<div class="theme-base-cards">
				${BASES.map(b => `<button class="theme-base-card ${state.base === b.id ? 'active' : ''}" data-base="${b.id}">
					<span class="tbc-preview tbc-${b.id}"><span class="tbc-bar"></span><span class="tbc-bar short"></span></span>
					<span class="tbc-name">${b.label} ${state.base === b.id ? icon('check', 'tbc-check') : ''}</span>
				</button>`).join('')}
			</div>
		</div>
		<div class="set-field">
			<div class="set-field-head"><span class="set-field-label">Color de acento</span><span class="set-field-sub">El color principal de botones y estados</span></div>
			<div class="accent-grid">
				${ACCENTS.map(a => `<button class="accent-chip ${state.accent === a.id ? 'active' : ''}" data-accent="${a.id}" style="--sw:${a.c}">
					<span class="accent-dot"></span><span class="accent-name">${a.label}</span>
				</button>`).join('')}
			</div>
		</div>`;
}

/* ═══════════════════════════════════ REGISTRO ══ */
function renderRegister() {
	return `<div class="auth-wrap">
		<div class="auth-card auth-card-wide">
			<div class="auth-logo">
				<div class="auth-mark">m</div>
				<div class="auth-name">meado</div>
			</div>
			<p class="auth-tag">Crea tu cuenta y empieza a estar cerca.</p>
			<form class="auth-form" onsubmit="return false">
				<label class="field"><span>Nombre para mostrar</span><input class="input" type="text" placeholder="¿Cómo te llamamos?" value="Lucas"></label>
				<div class="field-row">
					<label class="field"><span>Usuario</span><input class="input" type="text" placeholder="username" value="lucas_meado"></label>
					<label class="field"><span>Email</span><input class="input" type="email" placeholder="hola@meado.es" value="lucas@meado.es"></label>
				</div>
				<label class="field"><span>Contraseña</span><input class="input" type="password" placeholder="••••••••" value="meadolandia"></label>
				<label class="check-row"><input type="checkbox" class="check" checked><span>Acepto los <a href="#">términos</a> y la <a href="#">privacidad</a>.</span></label>
				<button class="btn block" data-screen="home" type="button">Crear cuenta</button>
			</form>
			<div class="auth-foot">¿Ya tienes cuenta? <a href="#" data-screen="login">Inicia sesión</a></div>
		</div>
	</div>`;
}

/* ═══════════════════════════ DESPLEGABLE DEL SERVIDOR ══ */
function renderServerMenu() {
	const item = (act, ic, label, extra = '') => `<button class="srvmenu-item ${extra}" data-action="${act}">${icon(ic)} <span>${label}</span>${extra === 'accent' ? icon('chevronRight', 'sm-chev') : ''}</button>`;
	return `<div class="srvmenu" data-stop>
		<div class="srvmenu-banner">
			<div class="srvmenu-boost">${icon('sparkles')} Nivel ${SERVER_INFO.boost} · ${SERVER_INFO.members} miembros</div>
		</div>
		${item('open-invite', 'userPlus', 'Invitar gente', 'accent')}
		<div class="srvmenu-sep"></div>
		${item('open-server-settings', 'settings', 'Ajustes del servidor')}
		${item('srv-channels', 'plus', 'Crear canal')}
		${item('srv-channels', 'hash', 'Crear categoría')}
		<div class="srvmenu-sep"></div>
		${item('close-menu', 'bell', 'Notificaciones')}
		${item('close-menu', 'shield', 'Privacidad')}
		<div class="srvmenu-sep"></div>
		<button class="srvmenu-item danger" data-action="close-menu">${icon('logout')} <span>Salir del servidor</span></button>
	</div>`;
}

/* ═══════════════════════════ PERFIL DE USUARIO (popout) ══ */
function renderUserProfileCard(name) {
	const p = personFor(name);
	const me = name === ME.name;
	const rel = relationOf(name);
	const mf = mutualFriends(name);
	const ms = mutualServers(name);

	const actions = me ? `
		<button class="btn ghost sm" data-action="open-user-settings">${icon('pencil')} Editar perfil</button>
	` : `
		<button class="uprofile-act primary" data-action="send-dm-profile" data-uname="${p.name}">${icon('message')} Mensaje</button>
		${rel === 'friend'
			? `<button class="uprofile-act" data-action="remove-friend" data-uname="${p.name}">${icon('userMinus')} Quitar amigo</button>`
			: rel === 'blocked'
				? `<button class="uprofile-act" data-action="unblock-user" data-uname="${p.name}">${icon('check')} Desbloquear</button>`
				: `<button class="uprofile-act primary-soft" data-action="add-friend" data-uname="${p.name}">${icon('userPlus')} Añadir amigo</button>`}
		<button class="uprofile-act icon ${rel === 'blocked' ? 'active-danger' : ''}" data-action="${rel === 'blocked' ? 'unblock-user' : 'block-user'}" data-uname="${p.name}" title="${rel === 'blocked' ? 'Desbloquear' : 'Bloquear'}">${icon('ban')}</button>
		<button class="uprofile-act icon" data-action="report-user" data-uname="${p.name}" title="Denunciar">${icon('flag')}</button>
	`;

	return `<div class="overlay-scrim" data-scrim="overlay">
		<div class="uprofile-card big" data-stop data-screen-label="Perfil de ${p.name}">
			<div class="uprofile-banner" style="background:linear-gradient(120deg, var(--accent), var(--accent-strong))">
				<button class="uprofile-x" data-action="close-overlay">${icon('x')}</button>
			</div>
			<div class="uprofile-head">
				<div class="avatar uprofile-avatar" style="background:${avatarColor(p.name)}">${initial(p.name)}<span class="status-ring st-${p.status}"></span></div>
			</div>
			<div class="uprofile-body">
				<div class="uprofile-idline">
					<div>
						<div class="uprofile-name">${p.name}</div>
						<div class="uprofile-tag">@${p.tag}${p.pronouns ? ` · ${p.pronouns}` : ''}</div>
					</div>
					<div class="uprofile-status-chip"><span class="pp-bullet" style="background:var(--st-${p.status})"></span>${STATUS_LABEL[p.status]}</div>
				</div>

				<div class="uprofile-actions">${actions}</div>

				${rel === 'blocked' && !me ? `<div class="uprofile-blocked-note">${icon('ban')} Has bloqueado a ${p.name}. No recibirás sus mensajes.</div>` : ''}

				<div class="uprofile-scroll">
					<section class="uprofile-section">
						<div class="uprofile-label">Sobre mí</div>
						<p class="uprofile-bio">${p.bio}</p>
					</section>

					<div class="uprofile-grid2">
						<section class="uprofile-section">
							<div class="uprofile-label">Roles</div>
							${roleChips(p.roles)}
						</section>
						<section class="uprofile-section">
							<div class="uprofile-label">Miembro desde</div>
							<p class="uprofile-meta">${p.memberSince}</p>
						</section>
					</div>

					${me ? '' : `
					<section class="uprofile-section">
						<div class="uprofile-label">${mf.length} amigos en común</div>
						<div class="mutual-friends">
							${mf.map(f => `<button class="mutual-friend" data-profile="${f.name}">
								<div class="avatar mutual-avatar" style="background:${avatarColor(f.name)}">${initial(f.name)}<span class="status-ring sm st-${f.status}"></span></div>
								<span class="mutual-fname">${f.name}</span>
							</button>`).join('')}
						</div>
					</section>

					<section class="uprofile-section">
						<div class="uprofile-label">${ms.length} servidores en común</div>
						<div class="mutual-servers">
							${ms.map(s => `<div class="mutual-server"><div class="mutual-srv-badge">${s.initial}</div><span class="mutual-sname">${s.name}</span></div>`).join('')}
						</div>
					</section>
					`}
				</div>

				${me ? '' : `<div class="composer-box uprofile-msg"><input class="composer-input" placeholder="Mensaje a ${p.name}" style="padding-left:.5rem"><button class="send-btn" disabled>${icon('send')}</button></div>`}
			</div>
		</div>
	</div>`;
}

/* ═══════════════════════════════════ AJUSTES DE USUARIO ══ */
const USER_SECTIONS = [
	{ group: 'Ajustes de usuario', items: [
		{ id: 'cuenta', label: 'Mi cuenta', icon: 'user' },
		{ id: 'perfil', label: 'Perfil', icon: 'at' },
		{ id: 'privacidad', label: 'Privacidad y seguridad', icon: 'shield' },
	] },
	{ group: 'Ajustes de la app', items: [
		{ id: 'apariencia', label: 'Apariencia', icon: 'palette' },
		{ id: 'notif', label: 'Notificaciones', icon: 'bell' },
		{ id: 'voz', label: 'Voz y vídeo', icon: 'mic' },
	] },
];

function renderUserSettings() {
	const sec = state.settingsSection;
	return `<div class="settings-overlay" data-screen-label="Ajustes de usuario">
		<nav class="settings-nav">
			<div class="settings-nav-inner">
				${USER_SECTIONS.map(g => `<div class="set-cat">${g.group}</div>
					${g.items.map(i => `<button class="set-nav-item ${sec === i.id ? 'active' : ''}" data-settings="${i.id}">${icon(i.icon)} ${i.label}</button>`).join('')}`).join('')}
				<div class="set-nav-sep"></div>
				<button class="set-nav-item danger" data-action="logout">${icon('logout')} Cerrar sesión</button>
			</div>
		</nav>
		<div class="settings-main">
			<div class="settings-content">${userSection(sec)}</div>
			<button class="settings-close" data-action="close-overlay"><span class="sc-ring">${icon('x')}</span><span class="sc-esc">ESC</span></button>
		</div>
	</div>`;
}

function userSection(sec) {
	if (sec === 'perfil') return userProfileEditSection();
	if (sec === 'apariencia') return `<h2 class="set-title">Apariencia</h2><p class="set-lead">Personaliza cómo se ve meado. Los cambios se aplican al instante.</p>${appearanceControlsHTML()}
		<div class="set-field">
			<div class="set-field-head"><span class="set-field-label">Mensajes</span></div>
			<label class="set-toggle"><span><strong>Modo compacto</strong><em>Menos espacio entre mensajes</em></span><span class="switch"><input type="checkbox"><span class="switch-track"></span></span></label>
			<label class="set-toggle"><span><strong>Mostrar avatares</strong><em>Foto junto a cada mensaje</em></span><span class="switch"><input type="checkbox" checked><span class="switch-track"></span></span></label>
		</div>`;
	if (sec === 'notif') return `<h2 class="set-title">Notificaciones</h2><p class="set-lead">Decide qué quieres que te avise.</p>
		<div class="set-field">
			${toggle('Mensajes directos', 'Avisos de tus DMs', true)}
			${toggle('Menciones', 'Cuando te mencionan con @', true)}
			${toggle('Sonidos', 'Tono al recibir mensajes', true)}
			${toggle('Resumen por email', 'Un correo semanal con lo importante', false)}
		</div>`;
	if (sec === 'voz') return `<h2 class="set-title">Voz y vídeo</h2><p class="set-lead">Ajusta tus dispositivos para las salas de voz.</p>
		<div class="set-grid-2">
			<div class="set-field"><div class="set-field-label">Dispositivo de entrada</div><div class="set-select">${icon('mic')} MacBook Pro · Micrófono ${icon('chevronDown')}</div></div>
			<div class="set-field"><div class="set-field-label">Dispositivo de salida</div><div class="set-select">${icon('headphones')} Auriculares Bluetooth ${icon('chevronDown')}</div></div>
		</div>
		<div class="set-grid-2">
			<div class="set-field"><div class="set-field-label">Volumen de entrada</div>${sliderRow(80)}</div>
			<div class="set-field"><div class="set-field-label">Volumen de salida</div>${sliderRow(65)}</div>
		</div>
		<div class="set-field"><div class="set-field-label">Sensibilidad del micro</div>
			${sliderRow(62)}
			<div class="meter-row" style="margin-top:.6rem"><div class="meter"><div class="meter-fill" style="width:62%"></div></div><span class="meter-val">Detectando voz</span></div>
			<div class="field-hint">El indicador se ilumina cuando se detecta tu voz.</div>
		</div>
		<div class="set-grid-2">
			<div class="set-field"><div class="set-field-label">Cámara</div><div class="set-select">${icon('video')} Cámara FaceTime HD ${icon('chevronDown')}</div></div>
			<div class="set-field"><div class="set-field-label">Resolución de vídeo</div><div class="set-select">${icon('monitor')} 720p · 30 fps ${icon('chevronDown')}</div></div>
		</div>
		<div class="set-field"><div class="set-field-label">Vista previa de la cámara</div><div class="video-prev">${icon('video')}<span>Vista previa de la cámara</span></div></div>`;
	if (sec === 'privacidad') return `<h2 class="set-title">Privacidad y seguridad</h2><p class="set-lead">Tú decides quién puede contactarte.</p>
		<div class="set-field">
			${toggle('Permitir DMs de miembros del servidor', 'Cualquiera de tus servidores puede escribirte', true)}
			${toggle('Solicitudes de amistad de todos', 'Si no, solo amigos de amigos', false)}
			${toggle('Mostrar mi estado de actividad', 'Otros ven a qué juegas o escuchas', true)}
		</div>`;
	// cuenta (por defecto)
	return `<h2 class="set-title">Mi cuenta</h2>
		<div class="account-card">
			<div class="account-banner"></div>
			<div class="account-id">
				<div class="avatar account-avatar" style="background:${avatarColor(ME.name)}">${initial(ME.name)}<span class="status-ring st-${ME.status}"></span></div>
				<div class="account-name-wrap"><div class="account-name">${ME.name}</div><div class="account-tag">@${ME.tag}</div></div>
				<button class="btn sm" data-settings="perfil">Editar perfil</button>
			</div>
		</div>
		<div class="info-rows">
			${infoRow('Nombre para mostrar', ME.name)}
			${infoRow('Nombre de usuario', '@' + ME.tag, false)}
			${infoRow('Email', ME.email)}
			${infoRow('Teléfono', ME.phone)}
		</div>
		<p class="set-foot-note">${icon('lock')} Tu nombre de usuario es único y permanente, por eso no se puede cambiar.</p>`;
}

function userProfileEditSection() {
	const bc = (ACCENTS.find(a => a.id === state.bannerColor) || ACCENTS[0]).c;
	return `<h2 class="set-title">Perfil</h2><p class="set-lead">Así te ven los demás en meado.</p>
		<div class="profile-edit">
			<div class="profile-edit-form">
				<div class="set-field"><div class="set-field-label">Nombre para mostrar</div><input class="input" value="${ME.name}"></div>
				<div class="set-field"><div class="set-field-label">Pronombres</div><input class="input" value="${ME.pronouns}" placeholder="opcional"></div>
				<div class="set-field"><div class="set-field-label">Sobre mí</div><textarea class="input area" rows="4">${ME.bio}</textarea><div class="field-hint">Markdown ligero permitido · 190 caracteres</div></div>
				<div class="set-field"><div class="set-field-label">Avatar</div><div class="upload-row"><div class="upload-slot" style="background:${avatarColor(ME.name)}">${initial(ME.name)}</div><button class="btn ghost sm">${icon('camera')} Cambiar avatar</button></div></div>
				<div class="set-field"><div class="set-field-label">Color del banner</div>
					<div class="accent-grid">${ACCENTS.map(a => `<button class="accent-chip ${state.bannerColor === a.id ? 'active' : ''}" data-banner="${a.id}" style="--sw:${a.c}" title="${a.label}"><span class="accent-dot"></span></button>`).join('')}</div>
				</div>
			</div>
			<div class="profile-edit-preview">
				<div class="set-field-label">Vista previa</div>
				<div class="preview-card">
					<div class="preview-banner" style="background:linear-gradient(120deg, ${bc}, color-mix(in oklab, ${bc} 65%, #000))"></div>
					<div class="avatar preview-avatar" style="background:${avatarColor(ME.name)}">${initial(ME.name)}<span class="status-ring st-online"></span></div>
					<div class="preview-body">
						<div class="preview-name">${ME.name}</div>
						<div class="preview-tag">@${ME.tag}${ME.pronouns ? ' · ' + ME.pronouns : ''}</div>
						<div class="preview-divider"></div>
						<div class="uprofile-label">Sobre mí</div>
						<p class="uprofile-bio">${ME.bio}</p>
						<div class="uprofile-label">Roles</div>
						${roleChips(ME.roles)}
					</div>
				</div>
			</div>
		</div>`;
}

/* ═══════════════════════════════════ AJUSTES DEL SERVIDOR ══ */
const SRV_SECTIONS = [
	{ group: SERVER_INFO.name, items: [
		{ id: 'info', label: 'Información', icon: 'sliders' },
		{ id: 'roles', label: 'Roles', icon: 'shield' },
		{ id: 'channels', label: 'Canales', icon: 'hash' },
		{ id: 'invite', label: 'Invitaciones', icon: 'userPlus' },
	] },
];

function renderServerSettings() {
	const sec = state.srvSection;
	return `<div class="settings-overlay" data-screen-label="Ajustes del servidor">
		<nav class="settings-nav">
			<div class="settings-nav-inner">
				<div class="srv-nav-head"><div class="srv-icon sm">${SERVER_INFO.initial}</div><span>${SERVER_INFO.name}</span></div>
				${SRV_SECTIONS.map(g => g.items.map(i => `<button class="set-nav-item ${sec === i.id ? 'active' : ''}" data-srvsettings="${i.id}">${icon(i.icon)} ${i.label}</button>`).join('')).join('')}
				<div class="set-nav-sep"></div>
				<button class="set-nav-item danger" data-action="close-overlay">${icon('trash')} Eliminar servidor</button>
			</div>
		</nav>
		<div class="settings-main">
			<div class="settings-content">${srvSection(sec)}</div>
			<button class="settings-close" data-action="close-overlay"><span class="sc-ring">${icon('x')}</span><span class="sc-esc">ESC</span></button>
		</div>
	</div>`;
}

function srvSection(sec) {
	if (sec === 'roles') return `<h2 class="set-title">Roles</h2><p class="set-lead">Organiza permisos y colores por grupo.</p>
		<button class="btn sm self-start">${icon('plus')} Crear rol</button>
		<div class="role-list">
			${ROLES.map(r => `<div class="role-row"><span class="role-swatch" style="background:${r.color}"></span><span class="role-row-name">${r.name}</span><span class="role-row-count">${icon('users')} ${r.members}</span><button class="icon-action sm">${icon('settings')}</button></div>`).join('')}
		</div>`;
	if (sec === 'channels') return `<h2 class="set-title">Canales</h2><p class="set-lead">Arrastra para reordenar. Texto y voz.</p>
		<div class="set-field-label">Texto</div>
		<div class="role-list">${TEXT_CHANNELS.map(c => `<div class="role-row"><span class="ch-glyph-sm">${icon('hash')}</span><span class="role-row-name">${c.name}</span><button class="icon-action sm">${icon('settings')}</button></div>`).join('')}</div>
		<div class="set-field-label" style="margin-top:1rem">Voz</div>
		<div class="role-list">${VOICE_CHANNELS.map(c => `<div class="role-row"><span class="ch-glyph-sm">${icon('volume2')}</span><span class="role-row-name">${c.name}</span><button class="icon-action sm">${icon('settings')}</button></div>`).join('')}</div>`;
	if (sec === 'invite') return `<h2 class="set-title">Invitaciones</h2><p class="set-lead">Comparte este enlace para que entren a ${SERVER_INFO.name}.</p>
		<div class="set-field">
			<div class="set-field-label">Enlace de invitación</div>
			<div class="invite-box"><span class="invite-link">${SERVER_INFO.invite}</span><button class="btn sm" data-action="copy-invite" id="copyInviteBtn">${icon('copy')} Copiar</button></div>
		</div>
		<div class="set-grid-2">
			<div class="set-field"><div class="set-field-label">Caduca en</div><div class="set-select">7 días ${icon('chevronDown')}</div></div>
			<div class="set-field"><div class="set-field-label">Usos máximos</div><div class="set-select">Sin límite ${icon('chevronDown')}</div></div>
		</div>
		${toggle('Solo invitación temporal', 'Los miembros sin rol se eliminan al desconectar', false)}`;
	// info (por defecto)
	return `<h2 class="set-title">Información del servidor</h2>
		<div class="set-field"><div class="set-field-label">Icono y nombre</div>
			<div class="upload-row"><div class="upload-slot sq">${SERVER_INFO.initial}</div>
				<div class="grow"><input class="input" value="${SERVER_INFO.name}"><button class="btn ghost sm" style="margin-top:.5rem">${icon('camera')} Subir icono</button></div>
			</div>
		</div>
		<div class="set-field"><div class="set-field-label">Descripción</div><textarea class="input area" rows="3">${SERVER_INFO.description}</textarea></div>
		<div class="srv-stats">
			<div class="srv-stat"><span class="srv-stat-num">${SERVER_INFO.members}</span><span class="srv-stat-lab">miembros</span></div>
			<div class="srv-stat"><span class="srv-stat-num">${SERVER_INFO.online}</span><span class="srv-stat-lab">en línea</span></div>
			<div class="srv-stat"><span class="srv-stat-num">${SERVER_INFO.boost}</span><span class="srv-stat-lab">nivel boost</span></div>
			<div class="srv-stat"><span class="srv-stat-num">${SERVER_INFO.created.split(' de ')[0]}</span><span class="srv-stat-lab">creado mar.</span></div>
		</div>`;
}

/* ═══════════════════════════ MODAL: EXPLORAR / CREAR ══ */
const DISCOVER = [
	{ initial: 'P', name: 'Pueblo Pixel', desc: 'Comunidad de pixel art y juegos retro', cat: 'Arte', members: 1280, hue: 18 },
	{ initial: 'L', name: 'Lo-fi & Estudio', desc: 'Música para concentrarse y estudiar juntos', cat: 'Música', members: 642, hue: 265 },
	{ initial: 'V', name: 'Viajeros', desc: 'Rutas, mapas y quedadas por el mundo', cat: 'Viajes', members: 390, hue: 150 },
	{ initial: 'J', name: 'Jardín Lento', desc: 'Plantas, calma y café de domingo', cat: 'Bienestar', members: 214, hue: 95 },
	{ initial: 'C', name: 'Cocina Casera', desc: 'Recetas, fotos de platos y dudas', cat: 'Comida', members: 508, hue: 32 },
	{ initial: 'D', name: 'Dev Tranqui', desc: 'Programar sin prisa, dudas y proyectos', cat: 'Tecnología', members: 873, hue: 210 },
];
const DISCOVER_CATS = ['Para ti', 'Arte', 'Música', 'Juegos', 'Tecnología', 'Bienestar', 'Comida'];

function renderServerModal() {
	const tab = state.modalTab || 'explore';
	return `<div class="modal-overlay" data-scrim="modal">
		<div class="modal modal-lg" data-stop>
			<div class="modal-head">
				<div class="modal-tabs">
					<button class="modal-tab ${tab === 'explore' ? 'active' : ''}" data-modaltab="explore">${icon('search')} Explorar</button>
					<button class="modal-tab ${tab === 'create' ? 'active' : ''}" data-modaltab="create">${icon('plus')} Crear servidor</button>
				</div>
				<button class="modal-close" data-action="close-modal">${icon('x')}</button>
			</div>
			<div class="modal-body">${tab === 'create' ? createServerBody() : exploreBody()}</div>
		</div>
	</div>`;
}

function exploreBody() {
	return `<div class="discover-hero">
			<h3>Encuentra tu sitio</h3>
			<p>Comunidades pequeñas y con cariño. Entra a curiosear.</p>
			<div class="discover-search">${icon('search')}<input placeholder="Busca por tema: arte, lo-fi, plantas…"></div>
		</div>
		<div class="discover-cats">${DISCOVER_CATS.map((c, i) => `<button class="cat-chip ${i === 0 ? 'active' : ''}">${c}</button>`).join('')}</div>
		<div class="discover-grid">
			${DISCOVER.map(s => `<div class="disc-card">
				<div class="disc-banner" style="background:linear-gradient(125deg, oklch(0.62 0.13 ${s.hue}), oklch(0.52 0.14 ${s.hue + 18}))"></div>
				<div class="disc-icon" style="background:oklch(0.55 0.14 ${s.hue})">${s.initial}</div>
				<div class="disc-body">
					<div class="disc-name">${s.name}</div>
					<div class="disc-desc">${s.desc}</div>
					<div class="disc-foot"><span class="disc-meta"><span class="online-dot"></span>${s.members.toLocaleString('es')} miembros</span><button class="btn sm">Entrar</button></div>
				</div>
			</div>`).join('')}
		</div>`;
}

function createServerBody() {
	return `<div class="create-wrap">
		<h3 class="create-title">Crea tu servidor</h3>
		<p class="create-sub">Un servidor es tu rincón para estar con tu gente. Empieza con una plantilla o desde cero.</p>
		<div class="upload-circle"><span class="upload-camera">${icon('camera')}</span><span class="upload-hint">SUBIR</span></div>
		<label class="field create-field"><span>Nombre del servidor</span><input class="input" placeholder="La casa de…" value="Mi rincón"></label>
		<label class="field create-field"><span>Región de voz</span><div class="set-select">${icon('globe')} Europa Occidental ${icon('chevronDown')}</div></label>
		<div class="create-templates">
			<span class="create-templates-label">O empieza con una plantilla</span>
			<div class="tmpl-row">
				${[['users', 'Amigos'], ['sparkles', 'Comunidad'], ['monitor', 'Estudio'], ['radio', 'Música']].map(t => `<button class="tmpl-chip">${icon(t[0])} ${t[1]}</button>`).join('')}
			</div>
		</div>
		<button class="btn block create-cta" data-action="close-modal">Crear servidor</button>
		<div class="create-foot">¿Tienes una invitación? <a href="#" data-action="set-explore">Únete a uno</a></div>
	</div>`;
}

/* pequeños helpers de markup */
function toggle(title, sub, on) {
	return `<label class="set-toggle"><span><strong>${title}</strong><em>${sub}</em></span><span class="switch"><input type="checkbox" ${on ? 'checked' : ''}><span class="switch-track"></span></span></label>`;
}
function sliderRow(val) {
	return `<div class="slider-row"><input type="range" class="set-range" min="0" max="100" value="${val}" oninput="this.nextElementSibling.textContent=this.value+'%'"><span class="slider-val">${val}%</span></div>`;
}
function infoRow(label, value, editable = true) {
	const right = editable
		? `<button class="btn ghost sm">Editar</button>`
		: `<span class="info-locked">${icon('lock')} No editable</span>`;
	return `<div class="info-row"><div class="info-row-text"><div class="info-row-label">${label}</div><div class="info-row-value">${value}</div></div>${right}</div>`;
}
