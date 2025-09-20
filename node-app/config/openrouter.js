// OpenRouter Model Configuration for NOVA
// This file contains different model configurations that can be used with OpenRouter

const OPENROUTER_MODELS = {
  // Current default model - Gemini for best performance
  current: {
    model: 'google/gemini-exp-1121',
    temperature: 0.5, // Lower for more focused analytical responses
    max_tokens: 1000, // Significantly increased for comprehensive responses
    top_p: 0.9,
    description: 'Gemini Experimental 1121 - Google\'s latest model with excellent analytics and reasoning capabilities'
  },

  // Alternative models for different use cases
  alternatives: {
    // Other Gemini models
    gemini_flash: {
      model: 'google/gemini-flash-1.5',
      temperature: 0.5,
      max_tokens: 1000,
      top_p: 0.9,
      description: 'Gemini Flash 1.5 - Fast and efficient Google model'
    },

    gemini_pro: {
      model: 'google/gemini-pro-1.5',
      temperature: 0.5,
      max_tokens: 1000,
      top_p: 0.9,
      description: 'Gemini Pro 1.5 - Google\'s reliable model for complex tasks'
    },

    // Claude models for comparison - BEST FOR ANALYTICS
    claude_sonnet: {
      model: 'anthropic/claude-3.5-sonnet',
      temperature: 0.1, // Very low for professional, focused responses
      max_tokens: 1000, // Maximum for comprehensive analysis
      top_p: 0.9,
      description: 'Claude 3.5 Sonnet - Excellent for analytics and data interpretation'
    },

    // Most powerful Claude for complex analysis - PREMIUM CHOICE
    claude_opus: {
      model: 'anthropic/claude-3-opus',
      temperature: 0.1, // Very low for most professional responses
      max_tokens: 1000, // Maximum tokens for comprehensive reports
      top_p: 0.9,
      description: 'Claude 3 Opus - Most powerful for complex reasoning and comprehensive analysis'
    },

    // Latest OpenAI model
    gpt4o: {
      model: 'openai/gpt-4o',
      temperature: 0.4,
      max_tokens: 1000,
      top_p: 0.9,
      description: 'GPT-4o - Latest OpenAI model with strong analytical capabilities'
    },

    // Cost-effective option
    claude_haiku: {
      model: 'anthropic/claude-3-haiku',
      temperature: 0.5,
      max_tokens: 1000,
      top_p: 0.9,
      description: 'Claude 3 Haiku - Fast and economical for simpler queries'
    },

    // Good balance
    gpt4_turbo: {
      model: 'openai/gpt-4-turbo',
      temperature: 0.4,
      max_tokens: 1000,
      top_p: 0.9,
      description: 'GPT-4 Turbo - Reliable and powerful'
    }
  }
};

// Model selection based on context (future enhancement)
function selectModelForContext(context) {
  // For analytics work, always use the most powerful models available
  // Default to Claude Opus for comprehensive analysis
  let selectedModel = OPENROUTER_MODELS.alternatives.claude_opus;

  // SDAO users or complex multi-org queries get the absolute best
  if (context?.userRole === 'SDAO' || context?.queryType === 'multi_org') {
    selectedModel = OPENROUTER_MODELS.alternatives.claude_opus; // Most powerful for comprehensive analysis
  }

  // For event analytics, use Claude Sonnet (excellent for data interpretation)
  if (context?.activeTab === 'event') {
    selectedModel = OPENROUTER_MODELS.alternatives.claude_sonnet;
  }

  // For financial analysis, use Claude Opus (best for complex calculations)
  if (context?.activeTab === 'transaction' || context?.activeTab === 'finance') {
    selectedModel = OPENROUTER_MODELS.alternatives.claude_opus;
  }

  // For user engagement, Claude Sonnet is excellent
  if (context?.activeTab === 'user') {
    selectedModel = OPENROUTER_MODELS.alternatives.claude_sonnet;
  }

  // For leaderboard/ranking analysis, use Claude Opus
  if (context?.activeTab === 'leaderboard') {
    selectedModel = OPENROUTER_MODELS.alternatives.claude_opus;
  }

  return selectedModel;
}

// Export for use in controller
module.exports = {
  OPENROUTER_MODELS,
  selectModelForContext,
  
  // Get current model config
  getCurrentModel: () => OPENROUTER_MODELS.current,
  
  // Get all available models
  getAvailableModels: () => ({
    current: OPENROUTER_MODELS.current,
    ...OPENROUTER_MODELS.alternatives
  })
};