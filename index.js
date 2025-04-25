const db = require('./src/database/db');
const botController = require('./src/controllers/botController');
const schedulerService = require('./src/services/schedulerService');
const { logger } = require('./src/utils/logger');

async function start() {
  try {
    await db.init();
    logger.info('База данных инициализирована');

    logger.info('Бот-контроллер инициализирован');

    schedulerService.start();
    logger.info('Планировщик запущен');

    logger.info('Приложение успешно запущено');
  } catch (error) {
    logger.error('Ошибка при запуске приложения:', error);
    process.exit(1);
  }
}

start(); 