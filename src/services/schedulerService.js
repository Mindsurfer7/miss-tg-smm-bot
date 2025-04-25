const cron = require('node-cron');
const db = require('../database/db');
const openai = require('./openaiService');
const bot = require('./botService');
const config = require('../config/config');
const { logger } = require('../utils/logger');

class SchedulerService {
  constructor() {
    this.task = null;
    this.isRunning = false;
  }

  normalizeChannelId(channelId) {
    return channelId.startsWith('@') ? channelId : `@${channelId}`;
  }

  async processChannels() {
    if (this.isRunning) {
      logger.info('Планировщик уже запущен, пропускаем итерацию');
      return;
    }

    this.isRunning = true;
    try {
      logger.info('Запуск планировщика');
      const channels = await db.getChannels();
      logger.info(`Найдено каналов: ${channels.length}`);
      
      if (channels.length === 0) {
        logger.info('Нет каналов для обработки');
        return;
      }

      for (const channel of channels) {
        try {
          const normalizedChannelId = this.normalizeChannelId(channel.channel_id);
          logger.info(`Обработка канала: ${normalizedChannelId}`);
          
          const theme = await db.getRandomTheme(channel.channel_id);
          if (!theme) {
            logger.info(`Нет доступных тем для канала ${normalizedChannelId}`);
            continue;
          }
          logger.info(`Выбрана тема: ${theme.theme}`);

          const idealPosts = await db.getIdealPosts(channel.channel_id);
          logger.info(`Найдено шаблонов постов: ${idealPosts.length}`);

          logger.info('Генерация поста через OpenAI...');
          const post = await openai.generatePost(theme.theme, idealPosts);
          logger.info('Пост успешно сгенерирован');

          if (!post || post.trim() === '') {
            logger.error('Получен пустой пост от OpenAI');
            continue;
          }

          logger.info(`Отправка поста в канал ${normalizedChannelId}...`);
          await bot.sendMessage(normalizedChannelId, post);
          logger.info(`Пост успешно отправлен в канал ${normalizedChannelId}`);

          await db.deleteTheme(channel.channel_id, theme.id);
          logger.info(`Тема ${theme.theme} удалена из базы данных`);
          
        } catch (channelError) {
          logger.error(`Ошибка при обработке канала ${channel.channel_id}: ${channelError.message}`);
          logger.error('Стек ошибки:', channelError.stack);
        }
      }
    } catch (error) {
      logger.error(`Ошибка в планировщике: ${error.message}`);
      logger.error('Стек ошибки:', error.stack);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    if (this.task) {
      this.task.stop();
    }

    // Запускаем сразу при старте
    this.processChannels();

    // Затем запускаем по расписанию
    this.task = cron.schedule(config.schedule.interval, () => {
      this.processChannels();
    });

    logger.info(`Планировщик запущен с интервалом: ${config.schedule.interval}`);
  }

  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Планировщик остановлен');
    }
  }
}

module.exports = new SchedulerService(); 