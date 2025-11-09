require('@testing-library/jest-dom');
// polyfill fetch for tests
require('whatwg-fetch');
// Increase timeout for slower integration tests (optimizer/backtester)
jest.setTimeout(120000);
// Prevent accidental premature termination during coverage by stubbing process.exit in tests
// Convert calls to process.exit into thrown errors so Jest can capture as test failures
if (process.env.JEST_WORKER_ID !== undefined) {
	const realExit = process.exit;
	process.exit = function(code){
		// Allow real non-zero exits in child processes spawned intentionally
		if (typeof code === 'number' && code !== 0) {
			// Throw a special error that tests can catch or will be reported by Jest
			const e = new Error('[jest-guard] process.exit(' + code + ') converted to exception');
			e.code = code;
			throw e;
		}
		// For zero or undefined, just log and swallow to avoid noisy shutdowns
		console.warn('[jest-guard] process.exit(' + code + ') suppressed during tests');
	};
}
