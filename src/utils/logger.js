const winston = require('winston');
const config = require('../config/config');
const TelegramBot = require('node-telegram-bot-api');

const bot = new TelegramBot(config.telegram.token);

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple()
  }));
}

const logError = async (error, channelId, command) => {
  const errorMessage = `**Ошибка**\nВремя: ${new Date().toLocaleString()}\nКанал: ${channelId}\nКоманда: ${command}\nОписание: ${error.message}`;
  
  logger.error(errorMessage);
  
  try {
    await bot.sendMessage(config.logging.channelId, errorMessage, { parse_mode: 'Markdown' });
  } catch (err) {
    logger.error(`Ошибка при отправке лога в Telegram: ${err.message}`);
  }
};

module.exports = {
  logger,
  logError
}; 