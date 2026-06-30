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

	const AVANCEMENTS = ['Non démarré', 'En programmation', 'En études', 'En cours — Travaux', 'Terminé'];

	const AV_COLORS: Record<string, string> = {
		'Non démarré':        '#546e7a',
		'En programmation':   '#1565c0',
		'En études':          '#7b1fa2',
		'En cours — Travaux': '#f57c00',
		'Terminé':            '#2e7d32',
		'à planifier':        '#1565c0',
		'En cours':           '#f57c00',
	};

	function avColor(av: string): string {
		return AV_COLORS[av] ?? AV_COLORS[avNorm(av)] ?? '#546e7a';
	}

	const ETAPES_MOP = [
		{ id: 'prog',  label: 'Inscrit au programme',         group: 'Programmation' },
		{ id: 'diag',  label: 'Diagnostic / état des lieux',  group: 'Programmation' },
		{ id: 'cm',    label: 'Enveloppe validée (CM)',        group: 'Études & Décision' },
		{ id: 'avp',   label: 'Études AVP/PRO commandées',    group: 'Études & Décision' },
		{ id: 'dce',   label: 'Consultation publiée (DCE)',    group: 'Études & Décision' },
		{ id: 'act',   label: 'Marché notifié',               group: 'Travaux' },
		{ id: 'os',    label: 'Ordre de service délivré',     group: 'Travaux' },
		{ id: 'aor',   label: 'Réception des travaux',        group: 'Travaux' },
		{ id: 'solde', label: 'Opération soldée',             group: 'Clôture' },
	];

	const MOP_GROUPS = ['Programmation', 'Études & Décision', 'Travaux', 'Clôture'];

	function avFromMop(etapes: string[]): string {
		if (!etapes || etapes.length === 0) return 'Non démarré';
		if (etapes.includes('solde')) return 'Terminé';
		if (etapes.some(id => ['act','os','aor'].includes(id))) return 'En cours — Travaux';
		if (etapes.some(id => ['cm','avp','dce'].includes(id))) return 'En études';
		if (etapes.some(id => ['prog','diag'].includes(id))) return 'En programmation';
		return 'Non démarré';
	}

	function avNorm(av: string): string {
		const KNOWN = new Set(AVANCEMENTS);
		const a = (av || '').trim();
		if (KNOWN.has(a)) return a;
		if (a.toLowerCase().includes('termin')) return 'Terminé';
		if (a.toLowerCase().includes('programmation')) return 'En programmation';
		if (a.toLowerCase().includes('étude') || a.toLowerCase().includes('avp')) return 'En études';
		if (a.toLowerCase().includes('travaux') || a.toLowerCase().includes('en cours')) return 'En cours — Travaux';
		return 'Non démarré';
	}

	function fmt(m: number | null): string {
		if (m === null || m === undefined) return '—';
		if (m >= 1_000_000) return (m / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' M€';
		if (m >= 1_000) return Math.round(m / 1_000).toLocaleString('fr-FR') + ' k€';
		return m.toLocaleString('fr-FR') + ' €';
	}
	function fmtLin(m: number): string {
		if (!m || m <= 0) return '—';
		if (m >= 1000) return (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' km';
		return m.toLocaleString('fr-FR') + ' m';
	}
	function fmtTotal(m: number): string {
		if (m >= 1_000_000) return (m / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M€';
		if (m >= 1_000) return Math.round(m / 1_000).toLocaleString('fr-FR') + ' k€';
		return m.toLocaleString('fr-FR') + ' €';
	}
	function fmtTotalLin(m: number): string {
		if (m >= 1000) return (m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km';
		return m.toLocaleString('fr-FR') + ' m';
	}

	const allSecteurs = $derived([...new Set(data.features.map(f => f.properties.secteur))].sort());

	let secteursOuverts = $state<Set<string>>(new Set());
	let voieItemEls = $state<Record<number, HTMLElement>>({});
	let expandedEditId = $state<number | null>(null);

	$effect(() => {
		const f = selectedFeature;
		if (!f) {
			secteursOuverts = new Set();
			expandedEditId = null;
			return;
		}
		const sec = f.properties.secteur;
		if (!secteursOuverts.has(sec)) secteursOuverts = new Set([...secteursOuverts, sec]);
		setTimeout(() => {
			voieItemEls[f.id]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}, 80);
	});

	let avancementsActifs = $state<Set<string>>(new Set(AVANCEMENTS));
	let recherche = $state('');

	let editNom = $state('');
	let editNomId = $state<number | null>(null);
	let editMontant = $state('');
	let editNote = $state('');
	let editEtapes = $state<string[]>([]);
	let saving = $state(false);
	let confirmDeleteId = $state<number | null>(null);

	$effect(() => {
		const q = recherche.toLowerCase().trim();
		const ids = new Set<number>();
		for (const f of data.features) {
			const p = f.properties;
			const avKey = avNorm(p.avancement);
			const matchAv = avancementsActifs.size >= AVANCEMENTS.length || avancementsActifs.has(avKey);
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
	function toggleEdit(id: number) {
		if (expandedEditId === id) {
			expandedEditId = null;
		} else {
			const f = data.features.find(x => x.id === id);
			if (f) {
				editMontant = String(f.properties.montant ?? '');
				editNote = f.properties.note ?? '';
				editNom = f.properties.nom;
				editEtapes = [...(f.properties.etapes_mop ?? [])];
			}
			expandedEditId = id;
		}
	}

	let editSecteur = $state('');

	function openEdit(f: VoieFeature) {
		editSecteur = f.properties.secteur;
		toggleEdit(f.id);
	}

	async function saveAll(f: VoieFeature, secteur: string) {
		const av = avFromMop(editEtapes);
		saving = true;
		const montantVal = parseFloat(String(editMontant).replace(/\s/g, '').replace(',', '.'));
		const note = editNote.trim();
		const nom = editNom.trim() || f.properties.nom;
		const newCouleur = avColor(av);
		const updates: Record<string, any> = {
			nom,
			avancement: av,
			couleur: newCouleur,
			secteur,
			note: note || null,
		};
		if (!isNaN(montantVal)) updates.montant_modifie = montantVal;
		const { error } = await supabase.from('voies').update(updates).eq('id', f.id);
		if (error) { console.error('Erreur sauvegarde:', error); saving = false; return; }
		const { error: errMop } = await supabase.from('voies').update({ etapes_mop: editEtapes }).eq('id', f.id);
		if (errMop) console.warn('etapes_mop non sauvegardé:', errMop.message);
		onUpdate({ ...f, properties: {
			...f.properties, nom,
			avancement: av, couleur: newCouleur,
			secteur,
			montant: !isNaN(montantVal) ? montantVal : f.properties.montant,
			note: note || '',
			etapes_mop: editEtapes,
		}});
		expandedEditId = null;
		saving = false;
	}

	async function deleteVoie(id: number) {
		const { error } = await supabase.from('voies').delete().eq('id', id);
		if (!error) onDelete(id);
		confirmDeleteId = null;
		expandedEditId = null;
	}

	let showModal = $state(false);
	let newNom = $state('');
	let newSecteur = $state('');
	let newSecteurCustom = $state('');
	let newAvancement = $state('Non démarré');

	function openModal() {
		newNom = ''; newSecteur = allSecteurs[0] ?? ''; newSecteurCustom = ''; newAvancement = 'Non démarré'; showModal = true;
	}

	async function createVoie() {
		const nom = newNom.trim();
		const secteur = newSecteurCustom.trim() || newSecteur;
		if (!nom || !secteur) return;
		saving = true;
		const couleur = AV_COLORS[avNorm(newAvancement)] ?? '#546e7a';
		const emptyGeom = { type: 'GeometryCollection', geometries: [] };
		const { data: maxRow } = await supabase.from('voies').select('id').order('id', { ascending: false }).limit(1).single();
		const nextId = (maxRow?.id ?? 0) + 1;
		const { data: rows, error } = await supabase.from('voies').insert({
			id: nextId, nom, secteur, avancement: newAvancement, couleur,
			geometry: emptyGeom, lineaire_m: 0,
			osm_voies: [], statut: 'absent_osm', statut_label: 'Absent OSM',
		}).select().single();
		if (error) { console.error('Erreur création voie:', error); saving = false; return; }
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

	const totalMontant = $derived(data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.montant ?? 0), 0));
	const totalLineaire = $derived(data.features.filter(f => filteredIds.has(f.id)).reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0));
</script>

<aside class="flex flex-col h-full w-96 shrink-0 overflow-hidden" style="background:#0d1117;border-right:1px solid rgba(255,255,255,0.07)">

	<!-- Header recherche + bouton nouvelle voie -->
	<div class="px-4 pt-4 pb-3 flex items-center gap-2" style="border-bottom:1px solid rgba(255,255,255,0.07)">
		<div class="relative flex-1">
			<svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
			<input type="text" placeholder="Rechercher…" bind:value={recherche}
				class="w-full pl-8 pr-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50 rounded-lg"
				style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08)"/>
		</div>
		<button onclick={openModal}
			class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 active:scale-95 shrink-0"
			style="background:linear-gradient(135deg,#2563eb,#4f46e5);border:1px solid rgba(99,102,241,0.4);box-shadow:0 0 16px rgba(99,102,241,0.2)">
			<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>
			Nouvelle
		</button>
	</div>

	<!-- Filtres avancement -->
	<div class="px-4 py-2.5 flex flex-wrap gap-1.5" style="border-bottom:1px solid rgba(255,255,255,0.06)">
		{#each AVANCEMENTS as av}
			{@const active = avancementsActifs.has(av)}
			{@const count = data.features.filter(f => avNorm(f.properties.avancement) === av).length}
			<button onclick={() => toggleAv(av)}
				class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
				style={active
					? `background:${AV_COLORS[av]}22;border:1px solid ${AV_COLORS[av]}66;color:#fff`
					: 'background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);color:#4b5563'}>
				<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{active ? AV_COLORS[av] : '#374151'}"></span>
				{av}
				<span class="opacity-50">{count}</span>
			</button>
		{/each}
	</div>

	<!-- Totaux -->
	<div class="px-4 py-2.5 grid grid-cols-3 gap-2 text-center text-xs" style="background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(255,255,255,0.05)">
		<div>
			<div class="text-white font-bold text-sm">{filteredIds.size}</div>
			<div class="text-gray-600">voies</div>
		</div>
		<div>
			<div class="text-blue-400 font-bold text-sm">{fmtTotalLin(totalLineaire)}</div>
			<div class="text-gray-600">linéaire</div>
		</div>
		<div>
			<div class="text-emerald-400 font-bold text-sm">{fmtTotal(totalMontant)}</div>
			<div class="text-gray-600">budget estimé</div>
		</div>
	</div>

	<!-- Liste secteurs -->
	<div class="flex-1 overflow-y-auto">
		{#each allSecteurs as sec}
			{@const voiesDuSecteur = data.features.filter(f => f.properties.secteur === sec && filteredIds.has(f.id))}
			{#if voiesDuSecteur.length > 0}
				{@const ouvert = secteursOuverts.has(sec)}
				{@const linSec = voiesDuSecteur.reduce((s, f) => s + (f.properties.lineaire_m ?? 0), 0)}
				{@const montantSec = voiesDuSecteur.reduce((s, f) => s + (f.properties.montant ?? 0), 0)}
				{@const terminesSec = voiesDuSecteur.filter(f => avNorm(f.properties.avancement) === 'Terminé').length}
				{@const enCoursSec = voiesDuSecteur.filter(f => ['En cours — Travaux','En études','En programmation'].includes(avNorm(f.properties.avancement))).length}

				<!-- En-tête quartier -->
				<button onclick={() => toggleSecteur(sec)}
					class="w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-white/[0.025]"
					style="border-left:3px solid {ouvert ? 'rgba(99,102,241,0.7)' : 'rgba(99,102,241,0.18)'};border-bottom:1px solid rgba(255,255,255,0.06);margin-top:4px">
					<div class="flex-1 min-w-0">
						<div class="text-xs font-semibold uppercase tracking-widest truncate" style="color:{ouvert ? '#a5b4fc' : '#6b7280'}">{sec}</div>
						<div class="flex items-center gap-2 mt-0.5" style="font-size:11px;color:#4b5563">
							<span>{voiesDuSecteur.length} voie{voiesDuSecteur.length > 1 ? 's' : ''}</span>
							{#if linSec > 0}<span style="color:#3b82f660">{fmtLin(linSec)}</span>{/if}
							{#if montantSec > 0}<span style="color:#10b98160">{fmt(montantSec)}</span>{/if}
						</div>
					</div>
					<div class="flex items-center gap-1.5 shrink-0">
						{#if terminesSec > 0}<span style="font-size:10px;color:#4ade8099">{terminesSec}✓</span>{/if}
						{#if enCoursSec > 0}<span style="font-size:10px;color:#fb923c80">{enCoursSec}▶</span>{/if}
						<svg class="w-3 h-3 transition-transform duration-200 {ouvert ? 'rotate-90' : ''}" style="color:rgba(99,102,241,0.45)" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
					</div>
				</button>
				{#if ouvert}
					<div class="py-1.5 px-2 space-y-1" style="background:rgba(0,0,0,0.15)">
						{#each voiesDuSecteur as f}
							{@const p = f.properties}
							{@const isSelected = selectedFeature?.id === f.id}
							{@const isEditing = expandedEditId === f.id}
							{@const avCol = AV_COLORS[avNorm(p.avancement)] ?? '#546e7a'}
							{@const mopDone = (p.etapes_mop ?? []).length}
							{@const lastMop = mopDone > 0 ? ETAPES_MOP.filter(e => (p.etapes_mop ?? []).includes(e.id)).at(-1) : null}

							<div bind:this={voieItemEls[f.id]}
								class="rounded-lg overflow-hidden transition-all duration-150"
								style="border:1px solid {isSelected ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.06)'};background:{isSelected ? 'rgba(59,130,246,0.1)' : 'rgba(255,255,255,0.03)'};box-shadow:{isSelected ? '0 0 0 2px rgba(59,130,246,0.2),0 2px 8px rgba(0,0,0,0.4)' : 'none'}">

								<!-- Carte voie -->
								<div class="flex items-stretch">
									<!-- Barre colorée gauche -->
									<div class="w-[3px] shrink-0" style="background:{avCol};opacity:{isSelected ? 1 : 0.7}"></div>

									<!-- Corps cliquable -->
									<div class="flex-1 px-2.5 py-2 min-w-0 cursor-pointer select-none"
										onclick={() => onSelect(f)} role="button" tabindex="0"
										aria-label="Sélectionner {p.nom}"
										onkeydown={(e) => e.key === 'Enter' && onSelect(f)}>

										<!-- Ligne 1 : nom -->
										<div class="text-sm font-semibold text-white truncate leading-snug">{p.nom}</div>

										<!-- Ligne 2 : badge avancement + métriques -->
										<div class="mt-1 flex items-center gap-2 flex-wrap">
											<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
												style="background:{avCol}20;border:1px solid {avCol}50;color:{avCol}">
												<span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:{avCol}"></span>
												{avNorm(p.avancement)}
											</span>
											{#if p.lineaire_m > 0}
												<span class="text-[10px] text-blue-300 font-medium">{fmtLin(p.lineaire_m)}</span>
											{/if}
											{#if p.montant}
												<span class="text-[10px] text-emerald-300 font-medium">{fmt(p.montant)}</span>
											{/if}
										</div>

										<!-- Ligne 3 : étape MOP (si dispo) -->
										{#if lastMop}
											<div class="mt-1 flex items-center gap-1.5">
												<div class="flex gap-0.5">
													{#each ETAPES_MOP as etape}
														<div class="h-[3px] rounded-full" style="width:9px;background:{(p.etapes_mop ?? []).includes(etape.id) ? avCol : 'rgba(255,255,255,0.08)'}"></div>
													{/each}
												</div>
												<span class="text-[10px] text-gray-500 truncate">{lastMop.label}</span>
											</div>
										{/if}

										<!-- Note -->
										{#if p.note}
											<div class="mt-0.5 text-[10px] text-gray-600 truncate italic">{p.note}</div>
										{/if}

										<!-- Confirmation suppression -->
										{#if isEditing && confirmDeleteId === f.id}
											<div class="flex items-center gap-2 mt-2 p-2 rounded-lg text-xs"
												style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2)">
												<span class="text-red-400 flex-1">Supprimer cette voie ?</span>
												<button onclick={() => deleteVoie(f.id)}
													class="px-2 py-1 bg-red-700 hover:bg-red-600 text-white rounded font-medium text-xs">Oui</button>
												<button onclick={() => confirmDeleteId = null}
													class="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-xs">Non</button>
											</div>
										{/if}
									</div>

									<!-- Bouton édition -->
									<button onclick={() => openEdit(f)} title={isEditing ? 'Fermer' : 'Modifier'}
										class="shrink-0 self-start mt-1.5 mr-1.5 p-1.5 rounded-lg transition-all hover:scale-110 {isEditing ? 'text-blue-400 bg-blue-500/10' : 'text-gray-700 hover:text-gray-300 hover:bg-white/5'}">
										{#if isEditing}
											<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
										{:else}
											<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
										{/if}
									</button>
								</div>

								<!-- Panneau édition dépliable -->
								{#if isEditing}
									<div class="px-3 pb-3 pt-2 space-y-3" style="border-top:1px solid rgba(255,255,255,0.06)">

										<!-- Nom -->
										<div>
											<label for="edit-nom-{f.id}" class="text-xs text-gray-500 font-medium block mb-1">Nom</label>
											<input id="edit-nom-{f.id}" type="text" bind:value={editNom}
												class="w-full bg-black/30 border border-white/10 focus:border-blue-500/50 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30"
												onkeydown={(e) => e.key === 'Escape' && (expandedEditId = null)}/>
										</div>

										<!-- Quartier -->
										<div>
											<label for="edit-secteur-{f.id}" class="text-xs text-gray-500 font-medium block mb-1">Quartier</label>
											<select id="edit-secteur-{f.id}" bind:value={editSecteur}
												class="w-full bg-black/30 border border-white/10 focus:border-blue-500/50 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none">
												{#each allSecteurs as s}<option value={s}>{s}</option>{/each}
											</select>
										</div>

										<!-- Montant -->
										<div>
											<label for="edit-montant-{f.id}" class="text-xs text-gray-500 font-medium block mb-1">Coût estimé (€)</label>
											<input id="edit-montant-{f.id}" type="number" bind:value={editMontant}
												class="w-full bg-black/30 border border-white/10 focus:border-yellow-500/50 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500/20"
												placeholder="Montant en euros"/>
										</div>

										<!-- Commentaire -->
										<div>
											<label for="edit-note-{f.id}" class="text-xs text-gray-500 font-medium block mb-1">Commentaire</label>
											<textarea id="edit-note-{f.id}" bind:value={editNote} rows="2"
												class="w-full bg-black/30 border border-white/10 focus:border-indigo-500/50 rounded-lg px-2.5 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/20 resize-none"
												placeholder="Remarques, précisions…"></textarea>
										</div>

										<!-- Avancement du projet (étapes MOP) -->
										<div>
											<p class="text-xs text-gray-500 font-medium mb-2">Avancement du projet</p>
											<div class="space-y-2">
												{#each MOP_GROUPS as group}
													{@const ge = ETAPES_MOP.filter(e => e.group === group)}
													{@const allDone = ge.every(e => editEtapes.includes(e.id))}
													<div class="rounded-lg p-2" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06)">
														<div class="text-xs font-semibold mb-1.5 flex items-center justify-between"
															style="color:{allDone ? '#22c55e' : '#6b7280'}">
															<span>{group}</span>
															{#if allDone}<span>&#10003; Complet</span>{/if}
														</div>
														<div class="space-y-0.5">
															{#each ge as etape}
																{@const done = editEtapes.includes(etape.id)}
																<button
																	onclick={() => { if (done) editEtapes = editEtapes.filter(e => e !== etape.id); else editEtapes = [...editEtapes, etape.id]; }}
																	class="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md transition-colors text-left"
																	style={done ? 'background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25)' : 'background:transparent;border:1px solid transparent'}>
																	<div class="w-4 h-4 rounded shrink-0 flex items-center justify-center"
																		style={done ? 'background:#22c55e' : 'background:transparent;border:1.5px solid rgba(255,255,255,0.2)'}>
																		{#if done}<svg class="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>{/if}
																	</div>
																	<span class="text-xs {done ? 'text-green-300 font-medium' : 'text-gray-500'}">{etape.label}</span>
																</button>
															{/each}
														</div>
													</div>
												{/each}
											</div>
										</div>

										<!-- Actions -->
										<div class="flex items-center justify-between pt-1">
											<button onclick={() => confirmDeleteId = f.id}
												class="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors">
												<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
												Supprimer
											</button>
											<div class="flex gap-2">
												<button onclick={() => expandedEditId = null}
													class="px-3 py-1.5 rounded-lg text-xs text-gray-500 hover:text-white transition-colors"
													style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)">
													Annuler
												</button>
												<button onclick={() => saveAll(f, editSecteur)} disabled={saving}
													class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:scale-105 disabled:opacity-40"
													style="background:linear-gradient(135deg,#16a34a,#15803d);border:1px solid rgba(74,222,128,0.3);box-shadow:0 0 12px rgba(34,197,94,0.15)">
													{#if saving}
														<svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
													{:else}
														<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
													{/if}
													Enregistrer
												</button>
											</div>
										</div>
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
		<div class="fixed inset-0 z-[2000] flex items-center justify-center" style="background:rgba(0,0,0,0.75);backdrop-filter:blur(6px)" role="dialog" aria-modal="true">
			<div class="w-full max-w-md mx-4 rounded-2xl overflow-hidden shadow-2xl" style="background:#0d1117;border:1px solid rgba(99,102,241,0.25);box-shadow:0 0 60px rgba(99,102,241,0.15)">
				<div class="flex items-center justify-between px-6 py-4" style="border-bottom:1px solid rgba(255,255,255,0.07)">
					<div>
						<h2 class="text-white font-semibold text-base">Nouvelle voie</h2>
						<p class="text-gray-500 text-xs mt-0.5">Créez la voie, tracez-la ensuite sur la carte</p>
					</div>
					<button onclick={() => showModal = false} class="text-gray-600 hover:text-white transition-colors" aria-label="Fermer">
						<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
					</button>
				</div>
				<div class="px-6 py-5 space-y-4">
					<div>
						<label for="new-nom" class="text-xs text-gray-500 font-medium block mb-1.5">Nom de la voie *</label>
						<input id="new-nom" type="text" bind:value={newNom} placeholder="Ex : Rue du Bras-Panon"
							class="w-full rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
							style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)"/>
					</div>
					<div>
						<label for="new-secteur" class="text-xs text-gray-500 font-medium block mb-1.5">Secteur *</label>
						<select id="new-secteur" bind:value={newSecteur}
							class="w-full rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
							style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1)">
							{#each allSecteurs as s}<option value={s}>{s}</option>{/each}
							<option value="__new__">+ Nouveau secteur…</option>
						</select>
						{#if newSecteur === '__new__'}
							<input type="text" bind:value={newSecteurCustom} placeholder="Nom du nouveau secteur"
								class="w-full mt-2 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
								style="background:rgba(255,255,255,0.05);border:1px solid rgba(99,102,241,0.4)"/>
						{/if}
					</div>
					<div>
						<p class="text-xs text-gray-500 font-medium mb-1.5">Avancement initial</p>
						<div class="flex flex-wrap gap-2">
							{#each AVANCEMENTS as av}
								<button onclick={() => newAvancement = av}
									class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
									style={newAvancement === av
										? `background:${AV_COLORS[av]}22;border:1px solid ${AV_COLORS[av]};color:#fff`
										: 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);color:#6b7280'}>
									<span class="w-2 h-2 rounded-full" style="background:{AV_COLORS[av]}"></span>{av}
								</button>
							{/each}
						</div>
					</div>
				</div>
				<div class="px-6 py-4 flex justify-end gap-3" style="border-top:1px solid rgba(255,255,255,0.07)">
					<button onclick={() => showModal = false}
						class="px-4 py-2 rounded-lg text-sm text-gray-500 hover:text-white transition-colors"
						style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07)">
						Annuler
					</button>
					<button onclick={createVoie}
						disabled={saving || !newNom.trim() || (!newSecteur || (newSecteur === '__new__' && !newSecteurCustom.trim()))}
						class="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:scale-105 disabled:opacity-40 disabled:pointer-events-none"
						style="background:linear-gradient(135deg,#2563eb,#4f46e5);border:1px solid rgba(99,102,241,0.4);box-shadow:0 0 20px rgba(99,102,241,0.2)">
						{#if saving}
							<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Création…
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/></svg>Créer
						{/if}
					</button>
				</div>
			</div>
		</div>
	{/if}

</aside>
