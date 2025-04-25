const cron = require('node-cron');
const config = require('../config/config');
const db = require('../database/db');
const openaiService = require('./openaiService');
const { logError } = require('../utils/logger');
const TelegramBot = require('node-telegram-bot-api');

class SchedulerService {
  constructor() {
    this.bot = new TelegramBot(config.telegram.token);
  }

  start() {
    cron.schedule(config.schedule.interval, async () => {
      try {
        const channels = await db.getChannels();
        
        for (const channelId of channels) {
          try {
            const theme = await db.getRandomTheme(channelId);
            if (!theme) continue;

            const idealPosts = await db.getIdealPosts(channelId, theme.id);
            const generatedPost = await openaiService.generatePost(
              theme.theme,
              idealPosts
            );

            await this.bot.sendMessage(channelId, generatedPost, { parse_mode: 'Markdown' });
            await db.deleteTheme(channelId, theme.id);
          } catch (error) {
            await logError(error, channelId, 'scheduled_generation');
          }
        }
      } catch (error) {
        await logError(error, 'system', 'scheduler');
      }
    });
  }
}

module.exports = new SchedulerService(); 