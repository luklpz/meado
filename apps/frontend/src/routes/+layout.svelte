<script lang="ts">
	import './layout.css';
	import { onMount } from 'svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import { authStore } from '$lib/auth.js';

	let { children } = $props();

	onMount(() => {
		authStore.init();
	});
</script>

<ProfileMenu />
{@render children()}
