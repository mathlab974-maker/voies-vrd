<script lang="ts">
	import { onMount } from 'svelte';
	import MapLeaflet from '$lib/MapLeaflet.svelte';
	import Sidebar from '$lib/Sidebar.svelte';
	import { supabase } from '$lib/supabase';
	import type { VoiesData, VoieFeature } from '$lib/types';

	let data = $state<VoiesData | null>(null);
	let filteredIds = $state<Set<number>>(new Set());
	let selectedFeature = $state<VoieFeature | null>(null);

	async function loadFromSupabase() {
		const { data: rows, error } = await supabase
			.from('voies')
			.select('*')
			.order('id');
		if (error) { console.error(error); return; }

		const features: VoieFeature[] = rows.map((r: any) => ({
			type: 'Feature',
			id: r.id,
			geometry: r.geometry_modifiee ?? r.geometry,
			properties: {
				id: r.id,
				nom: r.nom,
				secteur: r.secteur,
				montant: r.montant_modifie ?? r.montant,
				montant_original: r.montant,
				avancement: r.avancement,
				fichier: r.fichier,
				os_travaux: r.os_travaux,
				fin_travaux: r.fin_travaux,
				osm_voies: r.osm_voies ?? [],
				statut: r.statut,
				statut_label: r.statut_label,
				note: r.note,
				couleur: r.couleur,
				lineaire_m: r.lineaire_m ?? 0,
			}
		}));

		data = { type: 'FeatureCollection', commune: 'Saint-André (La Réunion)', features };
		filteredIds = new Set(features.map(f => f.id));
	}

	onMount(loadFromSupabase);

	function handleUpdate(updatedFeature: VoieFeature) {
		if (!data) return;
		data = {
			...data,
			features: data.features.map(f => f.id === updatedFeature.id ? updatedFeature : f)
		};
		if (selectedFeature?.id === updatedFeature.id) selectedFeature = updatedFeature;
	}

	function handleAdd(newFeature: VoieFeature) {
		if (!data) return;
		data = { ...data, features: [...data.features, newFeature] };
		filteredIds = new Set([...filteredIds, newFeature.id]);
		selectedFeature = newFeature;
	}

	function handleDelete(id: number) {
		if (!data) return;
		data = { ...data, features: data.features.filter(f => f.id !== id) };
		filteredIds = new Set([...filteredIds].filter(i => i !== id));
		if (selectedFeature?.id === id) selectedFeature = null;
	}
</script>

{#if data}
	<div class="flex h-full">
		<Sidebar
			{data}
			{filteredIds}
			selectedFeature={selectedFeature}
			onFilterChange={(ids) => { filteredIds = ids; }}
			onSelect={(f) => { selectedFeature = f; }}
			onUpdate={handleUpdate}
			onAdd={handleAdd}
			onDelete={handleDelete}
		/>
		<div class="flex-1 relative">
			<MapLeaflet
				{data}
				{filteredIds}
				selectedId={selectedFeature?.id ?? null}
				onSelect={(f) => { selectedFeature = f; }}
				onUpdate={handleUpdate}
			/>
		</div>
	</div>
{:else}
	<div class="flex items-center justify-center h-full text-gray-500 text-sm">
		Chargement depuis Supabase…
	</div>
{/if}
