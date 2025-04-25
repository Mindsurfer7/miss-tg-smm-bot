const OpenAI = require('openai');
const config = require('../config/config');
const { logError } = require('../utils/logger');

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

class OpenAIService {
  async generatePost(theme, idealPosts, userPrompt = null) {
    try {
      const prompt = this._buildPrompt(theme, idealPosts, userPrompt);
      
      console.log('--- OpenAI Prompt ---');
      console.log(prompt);
      console.log('---------------------');

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "Ты - эксперт по созданию контента для социальных сетей. Твоя задача - создавать привлекательные и эффективные посты на основе предоставленных примеров и темы."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      });

      return completion.choices[0].message.content;
    } catch (error) {
      console.error('Ошибка при генерации поста OpenAI:', error);
      await logError(error, 'system', 'openai_generate');
      throw error;
    }
  }

  _buildPrompt(theme, idealPosts, userPrompt = null) {
    let prompt = `Тема: ${theme}\n\n`;
    
    if (idealPosts && idealPosts.length > 0) {
      prompt += "Примеры идеальных постов:\n";
      idealPosts.forEach((post, index) => {
        prompt += `${index + 1}. ${post}\n\n`;
      });
    }

    if (userPrompt) {
      prompt += `\nДополнительные указания: ${userPrompt}\n`;
    } else {
      prompt += "\nСоздай новый уникальный пост, используя стиль и структуру примеров, но с новым содержанием.";
    }

    prompt += "\nСоздай пост в формате Markdown, который будет соответствовать теме и стилю примеров.";

    return prompt;
  }
}

module.exports = new OpenAIService(); 