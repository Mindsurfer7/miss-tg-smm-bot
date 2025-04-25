const TelegramBot = require('node-telegram-bot-api');
const config = require('../config/config');
const db = require('../database/db');
const openaiService = require('../services/openaiService');
const { logError } = require('../utils/logger');

class BotController {
  constructor() {
    this.bot = new TelegramBot(config.telegram.token, { polling: true });
    this.userStates = new Map();
    this.setupCommands();
  }

  setupCommands() {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/addtheme (.+) (.+)/, this.handleAddTheme.bind(this));
    this.bot.onText(/\/deletetheme (.+) (.+)/, this.handleDeleteTheme.bind(this));
    this.bot.onText(/\/listthemes (.+)/, this.handleListThemes.bind(this));
    this.bot.onText(/\/generate (.+) (.+)/, this.handleGenerate.bind(this));
    this.bot.on('message', this.handleMessage.bind(this));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) {
      await this.bot.sendMessage(chatId, 'У вас нет доступа к этому боту.');
      return;
    }

    await this.bot.sendMessage(
      chatId,
      'Добро пожаловать в бота для генерации постов!\n\n' +
      'Доступные команды:\n' +
      '/addtheme <channel_id> <тема> - Добавить тему\n' +
      '/deletetheme <channel_id> <ID> - Удалить тему\n' +
      '/listthemes <channel_id> - Список тем\n' +
      '/generate <channel_id> <ID> - Сгенерировать пост'
    );
  }

  async handleAddTheme(msg, match) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const channelId = match[1];
    const theme = match[2];

    try {
      await db.registerChannel(channelId);
      const themeId = await db.addTheme(channelId, theme);
      await this.bot.sendMessage(
        chatId,
        `Тема успешно добавлена!\nID: ${themeId}\nТема: ${theme}`
      );
    } catch (error) {
      await logError(error, channelId, 'addtheme');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при добавлении темы.');
    }
  }

  async handleDeleteTheme(msg, match) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const channelId = match[1];
    const themeId = match[2];

    try {
      const success = await db.deleteTheme(channelId, themeId);
      if (success) {
        await this.bot.sendMessage(chatId, `Тема с ID ${themeId} успешно удалена.`);
      } else {
        await this.bot.sendMessage(chatId, `Тема с ID ${themeId} не найдена.`);
      }
    } catch (error) {
      await logError(error, channelId, 'deletetheme');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при удалении темы.');
    }
  }

  async handleListThemes(msg, match) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const channelId = match[1];

    try {
      const themes = await db.getThemes(channelId);
      if (themes.length === 0) {
        await this.bot.sendMessage(chatId, 'Темы не найдены.');
        return;
      }

      let message = `# Список тем для канала ${channelId}\n\n`;
      themes.forEach(theme => {
        message += `- ID: ${theme.id}, Тема: ${theme.theme}\n`;
      });

      await this.bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (error) {
      await logError(error, channelId, 'listthemes');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при получении списка тем.');
    }
  }

  async handleGenerate(msg, match) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const channelId = match[1];
    const themeId = match[2];

    try {
      const themes = await db.getThemes(channelId);
      const theme = themes.find(t => t.id === parseInt(themeId));
      
      if (!theme) {
        await this.bot.sendMessage(chatId, 'Тема не найдена.');
        return;
      }

      this.userStates.set(chatId, {
        action: 'generate',
        channelId,
        themeId,
        theme: theme.theme
      });

      await this.bot.sendMessage(
        chatId,
        `Отправьте промпт для темы: ${theme.theme} (канал: ${channelId})`
      );
    } catch (error) {
      await logError(error, channelId, 'generate');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при генерации поста.');
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const userState = this.userStates.get(chatId);
    if (!userState || userState.action !== 'generate') return;

    try {
      const idealPosts = await db.getIdealPosts(userState.channelId, userState.themeId);
      const generatedPost = await openaiService.generatePost(
        userState.theme,
        idealPosts,
        msg.text
      );

      await this.bot.sendMessage(chatId, generatedPost, { parse_mode: 'Markdown' });
      await this.bot.sendMessage(userState.channelId, generatedPost, { parse_mode: 'Markdown' });

      this.userStates.delete(chatId);
    } catch (error) {
      await logError(error, userState.channelId, 'generate_post');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при генерации поста.');
      this.userStates.delete(chatId);
    }
  }

  isAuthorized(chatId) {
    return config.telegram.authorizedUsers.includes(chatId);
  }
}

module.exports = new BotController(); 