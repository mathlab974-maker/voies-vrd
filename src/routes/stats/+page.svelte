<script lang="ts">
	import { onMount } from 'svelte';
	import type { StatsData } from '$lib/types';

	let stats = $state<StatsData | null>(null);

	onMount(async () => {
		const res = await fetch('/data/stats.json');
		stats = await res.json();
	});

	function fmt(m: number): string {
		return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(m);
	}

	const AV_COLORS: Record<string, string> = {
		'Terminé': '#2e7d32',
		'En cours': '#f9a825',
		'Non démarré': '#c62828',
		'À planifier': '#1565c0'
	};

	const STATUT_COLORS: Record<string, string> = {
		trace: '#22c55e',
		multi_trace: '#3b82f6',
		approx_trace: '#f59e0b',
		ponctuel: '#a78bfa',
		absent_osm: '#ef4444'
	};
</script>

{#if stats}
	<div class="h-full overflow-y-auto p-6 space-y-8 bg-gray-950">

		<!-- KPIs -->
		<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
			<div class="bg-gray-900 rounded-xl p-4 border border-gray-800">
				<div class="text-2xl font-bold text-white">{stats.nb_voies}</div>
				<div class="text-xs text-gray-400 mt-1">Voies totales</div>
			</div>
			<div class="bg-gray-900 rounded-xl p-4 border border-gray-800">
				<div class="text-2xl font-bold text-green-400">{fmt(stats.montant_total)}</div>
				<div class="text-xs text-gray-400 mt-1">Budget total</div>
			</div>
			<div class="bg-gray-900 rounded-xl p-4 border border-gray-800">
				<div class="text-2xl font-bold text-white">{stats.par_secteur.length}</div>
				<div class="text-xs text-gray-400 mt-1">Secteurs</div>
			</div>
			<div class="bg-gray-900 rounded-xl p-4 border border-gray-800">
				<div class="text-2xl font-bold text-yellow-400">
					{stats.par_avancement.find(a => a.avancement === 'En cours')?.nb ?? 0}
				</div>
				<div class="text-xs text-gray-400 mt-1">En cours</div>
			</div>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

			<!-- Avancement global -->
			<div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
				<h2 class="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Avancement</h2>
				<div class="space-y-3">
					{#each stats.par_avancement as av}
						{@const pct = Math.round(100 * av.nb / stats.nb_voies)}
						<div>
							<div class="flex justify-between text-sm mb-1">
								<span class="flex items-center gap-2">
									<span class="w-2.5 h-2.5 rounded-full" style="background:{AV_COLORS[av.avancement] ?? '#666'}"></span>
									<span class="text-white">{av.avancement}</span>
								</span>
								<span class="text-gray-400">{av.nb} voies · {fmt(av.montant)}</span>
							</div>
							<div class="h-2 bg-gray-800 rounded-full overflow-hidden">
								<div class="h-full rounded-full transition-all" style="width:{pct}%;background:{AV_COLORS[av.avancement] ?? '#666'}"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Statuts OSM -->
			<div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
				<h2 class="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Qualité du tracé OSM</h2>
				<div class="space-y-3">
					{#each stats.par_statut as s}
						{@const pct = Math.round(100 * s.nb / stats.nb_voies)}
						<div>
							<div class="flex justify-between text-sm mb-1">
								<span class="flex items-center gap-2">
									<span class="w-2.5 h-2.5 rounded-full" style="background:{STATUT_COLORS[s.statut] ?? '#666'}"></span>
									<span class="text-white">{s.statut.replace('_', ' ')}</span>
								</span>
								<span class="text-gray-400">{s.nb} · {pct}%</span>
							</div>
							<div class="h-2 bg-gray-800 rounded-full overflow-hidden">
								<div class="h-full rounded-full" style="width:{pct}%;background:{STATUT_COLORS[s.statut] ?? '#666'}"></div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Budget par secteur -->
		<div class="bg-gray-900 rounded-xl p-5 border border-gray-800">
			<h2 class="text-sm font-semibold text-gray-300 mb-4 uppercase tracking-wider">Budget par secteur</h2>
			<div class="space-y-3">
				{#each stats.par_secteur as sec, i}
					{@const maxMontant = Math.max(...stats.par_secteur.map(s => s.montant))}
					{@const pct = Math.round(100 * sec.montant / maxMontant)}
					<div>
						<div class="flex justify-between text-sm mb-1">
							<span class="text-white font-medium">{sec.secteur}</span>
							<span class="text-gray-400">{sec.nb} voies · <span class="text-green-400 font-semibold">{fmt(sec.montant)}</span></span>
						</div>
						<div class="h-2 bg-gray-800 rounded-full overflow-hidden">
							<div class="h-full rounded-full bg-blue-600" style="width:{pct}%"></div>
						</div>
						<!-- Mini répartition avancement -->
						<div class="flex gap-1 mt-1">
							{#each Object.entries(sec.avancement) as [av, n]}
								<span class="text-xs px-1.5 py-0.5 rounded" style="background:{AV_COLORS[av] ?? '#333'}22;color:{AV_COLORS[av] ?? '#888'}">
									{av} · {n}
								</span>
							{/each}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Tableau complet -->
		<div class="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
			<div class="px-5 py-3 border-b border-gray-800">
				<h2 class="text-sm font-semibold text-gray-300 uppercase tracking-wider">Détail par secteur</h2>
			</div>
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="text-xs text-gray-500 uppercase border-b border-gray-800">
							<th class="px-4 py-3 text-left">Secteur</th>
							<th class="px-4 py-3 text-right">Voies</th>
							<th class="px-4 py-3 text-right">Budget</th>
							<th class="px-4 py-3 text-right">Terminé</th>
							<th class="px-4 py-3 text-right">En cours</th>
							<th class="px-4 py-3 text-right">Non démarré</th>
						</tr>
					</thead>
					<tbody>
						{#each stats.par_secteur as sec}
							<tr class="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
								<td class="px-4 py-3 font-medium text-white">{sec.secteur}</td>
								<td class="px-4 py-3 text-right text-gray-300">{sec.nb}</td>
								<td class="px-4 py-3 text-right text-green-400 font-semibold">{fmt(sec.montant)}</td>
								<td class="px-4 py-3 text-right text-green-500">{sec.avancement['Terminé'] ?? 0}</td>
								<td class="px-4 py-3 text-right text-yellow-500">{sec.avancement['En cours'] ?? 0}</td>
								<td class="px-4 py-3 text-right text-red-500">{sec.avancement['Non démarré'] ?? 0}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>

	</div>
{:else}
	<div class="flex items-center justify-center h-full text-gray-500 text-sm">
		Chargement des statistiques…
	</div>
{/if}
