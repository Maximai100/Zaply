module.exports = {
  apps: [
    {
      name: 'zaply-api',
      cwd: './apps/api',
      script: 'index.js',
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'zaply-reminders',
      cwd: './apps/api',
      script: 'reminder.js',
      cron_restart: '*/5 * * * *', // запускать каждые 5 минут
      env: { NODE_ENV: 'production' }
    }
  ]
};


