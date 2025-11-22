// PM2 ecosystem for Live Runner
// Usage: pm2 start ecosystem.config.cjs --only live-runner
// Note: Fill real secrets via your environment or PM2 ecosystem (do not commit real values)

module.exports = {
  apps: [
    {
      name: 'live-runner',
      script: 'backend/strategy/liveRunner.cjs',
      node_args: '',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        DRY_RUN: '1',
        ALLOW_LIVE: '0',
        WS_PORT: '8080',
        CANARY_MODE: '1',
        // Provide these via PM2 runtime env or system env
        // TOKENS_ENCRYPTION_KEY: '<base64-32B-key>',
        // ADMIN_SHARED_SECRET: '<strong-admin-secret>'
      },
      error_file: 'logs/pm2-live-runner.err.log',
      out_file: 'logs/pm2-live-runner.out.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
};
