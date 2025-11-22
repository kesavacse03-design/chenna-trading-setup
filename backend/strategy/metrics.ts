export interface Metrics {
	netPnl: number;
	winRate: number; // always 0-100
	maxDrawdown: number;
	trades: number;
	avgReturn: number;
	profitFactor: number;
	wins?: number;
	losses?: number;
}

function num(v: unknown, def = 0): number {
	const n = Number(v as any);
	return Number.isFinite(n) ? n : def;
}

export function normalizeMetrics(raw: Partial<Metrics> | null | undefined): Metrics {
	const m = raw ?? {};
	let netPnl = num((m as any).netPnl, 0);
	let trades = Math.max(0, Math.trunc(num((m as any).trades, 0)));
	let maxDrawdown = num((m as any).maxDrawdown, 0);
	let avgReturn = num((m as any).avgReturn, 0);
	let profitFactor = num((m as any).profitFactor, 0);
	let wins = Math.max(0, Math.trunc(num((m as any).wins, 0)));
	let losses = Math.max(0, Math.trunc(num((m as any).losses, 0)));

	let winRate = num((m as any).winRate, NaN);
	if (!Number.isFinite(winRate)) {
		if (trades > 0 && wins >= 0) {
			winRate = (wins * 100) / trades;
		} else {
			winRate = 0;
		}
	} else if (winRate <= 1 && winRate >= 0) {
		winRate = winRate * 100;
	}
	if (!Number.isFinite(winRate)) winRate = 0;
	winRate = +Math.min(100, Math.max(0, winRate)).toFixed(2);

	if (!avgReturn && trades > 0) {
		const r = netPnl / trades;
		if (Number.isFinite(r)) avgReturn = r;
	}

	if (!Number.isFinite(netPnl)) netPnl = 0;
	if (!Number.isFinite(maxDrawdown)) maxDrawdown = 0;
	if (!Number.isFinite(avgReturn)) avgReturn = 0;
	if (!Number.isFinite(profitFactor)) profitFactor = 0;

	return {
		netPnl: +netPnl.toFixed(2),
		winRate,
		maxDrawdown: +maxDrawdown.toFixed(2),
		trades,
		avgReturn: +avgReturn,
		profitFactor,
		wins,
		losses,
	};
}

export function computeMetrics(trades: any[]): Metrics {
	const t = Array.isArray(trades) ? trades : [];
	const netPnl = t.reduce((a, x) => a + Number(x.pnl || 0), 0);
	const wins = t.filter((x) => Number(x.pnl || 0) > 0).length;
	const tradesCount = t.length;
	const winRate = tradesCount ? +( (wins * 100) / tradesCount ).toFixed(2) : 0;
	const returns = t
		.map((tr) => {
			const e = Number(tr.entry || 0);
			const x = Number(tr.exit || 0);
			if (!e) return 0;
			return (x - e) / e;
		})
		.filter((r) => Number.isFinite(r));
	const avgReturn = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
	const grossProfit = t
		.filter((x) => Number(x.pnl || 0) > 0)
		.reduce((a, x) => a + Number(x.pnl || 0), 0);
	const grossLoss = Math.abs(
		t
			.filter((x) => Number(x.pnl || 0) < 0)
			.reduce((a, x) => a + Number(x.pnl || 0), 0),
	);
	const profitFactor = grossLoss > 0 ? +(grossProfit / grossLoss).toFixed(2) : grossProfit > 0 ? Number.POSITIVE_INFINITY : 0;
	let peak = 0,
		dd = 0,
		eq = 0;
	for (const tr of t) {
		eq += Number(tr.pnl || 0);
		if (eq > peak) peak = eq;
		const curDD = peak - eq;
		if (curDD > dd) dd = curDD;
	}
	const maxDrawdown = +dd.toFixed(2);
	return normalizeMetrics({ netPnl, winRate, maxDrawdown, trades: tradesCount, avgReturn, profitFactor, wins, losses: tradesCount - wins });
}
