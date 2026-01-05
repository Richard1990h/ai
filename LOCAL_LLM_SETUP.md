# Neural Bridge - Local LLM Setup Guide

## Overview
Neural Bridge supports local LLM servers for private, free AI inference. This guide covers setup for Ollama, LM Studio, and llama.cpp.

## Supported Providers

### 1. Ollama (Recommended)
**Best for:** Easy setup, model management

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a model
ollama pull llama3.2
ollama pull codellama
ollama pull mistral

# Start server (default port 11434)
ollama serve
```

**Available Models:**
- `llama3.2` - General purpose, fast
- `codellama` - Optimized for code
- `mistral` - Good balance of speed/quality
- `deepseek-coder` - Code generation specialist
- `phi3` - Microsoft's small but capable model

### 2. LM Studio
**Best for:** GUI-based model management, GGUF files

1. Download from [lmstudio.ai](https://lmstudio.ai)
2. Download models from the built-in browser
3. Go to **Settings → Local Server**
4. Enable "Start server on launch"
5. Default port: 1234

### 3. llama.cpp
**Best for:** Maximum performance, custom builds

```bash
# Clone and build
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make -j

# Run server with a GGUF model
./server -m models/llama-3.2-8b.gguf --host 0.0.0.0 --port 8080
```

## Configuration

### Backend .env Settings
```env
# Enable/disable local LLM
LOCAL_LLM_ENABLED=true

# Provider: ollama, lmstudio, llamacpp
LOCAL_LLM_PROVIDER=ollama

# Server address
LOCAL_LLM_HOST=http://localhost
LOCAL_LLM_PORT=11434

# Default model name
LOCAL_LLM_MODEL=llama3.2

# Generation settings
LOCAL_LLM_TEMPERATURE=0.7
LOCAL_LLM_MAX_TOKENS=4096
LOCAL_LLM_CONTEXT_WINDOW=8192

# Timeouts and retries
LOCAL_LLM_TIMEOUT=120
LOCAL_LLM_RETRY_ATTEMPTS=3
LOCAL_LLM_RETRY_DELAY=1.0

# Rate limiting
MAX_PROMPT_SIZE=32000
MAX_REQUESTS_PER_MINUTE=30
```

### Port Reference
| Provider | Default Port |
|----------|-------------|
| Ollama | 11434 |
| LM Studio | 1234 |
| llama.cpp | 8080 |

## API Endpoints

### Check LLM Status
```bash
GET /api/llm/status
```
Response:
```json
{
  "enabled": true,
  "provider": "ollama",
  "host": "http://localhost:11434",
  "default_model": "llama3.2",
  "health": {"status": "online"}
}
```

### List Available Models
```bash
GET /api/llm/models
```

### Test Connection
```bash
POST /api/llm/test
Authorization: Bearer <token>
```

### Generate Response
```bash
POST /api/llm/generate
Content-Type: application/json
Authorization: Bearer <token>

{
  "prompt": "Write a hello world in Python",
  "system_prompt": "You are a helpful coding assistant",
  "model": "codellama",
  "temperature": 0.7,
  "max_tokens": 1024
}
```

### Streaming Generation
```bash
POST /api/llm/generate/stream
```
Returns Server-Sent Events (SSE).

## Chat Integration

When chatting with agents, you can toggle local LLM:
```json
{
  "agent_type": "code",
  "message": "Create a REST API",
  "use_local_llm": true,
  "model": "codellama",
  "temperature": 0.5
}
```

## Features

### Context Window Management
- Automatic message truncation to fit context window
- System prompt + recent history preserved
- Configurable via `LOCAL_LLM_CONTEXT_WINDOW`

### Retry Logic
- Configurable retry attempts on failure
- Exponential backoff between retries
- Automatic fallback to cloud LLM if local fails

### Rate Limiting
- Per-user request limits
- Configurable requests per minute
- Prompt size limits for security

### Streaming Responses
- Real-time token streaming
- SSE (Server-Sent Events) format
- Reduces perceived latency

## Fallback Behavior

If local LLM is offline:
1. First attempt uses local LLM
2. On failure, automatically falls back to cloud (GPT-5.2)
3. Warning shown to user about fallback
4. Credits deducted for cloud usage

## Recommended Models by Use Case

| Use Case | Model | Provider |
|----------|-------|----------|
| General coding | `codellama:13b` | Ollama |
| Fast responses | `phi3:mini` | Ollama |
| Complex reasoning | `llama3.2:70b` | Ollama |
| Documentation | `mistral` | Ollama |
| Code review | `deepseek-coder` | Ollama |

## Troubleshooting

### "Cannot connect to LLM server"
1. Check if server is running: `curl http://localhost:11434/api/tags`
2. Verify port in .env matches server
3. Check firewall settings

### "Model not found"
1. Pull the model: `ollama pull <model-name>`
2. Check available models: `ollama list`
3. Verify model name spelling

### Slow responses
1. Use smaller model (7B vs 70B)
2. Reduce max_tokens
3. Enable GPU acceleration in Ollama

### Out of memory
1. Use quantized models (Q4_K_M)
2. Reduce context window
3. Close other applications

## Security Notes

- Local LLM runs on your machine - data never leaves
- Rate limiting prevents abuse
- Prompt size limits prevent memory attacks
- No authentication required for local server (trusted network)
