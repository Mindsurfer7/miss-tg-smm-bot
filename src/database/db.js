const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');
const { logError } = require('../utils/logger');
const path = require('path');
const fs = require('fs');

class Database {
  static normalizeChannelId(channelId) {
    return channelId.startsWith('@') ? channelId.substring(1) : channelId;
  }

  constructor() {
    this.dbPath = path.join(__dirname, 'smm_bot.db');
    this.connect();
  }

  connect() {
    this.db = new sqlite3.Database(this.dbPath);
  }

  async close() {
    return new Promise((resolve, reject) => {
      this.db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  async reset() {
    try {
      await this.close();
      if (fs.existsSync(this.dbPath)) {
        fs.unlinkSync(this.dbPath);
        console.log('✅ Старая база данных удалена');
      }
      this.connect();
      await this.init();
      console.log('✅ База данных успешно пересоздана');
      return true;
    } catch (error) {
      console.error('Ошибка при сбросе базы данных:', error);
      return false;
    }
  }

  async init() {
    try {
      await this.createTables();
      await this.updateTables();
    } catch (error) {
      await logError(error, 'system', 'database_init');
      throw error;
    }
  }

  createTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS channels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT UNIQUE NOT NULL,
            name TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS ideal_posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            content TEXT NOT NULL,
            theme_id INTEGER,
            FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS themes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            channel_id TEXT NOT NULL,
            theme TEXT NOT NULL,
            FOREIGN KEY (channel_id) REFERENCES channels(channel_id)
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  updateTables() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        // Проверяем существование таблицы channels
        this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='channels'", (err, row) => {
          if (err) {
            reject(err);
            return;
          }

          if (!row) {
            // Если таблицы нет, она будет создана в createTables
            resolve();
            return;
          }

          // Проверяем структуру существующей таблицы
          this.db.all("PRAGMA table_info(channels)", (err, columns) => {
            if (err) {
              reject(err);
              return;
            }

            const columnNames = columns.map(col => col.name);
            const missingColumns = [];

            // Проверяем наличие необходимых колонок
            if (!columnNames.includes('name')) {
              missingColumns.push('name TEXT');
            }
            if (!columnNames.includes('description')) {
              missingColumns.push('description TEXT');
            }
            if (!columnNames.includes('created_at')) {
              missingColumns.push('created_at DATETIME DEFAULT CURRENT_TIMESTAMP');
            }

            if (missingColumns.length === 0) {
              resolve();
              return;
            }

            // Если есть отсутствующие колонки, создаем новую таблицу
            const tempTable = 'channels_temp_' + Date.now();
            
            // Создаем временную таблицу с полной структурой
            this.db.run(`
              CREATE TABLE ${tempTable} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id TEXT UNIQUE NOT NULL,
                name TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `);

            // Копируем существующие данные
            const existingColumns = columnNames.filter(col => 
              ['id', 'channel_id', 'name', 'description', 'created_at'].includes(col)
            ).join(', ');

            this.db.run(`
              INSERT INTO ${tempTable} (${existingColumns})
              SELECT ${existingColumns} FROM channels
            `);

            // Удаляем старую таблицу
            this.db.run('DROP TABLE channels');

            // Переименовываем новую таблицу
            this.db.run(`ALTER TABLE ${tempTable} RENAME TO channels`);

            resolve();
          });
        });
      });
    });
  }

  async addTheme(channelId, theme) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO themes (channel_id, theme) VALUES (?, ?)',
        [normalizedChannelId, theme],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async deleteTheme(channelId, themeId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM themes WHERE channel_id = ? AND id = ?',
        [normalizedChannelId, themeId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getThemes(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM themes WHERE channel_id = ?',
        [normalizedChannelId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getRandomTheme(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id, theme FROM themes WHERE channel_id = ? ORDER BY RANDOM() LIMIT 1',
        [normalizedChannelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async addIdealPost(channelId, content) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO ideal_posts (channel_id, content) VALUES (?, ?)',
        [normalizedChannelId, content],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getIdealPosts(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT content FROM ideal_posts WHERE channel_id = ?',
        [normalizedChannelId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.content));
        }
      );
    });
  }

  async registerChannel(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO channels (channel_id) VALUES (?)',
        [normalizedChannelId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getChannels() {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT channel_id, name, description FROM channels',
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async addChannel(channelId, name = '', description = '') {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO channels (channel_id, name, description) VALUES (?, ?, ?)',
        [normalizedChannelId, name, description],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async removeChannel(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM channels WHERE channel_id = ?',
        [normalizedChannelId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getChannelInfo(channelId) {
    const normalizedChannelId = Database.normalizeChannelId(channelId);
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT channel_id, name, description FROM channels WHERE channel_id = ?',
        [normalizedChannelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }
}

module.exports = new Database(); 