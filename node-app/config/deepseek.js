// server/config/deepseek.js
function toNum(val, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function getDefaultDeepseekModel() {
  return {
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    temperature: toNum(process.env.DEEPSEEK_TEMPERATURE, 0.2),
    max_tokens: toNum(process.env.DEEPSEEK_MAX_TOKENS, 1600),
    top_p: toNum(process.env.DEEPSEEK_TOP_P, 1),
  };
}

/**
 * Optional: choose a different model for heavier multi-org analytics
 * You can keep it simple and always return getDefaultDeepseekModel().
 */
function selectDeepseekModelForContext(context) {
  const base = getDefaultDeepseekModel();

  // Example heuristic: use reasoner for SDAO + multi-org queries
  if (
    process.env.DEEPSEEK_MODEL_REASONER &&
    context?.userRole === 'SDAO' &&
    context?.queryType === 'multi_org'
  ) {
    return {
      ...base,
      model: process.env.DEEPSEEK_MODEL_REASONER, // e.g., "deepseek-reasoner"
      // You can tweak temperature/tokens here if desired
    };
  }

  return base;
}

module.exports = {
  getDefaultDeepseekModel,
  selectDeepseekModelForContext,
};
