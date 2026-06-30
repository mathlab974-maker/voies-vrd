<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { supabase } from './supabase';
	import type { VoieFeature, VoiesData } from './types';

	interface Props {
		data: VoiesData;
		filteredIds: Set<number>;
		selectedId: number | null;
		onSelect: (f: VoieFeature | null) => void;
		onUpdate: (f: VoieFeature) => void;
	}

	let { data, filteredIds, selectedId, onSelect, onUpdate }: Props = $props();

	let mapEl: HTMLDivElement;
	let L: typeof import('leaflet');
	let map: import('leaflet').Map;
	let layerGroup: import('leaflet').LayerGroup;
	let editGroup: import('leaflet').LayerGroup;
	let ready = $state(false);

	// Mode edition
	type EditMode = 'none' | 'draw' | 'edit';
	let editMode = $state<EditMode>('none');
	let editingFeature = $state<VoieFeature | null>(null);
	let savingTrace = $state(false);

	// Points du segment en cours de dessin
	let drawPoints = $state<[number, number][]>([]);          // [lat, lng]
	let drawSegments = $state<[number, number][][]>([]);       // segments deja fermes
	let drawLayer: import('leaflet').Polyline | null = null;
	let previewLayer: import('leaflet').Polyline | null = null;
	let markersLayer: import('leaflet').LayerGroup | null = null;
	let snapMarker: import('leaflet').CircleMarker | null = null;
	let snapPoint: [number, number] | null = null;
	let snapLocked = $state(false); // true = snap forcé sur un nœud, double-clic pour décrocher
	const SNAP_PX = 15; // pixels de tolérance

	function formatMontant(m: number | null): string {
		if (m === null || m === undefined) return '\u2014';
		return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(m);
	}

	function popupHtml(f: VoieFeature): string {
		const p = f.properties;
		return `<div style="font-family:system-ui,sans-serif;min-width:260px">
			<div style="background:${p.couleur};padding:10px 14px">
				<div style="font-weight:700;font-size:13px;color:#fff">${p.nom}</div>
				<div style="font-size:11px;color:rgba(255,255,255,0.8);margin-top:2px">${p.secteur}</div>
			</div>
			<div style="padding:10px 14px;background:#1e293b;color:#e2e8f0">
				<table style="width:100%;font-size:12px;border-collapse:collapse">
					<tr><td style="color:#94a3b8;padding:2px 0">Montant</td><td style="text-align:right;color:#4ade80;font-weight:600">${formatMontant(p.montant)}</td></tr>
					<tr><td style="color:#94a3b8;padding:2px 0">Lin\u00e9aire</td><td style="text-align:right;color:#60a5fa;font-weight:600">${p.lineaire_m > 0 ? p.lineaire_m.toLocaleString('fr-FR') + ' m' : '\u2014'}</td></tr>
					${p.lineaire_m > 0 && p.montant ? `<tr><td style="color:#94a3b8;padding:2px 0">Co\u00fbt/ml</td><td style="text-align:right;color:#f472b6">${Math.round(p.montant / p.lineaire_m).toLocaleString('fr-FR')} \u20ac/ml</td></tr>` : ''}
					<tr><td style="color:#94a3b8;padding:2px 0">Avancement</td><td style="text-align:right">${p.avancement || '\u2014'}</td></tr>
					<tr><td style="color:#94a3b8;padding:2px 0">Statut OSM</td><td style="text-align:right">${p.statut_label}</td></tr>
				</table>
				${p.note ? `<div style="margin-top:8px;padding:6px 8px;background:#0f172a;border-radius:4px;font-size:11px;color:#94a3b8">${p.note}</div>` : ''}
			</div>
		</div>`;
	}

	function drawLayers(features = data.features, filtered = filteredIds, selId = selectedId) {
		if (!layerGroup || editMode !== 'none') return;
		layerGroup.clearLayers();
		for (const f of features) {
			if (!filtered.has(f.id)) continue;
			const isSelected = f.id === selId;
			const color = f.properties.couleur;
			const weight = isSelected ? 6 : 3.5;
			const opacity = isSelected ? 1 : 0.82;
			for (const geom of f.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				if (isSelected) {
					L.polyline(coords, { color: '#fff', weight: weight + 4, opacity: 0.18 }).addTo(layerGroup);
				}
				const line = L.polyline(coords, { color, weight, opacity, lineCap: 'round' });
				line.bindPopup(popupHtml(f), { maxWidth: 320 });
				line.on('click', () => onSelect(f));
				line.addTo(layerGroup);
			}
		}
	}

	// ---- Mode EDIT (modifier les noeuds existants) ----
	function startEdit(f: VoieFeature) {
		editingFeature = f;
		editMode = 'edit';
		setupEditCanvas(f);
	}

	// ---- Mode DRAW (retracer from scratch) ----
	function startDraw(f: VoieFeature) {
		editingFeature = f;
		editMode = 'draw';
		drawPoints = [];
		drawSegments = [];
		setupDrawCanvas(f);
	}

	function setupEditCanvas(f: VoieFeature) {
		layerGroup.clearLayers();
		editGroup.clearLayers();

		// Fond gris pour les autres voies
		for (const feat of data.features) {
			if (!filteredIds.has(feat.id) || feat.id === f.id) continue;
			for (const geom of feat.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				L.polyline(coords, { color: '#334155', weight: 2, opacity: 0.4 }).addTo(layerGroup);
			}
		}

		// Charger les segments de la voie comme markers draggables
		markersLayer = L.layerGroup().addTo(editGroup);
		drawSegments = [];
		for (const geom of f.geometry.geometries) {
			const pts: [number, number][] = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
			drawSegments.push(pts);
			renderEditSegment(pts, drawSegments.length - 1, f.properties.couleur);
		}

		const bounds = (editGroup as any).getBounds();
		if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80] });
	}

	function renderEditSegment(pts: [number, number][], segIdx: number, color: string) {
		if (!markersLayer) return;
		// Ligne du segment
		const line = L.polyline(pts, { color, weight: 4, opacity: 1 });
		line.addTo(markersLayer);
		// Markers draggables sur chaque noeud
		pts.forEach((pt, i) => {
			const marker = L.circleMarker(pt, {
				radius: 7,
				color: '#fff',
				weight: 2,
				fillColor: color,
				fillOpacity: 1,
			} as any);
			marker.addTo(markersLayer!);
			// Drag via mousedown/mousemove
			(marker as any).on('mousedown', (e: any) => {
				L.DomEvent.stop(e);
				map.dragging.disable();
				map.on('mousemove', (mv: any) => {
					const ll: [number, number] = [mv.latlng.lat, mv.latlng.lng];
					drawSegments[segIdx][i] = ll;
					marker.setLatLng(ll);
					(line as any).setLatLngs(drawSegments[segIdx]);
				});
				map.once('mouseup', () => {
					map.dragging.enable();
					map.off('mousemove');
				});
			});
		});
	}

	function setupDrawCanvas(f: VoieFeature) {
		layerGroup.clearLayers();
		editGroup.clearLayers();

		// Fond gris pour les autres voies
		for (const feat of data.features) {
			if (!filteredIds.has(feat.id) || feat.id === f.id) continue;
			for (const geom of feat.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				L.polyline(coords, { color: '#334155', weight: 2, opacity: 0.4 }).addTo(layerGroup);
			}
		}

		// Afficher l'ancien trace en pointilles pour reference
		for (const geom of f.geometry.geometries) {
			const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
			L.polyline(coords, { color: f.properties.couleur, weight: 2, opacity: 0.3, dashArray: '6,6' }).addTo(layerGroup);
		}

		markersLayer = L.layerGroup().addTo(editGroup);
		drawLayer = L.polyline([], { color: f.properties.couleur, weight: 4 }).addTo(editGroup);
		previewLayer = L.polyline([], { color: f.properties.couleur, weight: 2, dashArray: '4,4', opacity: 0.7 }).addTo(editGroup);

		map.getContainer().style.cursor = 'crosshair';

		const bounds = (editGroup as any).getBounds?.();
		// Centrer sur le tracé existant s'il existe
		try {
			const existingBounds = L.geoJSON({ type: 'GeometryCollection', geometries: f.geometry.geometries } as any).getBounds();
			if (existingBounds.isValid()) map.fitBounds(existingBounds, { padding: [80, 80] });
		} catch(e) {}
	}

	function snapToNearest(latlng: any): [number, number] | null {
		if (!editingFeature) return null;
		const cursor = map.latLngToContainerPoint(latlng);
		let bestDist = SNAP_PX;
		let bestPt: [number, number] | null = null;

		// Collecter toutes les géométries : voies voisines + ancien tracé de la voie en cours
		const allGeoms: [number, number][][] = [];
		for (const feat of data.features) {
			for (const geom of feat.geometry.geometries) {
				allGeoms.push(geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]));
			}
		}
		// Aussi les points déjà posés dans le dessin en cours
		if (drawPoints.length > 0) allGeoms.push(drawPoints);

		for (const pts of allGeoms) {
			// Snap sur nœuds
			for (const pt of pts) {
				const p = map.latLngToContainerPoint(pt);
				const dx = p.x - cursor.x, dy = p.y - cursor.y;
				const d = Math.sqrt(dx*dx + dy*dy);
				if (d < bestDist) { bestDist = d; bestPt = pt; }
			}
			// Snap sur segments (projection orthogonale)
			for (let i = 0; i < pts.length - 1; i++) {
				const a = map.latLngToContainerPoint(pts[i]);
				const b = map.latLngToContainerPoint(pts[i + 1]);
				const abx = b.x - a.x, aby = b.y - a.y;
				const len2 = abx*abx + aby*aby;
				if (len2 === 0) continue;
				const t = Math.max(0, Math.min(1, ((cursor.x - a.x)*abx + (cursor.y - a.y)*aby) / len2));
				const proj = { x: a.x + t*abx, y: a.y + t*aby };
				const dx = proj.x - cursor.x, dy = proj.y - cursor.y;
				const d = Math.sqrt(dx*dx + dy*dy);
				if (d < bestDist) {
					bestDist = d;
					// Interpoler la coordonnée géographique
					const lat = pts[i][0] + t * (pts[i+1][0] - pts[i][0]);
					const lng = pts[i][1] + t * (pts[i+1][1] - pts[i][1]);
					bestPt = [lat, lng];
				}
			}
		}
		return bestPt;
	}

	let _ignoreNextClick = false;

	function onMapClick(e: any) {
		if (editMode !== 'draw') return;
		// Le dblclick génère 2 clics + 1 dblclick — on ignore ces 2 clics
		if (_ignoreNextClick) { _ignoreNextClick = false; return; }
		const snapped = snapLocked ? snapPoint : snapToNearest(e.latlng);
		const ll: [number, number] = snapped ?? [e.latlng.lat, e.latlng.lng];
		drawPoints.push(ll);
		(drawLayer as any)?.setLatLngs(drawPoints);

		// Marker sur le point (orange si snappé)
		const isSnapped = snapped !== null;
		const marker = L.circleMarker(ll, {
			radius: isSnapped ? 7 : 5,
			color: isSnapped ? '#f59e0b' : '#fff',
			weight: 2,
			fillColor: editingFeature?.properties.couleur ?? '#f59e0b',
			fillOpacity: 1
		} as any).addTo(markersLayer!);
	}

	function onMapDblClick(e: any) {
		if (editMode !== 'draw') return;
		L.DomEvent.stop(e);
		// Annuler les 2 clics parasites déjà enregistrés (le dernier seulement est arrivé)
		_ignoreNextClick = true;
		// Retirer le point parasite du simple clic précédent
		if (drawPoints.length > 0) {
			drawPoints.pop();
			(drawLayer as any)?.setLatLngs(drawPoints);
			const layers: any[] = [];
			markersLayer?.eachLayer((l: any) => layers.push(l));
			if (layers.length > 0) markersLayer?.removeLayer(layers[layers.length - 1]);
		}
		const nearest = snapToNearest(e.latlng);
		if (nearest) {
			// Toggle accrochage
			snapLocked = !snapLocked;
			snapPoint = snapLocked ? nearest : null;
			if (snapMarker) {
				(snapMarker as any).setStyle(
					snapLocked
						? { color: '#22c55e', fillColor: '#22c55e', opacity: 1, fillOpacity: 0.5, radius: 10 }
						: { color: '#f59e0b', fillColor: '#f59e0b', opacity: 0, fillOpacity: 0, radius: 8 }
				);
			}
		} else {
			// Pas de nœud proche : valider le segment
			validateSegment();
		}
	}

	function onMapMouseMove(e: any) {
		if (editMode !== 'draw') return;
		const snapped = snapLocked ? snapPoint : snapToNearest(e.latlng);
		if (!snapLocked) snapPoint = snapped;
		const cur: [number, number] = snapped ?? [e.latlng.lat, e.latlng.lng];

		// Indicateur visuel snap
		if (snapMarker) { snapMarker.setLatLng(cur); }
		else {
			snapMarker = L.circleMarker(cur, {
				radius: 8, color: '#f59e0b', weight: 2.5,
				fillColor: '#f59e0b', fillOpacity: 0.25
			} as any).addTo(editGroup!);
		}
		if (snapped) {
			(snapMarker as any).setStyle({ opacity: 1, fillOpacity: 0.4 });
			map.getContainer().style.cursor = 'pointer';
		} else {
			(snapMarker as any).setStyle({ opacity: 0, fillOpacity: 0 });
			map.getContainer().style.cursor = 'crosshair';
		}

		if (drawPoints.length === 0) return;
		const last = drawPoints[drawPoints.length - 1];
		(previewLayer as any)?.setLatLngs([last, cur]);
	}

	function undoLastPoint() {
		if (editMode !== 'draw' || drawPoints.length === 0) return;
		drawPoints.pop();
		(drawLayer as any)?.setLatLngs(drawPoints);
		// Supprimer le dernier marker
		const layers: any[] = [];
		markersLayer?.eachLayer((l: any) => layers.push(l));
		if (layers.length > 0) markersLayer?.removeLayer(layers[layers.length - 1]);
	}

	function validateSegment() {
		if (editMode !== 'draw' || drawPoints.length < 2) return;
		drawSegments.push([...drawPoints]);
		drawPoints = [];
		(drawLayer as any)?.setLatLngs([]);
		(previewLayer as any)?.setLatLngs([]);
		markersLayer?.clearLayers();
		// Redessiner tous les segments valides
		for (const seg of drawSegments) {
			L.polyline(seg, { color: editingFeature?.properties.couleur ?? '#f59e0b', weight: 4 }).addTo(markersLayer!);
		}
	}

	function cancelEdit() {
		map.getContainer().style.cursor = '';
		map.off('click', onMapClick);
		map.off('mousemove', onMapMouseMove);
		editGroup.clearLayers();
		markersLayer = null;
		drawLayer = null;
		previewLayer = null;
		snapMarker = null;
		snapPoint = null;
		snapLocked = false;
		drawPoints = [];
		drawSegments = [];
		editMode = 'none';
		editingFeature = null;
		drawLayers(data.features, filteredIds, selectedId);
	}

	async function saveTrace() {
		if (!editingFeature) return;
		savingTrace = true;

		// En mode draw : valider le segment en cours si >= 2 points
		if (editMode === 'draw' && drawPoints.length >= 2) validateSegment();

		const allSegments = drawSegments;
		if (allSegments.length === 0) { savingTrace = false; cancelEdit(); return; }

		const geometries = allSegments.map(seg => ({
			type: 'LineString',
			coordinates: seg.map(([lat, lng]) => [lng, lat])
		}));

		// Calculer lineaire
		const R = 6371000;
		let lineaire = 0;
		for (const g of geometries) {
			for (let i = 0; i < g.coordinates.length - 1; i++) {
				const [lon1, lat1] = g.coordinates[i];
				const [lon2, lat2] = g.coordinates[i + 1];
				const phi1 = lat1 * Math.PI / 180, phi2 = lat2 * Math.PI / 180;
				const a = Math.sin((lat2-lat1)*Math.PI/360)**2 + Math.cos(phi1)*Math.cos(phi2)*Math.sin((lon2-lon1)*Math.PI/360)**2;
				lineaire += 2 * R * Math.asin(Math.sqrt(a));
			}
		}

		const newGeom = { type: 'GeometryCollection', geometries };
		const lineaire_m = Math.round(lineaire);
		const { error } = await supabase.from('voies').update({ geometry_modifiee: newGeom, lineaire_m }).eq('id', editingFeature.id);

		if (!error) {
			const updated: VoieFeature = {
				...editingFeature,
				geometry: newGeom as any,
				properties: { ...editingFeature.properties, lineaire_m: Math.round(lineaire) }
			};
			onUpdate(updated);
			onSelect(updated);
		}

		map.getContainer().style.cursor = '';
		map.off('click', onMapClick);
		map.off('mousemove', onMapMouseMove);
		editGroup.clearLayers();
		markersLayer = null;
		drawLayer = null;
		previewLayer = null;
		drawPoints = [];
		drawSegments = [];
		editMode = 'none';
		editingFeature = null;
		savingTrace = false;
	}

	onMount(async () => {
		L = (await import('leaflet')).default;

		map = L.map(mapEl, { zoomControl: true });
		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			attribution: '&copy; OpenStreetMap', maxZoom: 20
		}).addTo(map);

		layerGroup = L.layerGroup().addTo(map);
		editGroup = L.layerGroup().addTo(map);

		map.on('click', onMapClick);
		map.on('dblclick', onMapDblClick);
		map.on('mousemove', onMapMouseMove);

		map.setView([-20.963, 55.652], 14);
		ready = true;
	});

	onDestroy(() => map?.remove());

	$effect(() => {
		if (!ready) return;
		const _features = data.features;
		const _filtered = filteredIds;
		const _selected = selectedId;
		drawLayers(_features, _filtered, _selected);
	});
</script>

<div class="relative w-full h-full">
	<div bind:this={mapEl} class="w-full h-full"></div>

	<!-- Boutons mode edition (voie sélectionnée, hors edition) -->
	{#if selectedId && editMode === 'none'}
		{@const f = data.features.find(x => x.id === selectedId)}
		{#if f}
			<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-2.5">
				<button
					onclick={() => startEdit(f)}
					class="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
					style="background:rgba(30,41,59,0.95);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,0.5);box-shadow:0 0 0 1px rgba(99,102,241,0.2),0 8px 32px rgba(0,0,0,0.4)"
				>
					<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
					<span class="text-indigo-200">Ajuster les nœuds</span>
				</button>
				<button
					onclick={() => startDraw(f)}
					class="group flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-2xl transition-all duration-200 hover:scale-105 active:scale-95"
					style="background:rgba(30,41,59,0.95);backdrop-filter:blur(12px);border:1px solid rgba(249,115,22,0.5);box-shadow:0 0 0 1px rgba(249,115,22,0.2),0 8px 32px rgba(0,0,0,0.4)"
				>
					<svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
					<span class="text-orange-200">Retracer la voie</span>
				</button>
			</div>
		{/if}
	{/if}

	<!-- Barre d'actions mode DRAW -->
	{#if editMode === 'draw' && editingFeature}
		<!-- Tooltip haut -->
		<div class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]"
			style="background:rgba(15,23,42,0.9);backdrop-filter:blur(8px);border:1px solid rgba(249,115,22,0.3);border-radius:10px;padding:8px 16px">
			<div class="flex items-center gap-2 text-xs text-gray-300">
				<svg class="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>
				Cliquez sur la carte pour poser des points — l'ancien tracé est en pointillés
			</div>
		</div>

		<!-- Barre bas -->
		<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]"
			style="background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(249,115,22,0.4);border-radius:16px;padding:14px 20px;box-shadow:0 8px 40px rgba(0,0,0,0.5)">
			<div class="flex items-center gap-4">
				<!-- Info voie -->
				<div class="pr-4" style="border-right:1px solid rgba(255,255,255,0.08)">
					<div class="flex items-center gap-1.5 text-orange-400 text-xs font-semibold uppercase tracking-wider">
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M3 21h3.5l11-11-3.5-3.5L3 17.5V21z"/></svg>
						Dessin du tracé
					</div>
					<div class="text-white text-sm font-medium mt-0.5 max-w-48 truncate">{editingFeature.properties.nom}</div>
					<div class="flex gap-3 mt-1 text-xs">
						<span class="text-gray-400">{drawPoints.length} pt{drawPoints.length > 1 ? 's' : ''} en cours</span>
						{#if drawSegments.length > 0}<span class="text-orange-300">{drawSegments.length} segment{drawSegments.length > 1 ? 's' : ''}</span>{/if}
					</div>
				</div>
				<!-- Actions -->
				<div class="flex items-center gap-2">
					<button onclick={undoLastPoint} disabled={drawPoints.length === 0}
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
						style="background:rgba(71,85,105,0.6);border:1px solid rgba(71,85,105,0.8);color:#cbd5e1">
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
						Défaire
					</button>
					<button onclick={validateSegment} disabled={drawPoints.length < 2}
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
						style="background:rgba(67,56,202,0.6);border:1px solid rgba(99,102,241,0.6);color:#c7d2fe">
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
						Nouveau segment
					</button>
					<button onclick={saveTrace} disabled={savingTrace || (drawSegments.length === 0 && drawPoints.length < 2)}
						class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
						style="background:rgba(21,128,61,0.8);border:1px solid rgba(34,197,94,0.5);color:#bbf7d0;box-shadow:0 0 16px rgba(34,197,94,0.2)">
						{#if savingTrace}
							<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
							Sauvegarde…
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
							Enregistrer
						{/if}
					</button>
					<button onclick={cancelEdit}
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all hover:scale-105 active:scale-95"
						style="background:rgba(71,85,105,0.4);border:1px solid rgba(71,85,105,0.6);color:#94a3b8">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
						Annuler
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Barre d'actions mode EDIT noeuds -->
	{#if editMode === 'edit' && editingFeature}
		<div class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]"
			style="background:rgba(15,23,42,0.9);backdrop-filter:blur(8px);border:1px solid rgba(99,102,241,0.3);border-radius:10px;padding:8px 16px">
			<div class="flex items-center gap-2 text-xs text-gray-300">
				<svg class="w-3.5 h-3.5 text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>
				Glissez les nœuds (cercles) pour ajuster le tracé
			</div>
		</div>
		<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000]"
			style="background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(99,102,241,0.4);border-radius:16px;padding:14px 20px;box-shadow:0 8px 40px rgba(0,0,0,0.5)">
			<div class="flex items-center gap-4">
				<div class="pr-4" style="border-right:1px solid rgba(255,255,255,0.08)">
					<div class="flex items-center gap-1.5 text-indigo-400 text-xs font-semibold uppercase tracking-wider">
						<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
						Ajustement des nœuds
					</div>
					<div class="text-white text-sm font-medium mt-0.5 max-w-48 truncate">{editingFeature.properties.nom}</div>
				</div>
				<div class="flex items-center gap-2">
					<button onclick={saveTrace} disabled={savingTrace}
						class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 active:scale-95 disabled:opacity-40"
						style="background:rgba(21,128,61,0.8);border:1px solid rgba(34,197,94,0.5);color:#bbf7d0;box-shadow:0 0 16px rgba(34,197,94,0.2)">
						{#if savingTrace}
							<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
							Sauvegarde…
						{:else}
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
							Enregistrer
						{/if}
					</button>
					<button onclick={cancelEdit}
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all hover:scale-105 active:scale-95"
						style="background:rgba(71,85,105,0.4);border:1px solid rgba(71,85,105,0.6);color:#94a3b8">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
						Annuler
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
