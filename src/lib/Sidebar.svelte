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
		onAdd: (f: VoieFeature) => void;
	}

	let { data, filteredIds, selectedFeature, onFilterChange, onSelect, onUpdate, onAdd }: Props = $props();

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

	// Edition montant
	let editingMontantId = $state<number | null>(null);
	let editMontant = $state<string>('');

	// Edition nom
	let editingNomId = $state<number | null>(null);
	let editNom = $state<string>('');

	// Modal nouvelle voie
	let showModal = $state(false);
	let newNom = $state('');
	let newSecteur = $state('');
	let newSecteurCustom = $state('');
	let newAvancement = $state('Non d\u00e9marr\u00e9');
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

	// --- Montant ---
	function startEditMontant(f: VoieFeature) {
		editingMontantId = f.id;
		editingNomId = null;
		editMontant = String(f.properties.montant ?? '');
	}

	async function saveMontant(f: VoieFeature) {
		saving = true;
		const val = parseFloat(editMontant.replace(/\s/g, '').replace(',', '.'));
		if (!isNaN(val)) {
			const { error } = await supabase.from('voies').update({ montant_modifie: val }).eq('id', f.id);
			if (!error) onUpdate({ ...f, properties: { ...f.properties, montant: val } });
		}
		editingMontantId = null;
		saving = false;
	}

	// --- Nom ---
	function startEditNom(f: VoieFeature) {
		editingNomId = f.id;
		editingMontantId = null;
		editNom = f.properties.nom;
	}

	async function saveNom(f: VoieFeature) {
		saving = true;
		const nom = editNom.trim();
		if (nom && nom !== f.properties.nom) {
			const { error } = await supabase.from('voies').update({ nom }).eq('id', f.id);
			if (!error) onUpdate({ ...f, properties: { ...f.properties, nom } });
		}
		editingNomId = null;
		saving = false;
	}

	// --- Nouvelle voie ---
	function openModal() {
		newNom = '';
		newSecteur = allSecteurs[0] ?? '';
		newSecteurCustom = '';
		newAvancement = 'Non d\u00e9marr\u00e9';
		showModal = true;
	}

	async function createVoie() {
		const nom = newNom.trim();
		const secteur = newSecteurCustom.trim() || newSecteur;
		if (!nom || !secteur) return;
		saving = true;

		// Couleur par defaut selon secteur (cycle)
		const PALETTE = ['#e53935','#8e24aa','#1e88e5','#00897b','#f4511e','#6d4c41','#546e7a','#fdd835'];
		const existing = [...new Set(data.features.map(f => f.properties.secteur))];
		const idx = existing.indexOf(secteur) >= 0 ? existing.indexOf(secteur) : existing.length;
		const couleur = PALETTE[idx % PALETTE.length];

		const emptyGeom = { type: 'GeometryCollection', geometries: [] };

		const { data: rows, error } = await supabase
			.from('voies')
			.insert({
				nom,
				secteur,
				avancement: newAvancement,
				couleur,
				geometry: emptyGeom,
				montant: null,
				lineaire_m: 0,
				osm_voies: [],
				statut: 'absent_osm',
				statut_label: 'Absent OSM',
			})
			.select()
			.single();

		if (!error && rows) {
			const newFeature: VoieFeature = {
				type: 'Feature',
				id: rows.id,
				geometry: emptyGeom as any,
				properties: {
					id: rows.id,
					nom: rows.nom,
					secteur: rows.secteur,
					montant: null,
					avancement: rows.avancement,
					fichier: '',
					os_travaux: '',
					fin_travaux: '',
					osm_voies: [],
					statut: 'absent_osm',
					statut_label: 'Absent OSM',
					note: '',
					couleur: rows.couleur,
					lineaire_m: 0,
				}
			};
			onAdd(newFeature);
			// Ouvrir le secteur de la nouvelle voie
			const next = new Set(secteursOuverts);
			next.add(secteur);
			secteursOuverts = next;
		}

		showModal = false;
		saving = false;
	}

	const totalMontant = $derived(
		data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.montant ?? 0), 0)
	);
	const totalLineaire = $derived(
		data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0)
	);
</script>

<aside class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-96 shrink-0 overflow-y-auto">

	<!-- Header avec bouton Nouvelle voie -->
	<div class="px-3 pt-3 pb-2 border-b border-gray-800 flex items-center gap-2">
		<input
			type="text"
			placeholder="Rechercher une voie\u2026"
			bind:value={recherche}
			class="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
		/>
		<button
			onclick={openModal}
			class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 shrink-0"
			style="background:rgba(37,99,235,0.8);border:1px solid rgba(96,165,250,0.4);box-shadow:0 0 12px rgba(59,130,246,0.2)"
			title="Ajouter une voie"
		>
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
			Nouvelle voie
		</button>
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
							{@const isEditingNom = editingNomId === f.id}
							{@const isEditingMontant = editingMontantId === f.id}
							<div
								class="px-3 py-2 border-b border-gray-800/50 transition-colors {isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-800/40'}"
								style="border-left: 3px solid {isSelected ? '#3b82f6' : p.couleur}"
							>
								<!-- Nom + bouton edition nom -->
								{#if isEditingNom}
									<div class="flex items-center gap-1.5 mb-1.5">
										<span class="w-2 h-2 rounded-full shrink-0" style="background:{p.couleur}"></span>
										<input
											type="text"
											bind:value={editNom}
											class="flex-1 bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
											onkeydown={(e) => { if (e.key === 'Enter') saveNom(f); if (e.key === 'Escape') editingNomId = null; }}
										/>
										<button onclick={() => saveNom(f)} disabled={saving} class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs rounded disabled:opacity-50">
											{saving ? '...' : 'OK'}
										</button>
										<button onclick={() => editingNomId = null} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">
											\u00d7
										</button>
									</div>
								{:else}
									<!-- div cliquable au lieu de button pour éviter les boutons imbriqués -->
									<div class="w-full text-left group cursor-pointer" role="button" tabindex="0"
										onclick={() => onSelect(f)}
										onkeydown={(e) => e.key === 'Enter' && onSelect(f)}>
										<div class="flex items-start gap-2">
											<span class="w-2 h-2 rounded-full shrink-0 mt-1" style="background:{p.couleur}"></span>
											<div class="flex-1 min-w-0">
												<div class="flex items-center gap-1.5">
													<span class="text-xs font-medium text-white leading-snug truncate" title={p.nom}>{p.nom}</span>
													<button
														onclick={(e) => { e.stopPropagation(); startEditNom(f); }}
														class="opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-indigo-400"
														title="Renommer"
													>
														<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
													</button>
												</div>
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
									</div>
								{/if}

								<!-- Edition montant -->
								{#if isEditingMontant}
									<div class="mt-2 ml-4 flex items-center gap-2">
										<input
											type="number"
											bind:value={editMontant}
											class="w-28 bg-gray-800 border border-blue-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
											placeholder="Montant \u20ac"
											onkeydown={(e) => { if (e.key === 'Enter') saveMontant(f); if (e.key === 'Escape') editingMontantId = null; }}
										/>
										<button onclick={() => saveMontant(f)} disabled={saving} class="px-2 py-1 bg-green-700 hover:bg-green-600 text-white text-xs rounded disabled:opacity-50">
											{saving ? '...' : 'OK'}
										</button>
										<button onclick={() => editingMontantId = null} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">
											\u00d7
										</button>
									</div>
								{:else if !isEditingNom}
									<button
										onclick={() => startEditMontant(f)}
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

<!-- Modal nouvelle voie -->
{#if showModal}
	<!-- Overlay -->
	<div
		class="fixed inset-0 z-[2000] flex items-center justify-center"
		style="background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)"
		role="dialog" aria-modal="true"
	>
		<div
			class="w-full max-w-md mx-4 rounded-2xl overflow-hidden shadow-2xl"
			style="background:#0f172a;border:1px solid rgba(99,102,241,0.3)"
		>
			<!-- Header modal -->
			<div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
				<div>
					<h2 class="text-white font-semibold text-base">Nouvelle voie</h2>
					<p class="text-gray-400 text-xs mt-0.5">Cr\u00e9er une voie sans trac\u00e9 — vous pourrez la tracer ensuite sur la carte</p>
				</div>
				<button onclick={() => showModal = false} class="text-gray-500 hover:text-white transition-colors">
					<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
				</button>
			</div>

			<!-- Corps modal -->
			<div class="px-6 py-5 space-y-4">
				<!-- Nom -->
				<div>
					<label class="block text-xs text-gray-400 font-medium mb-1.5">Nom de la voie *</label>
					<input
						type="text"
						bind:value={newNom}
						placeholder="Ex\u00a0: Rue du Bras-Panon"
						class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
					/>
				</div>

				<!-- Secteur -->
				<div>
					<label class="block text-xs text-gray-400 font-medium mb-1.5">Secteur *</label>
					<select
						bind:value={newSecteur}
						class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
					>
						{#each allSecteurs as s}
							<option value={s}>{s}</option>
						{/each}
						<option value="__new__">+ Nouveau secteur\u2026</option>
					</select>
					{#if newSecteur === '__new__'}
						<input
							type="text"
							bind:value={newSecteurCustom}
							placeholder="Nom du nouveau secteur"
							class="w-full mt-2 bg-gray-800 border border-indigo-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"
						/>
					{/if}
				</div>

				<!-- Avancement -->
				<div>
					<label class="block text-xs text-gray-400 font-medium mb-1.5">Avancement</label>
					<div class="flex flex-wrap gap-2">
						{#each AVANCEMENTS as av}
							<button
								onclick={() => newAvancement = av}
								class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
								style={newAvancement === av
									? `background:${AV_COLORS[av]}33;border:1px solid ${AV_COLORS[av]};color:#fff`
									: 'background:rgba(30,41,59,0.6);border:1px solid rgba(71,85,105,0.4);color:#64748b'}
							>
								<span class="w-2 h-2 rounded-full" style="background:{AV_COLORS[av]}"></span>
								{av}
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- Footer modal -->
			<div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
				<button
					onclick={() => showModal = false}
					class="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
					style="background:rgba(71,85,105,0.3);border:1px solid rgba(71,85,105,0.4)"
				>
					Annuler
				</button>
				<button
					onclick={createVoie}
					disabled={saving || !newNom.trim() || (!newSecteur || (newSecteur === '__new__' && !newSecteurCustom.trim()))}
					class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
					style="background:rgba(37,99,235,0.8);border:1px solid rgba(96,165,250,0.4)"
				>
					{#if saving}
						<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
						Cr\u00e9ation\u2026
					{:else}
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
						Cr\u00e9er la voie
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}
