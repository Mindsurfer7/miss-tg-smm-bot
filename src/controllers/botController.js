const config = require('../config/config');
const db = require('../database/db');
const openaiService = require('../services/openaiService');
const { logError } = require('../utils/logger');
const { initDatabase } = require('../database/init');
const botService = require('../services/botService');
const fs = require('fs');
const path = require('path');

class BotController {
  constructor() {
    this.bot = botService.bot;
    this.userStates = new Map();
    this.setupCommands();
    this.setupBotCommands();
  }

  // Добавляем вспомогательный метод для очистки текста от Markdown
  cleanMarkdown(text) {
    // Убираем маркеры ```markdown и ``` в начале и конце
    return text.replace(/^```markdown\n?/, '').replace(/```$/, '').trim();
  }

  async setupBotCommands() {
    const commands = [
      { command: 'start', description: 'Запустить бота / Помощь' },
      { command: 'addchannel', description: 'Добавить канал' },
      { command: 'listchannels', description: 'Список каналов' },
      { command: 'addtheme', description: 'Добавить тему' },
      { command: 'listthemes', description: 'Список тем' },
      { command: 'addidealpost', description: 'Добавить шаблон поста' },
      { command: 'listidealposts', description: 'Список шаблонов постов' },
      { command: 'generate', description: 'Сгенерировать пост' },
      { command: 'manualpost', description: 'Ручная публикация' },
      { command: 'resetdb', description: 'Сбросить базу данных' }
    ];

    await this.bot.setMyCommands(commands);
  }

  setupCommands() {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/help/, this.handleStart.bind(this));
    this.bot.onText(/\/addchannel/, this.startAddChannelFlow.bind(this));
    this.bot.onText(/\/listchannels/, this.handleListChannels.bind(this));
    this.bot.onText(/\/addtheme/, this.startAddThemeFlow.bind(this));
    this.bot.onText(/\/listthemes/, this.startListThemesFlow.bind(this));
    this.bot.onText(/\/addidealpost/, this.startAddIdealPostFlow.bind(this));
    this.bot.onText(/\/listidealposts/, this.startListIdealPostsFlow.bind(this));
    this.bot.onText(/\/generate/, this.startGeneratePostFlow.bind(this));
    this.bot.onText(/\/manualpost/, this.handleManualPost.bind(this));
    this.bot.onText(/\/resetdb/, this.handleResetDatabase.bind(this));
    this.bot.on('callback_query', this.handleCallbackQuery.bind(this));
    this.bot.on('message', this.handleMessage.bind(this));
  }

  async handleStart(msg) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) {
      await this.bot.sendMessage(chatId, 'У вас нет доступа к этому боту.');
      return;
    }

    const keyboard = {
      inline_keyboard: [
        [
          { text: '➕ Добавить канал', callback_data: 'add_channel' },
          { text: '📋 Список каналов', callback_data: 'list_channels' },
        ],
        [
          { text: '➕ Добавить тему', callback_data: 'add_theme' },
          { text: '📝 Список тем', callback_data: 'list_themes' },
        ],
        [
          { text: '➕ Добавить шаблон', callback_data: 'add_ideal_post' },
          { text: '📄 Список шаблонов', callback_data: 'list_ideal_posts' },
        ],
        [
          { text: '🎯 Сгенерировать пост', callback_data: 'generate_post' },
          { text: '📤 Ручная публикация', callback_data: 'manual_post' }
        ],
        // [
        //   { text: '🔄 Сбросить БД', callback_data: 'reset_db' }
        // ]
      ]
    };

    await this.bot.sendMessage(
      chatId,
      '👋 Добро пожаловать! Выберите действие:',
      { reply_markup: keyboard }
    );
  }

  async handleHelp(chatId) {
    const commandList = await this.bot.getMyCommands();
    let helpMessage = '🤖 *Доступные команды:*\n\n';
    commandList.forEach(cmd => {
      helpMessage += `/${cmd.command} - ${cmd.description}\n`;
    });
    await this.bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
  }

  async handleCallbackQuery(query) {
    const chatId = query.message.chat.id;
    if (!this.isAuthorized(chatId)) {
      await this.bot.answerCallbackQuery(query.id, { text: 'У вас нет доступа!' });
      return;
    }
    await this.bot.answerCallbackQuery(query.id);

    const data = query.data;

    switch (data) {
      case 'add_channel':
        await this.startAddChannelFlow(chatId);
        break;
      case 'list_channels':
        await this.handleListChannels(chatId);
        break;
      case 'add_theme':
        await this.startAddThemeFlow(chatId);
        break;
      case 'list_themes':
        await this.startListThemesFlow(chatId);
        break;
      case 'add_ideal_post':
        await this.startAddIdealPostFlow(chatId);
        break;
      case 'list_ideal_posts':
        await this.startListIdealPostsFlow(chatId);
        break;
      case 'generate_post':
        await this.startGeneratePostFlow(chatId);
        break;
      case 'manual_post':
        await this.handleManualPost({ chat: { id: chatId } });
        break;
      default:
        if (data.startsWith('select_channel_add_theme_')) {
            const channelId = data.replace('select_channel_add_theme_', '');
            await this.askForThemeName(chatId, channelId);
        } else if (data.startsWith('list_themes_')) {
            const channelId = data.replace('list_themes_', '');
            await this.handleListThemes({ chat: { id: chatId } }, channelId);
        } else if (data.startsWith('generate_post_')) {
            const channelId = data.replace('generate_post_', '');
            await this.askForThemeSelection(chatId, channelId);
        } else if (data.startsWith('select_channel_add_ideal_')) {
            const channelId = data.replace('select_channel_add_ideal_', '');
            await this.askForIdealPostContent(chatId, channelId);
        } else if (data.startsWith('select_theme_add_ideal_')) {
            const [channelId, themeId] = data.replace('select_theme_add_ideal_', '').split('_');
            await this.askForIdealPostContent(chatId, channelId);
        } else if (data.startsWith('select_channel_list_ideal_')) {
            const channelId = data.replace('select_channel_list_ideal_', '');
            await this.sendIdealPostsFile(chatId, channelId);
        } else if (data.startsWith('select_theme_list_ideal_')) {
            const [channelId, themeId] = data.replace('select_theme_list_ideal_', '').split('_');
            await this.sendIdealPostsFile(chatId, channelId);
        } else if (data.startsWith('select_channel_generate_')) {
            const channelId = data.replace('select_channel_generate_', '');
            await this.askForThemeSelection(chatId, channelId);
        } else if (data.startsWith('select_theme_generate_')) {
            const [channelId, themeId] = data.replace('select_theme_generate_', '').split('_');
            await this.askForPrompt(chatId, channelId, themeId);
        } else if (data.startsWith('manualpost_')) {
            const channelId = data.replace('manualpost_', '');
            await this.handleManualPostChannel(chatId, channelId);
        }
    }
  }

  async startAddIdealPostFlow(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        return this.bot.sendMessage(chatId, '❌ Нет доступных каналов. Сначала добавьте канал.');
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `select_channel_add_ideal_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(chatId, 'Выберите канал для добавления шаблона:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      await logError(error, 'system', 'start_add_ideal_post');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка каналов.');
    }
  }

  async askForIdealPostContent(chatId, channelId) {
    try {
      this.userStates.set(chatId, {
        action: 'add_ideal_post',
        channelId: channelId // channelId уже нормализован
      });
      await this.bot.sendMessage(chatId, `Канал: ${channelId}\n\nВведите текст шаблона поста:`);
    } catch (error) {
      await logError(error, channelId, 'ask_ideal_content');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при запросе текста шаблона.');
      this.userStates.delete(chatId);
    }
  }

  async finishAddIdealPost(chatId, channelId, content) {
    try {
      const postId = await db.addIdealPost(channelId, content);
      await this.bot.sendMessage(
        chatId,
        `✅ Шаблон поста успешно добавлен в канал ${channelId}!`
      );
      this.userStates.delete(chatId);
    } catch (error) {
      await logError(error, channelId, 'finish_add_ideal');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении шаблона.');
      this.userStates.delete(chatId);
    }
  }

  async startListIdealPostsFlow(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        return this.bot.sendMessage(chatId, '❌ Нет доступных каналов. Сначала добавьте канал.');
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `select_channel_list_ideal_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(chatId, 'Выберите канал для просмотра шаблонов:', {
        reply_markup: { inline_keyboard: keyboard }
      });
    } catch (error) {
      await logError(error, 'system', 'start_list_ideal_posts');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка каналов.');
    }
  }

  async sendIdealPostsFile(chatId, channelId) {
    try {
      const idealPosts = await db.getIdealPosts(channelId);
      if (!idealPosts || idealPosts.length === 0) {
        return this.bot.sendMessage(chatId, `❌ В канале ${channelId} нет шаблонов.`);
      }

      const fileName = `ideal_posts_${channelId}.txt`;
      const filePath = path.join(__dirname, '..', 'temp', fileName);

      // Создаем папку temp, если её нет
      const tempDir = path.dirname(filePath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      // Формируем содержимое файла
      let fileContent = `Шаблоны для канала: ${channelId}\n\n`;
      fileContent += `====================\n\n`;
      idealPosts.forEach((post, index) => {
        fileContent += `--- Шаблон ${index + 1} ---\n${post}\n\n====================\n\n`;
      });

      fs.writeFileSync(filePath, fileContent);

      await this.bot.sendDocument(chatId, filePath, {}, {
        filename: fileName,
        contentType: 'text/plain'
      });

      // Удаляем временный файл после отправки
      fs.unlinkSync(filePath);
    } catch (error) {
      await logError(error, channelId, 'send_ideal_posts_file');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при отправке файла с шаблонами.');
    }
  }

  async handleMessage(msg) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) return;

    const userState = this.userStates.get(chatId);
    if (!userState) return;

    const text = msg.text.trim();

    if (userState.action === 'add_channel' && userState.step === 'waiting_for_id') {
        await this.askForChannelName(chatId, text);
    } else if (userState.action === 'add_channel' && userState.step === 'waiting_for_name') {
        await this.finishAddChannel(chatId, userState.channelId, text);
    } else if (userState.action === 'add_theme') {
        await this.finishAddTheme(chatId, userState.channelId, text);
    } else if (userState.action === 'add_ideal_post') {
        await this.finishAddIdealPost(chatId, userState.channelId, text);
    } else if (userState.action === 'generate') {
        await this.finishGeneratePost(chatId, userState, text);
    } else if (userState.action === 'manualpost_waiting_theme') {
        await this.generateAndPublishManualPost(chatId, userState.channelId, text);
        this.userStates.delete(chatId);
    } else if (userState.action === 'manualpost') {
        this.userStates.delete(chatId);
    }
  }

  async finishGeneratePost(chatId, userState, userPrompt) {
    let loaderMessageId = null;
    try {
      // Отправляем сообщение о загрузке
      const loaderMsg = await this.bot.sendMessage(chatId, '⏳ Генерирую пост... Пожалуйста, подождите.');
      loaderMessageId = loaderMsg.message_id;

      const idealPosts = await db.getIdealPosts(userState.channelId, userState.themeId);
      const generatedPost = await openaiService.generatePost(
        userState.theme,
        idealPosts,
        userPrompt === '-' ? null : userPrompt
      );

      // Удаляем сообщение о загрузке
      await this.bot.deleteMessage(chatId, loaderMessageId);

      await this.bot.sendMessage(chatId, '✅ Пост успешно сгенерирован!');
      // В чате с ботом показываем с Markdown для удобства копирования
      await this.bot.sendMessage(chatId, generatedPost, { parse_mode: 'Markdown' });
      
      try {
        const targetChannelId = userState.channelId.startsWith('-') ? userState.channelId : `@${userState.channelId}`;
        // В канал отправляем без Markdown и очищаем от маркеров
        await this.bot.sendMessage(targetChannelId, this.cleanMarkdown(generatedPost));
        await this.bot.sendMessage(chatId, '✅ Пост успешно опубликован в канале!');
      } catch (channelError) {
        await logError(channelError, userState.channelId, 'generate_post_publish_channel');
        await this.bot.sendMessage(chatId, `⚠️ Не удалось отправить пост в канал ${userState.channelId}. Проверьте, является ли бот администратором канала с правами на отправку сообщений.`);
      }

      this.userStates.delete(chatId);
    } catch (error) {
      if (loaderMessageId) {
        try { await this.bot.deleteMessage(chatId, loaderMessageId); } catch (e) {}
      }
      await logError(error, userState.channelId, 'generate_post_finish');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при генерации и отправке поста.');
      this.userStates.delete(chatId);
    }
  }

  async startAddChannelFlow(chatId) {
    try {
      await this.bot.sendMessage(
        chatId,
        'Введите ID канала (начинается с @ или -100):',
        {
          reply_markup: {
            force_reply: true
          }
        }
      );
      this.userStates.set(chatId, {
        action: 'add_channel',
        step: 'waiting_for_id'
      });
    } catch (error) {
      await logError(error, 'system', 'start_add_channel');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при начале процесса добавления канала.');
    }
  }

  async startAddThemeFlow(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Нет доступных каналов. Сначала добавьте канал.');
        return;
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `select_channel_add_theme_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(
        chatId,
        'Выберите канал для добавления темы:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      await logError(error, 'system', 'start_add_theme');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка каналов.');
    }
  }

  async handleListThemes(msg, channelId) {
    const chatId = msg.chat ? msg.chat.id : msg;
    
    if (!this.isAuthorized(chatId)) {
      return this.bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
    }

    if (!channelId) {
      console.error('Не удалось определить channelId в handleListThemes');
      return this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка тем.');
    }
    
    const normalizedChannelId = this.normalizeChannelId(channelId);

    try {
      const themes = await db.getThemes(normalizedChannelId);
      if (!themes || themes.length === 0) {
        await this.bot.sendMessage(chatId, `❌ В канале ${normalizedChannelId} нет тем.`);
        return;
      }

      let message = `📋 Список тем для канала ${normalizedChannelId}:\n\n`;
      themes.forEach(theme => {
        message += `- ID: ${theme.id}, Тема: ${theme.theme}\n`;
      });

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      await logError(error, normalizedChannelId, 'list_themes');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка тем.');
    }
  }

  async startListThemesFlow(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Нет доступных каналов. Сначала добавьте канал.');
        return;
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `list_themes_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(
        chatId,
        'Выберите канал для просмотра тем:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      await logError(error, 'system', 'start_list_themes');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка каналов.');
    }
  }

  async startGeneratePostFlow(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        await this.bot.sendMessage(chatId, '❌ Нет доступных каналов. Сначала добавьте канал.');
        return;
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `generate_post_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(
        chatId,
        'Выберите канал для генерации поста:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      await logError(error, 'system', 'start_generate_post');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка каналов.');
    }
  }

  async askForChannelName(chatId, channelId) {
    try {
      await this.bot.sendMessage(
        chatId,
        'Введите название канала:',
        {
          reply_markup: {
            force_reply: true
          }
        }
      );
      this.userStates.set(chatId, {
        action: 'add_channel',
        step: 'waiting_for_name',
        channelId
      });
    } catch (error) {
      await logError(error, 'system', 'ask_channel_name');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при запросе названия канала.');
    }
  }

  async finishAddChannel(chatId, channelId, name) {
    try {
      const result = await db.addChannel(channelId, name);
      if (result) {
        await this.bot.sendMessage(chatId, `✅ Канал ${name} (${channelId}) успешно добавлен!`);
      } else {
        await this.bot.sendMessage(chatId, `ℹ️ Канал ${channelId} уже существует в базе данных.`);
      }
      this.userStates.delete(chatId);
    } catch (error) {
      await logError(error, channelId, 'add_channel');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении канала.');
      this.userStates.delete(chatId);
    }
  }

  async handleManualPost(msg) {
    const chatId = msg.chat.id;
    if (!this.isAuthorized(chatId)) {
      return this.bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
    }

    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        return this.bot.sendMessage(chatId, 'Нет доступных каналов.');
      }

      const keyboard = channels.map(channel => [{
        text: channel.name || channel.channel_id,
        callback_data: `manualpost_${this.normalizeChannelId(channel.channel_id)}`
      }]);

      await this.bot.sendMessage(
        chatId,
        'Выберите канал для публикации:',
        {
          reply_markup: {
            inline_keyboard: keyboard
          }
        }
      );
    } catch (error) {
      await logError(error, 'system', 'manualpost');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при получении списка каналов.');
    }
  }

  async handleManualPostChannel(chatId, channelId) {
    try {
      const normalizedChannelId = this.normalizeChannelId(channelId);
      
      // Проверим, существует ли канал
      const channelInfo = await db.getChannelInfo(normalizedChannelId);
      if (!channelInfo) {
        await this.bot.sendMessage(chatId, `❌ Канал ${normalizedChannelId} не найден в базе данных.`);
        return;
      }
      
      // Проверим, есть ли шаблоны в канале
      const idealPosts = await db.getIdealPosts(normalizedChannelId);
       if (!idealPosts || idealPosts.length === 0) {
         await this.bot.sendMessage(chatId, `❌ В канале ${normalizedChannelId} нет шаблонов постов. Сначала добавьте шаблоны.`);
         return;
       }

      this.userStates.set(chatId, {
        action: 'manualpost_waiting_theme',
        channelId: normalizedChannelId
      });

      await this.bot.sendMessage(
        chatId,
        `Канал: ${normalizedChannelId}\n\nВведите тему для генерации поста:`,
        {
          reply_markup: {
            force_reply: true
          }
        }
      );
    } catch (error) {
      await logError(error, channelId, 'manualpost_ask_theme');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при запросе темы для ручной публикации.');
    }
  }

  async generateAndPublishManualPost(chatId, channelId, themeText) {
    let loaderMessageId = null;
    try {
      const normalizedChannelId = this.normalizeChannelId(channelId);
      
      // Отправляем сообщение о загрузке
      const loaderMsg = await this.bot.sendMessage(chatId, '⏳ Генерирую пост... Пожалуйста, подождите.');
      loaderMessageId = loaderMsg.message_id;

      const idealPosts = await db.getIdealPosts(normalizedChannelId);
      if (!idealPosts || idealPosts.length === 0) {
        await this.bot.deleteMessage(chatId, loaderMessageId);
        await this.bot.sendMessage(chatId, `❌ В канале ${normalizedChannelId} нет шаблонов постов.`);
        return;
      }

      const generatedPost = await openaiService.generatePost(
        themeText,
        idealPosts
      );
      
      await this.bot.deleteMessage(chatId, loaderMessageId);

      await this.bot.sendMessage(chatId, '✅ Пост успешно сгенерирован!');
      // В чате с ботом показываем с Markdown для удобства копирования
      await this.bot.sendMessage(chatId, generatedPost, { parse_mode: 'Markdown' });
      
      try {
        const targetChannelId = normalizedChannelId.startsWith('-') ? normalizedChannelId : `@${normalizedChannelId}`;
        // В канал отправляем без Markdown и очищаем от маркеров
        await this.bot.sendMessage(targetChannelId, this.cleanMarkdown(generatedPost));
        await this.bot.sendMessage(chatId, '✅ Пост успешно опубликован в канале!');
      } catch (channelError) {
        await logError(channelError, normalizedChannelId, 'manual_post_publish');
        await this.bot.sendMessage(chatId, `⚠️ Не удалось отправить пост в канал ${normalizedChannelId}. Проверьте, является ли бот администратором канала с правами на отправку сообщений.`);
      }
    } catch (error) {
      if (loaderMessageId) {
        try { await this.bot.deleteMessage(chatId, loaderMessageId); } catch (e) {}
      }
      await logError(error, channelId, 'manual_post_generate_publish');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при генерации и публикации поста.');
    }
  }

  async handleListChannels(chatId) {
    try {
      const channels = await db.getChannels();
      if (channels.length === 0) {
        await this.bot.sendMessage(chatId, 'Нет доступных каналов.');
        return;
      }

      let message = '📋 Список каналов:\n\n';
      channels.forEach(channel => {
        message += `- ${channel.name || channel.channel_id}\n`;
      });

      await this.bot.sendMessage(chatId, message);
    } catch (error) {
      await logError(error, 'system', 'list_channels');
      await this.bot.sendMessage(chatId, 'Произошла ошибка при получении списка каналов.');
    }
  }

  async askForThemeName(chatId, channelId) {
    try {
      const normalizedChannelId = this.normalizeChannelId(channelId);
      await this.bot.sendMessage(
        chatId,
        `Канал: ${normalizedChannelId}\n\nВведите название темы:`,
        {
          reply_markup: {
            force_reply: true
          }
        }
      );
      this.userStates.set(chatId, {
        action: 'add_theme',
        channelId: normalizedChannelId
      });
    } catch (error) {
      await logError(error, channelId, 'ask_theme_name');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при запросе названия темы.');
    }
  }

  async finishAddTheme(chatId, channelId, theme) {
    try {
      const normalizedChannelId = this.normalizeChannelId(channelId);
      const themeId = await db.addTheme(normalizedChannelId, theme);
      await this.bot.sendMessage(
        chatId,
        `✅ Тема "${theme}" успешно добавлена в канал ${normalizedChannelId}!\nID темы: ${themeId}`
      );
      this.userStates.delete(chatId);
    } catch (error) {
      await logError(error, channelId, 'add_theme');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при добавлении темы.');
      this.userStates.delete(chatId);
    }
  }

  async handleResetDatabase(ctx) {
    if (!this.isAuthorizedUser(ctx.from.id)) {
      return ctx.reply('У вас нет прав для выполнения этой команды.');
    }

    try {
      const success = await db.reset();
      if (success) {
        await ctx.reply('✅ База данных успешно сброшена и пересоздана');
      } else {
        await ctx.reply('❌ Произошла ошибка при сбросе базы данных');
      }
    } catch (error) {
      console.error('Ошибка при сбросе базы данных:', error);
      await ctx.reply('❌ Произошла ошибка при сбросе базы данных');
    }
  }

  isAuthorized(chatId) {
    return config.telegram.authorizedUsers.includes(chatId);
  }

  normalizeChannelId(channelId) {
    return channelId.startsWith('@') ? channelId.substring(1) : channelId;
  }

  async askForThemeSelection(chatId, channelId) {
    try {
      const normalizedChannelId = this.normalizeChannelId(channelId);
      const themes = await db.getThemes(normalizedChannelId);
      
      if (themes.length === 0) {
        await this.bot.sendMessage(chatId, `❌ В канале ${normalizedChannelId} нет тем. Сначала добавьте тему.`);
        return;
      }

      const keyboard = themes.map(theme => [{
        text: theme.theme,
        callback_data: `select_theme_generate_${normalizedChannelId}_${theme.id}`
      }]);

      await this.bot.sendMessage(
        chatId,
        `Выберите тему для генерации поста в канале ${normalizedChannelId}:`,
        {
          reply_markup: { inline_keyboard: keyboard }
        }
      );
    } catch (error) {
      await logError(error, channelId, 'ask_theme_selection');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при получении списка тем.');
    }
  }

  async askForPrompt(chatId, channelId, themeId) {
    try {
      const themes = await db.getThemes(channelId);
      const selectedTheme = themes.find(t => t.id === parseInt(themeId));
      
      if (!selectedTheme) {
        await this.bot.sendMessage(chatId, '❌ Тема не найдена');
        return;
      }

      this.userStates.set(chatId, {
        action: 'generate',
        channelId: channelId,
        themeId: themeId,
        theme: selectedTheme.theme
      });

      await this.bot.sendMessage(
        chatId,
        `Канал: ${channelId}\nТема: ${selectedTheme.theme}\n\nВведите дополнительные указания для генерации поста (или отправьте "-" для генерации без дополнительных указаний):`
      );
    } catch (error) {
      await logError(error, channelId, 'ask_prompt');
      await this.bot.sendMessage(chatId, '❌ Произошла ошибка при подготовке к генерации.');
      this.userStates.delete(chatId);
    }
  }
}

module.exports = new BotController(); 