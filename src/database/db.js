const sqlite3 = require('sqlite3').verbose();
const config = require('../config/config');
const { logError } = require('../utils/logger');

class Database {
  constructor() {
    this.db = new sqlite3.Database(config.database.path);
  }

  async init() {
    try {
      await this.createTables();
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
            channel_id TEXT UNIQUE NOT NULL
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

  async addTheme(channelId, theme) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO themes (channel_id, theme) VALUES (?, ?)',
        [channelId, theme],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async deleteTheme(channelId, themeId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'DELETE FROM themes WHERE channel_id = ? AND id = ?',
        [channelId, themeId],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  }

  async getThemes(channelId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT id, theme FROM themes WHERE channel_id = ?',
        [channelId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  async getRandomTheme(channelId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT id, theme FROM themes WHERE channel_id = ? ORDER BY RANDOM() LIMIT 1',
        [channelId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  async addIdealPost(channelId, content, themeId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO ideal_posts (channel_id, content, theme_id) VALUES (?, ?, ?)',
        [channelId, content, themeId],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  async getIdealPosts(channelId, themeId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT content FROM ideal_posts WHERE channel_id = ? AND theme_id = ?',
        [channelId, themeId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.content));
        }
      );
    });
  }

  async registerChannel(channelId) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO channels (channel_id) VALUES (?)',
        [channelId],
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
        'SELECT channel_id FROM channels',
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows.map(row => row.channel_id));
        }
      );
    });
  }
}

module.exports = new Database(); 