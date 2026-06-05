/* MEADO · app.js — render de pantallas, temas, navegación e interacciones */

const state = {
	screen: 'home',          // login | home | text | voice
	base: localStorage.getItem('meado-proto-base') || 'noche',     // noche | dia
	accent: localStorage.getItem('meado-proto-accent') || 'azul',  // azul | naranja | …
	device: 'desktop',       // desktop | mobile
	friendTab: 'online',
	dmOpen: null,           // null = lista de amigos | índice de DM abierto
	profileOpen: false,
	ppExpand: null,         // 'estado' | 'tema' | null — sección desplegable abierta en la tarjeta
	modalOpen: false,
	mobileNav: false,
	micOff: false,
	deafened: false,
	inVoice: true,
	serverMenuOpen: false,
	overlay: null,             // null | { type:'profile', name } | 'userSettings' | 'serverSettings'
	settingsSection: 'cuenta',
	srvSection: 'info',
	relations: {},             // name -> 'friend' | 'none' | 'blocked' (override sobre FRIENDS)
	bannerColor: 'naranja',    // color del banner del perfil (independiente del tema)
	modalTab: 'explore',
};

const frame = document.getElementById('frame');
const SCREENS = [
	{ id: 'login', label: 'Acceso' },
	{ id: 'home', label: 'Inicio' },
	{ id: 'text', label: 'Canal de texto' },
	{ id: 'voice', label: 'Canal de voz' },
];

/* ─────────────────────────────────────────────── Toolbar ── */
function renderToolbar() {
	document.getElementById('protoTabs').innerHTML = SCREENS.map(s =>
		`<button class="proto-tab ${state.screen === s.id ? 'active' : ''}" data-screen="${s.id}">${s.label}</button>`
	).join('');
	document.getElementById('baseToggle').innerHTML = BASES.map(b =>
		`<button class="base-btn ${state.base === b.id ? 'active' : ''}" data-base="${b.id}">${b.label}</button>`
	).join('');
	document.getElementById('themeSwatches').innerHTML = ACCENTS.map(a =>
		`<button class="theme-sw ${state.accent === a.id ? 'active' : ''}" data-accent="${a.id}" title="${a.label}" style="--sw:${a.c}"></button>`
	).join('');
	document.getElementById('devDesktop').classList.toggle('active', state.device === 'desktop');
	document.getElementById('devMobile').classList.toggle('active', state.device === 'mobile');
}

function applyTheme() {
	document.documentElement.setAttribute('data-base', state.base);
	document.documentElement.setAttribute('data-accent', state.accent);
	localStorage.setItem('meado-proto-base', state.base);
	localStorage.setItem('meado-proto-accent', state.accent);
}

/* ─────────────────────────────────────────────── Render ── */
function render() {
	frame.className = 'app-frame' + (state.device === 'mobile' ? ' mobile' : '');
	if (state.screen === 'login') { frame.innerHTML = renderLogin(); return; }
	if (state.screen === 'register') { frame.innerHTML = renderRegister(); return; }

	frame.innerHTML = `
		<div class="app-shell">
			${renderRail()}
			<div class="app-content">${renderScreen()}</div>
		</div>
		${renderStatusbar()}
		${state.profileOpen ? renderProfilePop() : ''}
		${state.serverMenuOpen ? renderServerMenu() : ''}
		${state.modalOpen ? renderServerModal() : ''}
		${state.overlay && state.overlay.type === 'profile' ? renderUserProfileCard(state.overlay.name) : ''}
		${state.overlay === 'userSettings' ? renderUserSettings() : ''}
		${state.overlay === 'serverSettings' ? renderServerSettings() : ''}
		${state.reportToast ? `<div class="toast"><span class="toast-ic">${icon('shield')}</span> Hemos recibido tu denuncia sobre <strong>${state.reportToast}</strong>. Gracias por avisar.</div>` : ''}
	`;
}

function renderScreen() {
	if (state.screen === 'home') return renderHome();
	if (state.screen === 'text') return renderServer('text');
	if (state.screen === 'voice') return renderServer('voice');
	return '';
}

/* ─────────────────────────────────────────────── Rail ── */
function renderRail() {
	const onHome = state.screen === 'home';
	const totalDm = DMS.reduce((a, d) => a + d.unread, 0);
	return `<nav class="rail">
		<button class="rail-btn rail-home ${onHome ? 'active' : ''}" data-screen="home" title="Inicio">
			<span class="rail-pip"></span><span class="home-glyph">m</span>
			${totalDm ? `<span class="rail-badge">${totalDm}</span>` : ''}
		</button>
		<div class="rail-sep"></div>
		${SERVERS.map(s => {
			const active = !onHome && s.active;
			return `<button class="rail-btn ${active ? 'active' : ''}" data-screen="${s.active ? 'text' : ''}" title="${s.name}">
				<span class="rail-pip"></span><span class="rail-initial">${s.initial}</span>
				${s.unread ? `<span class="rail-badge">${s.unread}</span>` : ''}
			</button>`;
		}).join('')}
		<button class="rail-btn rail-add" data-action="open-modal" title="Añadir servidor">+</button>
	</nav>`;
}

/* ─────────────────────────────────────────────── Status bar ── */
function renderStatusbar() {
	const sub = state.inVoice ? 'En la Sala de estar' : STATUS_LABEL[ME.status];
	const subCol = state.inVoice ? 'var(--success)' : `var(--st-${ME.status})`;
	return `<div class="statusbar">
		<button class="sb-identity" data-action="toggle-profile">
			<div class="avatar sb-avatar" style="background:${avatarColor(ME.name)}">${initial(ME.name)}
				<span class="status-ring ${state.inVoice ? 'st-online' : 'st-' + ME.status}"></span>
			</div>
			<div class="sb-info">
				<span class="sb-name">${ME.name}</span>
				<span class="sb-sub" style="color:${subCol}">${sub}</span>
			</div>
		</button>
		<div class="sb-controls">
			<button class="sb-btn ${state.micOff ? 'off' : ''}" data-action="toggle-mic" title="${state.micOff ? 'Activar micro' : 'Silenciar'}">${icon(state.micOff ? 'micOff' : 'mic')}</button>
			<button class="sb-btn ${state.deafened ? 'off' : ''}" data-action="toggle-deaf" title="${state.deafened ? 'Dejar de ensordecer' : 'Ensordecer'}">${icon(state.deafened ? 'volumeX' : 'headphones')}</button>
			<button class="sb-btn" data-action="open-user-settings" title="Ajustes de usuario">${icon('settings')}</button>
		</div>
	</div>`;
}

function renderProfilePop() {
	const statuses = ['online', 'away', 'dnd', 'invisible'];
	const accentLabel = (ACCENTS.find(a => a.id === state.accent) || {}).label || '';
	const baseLabel = (BASES.find(b => b.id === state.base) || {}).label || '';
	const estadoOpen = state.ppExpand === 'estado';
	const temaOpen = state.ppExpand === 'tema';
	return `<div class="flyout profile-pop">
		<div class="pp-banner"></div>
		<button class="pp-id clickable" data-profile="${ME.name}">
			<div class="avatar pp-avatar" style="background:${avatarColor(ME.name)}">${initial(ME.name)}<span class="status-ring st-${ME.status}"></span></div>
			<div class="pp-name">${ME.name}</div>
			<div class="pp-tag">@${ME.tag}</div>
		</button>
		<button class="pp-item" data-profile="${ME.name}">${icon('user')} Ver perfil ${icon('chevronRight', 'chev')}</button>
		<div class="pp-divider"></div>

		<button class="pp-row-toggle ${estadoOpen ? 'open' : ''}" data-action="pp-expand-estado">
			<span class="pp-bullet" style="background:var(--st-${ME.status})"></span>
			<span class="pp-row-label">Estado</span>
			<span class="pp-row-value">${STATUS_LABEL[ME.status]}</span>
			${icon('chevronDown', 'pp-caret')}
		</button>
		${estadoOpen ? `<div class="pp-collapse">
			<div class="pp-status-row">
				${statuses.map(s => `<button class="pp-status-btn ${ME.status === s ? 'active' : ''}" data-status="${s}"><span class="pp-bullet" style="background:var(--st-${s})"></span>${STATUS_LABEL[s]}</button>`).join('')}
			</div>
		</div>` : ''}

		<button class="pp-row-toggle ${temaOpen ? 'open' : ''}" data-action="pp-expand-tema">
			<span class="pp-swatch-mini" style="--sw:${(ACCENTS.find(a => a.id === state.accent) || {}).c}"></span>
			<span class="pp-row-label">Tema</span>
			<span class="pp-row-value">${baseLabel} · ${accentLabel}</span>
			${icon('chevronDown', 'pp-caret')}
		</button>
		${temaOpen ? `<div class="pp-collapse">
			<div class="pp-base-row">
				${BASES.map(b => `<button class="pp-base-btn ${state.base === b.id ? 'active' : ''}" data-base="${b.id}">${b.label}</button>`).join('')}
			</div>
			<div class="pp-theme-row">
				${ACCENTS.map(a => `<button class="pp-theme-sw ${state.accent === a.id ? 'active' : ''}" data-accent="${a.id}" title="${a.label}" style="--sw:${a.c}"></button>`).join('')}
			</div>
			<button class="pp-item subtle" data-settings="apariencia">${icon('sliders')} Más sobre apariencia ${icon('chevronRight', 'chev')}</button>
		</div>` : ''}

		<div class="pp-divider"></div>
		<button class="pp-item" data-settings="perfil">${icon('pencil')} Editar perfil</button>
		<button class="pp-item" data-settings="cuenta">${icon('settings')} Ajustes</button>
		<button class="pp-item danger" data-action="logout">${icon('logout')} Cerrar sesión</button>
	</div>`;
}

/* ─────────────────────────────────────────────── LOGIN ── */
function renderLogin() {
	return `<div class="auth-wrap">
		<div class="auth-card">
			<div class="auth-logo">
				<div class="auth-mark">m</div>
				<div class="auth-name">meado</div>
			</div>
			<p class="auth-tag">Tu espacio para estar cerca, aunque estéis lejos.</p>
			<form class="auth-form" onsubmit="return false">
				<label class="field"><span>Email</span><input class="input" type="email" placeholder="hola@meado.es" value="lucas@meado.es"></label>
				<label class="field"><span>Contraseña</span><input class="input" type="password" placeholder="••••••••" value="meadolandia"></label>
				<button class="btn block" data-screen="home" type="button">Entrar</button>
			</form>
			<div class="auth-links">
				<a href="#">¿Olvidaste tu contraseña?</a>
				<a href="#" data-screen="register">Crear cuenta</a>
			</div>
		</div>
	</div>`;
}

/* ─────────────────────────────────────────────── HOME ── */
function renderHome() {
	const navOpen = state.device !== 'mobile' || state.mobileNav;
	return `<div class="home">
		<aside class="home-side ${navOpen ? 'nav-open' : ''}">
			<div class="home-search"><div class="search-input">${icon('search')} Buscar</div></div>
			<button class="side-nav-btn ${state.dmOpen === null ? 'active' : ''}" data-action="show-friends">${icon('users')} Amigos <span class="seg-badge" style="margin-left:auto">1</span></button>
			<div class="side-head"><span>Mensajes directos</span><button>${icon('plus')}</button></div>
			<div class="dm-list">
				${DMS.map((d, i) => `<div class="dm-item ${state.dmOpen === i ? 'active' : ''}" data-dm="${i}">
					${avatarHTML(d.name, { size: 38, cls: 'dm-avatar', status: d.group ? null : d.status })}
					<div class="dm-info"><div class="dm-name">${d.name}</div><div class="dm-last ${d.unread ? 'unread' : ''}">${d.last}</div></div>
					<div class="dm-meta">${d.unread ? `<span class="unread-pill">${d.unread}</span>` : ''}<span class="dm-time">${d.time}</span></div>
				</div>`).join('')}
			</div>
		</aside>
		<main class="home-main">
			${state.dmOpen !== null ? renderDMConversation(DMS[state.dmOpen]) : renderFriendsView()}
		</main>
	</div>`;
}

function renderFriendsView() {
	const tabs = [
		{ id: 'online', label: 'En línea' },
		{ id: 'all', label: 'Todos' },
		{ id: 'pending', label: 'Pendiente', badge: 1 },
		{ id: 'add', label: 'Añadir amigo', cta: true },
	];
	return `<div class="home-topbar">
			${state.device === 'mobile' ? `<button class="h-icon-btn hamburger" data-action="toggle-nav">${icon('menu')}</button>` : ''}
			<span class="topbar-title">${icon('users')} Amigos</span>
			<div class="seg">${tabs.map(t => `<button class="seg-btn ${t.cta ? 'cta' : ''} ${state.friendTab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}${t.badge ? `<span class="seg-badge">${t.badge}</span>` : ''}</button>`).join('')}</div>
		</div>
		<div class="home-body">${renderFriends()}</div>`;
}

function renderDMConversation(dm) {
	const sub = dm.group ? `${dm.members} miembros` : STATUS_LABEL[dm.status];
	const conv = dm.conv || [];
	return `<div class="content-header dm-conv-header">
			${state.device === 'mobile' ? `<button class="h-icon-btn hamburger" data-action="show-dms">${icon('chevronLeft')}</button>` : ''}
			${avatarHTML(dm.name, { size: 32, cls: 'dmc-avatar' + (dm.group ? '' : ' clickable'), status: dm.group ? null : dm.status, profile: dm.group ? null : dm.name })}
			<span class="h-name ${dm.group ? '' : 'clickable'}" ${dm.group ? '' : `data-profile="${dm.name}"`}>${dm.name}</span>
			<span class="h-topic">${sub}</span>
			<div class="header-actions">
				<button class="h-icon-btn" title="Llamada de voz">${icon('phone')}</button>
				<button class="h-icon-btn" title="Videollamada">${icon('video')}</button>
			</div>
		</div>
		<div class="messages">
			<div class="ch-start">
				${avatarHTML(dm.name, { size: 60, cls: 'dmc-start-avatar' })}
				<h3>${dm.name}</h3>
				<p>${dm.group ? 'Principio de vuestra conversación de grupo.' : `Este es el principio de tu historial con ${dm.name}.`}</p>
			</div>
			${conv.map(m => renderMsg(m)).join('')}
		</div>
		<div class="composer">
			<div class="composer-box">
				<button class="composer-icon">${icon('plus')}</button>
				<textarea class="composer-input" rows="1" placeholder="Mensaje a ${dm.name}"></textarea>
				<button class="composer-icon">${icon('smile')}</button>
				<button class="send-btn" data-action="send" disabled>${icon('send')}</button>
			</div>
		</div>`;
}

function renderFriends() {
	if (state.friendTab === 'add') {
		return `<div style="max-width:480px;display:flex;flex-direction:column;gap:1rem">
			<h3 style="font-size:1.3rem;font-weight:800">Añadir amigo</h3>
			<p style="font-size:0.86rem;color:var(--text-muted)">Busca por username exacto para enviar una solicitud.</p>
			<div class="composer-box" style="border-radius:var(--radius-lg)"><input class="composer-input" placeholder="username" style="padding-left:0.5rem"><button class="btn sm">Enviar solicitud</button></div>
		</div>`;
	}
	const list = state.friendTab === 'pending'
		? [{ name: 'Valeria', activity: 'Solicitud entrante', pending: true }]
		: state.friendTab === 'online' ? FRIENDS.filter(f => f.status !== 'invisible') : FRIENDS;
	const label = state.friendTab === 'pending' ? `Entrantes — 1` : state.friendTab === 'online' ? `En línea — ${list.length}` : `Todos — ${list.length}`;
	return `<div class="list-label">${label}</div>
		${list.map(f => `<div class="friend-row">
			${avatarHTML(f.name, { size: 42, cls: 'fr-avatar', status: f.pending ? null : f.status })}
			<div class="fr-info"><div class="fr-name">${f.name}</div><div class="fr-status">${f.activity}</div></div>
			<div class="friend-actions">
				${f.pending
					? `<button class="icon-action success">${icon('check')}</button><button class="icon-action danger">${icon('x')}</button>`
					: `<button class="icon-action" data-dm-friend="${f.name}">${icon('message')}</button>`}
			</div>
		</div>`).join('')}`;
}

/* ─────────────────────────────────────────────── SERVER ── */
function renderServer(kind) {
	const navOpen = state.device !== 'mobile' || state.mobileNav;
	const chName = kind === 'text' ? 'general' : 'Sala de estar';
	return `<div class="server">
		<aside class="ch-side ${navOpen ? 'nav-open' : ''}">
			<div class="ch-header ${state.serverMenuOpen ? 'open' : ''}" data-action="toggle-server-menu">${SERVER_INFO.name} ${icon(state.serverMenuOpen ? 'x' : 'chevronDown', 'chev')}</div>
			<nav class="ch-nav">
				<div class="ch-cat"><span>Texto</span><button>${icon('plus')}</button></div>
				${TEXT_CHANNELS.map(c => `<button class="ch-item ${kind === 'text' && c.active ? 'active' : ''}" data-screen="text"><span class="ch-glyph">${icon('hash')}</span><span class="ch-name">${c.name}</span></button>`).join('')}
				<div class="ch-cat"><span>Voz</span><button>${icon('plus')}</button></div>
				${VOICE_CHANNELS.map(c => `
					<button class="ch-item ${kind === 'voice' && c.active ? 'active' : ''}" data-screen="voice">
						<span class="ch-glyph">${icon('volume2')}</span><span class="ch-name">${c.name}</span>
						${c.members.length ? `<span class="ch-count">${c.members.length}</span>` : ''}
					</button>
					${c.members.length ? `<div class="vc-side-members">${c.members.map(m => `
						<div class="vc-side-member ${m === 'Marina' && c.active ? 'speaking' : ''}">
							${avatarHTML(m, { size: 22 })}<span class="vc-side-name">${m}</span>
							${m === 'Nora' ? `<span class="mini-mute">${icon('micOff')}</span>` : ''}
						</div>`).join('')}</div>` : ''}
				`).join('')}
			</nav>
		</aside>
		<section class="ch-content">
			${kind === 'text' ? renderTextChannel(chName) : renderVoiceChannel(chName)}
		</section>
		${kind === 'text' && state.device !== 'mobile' ? renderMembers() : ''}
	</div>`;
}

function renderTextChannel(name) {
	return `<div class="content-header">
		${state.device === 'mobile' ? `<button class="h-icon-btn hamburger" data-action="toggle-nav">${icon('menu')}</button>` : ''}
		<span class="h-glyph">${icon('hash')}</span><span class="h-name">${name}</span>
		<span class="h-topic">la sala común de la cabaña 🏡</span>
		<div class="header-actions"><button class="h-icon-btn active">${icon('users')}</button></div>
	</div>
	<div class="messages">
		<div class="ch-start"><div class="start-mark">${icon('hash')}</div><h3>Bienvenido a #${name}</h3><p>Este es el comienzo del canal. Saluda 👋</p></div>
		${MESSAGES.map(m => renderMsg(m)).join('')}
	</div>
	<div class="typing"><span class="typing-dots"><span></span><span></span><span></span></span><span><strong>Diego</strong> está escribiendo…</span></div>
	<div class="composer">
		<div class="composer-box">
			<button class="composer-icon">${icon('plus')}</button>
			<textarea class="composer-input" rows="1" placeholder="Escribir en #${name}"></textarea>
			<button class="composer-icon">${icon('smile')}</button>
			<button class="send-btn" data-action="send" disabled>${icon('send')}</button>
		</div>
	</div>`;
}

function renderMsg(m) {
	const reactions = m.reactions ? `<div class="reactions">${m.reactions.map(r => `<button class="reaction ${r.me ? 'me' : ''}">${r.e} <span class="rc">${r.c}</span></button>`).join('')}</div>` : '';
	if (m.compact) {
		return `<div class="msg compact"><div class="msg-avatar" style="visibility:hidden"></div><div class="msg-body"><p class="msg-text">${m.text}</p>${reactions}</div></div>`;
	}
	return `<div class="msg">
		${avatarHTML(m.author, { size: 42, cls: 'msg-avatar clickable', profile: m.author })}
		<div class="msg-body">
			<div class="msg-head"><span class="msg-author clickable" data-profile="${m.author}" style="color:${avatarColor(m.author)}">${m.author}</span><span class="msg-time">${m.time}</span></div>
			<p class="msg-text">${m.text}</p>${reactions}
		</div>
	</div>`;
}

function renderVoiceChannel(name) {
	const count = VOICE_PARTICIPANTS.length;
	return `<div class="content-header">
		${state.device === 'mobile' ? `<button class="h-icon-btn hamburger" data-action="toggle-nav">${icon('menu')}</button>` : ''}
		<span class="h-glyph">${icon('volume2')}</span><span class="h-name">${name}</span>
		<span class="h-topic">${count} conectados</span>
		<div class="header-actions"><button class="h-icon-btn" title="Invitar">${icon('userPlus')}</button></div>
	</div>
	<div class="voice-view">
		<div class="voice-stage">
			<div class="participants-grid">
				${VOICE_PARTICIPANTS.map(p => `
					<div class="vp-tile ${p.you ? 'is-you' : ''} ${p.speaking ? 'speaking' : ''}">
						<div class="vp-avatar-wrap">
							${avatarHTML(p.name, { size: 84, cls: 'vp-avatar', profile: p.name })}
							${p.speaking ? '<span class="speaking-ring"></span>' : ''}
							${p.muted ? `<span class="vp-mute-badge">${icon('micOff')}</span>` : ''}
						</div>
						<div class="vp-name">${p.name}${p.you ? ' (tú)' : ''}</div>
					</div>`).join('')}
			</div>
		</div>
		<div class="voice-controls">
			<div class="vc-status"><span class="vc-status-dot"></span><span class="vc-status-text">Conectado · ${name}</span></div>
			<div class="vc-center">
				<div class="vc-btn-wrap">
					<button class="vc-btn ${state.micOff ? 'off' : ''}" data-action="toggle-mic">${icon(state.micOff ? 'micOff' : 'mic')}</button>
					<div class="vc-mic-level"><div class="vc-mic-fill" id="micFill" style="width:${state.micOff ? 0 : 40}%"></div></div>
				</div>
				<div class="vc-btn-wrap"><button class="vc-btn ${state.deafened ? 'off' : ''}" data-action="toggle-deaf">${icon(state.deafened ? 'volumeX' : 'headphones')}</button></div>
				<div class="vc-btn-wrap"><button class="vc-btn">${icon('video')}</button></div>
				<div class="vc-btn-wrap"><button class="vc-btn">${icon('monitor')}</button></div>
			</div>
			<div class="vc-right"><button class="vc-btn danger" data-action="leave-voice">${icon('phoneOff')}</button></div>
		</div>
	</div>`;
}

function renderMembers() {
	return `<aside class="members">
		<div class="members-label">En línea — ${MEMBERS_ONLINE.length}</div>
		${MEMBERS_ONLINE.map(m => memberRow(m)).join('')}
		<div class="members-label">Desconectados — ${MEMBERS_OFFLINE.length}</div>
		${MEMBERS_OFFLINE.map(m => memberRow(m, true)).join('')}
	</aside>`;
}
function memberRow(m, offline) {
	return `<div class="member ${offline ? 'offline' : ''} clickable" data-profile="${m.name}">
		${avatarHTML(m.name, { size: 34, cls: 'm-avatar', status: offline ? null : m.status })}
		<div class="m-info"><div class="m-name" ${m.role ? `style="color:${avatarColor(m.name)}"` : ''}>${m.name}</div>${m.role ? `<div class="m-role" style="color:${avatarColor(m.name)}">${m.role}</div>` : ''}</div>
	</div>`;
}

/* ─────────────────────────────────────────────── Eventos ── */
let micTimer = null;
function startMicMeter() {
	stopMicMeter();
	if (state.screen !== 'voice' || state.micOff) return;
	micTimer = setInterval(() => {
		const el = document.getElementById('micFill');
		if (el) el.style.width = (15 + Math.random() * 70).toFixed(0) + '%';
	}, 180);
}
function stopMicMeter() { if (micTimer) { clearInterval(micTimer); micTimer = null; } }

document.addEventListener('click', (e) => {
	// cerrar al clicar el fondo de un modal/scrim (solo el backdrop, no los hijos)
	if (e.target.matches('.modal-overlay')) { state.modalOpen = false; render(); return; }
	if (e.target.matches('.overlay-scrim')) { state.overlay = null; render(); return; }

	const t = e.target.closest('[data-screen], [data-base], [data-accent], [data-banner], [data-status], [data-tab], [data-action], [data-dm], [data-dm-friend], [data-profile], [data-uname], [data-settings], [data-srvsettings], [data-modaltab], #devDesktop, #devMobile');
	// cerrar popover de perfil al clicar fuera
	if (!e.target.closest('.profile-pop') && !e.target.closest('[data-action="toggle-profile"]') && state.profileOpen) {
		state.profileOpen = false; state.ppExpand = null; render();
	}
	// cerrar desplegable del servidor al clicar fuera
	if (state.serverMenuOpen && !e.target.closest('.srvmenu') && !e.target.closest('.ch-header')) {
		state.serverMenuOpen = false; render();
	}
	if (!t) return;

	if (t.id === 'devDesktop') { state.device = 'desktop'; state.mobileNav = false; renderToolbar(); render(); return; }
	if (t.id === 'devMobile') { state.device = 'mobile'; renderToolbar(); render(); return; }

	const base = t.dataset.base;
	if (base) { state.base = base; applyTheme(); renderToolbar(); if (state.profileOpen) render(); return; }

	const accent = t.dataset.accent;
	if (accent) { state.accent = accent; applyTheme(); renderToolbar(); if (state.profileOpen) render(); return; }

	if (t.dataset.banner) { state.bannerColor = t.dataset.banner; render(); return; }

	const screen = t.dataset.screen;
	if (screen) { state.screen = screen; state.profileOpen = false; state.mobileNav = false; renderToolbar(); render(); startMicMeter(); return; }

	const tab = t.dataset.tab;
	if (tab) { state.friendTab = tab; render(); return; }

	if (t.dataset.dm !== undefined) { state.dmOpen = +t.dataset.dm; state.mobileNav = false; render(); return; }

	if (t.dataset.dmFriend) {
		let idx = DMS.findIndex(d => d.name === t.dataset.dmFriend);
		if (idx < 0) { DMS.unshift({ name: t.dataset.dmFriend, last: '', time: 'ahora', unread: 0, status: 'online', conv: [] }); idx = 0; }
		state.dmOpen = idx; state.mobileNav = false; render(); return;
	}

	if (t.dataset.profile) { state.overlay = { type: 'profile', name: t.dataset.profile }; render(); return; }
	if (t.dataset.status) { ME.status = t.dataset.status; render(); return; }
	if (t.dataset.uname) {
		const n = t.dataset.uname, a = t.dataset.action;
		if (a === 'add-friend') state.relations[n] = 'friend';
		else if (a === 'remove-friend') state.relations[n] = 'none';
		else if (a === 'block-user') state.relations[n] = 'blocked';
		else if (a === 'unblock-user') state.relations[n] = 'none';
		else if (a === 'report-user') { state.reportToast = n; render(); setTimeout(() => { if (state.reportToast === n) { state.reportToast = null; render(); } }, 2600); return; }
		render(); return;
	}
	if (t.dataset.settings) { state.overlay = 'userSettings'; state.settingsSection = t.dataset.settings; render(); return; }
	if (t.dataset.srvsettings) { state.overlay = 'serverSettings'; state.srvSection = t.dataset.srvsettings; render(); return; }
	if (t.dataset.modaltab) { state.modalTab = t.dataset.modaltab; render(); return; }

	const action = t.dataset.action;
	if (action === 'toggle-profile') { state.profileOpen = !state.profileOpen; if (!state.profileOpen) state.ppExpand = null; render(); }
	else if (action === 'pp-expand-estado') { state.ppExpand = state.ppExpand === 'estado' ? null : 'estado'; render(); }
	else if (action === 'pp-expand-tema') { state.ppExpand = state.ppExpand === 'tema' ? null : 'tema'; render(); }
	else if (action === 'toggle-mic') { state.micOff = !state.micOff; render(); startMicMeter(); }
	else if (action === 'toggle-deaf') { state.deafened = !state.deafened; if (state.deafened) state.micOff = true; render(); startMicMeter(); }
	else if (action === 'toggle-nav') { state.mobileNav = !state.mobileNav; render(); }
	else if (action === 'show-friends') { state.dmOpen = null; state.mobileNav = false; render(); }
	else if (action === 'show-dms') { state.mobileNav = true; render(); }
	else if (action === 'open-modal') { state.modalOpen = true; state.serverMenuOpen = false; render(); }
	else if (action === 'close-modal') { state.modalOpen = false; render(); }
	else if (action === 'set-explore') { state.modalTab = 'explore'; render(); }
	else if (action === 'toggle-server-menu') { state.serverMenuOpen = !state.serverMenuOpen; render(); }
	else if (action === 'close-menu') { state.serverMenuOpen = false; render(); }
	else if (action === 'open-server-settings') { state.serverMenuOpen = false; state.overlay = 'serverSettings'; state.srvSection = 'info'; render(); }
	else if (action === 'open-invite') { state.serverMenuOpen = false; state.overlay = 'serverSettings'; state.srvSection = 'invite'; render(); }
	else if (action === 'srv-channels') { state.serverMenuOpen = false; state.overlay = 'serverSettings'; state.srvSection = 'channels'; render(); }
	else if (action === 'open-user-settings') { state.overlay = 'userSettings'; state.settingsSection = 'cuenta'; render(); }
	else if (action === 'close-overlay') { state.overlay = null; render(); }
	else if (action === 'send-dm-profile') {
		const n = t.dataset.uname;
		let idx = DMS.findIndex(d => d.name === n);
		if (idx < 0) { DMS.unshift({ name: n, last: '', time: 'ahora', unread: 0, status: (FRIENDS.find(f => f.name === n) || {}).status || 'online', conv: [] }); idx = 0; }
		state.overlay = null; state.screen = 'home'; state.dmOpen = idx; state.mobileNav = false; renderToolbar(); render();
	}
	else if (action === 'copy-invite') { const b = document.getElementById('copyInviteBtn'); if (b) { b.innerHTML = icon('check') + ' Copiado'; setTimeout(() => { if (document.getElementById('copyInviteBtn')) b.innerHTML = icon('copy') + ' Copiar'; }, 1600); } }
	else if (action === 'leave-voice') { state.inVoice = false; state.screen = 'text'; renderToolbar(); render(); stopMicMeter(); }
	else if (action === 'logout') { state.screen = 'login'; state.profileOpen = false; state.overlay = null; renderToolbar(); render(); }
});

/* enviar un mensaje al canal/DM activo desde un input de composer */
function sendFromComposer(input) {
	const val = input.value.trim();
	if (!val) return;
	const list = document.querySelector('.messages');
	if (list) {
		const div = document.createElement('div');
		div.className = 'msg';
		div.innerHTML = `${avatarHTML(ME.name, { size: 42, cls: 'msg-avatar' })}<div class="msg-body"><div class="msg-head"><span class="msg-author" style="color:${avatarColor(ME.name)}">${ME.name}</span><span class="msg-time">ahora</span></div><p class="msg-text">${val.replace(/</g,'&lt;')}</p></div>`;
		list.appendChild(div);
		list.scrollTop = list.scrollHeight;
	}
	input.value = '';
	input.style.height = 'auto';
	const btn = input.closest('.composer-box')?.querySelector('.send-btn');
	if (btn) btn.disabled = true;
	input.focus();
}

/* habilitar botón enviar al escribir + enviar mensaje */
document.addEventListener('input', (e) => {
	if (e.target.classList.contains('composer-input')) {
		const send = e.target.closest('.composer-box')?.querySelector('.send-btn');
		if (send) send.disabled = !e.target.value.trim();
		e.target.style.height = 'auto';
		e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
	}
});
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape') {
		if (state.overlay) { state.overlay = null; render(); return; }
		if (state.modalOpen) { state.modalOpen = false; render(); return; }
		if (state.serverMenuOpen) { state.serverMenuOpen = false; render(); return; }
		if (state.profileOpen) { state.profileOpen = false; state.ppExpand = null; render(); return; }
	}
	if (e.target.classList.contains('composer-input') && e.key === 'Enter' && !e.shiftKey) {
		e.preventDefault();
		sendFromComposer(e.target);
	}
});

/* clic en el botón de enviar (avión) */
document.addEventListener('click', (e) => {
	const sb = e.target.closest('.send-btn');
	if (sb && !sb.disabled) {
		const input = sb.closest('.composer-box')?.querySelector('.composer-input');
		if (input) sendFromComposer(input);
	}
});

/* init */
applyTheme();
renderToolbar();
render();
startMicMeter();
