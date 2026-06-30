export interface VoieProperties {
	id: number;
	nom: string;
	secteur: string;
	montant: number | null;
	avancement: string;
	fichier: string;
	os_travaux: string;
	fin_travaux: string;
	osm_voies: string[];
	statut: 'trace' | 'multi_trace' | 'approx_trace' | 'ponctuel' | 'absent_osm';
	statut_label: string;
	note: string;
	couleur: string;
	lineaire_m: number;
}

export interface VoieFeature {
	type: 'Feature';
	id: number;
	geometry: {
		type: 'GeometryCollection';
		geometries: Array<{ type: 'LineString'; coordinates: [number, number][] }>;
	};
	properties: VoieProperties;
}

export interface VoiesData {
	type: 'FeatureCollection';
	commune: string;
	features: VoieFeature[];
}

export interface SecteurStat {
	secteur: string;
	nb: number;
	montant: number;
	avancement: Record<string, number>;
	statuts: Record<string, number>;
}

export interface StatsData {
	commune: string;
	nb_voies: number;
	montant_total: number;
	par_secteur: SecteurStat[];
	par_avancement: Array<{ avancement: string; nb: number; montant: number }>;
	par_statut: Array<{ statut: string; nb: number }>;
}
