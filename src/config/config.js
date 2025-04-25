require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    authorizedUsers: process.env.AUTHORIZED_USERS.split(',').map(id => parseInt(id)),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-3.5-turbo'
  },
  logging: {
    channelId: process.env.LOG_CHANNEL_ID,
    errorLogPath: './logs/error.log'
  },
  database: {
    path: './src/database/smm_bot.db',
  },
  schedule: {
    interval: '* * * * *'  // Каждую минуту
  },
}; 