require('dotenv').config();

module.exports = {
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN,
    authorizedUsers: process.env.AUTHORIZED_USERS.split(',').map(id => parseInt(id)),
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
  },
  logging: {
    channelId: process.env.LOG_CHANNEL_ID,
  },
  database: {
    path: './database/smm_bot.db',
  },
  schedule: {
    interval: '0 */6 * * *', // Каждые 6 часов
  },
}; 