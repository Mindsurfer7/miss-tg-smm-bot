const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');

function initDatabase() {
  const dbPath = path.join(__dirname, 'smm_bot.db');
  
  // Удаляем существующую базу данных, если она есть
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    console.log('✅ Старая база данных удалена');
  }

  // Создаем новую базу данных
  const db = new sqlite3.Database(dbPath);

  // Создаем таблицы
  db.serialize(() => {
    // Таблица каналов
    db.run(`
      CREATE TABLE channels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT UNIQUE NOT NULL,
        name TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Таблица тем
    db.run(`
      CREATE TABLE themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        theme TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
      )
    `);

    // Таблица идеальных постов (теперь без привязки к темам)
    db.run(`
      CREATE TABLE ideal_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel_id TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
      )
    `);

    console.log('✅ База данных инициализирована');
  });

  return db;
}

// Если скрипт запущен напрямую
if (require.main === module) {
  initDatabase();
}

module.exports = initDatabase; 