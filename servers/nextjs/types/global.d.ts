interface ShapeProps {
  id: string;
  type: 'rectangle' | 'circle' | 'line';
  position: { x: number; y: number };
  size: { width: number; height: number };
  // Add other properties as needed
}

interface TextFrameProps {
  id: string;
  content: string;
  position: { x: number; y: number };
  // Add other properties as needed
}

interface LLMConfig {
  LLM?: string;

  // OpenAI
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;

  // Google
  GOOGLE_API_KEY?: string;
  GOOGLE_MODEL?: string;

  // Anthropic
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;

  // Ollama
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;

  // Custom LLM
  CUSTOM_LLM_URL?: string;
  CUSTOM_LLM_API_KEY?: string;
  CUSTOM_MODEL?: string;

  // Image providers
  IMAGE_PROVIDER?: string;
  PIXABAY_API_KEY?: string;
  PEXELS_API_KEY?: string;

  // Extended reasoning
  EXTENDED_REASONING?: boolean;

  // Only used in UI settings
  USE_CUSTOM_URL?: boolean;
}