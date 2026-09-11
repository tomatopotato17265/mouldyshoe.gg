/// <reference types="@cloudflare/workers-types" />

interface Env {
	ASSETS: Fetcher;
	STATS_KV: KVNamespace;
	YOUTUBE_API_KEY: string;
	YOUTUBE_CHANNEL_HANDLE?: string;
}

interface Stats {
	updatedAt: number;
	subscribers: number | null;
	videos: number | null;
}

const KV_KEY = 'stats:v1';
const TTL_MS = 10 * 60 * 1000;

async function fetchYouTube(env: Env): Promise<Pick<Stats, 'subscribers' | 'videos'>> {
	const handle = (env.YOUTUBE_CHANNEL_HANDLE ?? 'mouldy_shoe').replace(/^@/, '');
	const url =
		'https://www.googleapis.com/youtube/v3/channels' +
		`?part=statistics&forHandle=${encodeURIComponent(handle)}` +
		`&key=${env.YOUTUBE_API_KEY}`;

	try {
		const res = await fetch(url, { headers: { accept: 'application/json' } });
		if (!res.ok) return { subscribers: null, videos: null };
		const data = (await res.json()) as {
			items?: { statistics?: { subscriberCount?: string; videoCount?: string } }[];
		};
		const stats = data.items?.[0]?.statistics;
		return {
			subscribers: toCount(stats?.subscriberCount),
			videos: toCount(stats?.videoCount),
		};
	} catch {
		return { subscribers: null, videos: null };
	}
}

function toCount(raw: string | undefined): number | null {
	if (raw == null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

async function refresh(env: Env): Promise<Stats> {
	const previous = await env.STATS_KV.get<Stats>(KV_KEY, 'json');
	const fresh = await fetchYouTube(env);
	const stats: Stats = {
		updatedAt: Date.now(),
		subscribers: fresh.subscribers ?? previous?.subscribers ?? null,
		videos: fresh.videos ?? previous?.videos ?? null,
	};
	await env.STATS_KV.put(KV_KEY, JSON.stringify(stats));
	return stats;
}

async function getStats(env: Env, ctx: ExecutionContext): Promise<Stats> {
	const cached = await env.STATS_KV.get<Stats>(KV_KEY, 'json');
	if (!cached) return refresh(env);

	if (Date.now() - cached.updatedAt >= TTL_MS) {
		ctx.waitUntil(refresh(env));
	}
	return cached;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const { pathname } = new URL(request.url);

		if (pathname === '/api/stats') {
			const stats = await getStats(env, ctx);
			return Response.json(stats, {
				headers: { 'cache-control': 'public, max-age=60' },
			});
		}

		return env.ASSETS.fetch(request);
	},

	async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
		ctx.waitUntil(refresh(env));
	},
};
