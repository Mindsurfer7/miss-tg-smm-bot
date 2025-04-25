const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const { logger } = require('../utils/logger');

class BotService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this.setupErrorHandling();
  }

  setupErrorHandling() {
    this.bot.on('error', (error) => {
      logger.error(`Ошибка в боте: ${error.message}`);
    });
  }

  async sendMessage(chatId, text, options = {}) {
    try {
      return await this.bot.sendMessage(chatId, text, { 
        parse_mode: 'Markdown',
        ...options 
      });
    } catch (error) {
      logger.error(`Ошибка при отправке сообщения в ${chatId}: ${error.message}`);
      throw error;
    }
  }

  onText(regexp, callback) {
    this.bot.onText(regexp, callback);
  }

  onCallbackQuery(callback) {
    this.bot.on('callback_query', callback);
  }

  answerCallbackQuery(callbackQueryId, options = {}) {
    return this.bot.answerCallbackQuery(callbackQueryId, options);
  }
}

module.exports = new BotService(); 