# OpenRouter Integration for NOVA Chat Assistant

This document outlines the integration of OpenRouter API to replace DeepSeek in the NOVA chat assistant system.

## Overview

The NOVA chat assistant has been updated to use OpenRouter, which provides access to multiple AI models through a single API. This integration offers several benefits:

- Access to multiple AI models (Claude, GPT-4, etc.)
- Better pricing and reliability
- Fallback options if one model is unavailable
- Single API key management

## Configuration

### Environment Variables

The following environment variables have been added to `.env`:

```env
# OpenRouter API Configuration
OPENROUTER_API_KEY=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
SITE_URL=https://nginx.nuconnect.net
```

- `OPENROUTER_API_KEY`: Your OpenRouter API key for authentication
- `SITE_URL`: Your application's URL (required by OpenRouter for referrer tracking)

## Changes Made

### 1. API Endpoint Update
- **Old**: `https://api.deepseek.com/chat/completions`
- **New**: `https://openrouter.ai/api/v1/chat/completions`

### 2. Headers Update
OpenRouter requires additional headers:
```javascript
headers: {
  'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'Content-Type': 'application/json',
  'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
  'X-Title': 'NU Connect NOVA Assistant',
}
```

### 3. Model Selection
- **Old**: `deepseek-chat`
- **New**: `google/gemini-2.0-flash-exp` (Google's latest model)

### 4. Database Model Reference
Assistant messages are now stored with the model reference: `openrouter/google/gemini-2.0-flash-exp`

## Available Models

OpenRouter provides access to many models. Current configuration:

### Primary Model (Current Choice)
- `google/gemini-2.0-flash-exp` - Google's latest model with excellent analytics and reasoning capabilities

### For Complex Analytics (SDAO/Multi-org)
- `google/gemini-pro` - Google's powerful model for complex analysis

### Alternative Models
- `anthropic/claude-3.5-sonnet` - Excellent for analytics and data interpretation
- `anthropic/claude-3-opus` - Most powerful Claude model
- `openai/gpt-4o` - Latest OpenAI model
- `openai/gpt-4-turbo` - Reliable and well-tested

### For Cost-Effective Operations
- `anthropic/claude-3-haiku` - Fast and economical

## Model Switching

To change the model, update the configuration in `config/openrouter.js`:

```javascript
// In the current model configuration
current: {
  model: 'openai/gpt-4o', // Change this line
  temperature: 0.7,
  max_tokens: 1200,
  top_p: 0.9,
  description: 'Your new model description'
},
```

## Error Handling

The system now handles OpenRouter-specific errors and provides appropriate fallbacks. Error messages reference OpenRouter instead of DeepSeek.

## Streaming Response

The streaming response handling remains unchanged as OpenRouter uses the same Server-Sent Events (SSE) format as OpenAI and DeepSeek.

## Testing

After deployment:

1. Verify environment variables are loaded
2. Test a simple chat message
3. Monitor console logs for "Sending to OpenRouter (Gemini 2.0 Flash)" messages
4. Check database for correct model references (`openrouter/google/gemini-2.0-flash-exp`)

## Troubleshooting

### Common Issues

1. **API Key Issues**
   - Ensure `OPENROUTER_API_KEY` is set correctly
   - Verify the API key is active and has sufficient credits

2. **Referrer Issues**
   - Ensure `SITE_URL` matches your actual domain
   - OpenRouter may reject requests with invalid referrers

3. **Model Availability**
   - Some models may have rate limits or availability issues
   - Consider fallback models if needed

### Monitoring

Monitor these logs for successful integration:
- "Sending to OpenRouter (Gemini 2.0 Flash) with enhanced context"
- "OpenRouter API error" (for troubleshooting)

## Future Enhancements

Consider implementing:

1. **Model Selection by Context**: Use different models for different types of queries
2. **Fallback Models**: Automatically try alternative models if one fails
3. **Cost Optimization**: Use cheaper models for simple queries
4. **Model Performance Metrics**: Track which models perform best for different tasks

## Security Notes

- Keep the OpenRouter API key secure and rotate it regularly
- Monitor API usage to prevent unexpected charges
- Consider implementing usage limits if needed

## Support

For OpenRouter-specific issues, refer to:
- [OpenRouter Documentation](https://openrouter.ai/docs)
- [OpenRouter Models](https://openrouter.ai/models)
- [OpenRouter API Status](https://status.openrouter.ai/)