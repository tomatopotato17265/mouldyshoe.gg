/// <reference types="@cloudflare/workers-types" />

interface Env {
	ASSETS: Fetcher;
	STATS_KV: KVNamespace;
	YOUTUBE_API_KEY: string;
	YOUTUBE_CHANNEL_HANDLE?: string;
}

interface LatestVideo {
	id: string;
	title: string;
	thumbnail: string;
}

interface Stats {
	updatedAt: number;
	subscribers: number | null;
	videos: number | null;
	latestVideo: LatestVideo | null;
}

const KV_KEY = 'stats:v1';
const TTL_MS = 10 * 60 * 1000;

type ChannelInfo = Pick<Stats, 'subscribers' | 'videos'> & { uploadsPlaylistId: string | null };

async function fetchChannel(env: Env): Promise<ChannelInfo> {
	const handle = (env.YOUTUBE_CHANNEL_HANDLE ?? 'mouldy_shoe').replace(/^@/, '');
	const url =
		'https://www.googleapis.com/youtube/v3/channels' +
		'?part=statistics,contentDetails' +
		`&forHandle=${encodeURIComponent(handle)}` +
		`&key=${env.YOUTUBE_API_KEY}`;

	try {
		const res = await fetch(url, { headers: { accept: 'application/json' } });
		if (!res.ok) return { subscribers: null, videos: null, uploadsPlaylistId: null };
		const data = (await res.json()) as {
			items?: {
				statistics?: { subscriberCount?: string; videoCount?: string };
				contentDetails?: { relatedPlaylists?: { uploads?: string } };
			}[];
		};
		const item = data.items?.[0];
		return {
			subscribers: toCount(item?.statistics?.subscriberCount),
			videos: toCount(item?.statistics?.videoCount),
			uploadsPlaylistId: item?.contentDetails?.relatedPlaylists?.uploads ?? null,
		};
	} catch {
		return { subscribers: null, videos: null, uploadsPlaylistId: null };
	}
}

async function fetchLatestVideo(uploadsPlaylistId: string, env: Env): Promise<LatestVideo | null> {
	const url =
		'https://www.googleapis.com/youtube/v3/playlistItems' +
		'?part=snippet&maxResults=1' +
		`&playlistId=${encodeURIComponent(uploadsPlaylistId)}` +
		`&key=${env.YOUTUBE_API_KEY}`;

	try {
		const res = await fetch(url, { headers: { accept: 'application/json' } });
		if (!res.ok) return null;
		const data = (await res.json()) as {
			items?: {
				snippet?: {
					title?: string;
					resourceId?: { videoId?: string };
					thumbnails?: Record<string, { url?: string }>;
				};
			}[];
		};
		const snippet = data.items?.[0]?.snippet;
		const id = snippet?.resourceId?.videoId;
		const thumbnail =
			snippet?.thumbnails?.high?.url ??
			snippet?.thumbnails?.medium?.url ??
			snippet?.thumbnails?.default?.url;
		if (!id || !thumbnail) return null;
		return { id, title: snippet?.title ?? '', thumbnail };
	} catch {
		return null;
	}
}

function toCount(raw: string | undefined): number | null {
	if (raw == null) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

async function refresh(env: Env): Promise<Stats> {
	const previous = await env.STATS_KV.get<Stats>(KV_KEY, 'json');
	const channel = await fetchChannel(env);
	const latestVideo = channel.uploadsPlaylistId
		? await fetchLatestVideo(channel.uploadsPlaylistId, env)
		: null;

	const stats: Stats = {
		updatedAt: Date.now(),
		subscribers: channel.subscribers ?? previous?.subscribers ?? null,
		videos: channel.videos ?? previous?.videos ?? null,
		latestVideo: latestVideo ?? previous?.latestVideo ?? null,
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
