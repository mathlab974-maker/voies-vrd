<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';

	let { children } = $props();
</script>

<div class="flex flex-col h-screen bg-gray-950 text-white">
	<header class="flex items-center gap-6 px-5 py-3 bg-gray-900 border-b border-gray-800 shrink-0 shadow-md">
		<div class="flex items-center gap-3">
			<div class="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">VRD</div>
			<div>
				<div class="text-sm font-semibold leading-tight">Saint-André · La Réunion</div>
				<div class="text-xs text-gray-400 leading-tight">Voiries & Réseaux Divers</div>
			</div>
		</div>
		<nav class="flex gap-1 ml-4">
			<a href="/"
				class="px-4 py-1.5 rounded text-sm transition-colors {$page.url.pathname === '/' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}">
				Carte
			</a>
			<a href="/stats"
				class="px-4 py-1.5 rounded text-sm transition-colors {$page.url.pathname === '/stats' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}">
				Statistiques
			</a>
		</nav>
		<div class="ml-auto text-xs text-gray-500">104 voies · 31 473 823 €</div>
	</header>
	<main class="flex-1 overflow-hidden">
		{@render children()}
	</main>
</div>
