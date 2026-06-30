<script lang="ts">
	import { supabase } from './supabase';
	import type { VoieFeature, VoiesData } from './types';

	interface Props {
		data: VoiesData;
		filteredIds: Set<number>;
		selectedFeature: VoieFeature | null;
		onFilterChange: (ids: Set<number>) => void;
		onSelect: (f: VoieFeature) => void;
		onUpdate: (f: VoieFeature) => void;
	}

	let { data, filteredIds, selectedFeature, onFilterChange, onSelect, onUpdate }: Props = $props();

	const AVANCEMENTS = ['Termin\u00e9', 'En cours', 'Non d\u00e9marr\u00e9', '\u00c0 planifier'];
	const AV_COLORS: Record<string, string> = {
		'Termin\u00e9': '#2e7d32',
		'En cours': '#f9a825',
		'Non d\u00e9marr\u00e9': '#c62828',
		'\u00c0 planifier': '#1565c0'
	};

	function avNorm(av: string): string {
		const a = (av || '').toLowerCase();
		if (a.includes('termin')) return 'Termin\u00e9';
		if (a.includes('en cours')) return 'En cours';
		if (a.includes('non d')) return 'Non d\u00e9marr\u00e9';
		return '\u00c0 planifier';
	}

	const allSecteurs = $derived([...new Set(data.features.map(f => f.properties.secteur))].sort());

	let secteursOuverts = $state<Set<string>>(new Set());
	let avancementsActifs = $state<Set<string>>(new Set(AVANCEMENTS));
	let recherche = $state('');

	let editingId = $state<number | null>(null);
	let editMontant = $state<string>('');
	let saving = $state(false);

	function fmt(m: number | null): string {
		if (m === null || m === undefined) return '\u2014';
		return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(m);
	}

	function fmtLin(m: number): string {
		return m > 0 ? m.toLocaleString('fr-FR') + ' m' : '\u2014';
	}

	$effect(() => {
		const q = recherche.toLowerCase().trim();
		const ids = new Set<number>();
		for (const f of data.features) {
			const p = f.properties;
			const matchAv = avancementsActifs.has(avNorm(p.avancement));
			const matchQ = !q || p.nom.toLowerCase().includes(q) || p.secteur.toLowerCase().includes(q);
			if (matchAv && matchQ) ids.add(f.id);
		}
		onFilterChange(ids);
	});

	function toggleAv(av: string) {
		const next = new Set(avancementsActifs);
		if (next.has(av)) next.delete(av); else next.add(av);
		avancementsActifs = next;
	}

	function toggleSecteur(sec: string) {
		const next = new Set(secteursOuverts);
		if (next.has(sec)) next.delete(sec); else next.add(sec);
		secteursOuverts = next;
	}

	function startEdit(f: VoieFeature) {
		editingId = f.id;
		editMontant = String(f.properties.montant ?? '');
	}

	async function saveEdit(f: VoieFeature) {
		saving = true;
		const val = parseFloat(editMontant.replace(/\s/g, '').replace(',', '.'));
		if (!isNaN(val)) {
			const { error } = await supabase.from('voies').update({ montant_modifie: val }).eq('id', f.id);
			if (!error) {
				const updated: VoieFeature = { ...f, properties: { ...f.properties, montant: val } };
				onUpdate(updated);
			}
		}
		editingId = null;
		saving = false;
	}

	const totalMontant = $derived(
		data.features.filter(f => filteredIds.has(f.id))
			.reduce((s, f) => s + (f.properties.montant ?? 0), 0)
	);

	const totalLineaire = $derived(
		data.features.filter(f => filteredIds.has(f.id))
			.reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0)
	);
</script>

<aside class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-96 shrink-0 overflow-y-auto">

	<!-- Recherche -->
	<div class="p-3 border-b border-gray-800">
		<input
			type="text"
			placeholder="Rechercher une voie\u2026"
			bind:value={recherche}
			class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
		/>
	</div>

	<!-- Filtres avancement -->
	<div class="p-3 border-b border-gray-800">
		<div class="text-xs text-gray-500 uppercase tracking-wider mb-2">Filtre avancement</div>
		<div class="flex flex-wrap gap-1">
			{#each AVANCEMENTS as av}
				<button
					onclick={() => toggleAv(av)}
					class="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors {avancementsActifs.has(av) ? 'text-white' : 'text-gray-600 bg-gray-800/50'}"
					style={avancementsActifs.has(av) ? `background:${AV_COLORS[av]}33;border:1px solid ${AV_COLORS[av]}` : 'border:1px solid transparent'}
				>
					<span class="w-2 h-2 rounded-full shrink-0" style="background:{AV_COLORS[av]}"></span>
					{av}
					<span class="opacity-60">{data.features.filter(f => avNorm(f.properties.avancement) === av).length}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Resume global -->
	<div class="px-3 py-2 border-b border-gray-800 bg-gray-950/50 flex justify-between text-xs">
		<span class="text-gray-400"><span class="font-semibold text-white">{filteredIds.size}</span> voies</span>
		<span class="text-gray-400"><span class="font-semibold text-blue-400">{totalLineaire.toLocaleString('fr-FR')} m</span></span>
		<span class="text-gray-400"><span class="font-semibold text-green-400">{fmt(totalMontant)}</span></span>
	</div>

	<!-- Secteurs accordeon -->
	<div class="flex-1">
		{#each allSecteurs as sec}
			{@const voiesDuSecteur = data.features.filter(f => f.properties.secteur === sec && filteredIds.has(f.id))}
			{@const montantSec = voiesDuSecteur.reduce((s, f) => s + (f.properties.montant ?? 0), 0)}
			{@const linSec = voiesDuSecteur.reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0)}
			{@const ouvert = secteursOuverts.has(sec)}

			{#if voiesDuSecteur.length > 0}
				<button
					onclick={() => toggleSecteur(sec)}
					class="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-800 hover:bg-gray-800/50 transition-colors text-left"
				>
					<span class="text-gray-400 text-xs w-3 shrink-0">{ouvert ? '\u25be' : '\u25b8'}</span>
					<div class="flex-1 min-w-0">
						<div class="text-sm font-medium text-white truncate">{sec}</div>
						<div class="flex gap-3 text-xs text-gray-500 mt-0.5">
							<span>{voiesDuSecteur.length} voies</span>
							<span class="text-blue-400">{linSec.toLocaleString('fr-FR')} m</span>
							<span class="text-green-400">{fmt(montantSec)}</span>
						</div>
					</div>
				</button>

				{#if ouvert}
					<div class="bg-gray-950/40 border-b border-gray-800">
						{#each voiesDuSecteur as f}
							{@const p = f.properties}
							{@const isSelected = selectedFeature?.id === f.id}
							{@const isEditing = editingId === f.id}
							<div
								class="px-3 py-2 border-b border-gray-800/50 transition-colors {isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-800/40'}"
								style="border-left: 3px solid {isSelected ? '#3b82f6' : p.couleur}"
							>
								<button class="w-full text-left" onclick={() => onSelect(f)}>
									<div class="flex items-start gap-2">
										<span class="w-2 h-2 rounded-full shrink-0 mt-1" style="background:{p.couleur}"></span>
										<div class="flex-1 min-w-0">
											<div class="text-xs font-medium text-white leading-snug truncate" title={p.nom}>{p.nom}</div>
											<div class="text-xs text-gray-500 mt-0.5 truncate">{p.avancement || '\u2014'}</div>
										</div>
									</div>
									<div class="flex gap-3 mt-1.5 ml-4 text-xs">
										<span class="text-blue-400">{fmtLin(p.lineaire_m)}</span>
										<span class="text-green-400">{fmt(p.montant)}</span>
										{#if p.lineaire_m > 0 && p.montant}
											<span class="text-pink-400">{Math.round(p.montant / p.lineaire_m).toLocaleString('fr-FR')} \u20ac/ml</span>
										{/if}
									</div>
								</button>

								{#if isEditing}
									<div class="mt-2 ml-4 flex items-center gap-2">
										<input
											type="number"
											bind:value={editMontant}
											class="w-28 bg-gray-800 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
											placeholder="Montant \u20ac"
										/>
										<button
											onclick={() => saveEdit(f)}
											disabled={saving}
											class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded disabled:opacity-50"
										>
											{saving ? '...' : 'OK'}
										</button>
										<button
											onclick={() => editingId = null}
											class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded"
										>
											Annuler
										</button>
									</div>
								{:else}
									<button
										onclick={() => startEdit(f)}
										class="mt-1.5 ml-4 text-xs text-gray-600 hover:text-yellow-400 transition-colors"
									>
										\u270f Modifier le co\u00fbt
									</button>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{/if}
		{/each}
	</div>

</aside>
