/* MEADO · data.js — iconos (lucide inline) + datos de ejemplo */

const ICONS = {
	mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
	micOff: '<line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/>',
	headphones: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
	volumeX: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
	volume2: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
	settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
	chevronDown: '<path d="m6 9 6 6 6-6"/>',
	chevronLeft: '<path d="m15 18-6-6 6-6"/>',
	video: '<path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2"/>',
	users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
	message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
	plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
	x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
	check: '<path d="M20 6 9 17l-5-5"/>',
	send: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
	paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
	phoneOff: '<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="22" x2="2" y1="2" y2="22"/>',
	monitor: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
	hash: '<line x1="4" x2="20" y1="9" y2="9"/><line x1="4" x2="20" y1="15" y2="15"/><line x1="10" x2="8" y1="3" y2="21"/><line x1="14" x2="12" y1="3" y2="21"/>',
	search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
	smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" x2="9.01" y1="9" y2="9"/><line x1="15" x2="15.01" y1="9" y2="9"/>',
	logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
	pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
	userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
	userMinus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" x2="16" y1="11" y2="11"/>',
	ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
	flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>',
	monitorDesk: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
	phone: '<rect width="14" height="20" x="5" y="2" rx="2.5"/><line x1="12" x2="12" y1="18" y2="18"/>',
	globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
	lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
	map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
	menu: '<line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="18" y2="18"/>',
	radio: '<circle cx="12" cy="12" r="2"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14M19.07 4.93a10 10 0 0 1 0 14.14M7.76 16.24a6 6 0 0 1 0-8.49M16.24 7.76a6 6 0 0 1 0 8.49"/>',
	copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
	bell: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
	shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
	trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
	camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
	chevronRight: '<path d="m9 18 6-6-6-6"/>',
	palette: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>',
	image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
	sliders: '<line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/>',
	at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
	user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
	gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
	sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/>',
	logIn: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" x2="3" y1="12" y2="12"/>',
};

function icon(name, cls) {
	return `<svg class="${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/* paletas de avatar (warm/cozy, derivadas del acento) */
const AV_COLORS = ['#e88a5a','#6cb98a','#5fa8e8','#b18cf0','#e7a76a','#ef7a72','#5cbf9f','#d98ab0'];
function avatarColor(seed) {
	let h = 0; for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
	return AV_COLORS[Math.abs(h) % AV_COLORS.length];
}
function initial(name) { return (name || '?')[0].toUpperCase(); }

/* avatar HTML (con anillo de estado opcional) */
function avatarHTML(name, { size = 40, sq = false, status = null, cls = '', profile = null } = {}) {
	const col = avatarColor(name);
	const ring = status ? `<span class="status-ring st-${status}"></span>` : '';
	const dp = profile ? ` data-profile="${profile}"` : '';
	return `<div class="avatar ${sq ? 'sq' : ''} ${cls}"${dp} style="width:${size}px;height:${size}px;background:${col}">${initial(name)}${ring}</div>`;
}

const ME = {
	name: 'Lucas', tag: 'lucas_meado', status: 'online',
	pronouns: 'él/ellos',
	bio: 'Diseño de producto 🎨 — café, lo-fi y voz por proximidad. Construyendo meado con cariño.',
	memberSince: 'Marzo 2024',
	email: 'lucas@meado.es',
	phone: '+34 ··· ··· 042',
	roles: ['Diseño', 'Anfitriona'],
};

const SERVER_INFO = {
	name: 'La Cabaña', initial: 'C',
	description: 'Nuestra cabaña digital: charlas tranquilas, voz por proximidad y buen rollo. 🏡',
	members: 48, online: 12, boost: 2,
	invite: 'meado.es/la-cabana',
	created: '12 de marzo de 2024',
};

const ROLES = [
	{ name: 'Anfitriona', color: '#e88a5a', members: 1 },
	{ name: 'Moderación', color: '#5fa8e8', members: 2 },
	{ name: 'Diseño', color: '#6cb98a', members: 3 },
	{ name: 'Veterano', color: '#b18cf0', members: 8 },
	{ name: 'Miembro', color: '#8b8696', members: 42 },
];

const FRIENDS = [
	{ name: 'Marina', status: 'online', activity: 'Jugando' },
	{ name: 'Diego',  status: 'online', activity: 'En línea' },
	{ name: 'Sofía',  status: 'dnd',    activity: 'No molestar' },
	{ name: 'Pablo',  status: 'away',   activity: 'Ausente' },
	{ name: 'Nora',   status: 'online', activity: 'En línea' },
	{ name: 'Hugo',   status: 'invisible', activity: 'Desconectado' },
];

const DMS = [
	{ name: 'Marina', last: 'jaja vale, nos vemos en la sala 🫶', time: '14:22', unread: 0, status: 'online', conv: [
		{ author: 'Marina', time: '14:12', text: '¿te conectas luego a la sala? quiero enseñarte una cosa del lobby' },
		{ author: 'Lucas', time: '14:18', text: 'claro, dame 10 min y entro' },
		{ author: 'Marina', time: '14:20', text: 'genial 🌙', compact: true },
		{ author: 'Marina', time: '14:22', text: 'jaja vale, nos vemos en la sala 🫶', reactions: [{ e: '🫶', c: 1, me: true }] },
	] },
	{ name: 'Equipo Diseño', last: 'Diego: subo el mockup en un rato', time: '13:05', unread: 3, group: true, members: 5, conv: [
		{ author: 'Nora', time: '12:48', text: '¿cómo lleváis lo del rediseño del lobby?' },
		{ author: 'Diego', time: '12:55', text: 'casi listo, estoy puliendo las animaciones de proximidad' },
		{ author: 'Diego', time: '13:05', text: 'subo el mockup en un rato', reactions: [{ e: '👀', c: 2, me: false }] },
	] },
	{ name: 'Sofía', last: 'tú: ¿lo dejamos para mañana?', time: 'Ayer', unread: 0, status: 'dnd', conv: [
		{ author: 'Sofía', time: 'Ayer 19:40', text: 'oye, hoy ando liada con entregas 😅' },
		{ author: 'Lucas', time: 'Ayer 19:52', text: '¿lo dejamos para mañana?' },
		{ author: 'Sofía', time: 'Ayer 20:01', text: 'perfecto, mañana sin falta' },
	] },
	{ name: 'Pablo', last: '¿te conectas a la quedada?', time: 'Ayer', unread: 1, status: 'away', conv: [
		{ author: 'Pablo', time: 'Ayer 21:10', text: '¿te conectas a la quedada?' },
	] },
	{ name: 'Nora', last: 'gracias!! 🌿', time: 'lun', unread: 0, status: 'online', conv: [
		{ author: 'Lucas', time: 'lun 11:02', text: 'te he dejado los recursos en el canal #recursos 🌿' },
		{ author: 'Nora', time: 'lun 11:15', text: 'gracias!! 🌿', reactions: [{ e: '🌿', c: 1, me: true }] },
	] },
];

const SERVERS = [
	{ initial: 'C', name: 'La Cabaña', active: true },
	{ initial: 'D', name: 'Diseño Co.' },
	{ initial: 'G', name: 'Gamers ES', unread: 5 },
	{ initial: 'E', name: 'Estudio' },
];

const TEXT_CHANNELS = [
	{ name: 'bienvenida', active: false },
	{ name: 'general', active: true },
	{ name: 'random', active: false },
	{ name: 'recursos', active: false },
];
const VOICE_CHANNELS = [
	{ name: 'Sala de estar', members: ['Marina','Diego','Lucas'], active: true },
	{ name: 'Cocina', members: [] },
	{ name: 'Terraza', members: ['Nora'] },
];

const MESSAGES = [
	{ author: 'Marina', time: '13:58', text: '¡buenas! ¿alguien se anima a una quedada de voz esta tarde? 🌙', reactions: [{ e: '🔥', c: 3, me: true }, { e: '🫶', c: 1, me: false }] },
	{ author: 'Diego', time: '14:01', text: 'yo me apunto, acabo de terminar el rediseño del lobby', compact: false },
	{ author: 'Diego', time: '14:01', text: 'os enseño en la sala de voz y me decís qué os parece', compact: true },
	{ author: 'Lucas', time: '14:03', text: 'perfecto, entro en un momento. me encanta cómo va quedando lo de la proximidad', reactions: [{ e: '👀', c: 2, me: false }] },
	{ author: 'Nora', time: '14:08', text: 'qué ganas! el tema cacao es precioso btw 🍫', reactions: [{ e: '🍫', c: 4, me: true }] },
	{ author: 'Marina', time: '14:10', text: 'verdad? cada uno con su tema y todos en la misma sala, me flipa', compact: false },
];

const MEMBERS_ONLINE = [
	{ name: 'Marina', role: 'Anfitriona', status: 'online' },
	{ name: 'Diego', role: 'Diseño', status: 'online' },
	{ name: 'Lucas', role: '', status: 'online' },
	{ name: 'Nora', role: '', status: 'dnd' },
];
const MEMBERS_OFFLINE = [
	{ name: 'Sofía', role: '', status: 'invisible' },
	{ name: 'Pablo', role: '', status: 'away' },
	{ name: 'Hugo', role: '', status: 'invisible' },
];

/* participantes en la sala de voz · sala estándar de servidor (sin proximidad) */
const VOICE_PARTICIPANTS = [
	{ name: 'Lucas', you: true, speaking: false, muted: false },
	{ name: 'Marina', you: false, speaking: true, muted: false },
	{ name: 'Diego', you: false, speaking: false, muted: false },
	{ name: 'Nora', you: false, speaking: false, muted: true },
];

/* Sistema de temas en 2 ejes: base (fondo) × acento (color principal) */
const BASES = [
	{ id: 'noche', label: 'Noche' },
	{ id: 'dia',   label: 'Día' },
];
const ACCENTS = [
	{ id: 'azul',     label: 'Azul',     c: '#3b82f6' },
	{ id: 'naranja',  label: 'Naranja',  c: '#e8833f' },
	{ id: 'verde',    label: 'Verde',    c: '#2fa86a' },
	{ id: 'morado',   label: 'Morado',   c: '#8b5cf6' },
	{ id: 'rosa',     label: 'Rosa',     c: '#e0568f' },
	{ id: 'turquesa', label: 'Turquesa', c: '#16a89f' },
];

const STATUS_LABEL = { online: 'En línea', away: 'Ausente', dnd: 'No molestar', invisible: 'Invisible' };
