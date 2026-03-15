module.exports = {
  apps: [{
    name: 'gettransfer',
    script: 'dist/api/server.js',
    cwd: '/home/cristian/gettransfer',
    env_file: '.env',
    exec_mode: 'fork',
    autorestart: true,
    max_memory_restart: '400M',
  }]
}
