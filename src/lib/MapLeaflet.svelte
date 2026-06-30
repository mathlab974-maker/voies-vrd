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

	const AV_COLORS: Record<string, string> = {
		'Terminé':                   '#2e7d32',
		'En cours — Programmation': '#1565c0',
		'En cours — Études':        '#7b1fa2',
		'En cours — Consultation': '#e65100',
		'En cours — Travaux':       '#f9a825',
		'En cours — Clôture':       '#558b2f',
		'Non démarré':               '#c62828',
		'En cours':                '#f9a825',
		'À planifier':              '#1565c0'
	};
	function voieCouleur(f: VoieFeature): string {
		const av = f.properties.avancement || '';
		// Correspondance exacte d'abord (inclut les niveaux MOP)
		if (AV_COLORS[av]) return AV_COLORS[av];
		// Fallback par inclusion
		const avL = av.toLowerCase();
		if (avL.includes('termin')) return AV_COLORS['Terminé'];
		if (avL.includes('en cours')) return AV_COLORS['En cours'];
		if (avL.includes('non')) return AV_COLORS['Non démarré'];
		if (avL.includes('planifier')) return AV_COLORS['À planifier'];
		return f.properties.couleur ?? '#546e7a';
	}

	let mapEl: HTMLDivElement;
	let L: typeof import('leaflet');
	let map: import('leaflet').Map;
	let layerGroup: import('leaflet').LayerGroup;
	let editGroup: import('leaflet').LayerGroup;
	let ready = $state(false);

	const BASEMAPS = [
		// --- Sombres ---
		{ id: 'dark',        label: 'Dark',            icon: '🌑', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                                                          attribution: '&copy; OpenStreetMap &copy; CARTO',               maxZoom: 20, subdomains: 'abcd' },
		{ id: 'dark_nolabel',label: 'Dark sans labels', icon: '⬛', url: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',                                                    attribution: '&copy; OpenStreetMap &copy; CARTO',               maxZoom: 20, subdomains: 'abcd' },
		// --- Clairs ---
		{ id: 'light',       label: 'Clair',           icon: '☀️', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',                                                         attribution: '&copy; OpenStreetMap &copy; CARTO',               maxZoom: 20, subdomains: 'abcd' },
		{ id: 'voyager',     label: 'Voyager',         icon: '🧭', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',                                               attribution: '&copy; OpenStreetMap &copy; CARTO',               maxZoom: 20, subdomains: 'abcd' },
		{ id: 'osm',         label: 'Plan OSM',        icon: '🗺', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',                                                                         attribution: '&copy; OpenStreetMap contributors',               maxZoom: 20, subdomains: '' },
		{ id: 'osm_fr',      label: 'OSM France',      icon: '🇫🇷', url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',                                                              attribution: '&copy; OpenStreetMap France',                     maxZoom: 20, subdomains: 'abc' },
		{ id: 'cycle',       label: 'Cyclable',        icon: '🚴', url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',                                                      attribution: '&copy; CyclOSM &copy; OpenStreetMap',             maxZoom: 20, subdomains: 'abc' },
		// --- Satellite / Photo ---
		{ id: 'satellite',   label: 'Satellite Esri',  icon: '🛰', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',                         attribution: '&copy; Esri',                                     maxZoom: 19, subdomains: '' },
		{ id: 'esri_clarity',label: 'Clarity Esri',   icon: '🔭', url: 'https://clarity.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',                     attribution: '&copy; Esri',                                     maxZoom: 19, subdomains: '' },
		// --- Topographiques ---
		{ id: 'esri_topo',   label: 'Topo Esri',      icon: '⛰', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',                         attribution: '&copy; Esri',                                     maxZoom: 19, subdomains: '' },
		{ id: 'topo',        label: 'OTM Topo',       icon: '🏔', url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',                                                                            attribution: '&copy; OpenStreetMap &copy; OpenTopoMap',         maxZoom: 17, subdomains: '' },
		{ id: 'esri_shaded', label: 'Relief Esri',    icon: '🌄', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',                   attribution: '&copy; Esri',                                     maxZoom: 13, subdomains: '' },
		// --- Hybrides / spéciaux ---
		{ id: 'esri_street', label: 'Street Esri',    icon: '🏙', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',                      attribution: '&copy; Esri',                                     maxZoom: 19, subdomains: '' },
		{ id: 'esri_ocean',  label: 'Océan Esri',     icon: '�', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Ocean/World_Ocean_Base/MapServer/tile/{z}/{y}/{x}',                attribution: '&copy; Esri',                                     maxZoom: 13, subdomains: '' },
		{ id: 'watercolor',  label: 'Aquarelle',      icon: '🎨', url: 'https://watercolormaps.collection.cooperhewitt.org/tile/watercolor/{z}/{x}/{y}.jpg',                                     attribution: '&copy; Stamen &copy; OpenStreetMap',              maxZoom: 16, subdomains: '' },
	] as const;
	type BasemapId = typeof BASEMAPS[number]['id'];
	let currentBasemap = $state<BasemapId>('dark');
	let basemapMenuOpen = $state(false);
	let tileLayer: import('leaflet').TileLayer | null = null;
	let communeLayer: import('leaflet').GeoJSON | null = null;

	async function loadCommune() {
		if (!L || !map) return;
		try {
			const query = `[out:json][timeout:25];relation(280118);out geom;`;
			const res = await fetch('https://overpass.kumi.systems/api/interpreter', {
				method: 'POST',
				body: query,
			});
			const json = await res.json();
			const rel = json.elements?.[0];
			if (!rel) return;

			// Collecter les ways par rôle
			const waysByRole: Record<string, number[][][]> = { outer: [], inner: [] };
			for (const m of rel.members ?? []) {
				if (m.type !== 'way' || !m.geometry) continue;
				const role = m.role === 'inner' ? 'inner' : 'outer';
				waysByRole[role].push(m.geometry.map((p: any) => [p.lon, p.lat]));
			}

			// Assembler les ways en anneaux continus par chaînage
			function assembleRings(ways: number[][][]): number[][][] {
				const rings: number[][][] = [];
				const remaining = ways.map(w => [...w]);
				while (remaining.length > 0) {
					let ring = remaining.shift()!;
					let changed = true;
					while (changed) {
						changed = false;
						for (let i = 0; i < remaining.length; i++) {
							const w = remaining[i];
							const rEnd = ring[ring.length - 1];
							const wStart = w[0];
							const wEnd = w[w.length - 1];
							const rStart = ring[0];
							// Comparer avec tolérance
							const eq = (a: number[], b: number[]) => Math.abs(a[0]-b[0]) < 1e-7 && Math.abs(a[1]-b[1]) < 1e-7;
							if (eq(rEnd, wStart)) {
								ring = [...ring, ...w.slice(1)];
							} else if (eq(rEnd, wEnd)) {
								ring = [...ring, ...[...w].reverse().slice(1)];
							} else if (eq(rStart, wEnd)) {
								ring = [...w, ...ring.slice(1)];
							} else if (eq(rStart, wStart)) {
								ring = [...[...w].reverse(), ...ring.slice(1)];
							} else {
								continue;
							}
							remaining.splice(i, 1);
							changed = true;
							break;
						}
					}
					rings.push(ring);
				}
				return rings;
			}

			const outerRings = assembleRings(waysByRole.outer);
			const innerRings = assembleRings(waysByRole.inner);
			if (outerRings.length === 0) return;

			const geojson: any = {
				type: 'Feature',
				geometry: {
					type: 'MultiPolygon',
					coordinates: outerRings.map(ring => [ring, ...innerRings])
				},
				properties: {}
			};
			communeLayer = L.geoJSON(geojson, {
				style: { color: '#6366f1', weight: 2.5, opacity: 0.85, fill: true, fillColor: '#6366f1', fillOpacity: 0.04, dashArray: '6,4' },
				interactive: false,
			}).addTo(map);
			communeLayer.bringToBack();
		} catch(e) {
			console.warn('Contour commune non chargé:', e);
		}
	}

	function switchBasemap(id: BasemapId) {
		if (!map || !L) return;
		const bm = BASEMAPS.find(b => b.id === id);
		if (!bm) return;
		if (tileLayer) { map.removeLayer(tileLayer); }
		tileLayer = L.tileLayer(bm.url, { attribution: bm.attribution, maxZoom: bm.maxZoom, ...(bm.subdomains ? { subdomains: bm.subdomains } : {}) });
		basemapMenuOpen = false;
		tileLayer.addTo(map);
		tileLayer.bringToBack();
		currentBasemap = id;
	}

	type EditMode = 'none' | 'draw' | 'edit';
	let editMode = $state<EditMode>('none');
	let editingFeature = $state<VoieFeature | null>(null);
	let savingTrace = $state(false);

	// Segments validés (chacun = une LineString)
	let segments = $state<[number, number][][]>([]);
	// Points du tronçon en cours de dessin
	let currentPts = $state<[number, number][]>([]);

	let drawLayer: import('leaflet').Polyline | null = null;
	let previewLayer: import('leaflet').Polyline | null = null;
	let markersLayer: import('leaflet').LayerGroup | null = null;
	let snapMarker: import('leaflet').CircleMarker | null = null;
	let snapPoint: [number, number] | null = null;

	const SNAP_PX = 14;

	// ---- Popup ----
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

	// ---- Rendu carte normale ----
	function drawLayers(features = data.features, filtered = filteredIds, selId = selectedId) {
		if (!layerGroup || editMode !== 'none') return;
		layerGroup.clearLayers();
		for (const f of features) {
			if (!filtered.has(f.id)) continue;
			const isSelected = f.id === selId;
			// Non sélectionné : couleur selon avancement — Sélectionné : couleur vignette
			const color = isSelected ? f.properties.couleur : voieCouleur(f);
			const weight = isSelected ? 6 : 3.5;
			const opacity = isSelected ? 1 : 0.82;
			for (const geom of f.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				if (isSelected) L.polyline(coords, { color: '#fff', weight: weight + 4, opacity: 0.25 }).addTo(layerGroup);
				const line = L.polyline(coords, { color, weight, opacity, lineCap: 'round' });
				line.bindPopup(popupHtml(f), { maxWidth: 320 });
				line.on('click', () => onSelect(f));
				line.addTo(layerGroup);
			}
		}
	}

	// ---- Snap ----
	function snapToNearest(latlng: any): [number, number] | null {
		if (!editingFeature) return null;
		const cursor = map.latLngToContainerPoint(latlng);
		let bestDist = SNAP_PX;
		let bestPt: [number, number] | null = null;

		const allGeoms: [number, number][][] = [];
		// Toutes les voies (y compris la voie en cours)
		for (const feat of data.features) {
			for (const geom of feat.geometry.geometries) {
				allGeoms.push(geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]));
			}
		}
		// Segments déjà validés dans la session en cours
		for (const seg of segments) allGeoms.push(seg);
		// Points du tronçon en cours
		if (currentPts.length > 0) allGeoms.push(currentPts);

		for (const pts of allGeoms) {
			// Snap sur nœuds
			for (const pt of pts) {
				const p = map.latLngToContainerPoint(pt);
				const dx = p.x - cursor.x, dy = p.y - cursor.y;
				const d = Math.sqrt(dx*dx + dy*dy);
				if (d < bestDist) { bestDist = d; bestPt = pt; }
			}
			// Snap sur segments
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
					bestPt = [pts[i][0] + t*(pts[i+1][0]-pts[i][0]), pts[i][1] + t*(pts[i+1][1]-pts[i][1])];
				}
			}
		}
		return bestPt;
	}

	// ---- Mode EDIT nœuds ----
	function startEdit(f: VoieFeature) {
		editingFeature = f;
		editMode = 'edit';
		layerGroup.clearLayers();
		editGroup.clearLayers();

		// Fond gris autres voies
		for (const feat of data.features) {
			if (!filteredIds.has(feat.id) || feat.id === f.id) continue;
			for (const geom of feat.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				L.polyline(coords, { color: '#334155', weight: 2, opacity: 0.4 }).addTo(layerGroup);
			}
		}

		markersLayer = L.layerGroup().addTo(editGroup);
		segments = [];
		for (const geom of f.geometry.geometries) {
			const pts: [number, number][] = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
			segments.push(pts);
			renderEditSegment(pts, segments.length - 1, f.properties.couleur);
		}

		try {
			const b = (markersLayer as any).getBounds();
			if (b.isValid()) map.fitBounds(b, { padding: [80, 80] });
		} catch(e) {}
	}

	function renderEditSegment(pts: [number, number][], segIdx: number, color: string) {
		if (!markersLayer) return;
		const line = L.polyline(pts, { color, weight: 4, opacity: 1 });
		line.addTo(markersLayer);
		pts.forEach((pt, i) => {
			const marker = L.circleMarker(pt, { radius: 7, color: '#fff', weight: 2, fillColor: color, fillOpacity: 1 } as any);
			marker.addTo(markersLayer!);
			(marker as any).on('mousedown', (e: any) => {
				L.DomEvent.stop(e);
				map.dragging.disable();
				map.on('mousemove', (mv: any) => {
					const ll: [number, number] = [mv.latlng.lat, mv.latlng.lng];
					segments[segIdx][i] = ll;
					marker.setLatLng(ll);
					(line as any).setLatLngs(segments[segIdx]);
				});
				map.once('mouseup', () => { map.dragging.enable(); map.off('mousemove'); });
			});
		});
	}

	// ---- Mode DRAW : ajout de tronçons sur tracé existant ----
	function startDraw(f: VoieFeature) {
		editingFeature = f;
		editMode = 'draw';
		currentPts = [];
		layerGroup.clearLayers();
		editGroup.clearLayers();

		// Fond gris autres voies
		for (const feat of data.features) {
			if (!filteredIds.has(feat.id) || feat.id === f.id) continue;
			for (const geom of feat.geometry.geometries) {
				const coords = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng] as [number, number]);
				L.polyline(coords, { color: '#334155', weight: 2, opacity: 0.35 }).addTo(layerGroup);
			}
		}

		// Charger le tracé existant comme segments éditables (base de départ)
		markersLayer = L.layerGroup().addTo(editGroup);
		segments = [];
		for (const geom of f.geometry.geometries) {
			const pts: [number, number][] = geom.coordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
			segments.push(pts);
		}
		redrawSegments(f.properties.couleur);

		drawLayer = L.polyline([], { color: f.properties.couleur, weight: 4 }).addTo(editGroup);
		previewLayer = L.polyline([], { color: f.properties.couleur, weight: 2, dashArray: '5,5', opacity: 0.7 }).addTo(editGroup);
		snapMarker = L.circleMarker([0,0], { radius: 9, color: '#f59e0b', weight: 2.5, fillColor: '#f59e0b', fillOpacity: 0, opacity: 0 } as any).addTo(editGroup);

		map.getContainer().style.cursor = 'crosshair';

		try {
			const existingBounds = L.geoJSON({ type: 'GeometryCollection', geometries: f.geometry.geometries } as any).getBounds();
			if (existingBounds.isValid()) map.fitBounds(existingBounds, { padding: [80, 80] });
		} catch(e) {}
	}

	function redrawSegments(color: string) {
		if (!markersLayer) return;
		markersLayer.clearLayers();
		segments.forEach((seg, si) => {
			L.polyline(seg, { color, weight: 4, opacity: 0.9 }).addTo(markersLayer!);
			// Nœuds
			seg.forEach(pt => {
				L.circleMarker(pt, { radius: 5, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 0.9 } as any).addTo(markersLayer!);
			});
		});
	}

	// Valider le tronçon en cours → devient un segment
	function commitCurrent() {
		if (currentPts.length < 2) return;
		segments = [...segments, [...currentPts]];
		currentPts = [];
		(drawLayer as any)?.setLatLngs([]);
		(previewLayer as any)?.setLatLngs([]);
		redrawSegments(editingFeature?.properties.couleur ?? '#f59e0b');
	}

	// Supprimer un segment par index
	function removeSegment(i: number) {
		segments = segments.filter((_, idx) => idx !== i);
		redrawSegments(editingFeature?.properties.couleur ?? '#f59e0b');
	}

	// Undo dernier point du tronçon en cours
	function undoLastPoint() {
		if (editMode !== 'draw' || currentPts.length === 0) return;
		currentPts = currentPts.slice(0, -1);
		(drawLayer as any)?.setLatLngs(currentPts);
	}

	// ---- Événements carte ----
	let _ignoreNextClick = false;

	function onMapClick(e: any) {
		if (editMode !== 'draw') return;
		if (_ignoreNextClick) { _ignoreNextClick = false; return; }
		const snapped = snapToNearest(e.latlng);
		const ll: [number, number] = snapped ?? [e.latlng.lat, e.latlng.lng];
		currentPts = [...currentPts, ll];
		(drawLayer as any)?.setLatLngs(currentPts);

		// Marker visuel
		L.circleMarker(ll, {
			radius: snapped ? 7 : 5,
			color: snapped ? '#f59e0b' : '#fff',
			weight: 2,
			fillColor: editingFeature?.properties.couleur ?? '#f59e0b',
			fillOpacity: 1
		} as any).addTo(editGroup!);
	}

	function onMapDblClick(e: any) {
		if (editMode !== 'draw') return;
		L.DomEvent.stop(e);
		_ignoreNextClick = true;
		// Retirer le point du simple-clic parasite
		if (currentPts.length > 0) {
			currentPts = currentPts.slice(0, -1);
			(drawLayer as any)?.setLatLngs(currentPts);
		}
		// Valider le tronçon en cours
		commitCurrent();
	}

	function onMapMouseMove(e: any) {
		if (editMode !== 'draw') return;
		const snapped = snapToNearest(e.latlng);
		snapPoint = snapped;
		const cur: [number, number] = snapped ?? [e.latlng.lat, e.latlng.lng];

		if (snapMarker) {
			snapMarker.setLatLng(cur);
			(snapMarker as any).setStyle(snapped
				? { opacity: 1, fillOpacity: 0.35, radius: 9 }
				: { opacity: 0, fillOpacity: 0 });
		}
		map.getContainer().style.cursor = snapped ? 'pointer' : 'crosshair';

		if (currentPts.length === 0) return;
		const last = currentPts[currentPts.length - 1];
		(previewLayer as any)?.setLatLngs([last, cur]);
	}

	// ---- Cancel / Save ----
	function cancelEdit() {
		map.getContainer().style.cursor = '';
		editGroup.clearLayers();
		markersLayer = null; drawLayer = null; previewLayer = null; snapMarker = null; snapPoint = null;
		currentPts = []; segments = [];
		editMode = 'none'; editingFeature = null;
		drawLayers(data.features, filteredIds, selectedId);
	}

	async function saveTrace() {
		if (!editingFeature) return;
		savingTrace = true;

		// Valider le tronçon en cours si assez de points
		if (editMode === 'draw' && currentPts.length >= 2) commitCurrent();

		const allSegs = segments;
		if (allSegs.length === 0) { savingTrace = false; cancelEdit(); return; }

		const geometries = allSegs.map(seg => ({
			type: 'LineString',
			coordinates: seg.map(([lat, lng]) => [lng, lat])
		}));

		// Calcul linéaire (Haversine)
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
				properties: { ...editingFeature.properties, lineaire_m }
			};
			onUpdate(updated);
			onSelect(updated);
		} else {
			console.error('Erreur sauvegarde tracé:', error);
		}

		cancelEdit();
		savingTrace = false;
	}

	onMount(async () => {
		L = (await import('leaflet')).default;
		map = L.map(mapEl, { zoomControl: true });
		const defaultBm = BASEMAPS.find(b => b.id === 'dark')!;
		tileLayer = L.tileLayer(defaultBm.url, { attribution: defaultBm.attribution, maxZoom: defaultBm.maxZoom, subdomains: defaultBm.subdomains || 'abc' });
		tileLayer.addTo(map);
		layerGroup = L.layerGroup().addTo(map);
		loadCommune();
		editGroup = L.layerGroup().addTo(map);
		map.on('click', onMapClick);
		map.on('dblclick', onMapDblClick);
		map.on('mousemove', onMapMouseMove);
		// Désélection clic fond de carte
		map.on('click', (e: any) => {
			if (editMode !== 'none') return;
			if (!(e.originalEvent.target as HTMLElement).closest('.leaflet-interactive')) onSelect(null);
		});
		// Désélection Echap
		document.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape' && editMode === 'none') onSelect(null);
		});
		map.setView([-20.963, 55.652], 14);
		ready = true;
	});

	onDestroy(() => map?.remove());

	$effect(() => {
		if (!ready) return;
		drawLayers(data.features, filteredIds, selectedId);
	});

	$effect(() => {
		if (!ready || editMode !== 'none') return;
		const id = selectedId;
		if (!id) return;
		const f = data.features.find(x => x.id === id);
		if (!f || !f.geometry.geometries.length) return;
		try {
			const bounds = L.geoJSON({ type: 'GeometryCollection', geometries: f.geometry.geometries } as any).getBounds();
			if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80], maxZoom: 18, animate: true, duration: 0.5 });
		} catch(e) {}
	});
</script>

<div class="relative w-full h-full">
	<div bind:this={mapEl} class="w-full h-full"></div>

	<!-- Sélecteur fond de carte repliable -->
	{#if ready && editMode === 'none'}
		{@const activeBm = BASEMAPS.find(b => b.id === currentBasemap)}
		<div class="absolute top-3 right-3 z-[1000]">
			<!-- Bouton déclencheur -->
			<button
				onclick={() => basemapMenuOpen = !basemapMenuOpen}
				class="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
				style="background:rgba(13,17,23,0.88);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.12);box-shadow:0 4px 24px rgba(0,0,0,0.4);color:#e2e8f0">
				<span class="text-base leading-none">{activeBm?.icon}</span>
				<span>{activeBm?.label}</span>
				<svg class="w-3 h-3 text-gray-500 transition-transform {basemapMenuOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
			</button>
			<!-- Menu déroulant -->
			{#if basemapMenuOpen}
				<div class="absolute top-full right-0 mt-1.5 rounded-xl overflow-hidden"
					style="background:rgba(13,17,23,0.96);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.1);box-shadow:0 8px 32px rgba(0,0,0,0.6);min-width:175px;max-height:420px;overflow-y:auto">
					{#each ['Sombres','Clairs','Satellite / Photo','Topographiques','Hybrides / Spéciaux'] as group}
						{@const groupBms = BASEMAPS.filter(b => (
							group === 'Sombres'              ? ['dark','dark_nolabel'].includes(b.id) :
							group === 'Clairs'               ? ['light','voyager','osm','osm_fr','cycle'].includes(b.id) :
							group === 'Satellite / Photo'    ? ['satellite','esri_clarity'].includes(b.id) :
							group === 'Topographiques'       ? ['esri_topo','topo','esri_shaded'].includes(b.id) :
							                                  ['esri_street','esri_ocean','watercolor'].includes(b.id)
						))}
						<div class="px-3 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider" style="color:#4b5563">{group}</div>
						{#each groupBms as bm}
							<button
								onclick={() => switchBasemap(bm.id)}
								class="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs transition-colors hover:bg-white/5 text-left"
								style={currentBasemap === bm.id ? 'color:#a5b4fc;background:rgba(99,102,241,0.12)' : 'color:#94a3b8'}>
								<span class="text-sm leading-none shrink-0">{bm.icon}</span>
								<span class="font-medium">{bm.label}</span>
								{#if currentBasemap === bm.id}
									<svg class="w-3 h-3 ml-auto shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
								{/if}
							</button>
						{/each}
					{/each}
					<div class="h-1"></div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Boutons sélection voie (mode normal) -->
	{#if selectedId && editMode === 'none'}
		{@const f = data.features.find(x => x.id === selectedId)}
		{#if f}
			<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex gap-2.5">
				<button onclick={() => startEdit(f)}
					class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-2xl transition-all hover:scale-105 active:scale-95"
					style="background:rgba(30,41,59,0.95);backdrop-filter:blur(12px);border:1px solid rgba(99,102,241,0.5);box-shadow:0 8px 32px rgba(0,0,0,0.4)">
					<svg class="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
					<span class="text-indigo-200">Ajuster les nœuds</span>
				</button>
				<button onclick={() => startDraw(f)}
					class="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-2xl transition-all hover:scale-105 active:scale-95"
					style="background:rgba(30,41,59,0.95);backdrop-filter:blur(12px);border:1px solid rgba(249,115,22,0.5);box-shadow:0 8px 32px rgba(0,0,0,0.4)">
					<svg class="w-4 h-4 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
					<span class="text-orange-200">Éditer le tracé</span>
				</button>
			</div>
		{/if}
	{/if}

	<!-- Mode DRAW -->
	{#if editMode === 'draw' && editingFeature}
		<div class="absolute top-4 left-1/2 -translate-x-1/2 z-[1000]"
			style="background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);border:1px solid rgba(249,115,22,0.35);border-radius:10px;padding:8px 18px">
			<div class="flex items-center gap-2 text-xs text-gray-300">
				<svg class="w-3.5 h-3.5 text-orange-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path stroke-linecap="round" d="M12 8v4m0 4h.01"/></svg>
				Cliquez pour poser des points — double-clic pour valider un tronçon
				{#if snapPoint}<span class="ml-2 text-amber-400 font-medium">⚡ Accrochage actif</span>{/if}
			</div>
		</div>

		<div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-3">

			<!-- Liste des segments existants -->
			{#if segments.length > 0}
				<div class="flex flex-wrap justify-center gap-1.5 max-w-xl"
					style="background:rgba(15,23,42,0.88);backdrop-filter:blur(8px);border:1px solid rgba(249,115,22,0.25);border-radius:12px;padding:8px 12px">
					{#each segments as seg, i}
						<div class="flex items-center gap-1 text-xs px-2 py-1 rounded"
							style="background:rgba(249,115,22,0.15);border:1px solid rgba(249,115,22,0.3)">
							<span class="text-orange-300">T{i+1}</span>
							<span class="text-gray-400">{seg.length} pts</span>
							<button onclick={() => removeSegment(i)}
								class="ml-1 text-gray-500 hover:text-red-400 transition-colors"
								title="Supprimer ce tronçon">
								<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Barre d'actions principale -->
			<div style="background:rgba(15,23,42,0.95);backdrop-filter:blur(16px);border:1px solid rgba(249,115,22,0.4);border-radius:16px;padding:14px 20px;box-shadow:0 8px 40px rgba(0,0,0,0.5)">
				<div class="flex items-center gap-4">
					<div class="pr-4" style="border-right:1px solid rgba(255,255,255,0.08)">
						<div class="flex items-center gap-1.5 text-orange-400 text-xs font-semibold uppercase tracking-wider">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536M3 21h3.5l11-11-3.5-3.5L3 17.5V21z"/></svg>
							Édition tracé
						</div>
						<div class="text-white text-sm font-medium mt-0.5 max-w-44 truncate">{editingFeature.properties.nom}</div>
						<div class="flex gap-3 mt-0.5 text-xs text-gray-400">
							<span>{segments.length} tronçon{segments.length > 1 ? 's' : ''}</span>
							<span class="text-orange-300">{currentPts.length} pt{currentPts.length !== 1 ? 's' : ''} en cours</span>
						</div>
					</div>
					<div class="flex items-center gap-2">
						<button onclick={undoLastPoint} disabled={currentPts.length === 0}
							class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-30"
							style="background:rgba(71,85,105,0.6);border:1px solid rgba(71,85,105,0.8);color:#cbd5e1"
							title="Supprimer le dernier point (Z)">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"/></svg>
							Défaire
						</button>
						<button onclick={commitCurrent} disabled={currentPts.length < 2}
							class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-30"
							style="background:rgba(67,56,202,0.6);border:1px solid rgba(99,102,241,0.6);color:#c7d2fe"
							title="Valider le tronçon en cours et commencer le suivant (Entrée)">
							<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
							Nouveau tronçon
						</button>
						<button onclick={saveTrace} disabled={savingTrace || (segments.length === 0 && currentPts.length < 2)}
							class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 disabled:opacity-40"
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
							class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all hover:scale-105"
							style="background:rgba(71,85,105,0.4);border:1px solid rgba(71,85,105,0.6);color:#94a3b8">
							<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
							Annuler
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- Mode EDIT nœuds -->
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
						Ajustement nœuds
					</div>
					<div class="text-white text-sm font-medium mt-0.5 max-w-48 truncate">{editingFeature.properties.nom}</div>
				</div>
				<div class="flex items-center gap-2">
					<button onclick={saveTrace} disabled={savingTrace}
						class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 disabled:opacity-40"
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
						class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all hover:scale-105"
						style="background:rgba(71,85,105,0.4);border:1px solid rgba(71,85,105,0.6);color:#94a3b8">
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
						Annuler
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
