import { validationResult } from 'express-validator';
import logger from '../utils/logger.js';

export const generateContent = async (req, res, next) => {
  try {
    const { topic, audience, tone } = req.body;

    // Construct the prompt
    const prompt = `Draft a school announcement about "${topic}".
    Audience: ${audience}
    Tone: ${tone}

    Keep it clear, concise, and engaging.
    Do not include any subject lines or greetings like 'Dear Students'.
    Just the body of the announcement.`;

    const apiKey = process.env.SAMBANOVA_API_KEY || '0f0311c2-b507-40e4-852b-8353482dbfb4';

    const response = await fetch('https://api.sambanova.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stream: false,
        model: 'Meta-Llama-3.1-8B-Instruct',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant for school communications.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('SambaNova API error', { status: response.status, body: errorText });
      throw new Error(`AI Provider Error: ${response.statusText}`);
    }

    const data = await response.json();
    const generatedText = data.choices[0]?.message?.content || '';

    res.json({
      success: true,
      data: generatedText
    });

  } catch (error) {
    logger.error('AI Generation failed', { error: error.message });
    next(error);
  }
};
