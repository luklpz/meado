<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<style>
	:global(*) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		background: #050d07;
		overflow-x: hidden;
	}
</style>
