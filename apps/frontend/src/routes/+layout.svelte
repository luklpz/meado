<script lang="ts">
	import './layout.css';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';

	let { children } = $props();
</script>

<ProfileMenu />
{@render children()}
