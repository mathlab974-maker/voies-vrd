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
		onDelete: (id: number) => void;
	}

	let { data, filteredIds, selectedFeature, onFilterChange, onSelect, onUpdate, onAdd, onDelete }: Props = $props();

	const AVANCEMENTS = ['Terminé', 'En cours', 'Non démarré', 'À planifier'];
	const AV_COLORS: Record<string, string> = {
		'Terminé': '#2e7d32',
		'En cours': '#f9a825',
		'Non démarré': '#c62828',
		'À planifier': '#1565c0'
	};

	function avNorm(av: string): string {
		const a = (av || '').toLowerCase();
		if (a.includes('termin')) return 'Terminé';
		if (a.includes('en cours')) return 'En cours';
		if (a.includes('non d')) return 'Non démarré';
		return 'À planifier';
	}

	const allSecteurs = $derived([...new Set(data.features.map(f => f.properties.secteur))].sort());

	let secteursOuverts = $state<Set<string>>(new Set());
	let avancementsActifs = $state<Set<string>>(new Set(AVANCEMENTS));
	let recherche = $state('');

	let editingMontantId = $state<number | null>(null);
	let editMontant = $state<string>('');

	let editingNomId = $state<number | null>(null);
	let editNom = $state<string>('');

	let editingSecId = $state<number | null>(null);
	let editSecteur = $state<string>('');

	let editingAvId = $state<number | null>(null);
	let confirmDeleteId = $state<number | null>(null);

	let showModal = $state(false);
	let newNom = $state('');
	let newSecteur = $state('');
	let newSecteurCustom = $state('');
	let newAvancement = $state('Non démarré');
	let saving = $state(false);

	function fmt(m: number | null): string {
		if (m === null || m === undefined) return '—';
		return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(m);
	}

	function fmtLin(m: number): string {
		return m > 0 ? m.toLocaleString('fr-FR') + ' m' : '—';
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

	function startEditMontant(f: VoieFeature) {
		editingMontantId = f.id; editingNomId = null; editingSecId = null; editingAvId = null;
		editMontant = String(f.properties.montant ?? '');
	}

	async function saveMontant(f: VoieFeature) {
		saving = true;
		const val = parseFloat(editMontant.replace(/\s/g, '').replace(',', '.'));
		if (!isNaN(val)) {
			const { error } = await supabase.from('voies').update({ montant_modifie: val }).eq('id', f.id);
			if (!error) onUpdate({ ...f, properties: { ...f.properties, montant: val } });
		}
		editingMontantId = null; saving = false;
	}

	function startEditNom(f: VoieFeature) {
		editingNomId = f.id; editingMontantId = null; editingSecId = null; editingAvId = null;
		editNom = f.properties.nom;
	}

	async function saveNom(f: VoieFeature) {
		saving = true;
		const nom = editNom.trim();
		if (nom && nom !== f.properties.nom) {
			const { error } = await supabase.from('voies').update({ nom }).eq('id', f.id);
			if (!error) onUpdate({ ...f, properties: { ...f.properties, nom } });
		}
		editingNomId = null; saving = false;
	}

	function startEditSecteur(f: VoieFeature) {
		editingSecId = f.id; editingNomId = null; editingMontantId = null; editingAvId = null;
		editSecteur = f.properties.secteur;
	}

	async function saveSecteur(f: VoieFeature) {
		saving = true;
		const secteur = editSecteur.trim();
		if (secteur && secteur !== f.properties.secteur) {
			const { error } = await supabase.from('voies').update({ secteur }).eq('id', f.id);
			if (!error) onUpdate({ ...f, properties: { ...f.properties, secteur } });
		}
		editingSecId = null; saving = false;
	}

	async function saveAvancement(f: VoieFeature, av: string) {
		const { error } = await supabase.from('voies').update({ avancement: av }).eq('id', f.id);
		if (!error) onUpdate({ ...f, properties: { ...f.properties, avancement: av } });
		editingAvId = null;
	}

	async function deleteVoie(id: number) {
		const { error } = await supabase.from('voies').delete().eq('id', id);
		if (!error) onDelete(id);
		confirmDeleteId = null;
	}

	function openModal() {
		newNom = ''; newSecteur = allSecteurs[0] ?? ''; newSecteurCustom = ''; newAvancement = 'Non démarré'; showModal = true;
	}

	async function createVoie() {
		const nom = newNom.trim();
		const secteur = newSecteurCustom.trim() || newSecteur;
		if (!nom || !secteur) return;
		saving = true;
		const PALETTE = ['#e53935','#8e24aa','#1e88e5','#00897b','#f4511e','#6d4c41','#546e7a','#fdd835'];
		const existing = [...new Set(data.features.map(f => f.properties.secteur))];
		const idx = existing.indexOf(secteur) >= 0 ? existing.indexOf(secteur) : existing.length;
		const couleur = PALETTE[idx % PALETTE.length];
		const emptyGeom = { type: 'GeometryCollection', geometries: [] };
		// Calculer le prochain id
		const { data: maxRow } = await supabase.from('voies').select('id').order('id', { ascending: false }).limit(1).single();
		const nextId = (maxRow?.id ?? 0) + 1;

		const { data: rows, error } = await supabase.from('voies').insert({
			id: nextId,
			nom, secteur, avancement: newAvancement, couleur,
			geometry: emptyGeom, lineaire_m: 0,
			osm_voies: [], statut: 'absent_osm', statut_label: 'Absent OSM',
		}).select().single();
		if (error) {
			console.error('Erreur création voie:', error);
			saving = false;
			return;
		}
		if (rows) {
			const newFeature: VoieFeature = {
				type: 'Feature', id: rows.id,
				geometry: emptyGeom as any,
				properties: {
					id: rows.id, nom: rows.nom, secteur: rows.secteur,
					montant: null, avancement: rows.avancement,
					fichier: '', os_travaux: '', fin_travaux: '',
					osm_voies: [], statut: 'absent_osm', statut_label: 'Absent OSM',
					note: '', couleur: rows.couleur, lineaire_m: 0,
				}
			};
			onAdd(newFeature);
			const next = new Set(secteursOuverts); next.add(secteur); secteursOuverts = next;
		}
		showModal = false; saving = false;
	}

	const totalMontant = $derived(
		data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.montant ?? 0), 0)
	);
	const totalLineaire = $derived(
		data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0)
	);
</script>

<aside class="flex flex-col h-full bg-gray-900 border-r border-gray-800 w-96 shrink-0 overflow-y-auto">

	<!-- Header -->
	<div class="px-3 pt-3 pb-2 border-b border-gray-800 flex items-center gap-2">
		<input
			type="text"
			placeholder="Rechercher une voie…"
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

	<!-- Résumé global -->
	<div class="px-3 py-2 border-b border-gray-800 bg-gray-950/50 flex justify-between text-xs">
		<span class="text-gray-400"><span class="font-semibold text-white">{filteredIds.size}</span> voies</span>
		<span class="text-gray-400"><span class="font-semibold text-blue-400">{totalLineaire.toLocaleString('fr-FR')} m</span></span>
		<span class="text-gray-400"><span class="font-semibold text-green-400">{fmt(totalMontant)}</span></span>
	</div>

	<!-- Secteurs accordéon -->
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
					<span class="text-gray-400 text-xs w-3 shrink-0">{ouvert ? '▾' : '▸'}</span>
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
							{@const isEditingAv = editingAvId === f.id}
							{@const isEditingSec = editingSecId === f.id}
							{@const isConfirmDelete = confirmDeleteId === f.id}
							<div
								class="px-3 py-2 border-b border-gray-800/50 transition-colors {isSelected ? 'bg-blue-900/30' : 'hover:bg-gray-800/40'}"
								style="border-left: 3px solid {isSelected ? '#3b82f6' : p.couleur}"
							>
								<!-- Nom -->
								{#if isEditingNom}
									<div class="flex items-center gap-1.5 mb-1.5">
										<span class="w-2 h-2 rounded-full shrink-0" style="background:{p.couleur}"></span>
										<input type="text" bind:value={editNom}
											class="flex-1 bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
											onkeydown={(e) => { if (e.key === 'Enter') saveNom(f); if (e.key === 'Escape') editingNomId = null; }}
										/>
										<button onclick={() => saveNom(f)} disabled={saving} class="px-2 py-1 bg-indigo-700 hover:bg-indigo-600 text-white text-xs rounded disabled:opacity-50">{saving ? '…' : 'OK'}</button>
										<button onclick={() => editingNomId = null} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded" title="Annuler">×</button>
									</div>
								{:else}
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
												<div class="text-xs text-gray-500 mt-0.5 truncate">{p.avancement || '—'}</div>
											</div>
										</div>
										<div class="flex gap-3 mt-1.5 ml-4 text-xs">
											<span class="text-blue-400">{fmtLin(p.lineaire_m)}</span>
											<span class="text-green-400">{fmt(p.montant)}</span>
											{#if p.lineaire_m > 0 && p.montant}
												<span class="text-pink-400">{Math.round(p.montant / p.lineaire_m).toLocaleString('fr-FR')} €/ml</span>
											{/if}
										</div>
									</div>
								{/if}

								<!-- Boutons d'action -->
								{#if !isEditingNom}
									<div class="mt-2 ml-4 flex flex-wrap gap-x-3 gap-y-1">

										<!-- Montant -->
										{#if isEditingMontant}
											<div class="w-full flex items-center gap-2 mt-1">
												<input type="number" bind:value={editMontant}
													class="w-28 bg-gray-800 border border-yellow-500 rounded px-2 py-1 text-xs text-white focus:outline-none"
													placeholder="Montant €"
													onkeydown={(e) => { if (e.key === 'Enter') saveMontant(f); if (e.key === 'Escape') editingMontantId = null; }}
												/>
												<button onclick={() => saveMontant(f)} disabled={saving} class="px-2 py-1 bg-yellow-700 hover:bg-yellow-600 text-white text-xs rounded disabled:opacity-50">{saving ? '…' : 'OK'}</button>
												<button onclick={() => editingMontantId = null} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded" title="Annuler">×</button>
											</div>
										{:else}
											<button onclick={() => startEditMontant(f)} class="flex items-center gap-1 text-xs text-gray-500 hover:text-yellow-400 transition-colors">
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
												Coût
											</button>
										{/if}

										<!-- Avancement -->
										{#if isEditingAv}
											<div class="w-full flex flex-wrap gap-1.5 mt-1">
												{#each AVANCEMENTS as av}
													<button onclick={() => saveAvancement(f, av)}
														class="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
														style={avNorm(p.avancement) === av ? `background:${AV_COLORS[av]}33;border:1px solid ${AV_COLORS[av]};color:#fff` : 'background:rgba(30,41,59,0.6);border:1px solid rgba(71,85,105,0.4);color:#94a3b8'}
													>
														<span class="w-1.5 h-1.5 rounded-full" style="background:{AV_COLORS[av]}"></span>{av}
													</button>
												{/each}
												<button onclick={() => editingAvId = null} class="px-2 py-1 bg-gray-700 text-gray-400 text-xs rounded" title="Annuler">×</button>
											</div>
										{:else}
											<button onclick={() => { editingAvId = f.id; editingMontantId = null; editingSecId = null; }} class="flex items-center gap-1 text-xs text-gray-500 hover:text-blue-400 transition-colors">
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
												Avancement
											</button>
										{/if}

										<!-- Quartier -->
										{#if isEditingSec}
											<div class="w-full flex items-center gap-2 mt-1">
												<select bind:value={editSecteur} class="flex-1 bg-gray-800 border border-purple-500 rounded px-2 py-1 text-xs text-white focus:outline-none">
													{#each allSecteurs as s}<option value={s}>{s}</option>{/each}
												</select>
												<button onclick={() => saveSecteur(f)} disabled={saving} class="px-2 py-1 bg-purple-700 hover:bg-purple-600 text-white text-xs rounded disabled:opacity-50">{saving ? '…' : 'OK'}</button>
												<button onclick={() => editingSecId = null} class="px-2 py-1 bg-gray-700 text-white text-xs rounded" title="Annuler">×</button>
											</div>
										{:else}
											<button onclick={() => startEditSecteur(f)} class="flex items-center gap-1 text-xs text-gray-500 hover:text-purple-400 transition-colors">
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
												Quartier
											</button>
										{/if}

										<!-- Suppression -->
										{#if isConfirmDelete}
											<div class="w-full flex items-center gap-2 mt-1">
												<span class="text-xs text-red-400">Supprimer ?</span>
												<button onclick={() => deleteVoie(f.id)} class="px-2 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded">Oui</button>
												<button onclick={() => confirmDeleteId = null} class="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded">Non</button>
											</div>
										{:else}
											<button onclick={() => confirmDeleteId = f.id} class="flex items-center gap-1 text-xs text-gray-500 hover:text-red-400 transition-colors">
												<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
												Supprimer
											</button>
										{/if}

									</div>
								{/if}

							</div>
						{/each}
					</div>
				{/if}
			{/if}
		{/each}
	</div>

	<!-- Modal nouvelle voie -->
	{#if showModal}
		<div class="fixed inset-0 z-[2000] flex items-center justify-center" style="background:rgba(0,0,0,0.7);backdrop-filter:blur(4px)" role="dialog" aria-modal="true">
			<div class="w-full max-w-md mx-4 rounded-2xl overflow-hidden shadow-2xl" style="background:#0f172a;border:1px solid rgba(99,102,241,0.3)">
				<div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
					<div>
						<h2 class="text-white font-semibold text-base">Nouvelle voie</h2>
						<p class="text-gray-400 text-xs mt-0.5">Créer une voie sans tracé — vous pourrez la tracer ensuite sur la carte</p>
					</div>
					<button onclick={() => showModal = false} class="text-gray-500 hover:text-white transition-colors" title="Fermer">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
				<div class="px-6 py-5 space-y-4">
					<div>
						<p class="block text-xs text-gray-400 font-medium mb-1.5">Nom de la voie *</p>
						<input type="text" bind:value={newNom} placeholder="Ex : Rue du Bras-Panon"
							class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"/>
					</div>
					<div>
						<p class="block text-xs text-gray-400 font-medium mb-1.5">Secteur *</p>
						<select bind:value={newSecteur} class="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500">
							{#each allSecteurs as s}<option value={s}>{s}</option>{/each}
							<option value="__new__">+ Nouveau secteur…</option>
						</select>
						{#if newSecteur === '__new__'}
							<input type="text" bind:value={newSecteurCustom} placeholder="Nom du nouveau secteur"
								class="w-full mt-2 bg-gray-800 border border-indigo-500 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none"/>
						{/if}
					</div>
					<div>
						<p class="block text-xs text-gray-400 font-medium mb-1.5">Avancement</p>
						<div class="flex flex-wrap gap-2">
							{#each AVANCEMENTS as av}
								<button onclick={() => newAvancement = av}
									class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
									style={newAvancement === av ? `background:${AV_COLORS[av]}33;border:1px solid ${AV_COLORS[av]};color:#fff` : 'background:rgba(30,41,59,0.6);border:1px solid rgba(71,85,105,0.4);color:#64748b'}
								>
									<span class="w-2 h-2 rounded-full" style="background:{AV_COLORS[av]}"></span>{av}
								</button>
							{/each}
						</div>
					</div>
				</div>
				<div class="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
					<button onclick={() => showModal = false} class="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white transition-colors" style="background:rgba(71,85,105,0.3);border:1px solid rgba(71,85,105,0.4)">Annuler</button>
					<button onclick={createVoie}
						disabled={saving || !newNom.trim() || (!newSecteur || (newSecteur === '__new__' && !newSecteurCustom.trim()))}
						class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
						style="background:rgba(37,99,235,0.8);border:1px solid rgba(96,165,250,0.4)"
					>
						{#if saving}
							<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Création…
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>Créer la voie
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

</aside>
