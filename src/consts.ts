// Place any global data in this file.
// You can import this data from anywhere in your site by using the `import` keyword.

export const SITE_TITLE = 'Mouldy Shoe';
export const SITE_DESCRIPTION = '';

// hardcoding rank tiers bc there's no public api for rl ranks :(
export const RANK_TIERS = [
	'B1',
	'B2',
	'B3',
	'S1',
	'S2',
	'S3',
	'G1',
	'G2',
	'G3',
	'P1',
	'P2',
	'P3',
	'D1',
	'D2',
	'D3',
	'C1',
	'C2',
	'C3',
	'GC1',
	'GC2',
	'GC3',
	'SSL',
] as const;

/** Must be a value from RANK_TIERS. */
export const CURRENT_RANK: (typeof RANK_TIERS)[number] = 'GC2';
