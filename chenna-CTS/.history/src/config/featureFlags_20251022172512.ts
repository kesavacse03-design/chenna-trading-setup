import * as fs from 'fs';
import * as path from 'path';

export type CTSFlags = {
	live_trading_enabled: boolean;
	hybrid_mode_enabled: boolean;
	telegram_enabled: boolean;
	upstox_enabled: boolean;
	v2_shadow_enabled: boolean;
};

const defaults: CTSFlags = {
	live_trading_enabled: false,
	hybrid_mode_enabled: true,
	telegram_enabled: true,
	upstox_enabled: false,
	v2_shadow_enabled: false,
};

function parseBool(val: any, fallback: boolean) {
	if (val === undefined || val === null) return fallback;
	if (typeof val === 'boolean') return val;
	if (typeof val === 'string') {
		const v = val.toLowerCase();
		if (['1', 'true', 'yes', 'on'].includes(v)) return true;
		if (['0', 'false', 'no', 'off'].includes(v)) return false;
	}
	return fallback;
}

function loadFlagsFromFile(): Partial<CTSFlags> {
	try {
		const p = path.resolve(process.cwd(), 'config', 'flags.json');
		if (!fs.existsSync(p)) return {};
		const raw = fs.readFileSync(p, 'utf8');
		const parsed = JSON.parse(raw) as Partial<CTSFlags>;
		return parsed;
	} catch (e) {
		return {};
	}
}

const fileFlags = loadFlagsFromFile();

const featureFlags: CTSFlags = {
	live_trading_enabled: parseBool(process.env.LIVE_TRADING_ENABLED, fileFlags.live_trading_enabled ?? defaults.live_trading_enabled),
	hybrid_mode_enabled: parseBool(process.env.HYBRID_MODE_ENABLED, fileFlags.hybrid_mode_enabled ?? defaults.hybrid_mode_enabled),
	telegram_enabled: parseBool(process.env.TELEGRAM_ENABLED, fileFlags.telegram_enabled ?? defaults.telegram_enabled),
	upstox_enabled: parseBool(process.env.UPSTOX_ENABLED, fileFlags.upstox_enabled ?? defaults.upstox_enabled),
	v2_shadow_enabled: parseBool(process.env.V2_SHADOW_ENABLED, fileFlags.v2_shadow_enabled ?? defaults.v2_shadow_enabled),
};

// Validation: ensure all keys present
const missingKeys: string[] = [] as string[];
(Object.keys(defaults) as Array<keyof CTSFlags>).forEach((k) => {
	if (featureFlags[k] === undefined) missingKeys.push(k as string);
});

if (missingKeys.length > 0) {
	try {
		const logDir = path.resolve(process.cwd(), '.agent', 'logs');
		if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
		const logPath = path.join(logDir, 'flags-errors.log');
		fs.appendFileSync(
			logPath,
			`[${new Date().toISOString()}] Missing feature flags keys: ${missingKeys.join(', ')} - defaulting to fail-closed for live_trading_enabled\n`
		);
	} catch (e) {
		// ignore logging failures
	}
	// Fail-closed
	featureFlags.live_trading_enabled = false;
}

export { featureFlags };
export const isFeatureEnabled = (k: keyof CTSFlags) => featureFlags[k];

