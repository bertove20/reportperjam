module.exports = {
  apps: [{
    name: 'tim-report-bot',
    script: 'src/server.js',
    node_args: '--env-file=.env',
    autorestart: true,
    max_memory_restart: '500M',
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: 30000,
    kill_timeout: 10000,
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
