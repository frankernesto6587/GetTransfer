module.exports = {
  apps: [{
    name: 'gettransfer',
    script: 'dist/api/server.js',
    cwd: '/home/cristian/gettransfer',
    env_file: '.env',
    instances: 1,
    autorestart: true,
    max_memory_restart: '400M',
  }]
}
