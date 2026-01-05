from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Request
from fastapi.responses import StreamingResponse, FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any, AsyncGenerator
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
import httpx
import asyncio
import json
import subprocess
import tempfile
import sys
import shutil
import time

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'neural-bridge-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION = 86400 * 7  # 7 days

# LLM Configuration
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

# Local LLM Configuration
LOCAL_LLM_ENABLED = os.environ.get('LOCAL_LLM_ENABLED', 'true').lower() == 'true'
LOCAL_LLM_PROVIDER = os.environ.get('LOCAL_LLM_PROVIDER', 'ollama')  # ollama, lmstudio, llamacpp
LOCAL_LLM_HOST = os.environ.get('LOCAL_LLM_HOST', 'http://localhost')
LOCAL_LLM_PORT = os.environ.get('LOCAL_LLM_PORT', '11434')  # Ollama default
LOCAL_LLM_MODEL = os.environ.get('LOCAL_LLM_MODEL', 'llama3.2')
LOCAL_LLM_TIMEOUT = int(os.environ.get('LOCAL_LLM_TIMEOUT', '120'))
LOCAL_LLM_MAX_TOKENS = int(os.environ.get('LOCAL_LLM_MAX_TOKENS', '4096'))
LOCAL_LLM_CONTEXT_WINDOW = int(os.environ.get('LOCAL_LLM_CONTEXT_WINDOW', '8192'))
LOCAL_LLM_TEMPERATURE = float(os.environ.get('LOCAL_LLM_TEMPERATURE', '0.7'))
LOCAL_LLM_RETRY_ATTEMPTS = int(os.environ.get('LOCAL_LLM_RETRY_ATTEMPTS', '3'))
LOCAL_LLM_RETRY_DELAY = float(os.environ.get('LOCAL_LLM_RETRY_DELAY', '1.0'))

# Rate limiting
MAX_PROMPT_SIZE = int(os.environ.get('MAX_PROMPT_SIZE', '32000'))  # characters
MAX_REQUESTS_PER_MINUTE = int(os.environ.get('MAX_REQUESTS_PER_MINUTE', '30'))

# Create the main app
app = FastAPI(title="Neural Bridge API")
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiting storage (in production, use Redis)
rate_limit_store: Dict[str, List[float]] = {}

# ============== LOCAL LLM CLIENT ==============

class LocalLLMClient:
    """Client for interacting with local LLM servers (Ollama, LM Studio, llama.cpp)"""
    
    def __init__(self):
        self.base_url = f"{LOCAL_LLM_HOST}:{LOCAL_LLM_PORT}"
        self.provider = LOCAL_LLM_PROVIDER
        self.default_model = LOCAL_LLM_MODEL
        self.timeout = LOCAL_LLM_TIMEOUT
        self.max_tokens = LOCAL_LLM_MAX_TOKENS
        self.context_window = LOCAL_LLM_CONTEXT_WINDOW
        self.temperature = LOCAL_LLM_TEMPERATURE
        self._available_models_cache = None
        self._cache_time = 0
    
    def _get_endpoint(self, action: str) -> str:
        """Get the appropriate endpoint based on provider"""
        endpoints = {
            'ollama': {
                'chat': f"{self.base_url}/api/chat",
                'generate': f"{self.base_url}/api/generate",
                'models': f"{self.base_url}/api/tags",
                'health': f"{self.base_url}/api/tags",
            },
            'lmstudio': {
                'chat': f"{self.base_url}/v1/chat/completions",
                'generate': f"{self.base_url}/v1/completions",
                'models': f"{self.base_url}/v1/models",
                'health': f"{self.base_url}/v1/models",
            },
            'llamacpp': {
                'chat': f"{self.base_url}/v1/chat/completions",
                'generate': f"{self.base_url}/completion",
                'models': f"{self.base_url}/v1/models",
                'health': f"{self.base_url}/health",
            },
        }
        return endpoints.get(self.provider, endpoints['ollama']).get(action, '')
    
    def _format_messages(self, system_prompt: str, user_message: str, history: List[Dict] = None) -> List[Dict]:
        """Format messages for the chat API"""
        messages = []
        
        # Add system message
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        
        # Add history if provided
        if history:
            for msg in history[-10:]:  # Last 10 messages for context
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
        
        # Add current user message
        messages.append({"role": "user", "content": user_message})
        
        return messages
    
    def _truncate_context(self, messages: List[Dict], max_chars: int = None) -> List[Dict]:
        """Truncate messages to fit within context window"""
        if max_chars is None:
            max_chars = self.context_window * 4  # Rough char-to-token ratio
        
        total_chars = sum(len(m.get("content", "")) for m in messages)
        
        if total_chars <= max_chars:
            return messages
        
        # Keep system message and last user message, truncate middle
        result = []
        if messages and messages[0].get("role") == "system":
            result.append(messages[0])
            messages = messages[1:]
        
        # Always keep the last message
        last_message = messages[-1] if messages else None
        messages = messages[:-1] if messages else []
        
        # Add messages from the end until we hit the limit
        remaining_chars = max_chars - sum(len(m.get("content", "")) for m in result)
        if last_message:
            remaining_chars -= len(last_message.get("content", ""))
        
        for msg in reversed(messages):
            msg_len = len(msg.get("content", ""))
            if remaining_chars - msg_len > 0:
                result.insert(1 if result else 0, msg)
                remaining_chars -= msg_len
            else:
                break
        
        if last_message:
            result.append(last_message)
        
        return result
    
    async def check_health(self) -> Dict[str, Any]:
        """Check if the local LLM server is running"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(self._get_endpoint('health'))
                if response.status_code == 200:
                    return {"status": "online", "provider": self.provider, "url": self.base_url}
                return {"status": "error", "code": response.status_code}
        except httpx.ConnectError:
            return {"status": "offline", "error": "Cannot connect to LLM server"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    async def get_available_models(self, force_refresh: bool = False) -> List[Dict]:
        """Get list of available models from the local server"""
        # Cache for 60 seconds
        if not force_refresh and self._available_models_cache and time.time() - self._cache_time < 60:
            return self._available_models_cache
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self._get_endpoint('models'))
                if response.status_code == 200:
                    data = response.json()
                    
                    if self.provider == 'ollama':
                        models = [{"name": m.get("name", ""), "size": m.get("size", 0), "modified": m.get("modified_at", "")} 
                                  for m in data.get("models", [])]
                    else:  # OpenAI-compatible format (LM Studio, llama.cpp)
                        models = [{"name": m.get("id", ""), "owned_by": m.get("owned_by", "")} 
                                  for m in data.get("data", [])]
                    
                    self._available_models_cache = models
                    self._cache_time = time.time()
                    return models
        except Exception as e:
            logger.error(f"Failed to get models: {e}")
        
        return []
    
    async def generate(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = None,
        temperature: float = None,
        max_tokens: int = None,
        history: List[Dict] = None,
        stream: bool = False
    ) -> str:
        """Generate a response from the local LLM"""
        model = model or self.default_model
        temperature = temperature if temperature is not None else self.temperature
        max_tokens = max_tokens or self.max_tokens
        
        messages = self._format_messages(system_prompt, prompt, history)
        messages = self._truncate_context(messages)
        
        # Prepare request based on provider
        if self.provider == 'ollama':
            payload = {
                "model": model,
                "messages": messages,
                "stream": stream,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                }
            }
        else:  # OpenAI-compatible format
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": stream,
            }
        
        # Retry logic
        last_error = None
        for attempt in range(LOCAL_LLM_RETRY_ATTEMPTS):
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(
                        self._get_endpoint('chat'),
                        json=payload
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        
                        if self.provider == 'ollama':
                            return data.get("message", {}).get("content", "")
                        else:  # OpenAI format
                            return data.get("choices", [{}])[0].get("message", {}).get("content", "")
                    
                    last_error = f"HTTP {response.status_code}: {response.text}"
                    
            except httpx.TimeoutException:
                last_error = "Request timed out"
            except httpx.ConnectError:
                last_error = "Cannot connect to LLM server"
            except Exception as e:
                last_error = str(e)
            
            if attempt < LOCAL_LLM_RETRY_ATTEMPTS - 1:
                await asyncio.sleep(LOCAL_LLM_RETRY_DELAY * (attempt + 1))
        
        raise HTTPException(status_code=503, detail=f"LLM request failed: {last_error}")
    
    async def generate_stream(
        self,
        prompt: str,
        system_prompt: str = "",
        model: str = None,
        temperature: float = None,
        max_tokens: int = None,
        history: List[Dict] = None
    ) -> AsyncGenerator[str, None]:
        """Generate a streaming response from the local LLM"""
        model = model or self.default_model
        temperature = temperature if temperature is not None else self.temperature
        max_tokens = max_tokens or self.max_tokens
        
        messages = self._format_messages(system_prompt, prompt, history)
        messages = self._truncate_context(messages)
        
        if self.provider == 'ollama':
            payload = {
                "model": model,
                "messages": messages,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    "num_predict": max_tokens,
                }
            }
        else:
            payload = {
                "model": model,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "stream": True,
            }
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream('POST', self._get_endpoint('chat'), json=payload) as response:
                    async for line in response.aiter_lines():
                        if line:
                            try:
                                if self.provider == 'ollama':
                                    data = json.loads(line)
                                    content = data.get("message", {}).get("content", "")
                                    if content:
                                        yield content
                                else:  # OpenAI format
                                    if line.startswith("data: "):
                                        line = line[6:]
                                    if line == "[DONE]":
                                        break
                                    data = json.loads(line)
                                    content = data.get("choices", [{}])[0].get("delta", {}).get("content", "")
                                    if content:
                                        yield content
                            except json.JSONDecodeError:
                                continue
        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield f"\n\n[Error: {str(e)}]"


# Initialize local LLM client
local_llm = LocalLLMClient()

# ============== RATE LIMITING ==============

def check_rate_limit(user_id: str) -> bool:
    """Check if user has exceeded rate limit"""
    now = time.time()
    minute_ago = now - 60
    
    if user_id not in rate_limit_store:
        rate_limit_store[user_id] = []
    
    # Clean old entries
    rate_limit_store[user_id] = [t for t in rate_limit_store[user_id] if t > minute_ago]
    
    if len(rate_limit_store[user_id]) >= MAX_REQUESTS_PER_MINUTE:
        return False
    
    rate_limit_store[user_id].append(now)
    return True

# ============== CREDIT PACKAGES ==============
CREDIT_PACKAGES = {
    "starter": {"credits": 500, "price": 5.00, "name": "Starter Pack"},
    "basic": {"credits": 1200, "price": 10.00, "name": "Basic Pack"},
    "pro": {"credits": 3500, "price": 25.00, "name": "Pro Pack"},
    "enterprise": {"credits": 8000, "price": 50.00, "name": "Enterprise Pack"},
}

DEFAULT_SETTINGS = {
    "credits_per_1k_tokens": 10,
    "free_credits_on_signup": 100,
    "min_credits_for_chat": 5,
    "use_local_llm": True,
    "local_llm_free": True,  # Local LLM doesn't cost credits
}

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    credits: int = 0
    is_admin: bool = False
    created_at: str

class TokenResponse(BaseModel):
    token: str
    user: UserResponse

class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    language: str = "python"
    framework: str = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    files: Optional[Dict[str, str]] = None

class ProjectResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    language: str
    framework: str
    files: Dict[str, str]
    user_id: str
    created_at: str
    updated_at: str

class ChatRequest(BaseModel):
    agent_type: str
    message: str
    project_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None
    use_local_llm: bool = True
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None

class CodeExecuteRequest(BaseModel):
    code: str
    language: str = "python"

class BuildRequest(BaseModel):
    files: Dict[str, str]
    language: str = "python"
    main_file: Optional[str] = None

class LLMSettingsUpdate(BaseModel):
    provider: Optional[str] = None
    host: Optional[str] = None
    port: Optional[str] = None
    model: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    timeout: Optional[int] = None

class PasswordResetRequest(BaseModel):
    current_password: str
    new_password: str

class AdminCreditUpdate(BaseModel):
    user_id: str
    credits: int
    operation: str
    reason: str = ""

class AdminSettingsUpdate(BaseModel):
    credits_per_1k_tokens: Optional[int] = None
    free_credits_on_signup: Optional[int] = None
    min_credits_for_chat: Optional[int] = None
    use_local_llm: Optional[bool] = None
    local_llm_free: Optional[bool] = None

class CheckoutRequest(BaseModel):
    package_id: str
    origin_url: str

# Agent configurations
AGENTS = {
    "design": {
        "name": "Design Agent",
        "icon": "Palette",
        "color": "#8B5CF6",
        "description": "UI/UX design and visual architecture",
        "system_prompt": "You are a senior UI/UX designer. Help users design beautiful, functional interfaces. Provide specific CSS, color schemes, layout suggestions, and component structures. Focus on modern design principles, accessibility, and user experience."
    },
    "code": {
        "name": "Code Agent",
        "icon": "Code2",
        "color": "#06B6D4",
        "description": "Code generation and implementation",
        "system_prompt": "You are an expert software developer. Write clean, efficient, well-documented code. Support all major languages (Python, JavaScript, TypeScript, Java, C#, Go, Rust, etc.). Follow best practices, design patterns, and provide complete, working implementations."
    },
    "test": {
        "name": "Test Agent",
        "icon": "TestTube2",
        "color": "#10B981",
        "description": "Test creation and quality assurance",
        "system_prompt": "You are a QA expert. Create comprehensive test suites including unit tests, integration tests, and e2e tests. Use appropriate testing frameworks (pytest, jest, junit, etc.). Ensure high code coverage and test edge cases."
    },
    "debug": {
        "name": "Debug Agent",
        "icon": "Bug",
        "color": "#F59E0B",
        "description": "Error analysis and bug fixing",
        "system_prompt": "You are a debugging expert. Analyze code errors, stack traces, and logs. Identify root causes and provide precise fixes. Explain the debugging process and suggest preventive measures."
    },
    "review": {
        "name": "Review Agent",
        "icon": "GitPullRequest",
        "color": "#EC4899",
        "description": "Code review and quality checks",
        "system_prompt": "You are a code reviewer. Analyze code for quality, maintainability, performance, and security issues. Provide constructive feedback with specific suggestions for improvement."
    },
    "architect": {
        "name": "Architect Agent",
        "icon": "Building2",
        "color": "#6366F1",
        "description": "System design and architecture",
        "system_prompt": "You are a software architect. Design scalable, maintainable system architectures. Create diagrams, define APIs, choose appropriate technologies, and plan database schemas."
    },
    "security": {
        "name": "Security Agent",
        "icon": "Shield",
        "color": "#EF4444",
        "description": "Security analysis and vulnerability detection",
        "system_prompt": "You are a security expert. Identify vulnerabilities (OWASP Top 10, CVEs), suggest secure coding practices, audit authentication/authorization, and recommend security improvements."
    },
    "performance": {
        "name": "Performance Agent",
        "icon": "Gauge",
        "color": "#F97316",
        "description": "Performance optimization",
        "system_prompt": "You are a performance engineer. Analyze and optimize code performance. Identify bottlenecks, suggest caching strategies, optimize algorithms and database queries."
    },
    "docs": {
        "name": "Documentation Agent",
        "icon": "FileText",
        "color": "#14B8A6",
        "description": "Documentation generation",
        "system_prompt": "You are a technical writer. Create clear, comprehensive documentation including API docs, README files, code comments, and user guides."
    },
    "refactor": {
        "name": "Refactor Agent",
        "icon": "RefreshCw",
        "color": "#8B5CF6",
        "description": "Code refactoring and cleanup",
        "system_prompt": "You are a refactoring expert. Improve code structure without changing behavior. Apply design patterns, reduce complexity, improve naming, eliminate duplication."
    },
    "deploy": {
        "name": "Deploy Agent",
        "icon": "Rocket",
        "color": "#06B6D4",
        "description": "Deployment and CI/CD",
        "system_prompt": "You are a DevOps engineer. Create deployment configurations (Docker, Kubernetes, cloud services). Set up CI/CD pipelines and handle environment configuration."
    },
    "api": {
        "name": "API Agent",
        "icon": "Webhook",
        "color": "#10B981",
        "description": "API design and integration",
        "system_prompt": "You are an API specialist. Design RESTful and GraphQL APIs. Create OpenAPI specifications. Handle authentication, rate limiting, versioning."
    },
    "database": {
        "name": "Database Agent",
        "icon": "Database",
        "color": "#F59E0B",
        "description": "Database design and optimization",
        "system_prompt": "You are a database expert. Design schemas for SQL and NoSQL databases. Write optimized queries, create migrations, handle indexing."
    },
    "devops": {
        "name": "DevOps Agent",
        "icon": "Container",
        "color": "#EC4899",
        "description": "Infrastructure and operations",
        "system_prompt": "You are a DevOps specialist. Configure infrastructure, set up monitoring and logging, manage containers and orchestration."
    },
    "ux": {
        "name": "UX Agent",
        "icon": "Users",
        "color": "#6366F1",
        "description": "User experience optimization",
        "system_prompt": "You are a UX specialist. Improve user flows, accessibility, and interaction design. Create wireframes, user journeys, and personas."
    }
}

# ============== AUTH HELPERS ==============

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def create_token(user_id: str) -> str:
    payload = {
        "user_id": user_id,
        "exp": datetime.now(timezone.utc).timestamp() + JWT_EXPIRATION
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(user: dict = Depends(get_current_user)):
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

async def get_system_settings():
    settings = await db.settings.find_one({"type": "system"}, {"_id": 0})
    if not settings:
        settings = {**DEFAULT_SETTINGS, "type": "system"}
        await db.settings.insert_one(settings)
    return settings

# ============== LOCAL LLM ROUTES ==============

@api_router.get("/llm/status")
async def get_llm_status():
    """Get the status of the local LLM server"""
    health = await local_llm.check_health()
    return {
        "enabled": LOCAL_LLM_ENABLED,
        "provider": LOCAL_LLM_PROVIDER,
        "host": f"{LOCAL_LLM_HOST}:{LOCAL_LLM_PORT}",
        "default_model": LOCAL_LLM_MODEL,
        "health": health
    }

@api_router.get("/llm/models")
async def get_available_models(force_refresh: bool = False):
    """Get list of available models from the local LLM server"""
    if not LOCAL_LLM_ENABLED:
        return {"models": [], "error": "Local LLM is disabled"}
    
    models = await local_llm.get_available_models(force_refresh)
    return {
        "models": models,
        "default": LOCAL_LLM_MODEL,
        "provider": LOCAL_LLM_PROVIDER
    }

@api_router.get("/llm/settings")
async def get_llm_settings(user: dict = Depends(get_current_user)):
    """Get current LLM settings"""
    return {
        "enabled": LOCAL_LLM_ENABLED,
        "provider": LOCAL_LLM_PROVIDER,
        "host": LOCAL_LLM_HOST,
        "port": LOCAL_LLM_PORT,
        "model": LOCAL_LLM_MODEL,
        "temperature": LOCAL_LLM_TEMPERATURE,
        "max_tokens": LOCAL_LLM_MAX_TOKENS,
        "context_window": LOCAL_LLM_CONTEXT_WINDOW,
        "timeout": LOCAL_LLM_TIMEOUT,
    }

@api_router.post("/llm/test")
async def test_llm_connection(user: dict = Depends(get_current_user)):
    """Test the local LLM connection with a simple prompt"""
    try:
        response = await local_llm.generate(
            prompt="Say 'Hello, Neural Bridge!' in exactly those words.",
            system_prompt="You are a helpful assistant. Respond concisely.",
            max_tokens=50
        )
        return {"success": True, "response": response}
    except Exception as e:
        return {"success": False, "error": str(e)}

@api_router.post("/llm/generate")
async def generate_with_local_llm(
    request: Request,
    prompt: str,
    system_prompt: str = "",
    model: str = None,
    temperature: float = None,
    max_tokens: int = None,
    user: dict = Depends(get_current_user)
):
    """Direct generation with local LLM"""
    # Rate limiting
    if not check_rate_limit(user["id"]):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment.")
    
    # Prompt size limit
    if len(prompt) > MAX_PROMPT_SIZE:
        raise HTTPException(status_code=400, detail=f"Prompt too large. Maximum {MAX_PROMPT_SIZE} characters.")
    
    try:
        response = await local_llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        )
        return {"response": response, "model": model or LOCAL_LLM_MODEL}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))

@api_router.post("/llm/generate/stream")
async def generate_stream_with_local_llm(
    prompt: str,
    system_prompt: str = "",
    model: str = None,
    temperature: float = None,
    max_tokens: int = None,
    user: dict = Depends(get_current_user)
):
    """Streaming generation with local LLM"""
    if not check_rate_limit(user["id"]):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")
    
    if len(prompt) > MAX_PROMPT_SIZE:
        raise HTTPException(status_code=400, detail=f"Prompt too large")
    
    async def stream_generator():
        async for chunk in local_llm.generate_stream(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens
        ):
            yield f"data: {json.dumps({'content': chunk})}\n\n"
        yield "data: [DONE]\n\n"
    
    return StreamingResponse(stream_generator(), media_type="text/event-stream")

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate, request: Request):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    settings = await get_system_settings()
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    user_doc = {
        "id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "credits": settings.get("free_credits_on_signup", 100),
        "total_credits_used": 0,
        "is_admin": False,
        "created_at": now,
        "last_login": now,
        "last_ip": client_ip,
        "login_history": [{"timestamp": now, "ip": client_ip}]
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    return TokenResponse(token=token, user=UserResponse(
        id=user_id, email=data.email, name=data.name,
        credits=user_doc["credits"], is_admin=False, created_at=now
    ))

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    now = datetime.now(timezone.utc).isoformat()
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": now, "last_ip": client_ip},
         "$push": {"login_history": {"$each": [{"timestamp": now, "ip": client_ip}], "$slice": -50}}}
    )
    
    token = create_token(user["id"])
    return TokenResponse(token=token, user=UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        credits=user.get("credits", 0), is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    ))

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        credits=user.get("credits", 0), is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetRequest, user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_password(data.new_password)}})
    return {"message": "Password updated successfully"}

# ============== CREDITS ROUTES ==============

@api_router.get("/credits/packages")
async def get_credit_packages():
    return CREDIT_PACKAGES

@api_router.get("/credits/balance")
async def get_credit_balance(user: dict = Depends(get_current_user)):
    return {"credits": user.get("credits", 0), "total_used": user.get("total_credits_used", 0)}

@api_router.post("/credits/checkout")
async def create_checkout(data: CheckoutRequest, user: dict = Depends(get_current_user)):
    if data.package_id not in CREDIT_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")
    package = CREDIT_PACKAGES[data.package_id]
    
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
        webhook_url = f"{data.origin_url}/api/webhook/stripe"
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
        
        session = await stripe_checkout.create_checkout_session(CheckoutSessionRequest(
            amount=package["price"],
            currency="usd",
            success_url=f"{data.origin_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}&payment=success",
            cancel_url=f"{data.origin_url}/dashboard?payment=cancelled",
            metadata={"user_id": user["id"], "package_id": data.package_id, "credits": str(package["credits"])}
        ))
        
        await db.payment_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "session_id": session.session_id,
            "user_id": user["id"],
            "package_id": data.package_id,
            "amount": package["price"],
            "credits": package["credits"],
            "status": "pending",
            "payment_status": "initiated",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        return {"url": session.url, "session_id": session.session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/credits/checkout/status/{session_id}")
async def check_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "credits_added": transaction.get("credits", 0)}
    
    try:
        from emergentintegrations.payments.stripe.checkout import StripeCheckout
        stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
        status = await stripe_checkout.get_checkout_status(session_id)
        
        if status.payment_status == "paid" and transaction.get("payment_status") != "paid":
            credits_to_add = transaction.get("credits", 0)
            await db.users.update_one({"id": transaction["user_id"]}, {"$inc": {"credits": credits_to_add}})
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"status": "complete", "payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}}
            )
            return {"status": "complete", "payment_status": "paid", "credits_added": credits_to_add}
        
        return {"status": status.status, "payment_status": status.payment_status}
    except Exception as e:
        return {"status": "pending", "error": str(e)}

# ============== ADMIN ROUTES ==============

@api_router.get("/admin/users")
async def admin_get_users(admin: dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(1000)
    return users

@api_router.get("/admin/users/{user_id}")
async def admin_get_user(user_id: str, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    conversations = await db.chat_history.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    payments = await db.payment_transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    return {"user": user, "conversations": conversations, "payments": payments}

@api_router.post("/admin/users/credits")
async def admin_update_credits(data: AdminCreditUpdate, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_credits = user.get("credits", 0)
    new_credits = current_credits + data.credits if data.operation == "add" else max(0, current_credits - data.credits)
    
    await db.users.update_one({"id": data.user_id}, {"$set": {"credits": new_credits}})
    await db.admin_logs.insert_one({
        "id": str(uuid.uuid4()), "admin_id": admin["id"], "action": f"credits_{data.operation}",
        "target_user_id": data.user_id, "amount": data.credits, "reason": data.reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Credits updated. New balance: {new_credits}", "new_credits": new_credits}

@api_router.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(get_admin_user)):
    return await get_system_settings()

@api_router.put("/admin/settings")
async def admin_update_settings(data: AdminSettingsUpdate, admin: dict = Depends(get_admin_user)):
    update_fields = {k: v for k, v in data.dict().items() if v is not None}
    if update_fields:
        await db.settings.update_one({"type": "system"}, {"$set": update_fields}, upsert=True)
    return await get_system_settings()

@api_router.get("/admin/stats")
async def admin_get_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    total_projects = await db.projects.count_documents({})
    total_chats = await db.chat_history.count_documents({})
    total_payments = await db.payment_transactions.count_documents({"payment_status": "paid"})
    payments = await db.payment_transactions.find({"payment_status": "paid"}, {"amount": 1}).to_list(1000)
    total_revenue = sum(p.get("amount", 0) for p in payments)
    recent_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_users": total_users, "total_projects": total_projects,
        "total_chats": total_chats, "total_payments": total_payments,
        "total_revenue": total_revenue, "recent_users": recent_users
    }

@api_router.get("/admin/logs")
async def admin_get_logs(admin: dict = Depends(get_admin_user)):
    return await db.admin_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)

@api_router.post("/admin/make-admin/{user_id}")
async def admin_make_admin(user_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_admin": True}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User is now an admin"}

@api_router.post("/admin/remove-admin/{user_id}")
async def admin_remove_admin(user_id: str, admin: dict = Depends(get_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")
    result = await db.users.update_one({"id": user_id}, {"$set": {"is_admin": False}})
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Admin status removed"}

# ============== PROJECT ROUTES ==============

@api_router.post("/projects", response_model=ProjectResponse)
async def create_project(data: ProjectCreate, user: dict = Depends(get_current_user)):
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    default_files = {
        "python": {"main.py": "# Neural Bridge Project\n\ndef main():\n    print('Hello, World!')\n\nif __name__ == '__main__':\n    main()\n"},
        "javascript": {"index.js": "// Neural Bridge Project\n\nconsole.log('Hello, World!');\n"},
        "typescript": {"index.ts": "// Neural Bridge Project\n\nconst greeting: string = 'Hello, World!';\nconsole.log(greeting);\n"},
    }
    
    project_doc = {
        "id": project_id, "name": data.name, "description": data.description,
        "language": data.language, "framework": data.framework,
        "files": default_files.get(data.language, {"main.txt": "# Neural Bridge Project\n"}),
        "user_id": user["id"], "created_at": now, "updated_at": now
    }
    
    await db.projects.insert_one(project_doc)
    return ProjectResponse(**{k: v for k, v in project_doc.items() if k != "_id"})

@api_router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(user: dict = Depends(get_current_user)):
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(100)
    return [ProjectResponse(**p) for p in projects]

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "user_id": user["id"]}, {"_id": 0})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**project)

@api_router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one({"id": project_id, "user_id": user["id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name: update_data["name"] = data.name
    if data.description is not None: update_data["description"] = data.description
    if data.files: update_data["files"] = data.files
    
    await db.projects.update_one({"id": project_id}, {"$set": update_data})
    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return ProjectResponse(**updated)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
    result = await db.projects.delete_one({"id": project_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"message": "Project deleted"}

# ============== AGENTS & CHAT ROUTES ==============

@api_router.get("/agents")
async def list_agents():
    return [{"id": k, "name": v["name"], "icon": v["icon"], "color": v["color"], "description": v["description"]} 
            for k, v in AGENTS.items()]

@api_router.post("/chat")
async def chat_with_agent(data: ChatRequest, user: dict = Depends(get_current_user)):
    if data.agent_type not in AGENTS:
        raise HTTPException(status_code=400, detail="Invalid agent type")
    
    # Rate limiting
    if not check_rate_limit(user["id"]):
        raise HTTPException(status_code=429, detail="Rate limit exceeded. Please wait a moment.")
    
    # Prompt size limit
    if len(data.message) > MAX_PROMPT_SIZE:
        raise HTTPException(status_code=400, detail=f"Message too large. Maximum {MAX_PROMPT_SIZE} characters.")
    
    settings = await get_system_settings()
    agent = AGENTS[data.agent_type]
    
    # Build context
    context_parts = [f"User: {user['name']}"]
    if data.project_id:
        project = await db.projects.find_one({"id": data.project_id}, {"_id": 0})
        if project:
            context_parts.append(f"Project: {project['name']} ({project['language']})")
            if data.context and data.context.get("current_file"):
                file_name = data.context["current_file"]
                if file_name in project["files"]:
                    context_parts.append(f"Current file ({file_name}):\n```\n{project['files'][file_name]}\n```")
    
    full_message = "\n".join(context_parts) + f"\n\nRequest: {data.message}"
    
    # Check if using local LLM
    use_local = data.use_local_llm and LOCAL_LLM_ENABLED
    local_llm_free = settings.get("local_llm_free", True)
    
    # Check credits (only for cloud LLM or if local isn't free)
    if not use_local or not local_llm_free:
        min_credits = settings.get("min_credits_for_chat", 5)
        if user.get("credits", 0) < min_credits:
            raise HTTPException(status_code=402, detail=f"Insufficient credits. Need at least {min_credits} credits.")
    
    try:
        if use_local:
            # Use local LLM
            response = await local_llm.generate(
                prompt=full_message,
                system_prompt=agent["system_prompt"],
                model=data.model,
                temperature=data.temperature,
                max_tokens=data.max_tokens
            )
            model_used = data.model or LOCAL_LLM_MODEL
            credits_used = 0 if local_llm_free else max(1, len(full_message.split()) // 100)
        else:
            # Use cloud LLM (Emergent)
            from emergentintegrations.llm.chat import LlmChat, UserMessage
            chat = LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"{user['id']}-{data.agent_type}-{uuid.uuid4()}",
                system_message=agent["system_prompt"]
            ).with_model("openai", "gpt-5.2")
            
            response = await chat.send_message(UserMessage(text=full_message))
            model_used = "gpt-5.2"
            tokens_used = len(full_message.split()) + len(response.split())
            credits_per_1k = settings.get("credits_per_1k_tokens", 10)
            credits_used = max(1, int((tokens_used / 1000) * credits_per_1k))
        
        # Deduct credits if applicable
        if credits_used > 0:
            await db.users.update_one(
                {"id": user["id"]},
                {"$inc": {"credits": -credits_used, "total_credits_used": credits_used}}
            )
        
        # Save chat history
        await db.chat_history.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["id"], "agent_type": data.agent_type,
            "project_id": data.project_id, "user_message": data.message, "agent_response": response,
            "model_used": model_used, "use_local_llm": use_local, "credits_used": credits_used,
            "timestamp": datetime.now(timezone.utc).isoformat()
        })
        
        updated_user = await db.users.find_one({"id": user["id"]}, {"credits": 1})
        
        return {
            "response": response, "agent": agent["name"], "model": model_used,
            "local_llm": use_local, "credits_used": credits_used,
            "remaining_credits": updated_user.get("credits", 0)
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Chat error: {e}")
        
        # Fallback to cloud if local fails
        if use_local and EMERGENT_LLM_KEY:
            try:
                from emergentintegrations.llm.chat import LlmChat, UserMessage
                chat = LlmChat(
                    api_key=EMERGENT_LLM_KEY,
                    session_id=f"{user['id']}-{data.agent_type}-fallback",
                    system_message=agent["system_prompt"]
                ).with_model("openai", "gpt-5.2")
                
                response = await chat.send_message(UserMessage(text=full_message))
                return {
                    "response": response, "agent": agent["name"], "model": "gpt-5.2 (fallback)",
                    "local_llm": False, "credits_used": 0, "remaining_credits": user.get("credits", 0),
                    "warning": "Local LLM unavailable, used cloud fallback"
                }
            except Exception as fallback_error:
                logger.error(f"Fallback also failed: {fallback_error}")
        
        raise HTTPException(status_code=503, detail=f"LLM service unavailable: {str(e)}")

@api_router.get("/chat/history")
async def get_chat_history(project_id: Optional[str] = None, agent_type: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if project_id: query["project_id"] = project_id
    if agent_type: query["agent_type"] = agent_type
    return await db.chat_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)

# ============== CODE EXECUTION ==============

@api_router.post("/execute")
async def execute_code(data: CodeExecuteRequest, user: dict = Depends(get_current_user)):
    supported = ["python", "javascript", "typescript"]
    if data.language not in supported:
        return {"output": f"Language '{data.language}' not supported. Supported: {', '.join(supported)}", "error": True}
    
    try:
        ext = {"python": ".py", "javascript": ".js", "typescript": ".ts"}[data.language]
        with tempfile.NamedTemporaryFile(mode='w', suffix=ext, delete=False) as f:
            f.write(data.code)
            temp_file = f.name
        
        cmd = [sys.executable, temp_file] if data.language == "python" else ["node", temp_file]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10, cwd=tempfile.gettempdir())
        os.unlink(temp_file)
        
        output = result.stdout + ("\n" + result.stderr if result.stderr else "")
        return {"output": output or "Code executed successfully (no output)", "error": result.returncode != 0}
    except subprocess.TimeoutExpired:
        return {"output": "Execution timed out (10s limit)", "error": True}
    except Exception as e:
        return {"output": str(e), "error": True}

@api_router.post("/build")
async def build_project(data: BuildRequest, user: dict = Depends(get_current_user)):
    supported = ["python", "javascript", "typescript"]
    if data.language not in supported:
        return {"output": f"Language '{data.language}' not supported", "error": True, "steps": []}
    
    steps = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        steps.append({"step": "Creating project files", "status": "success"})
        for file_path, content in data.files.items():
            full_path = os.path.join(temp_dir, file_path)
            os.makedirs(os.path.dirname(full_path) if os.path.dirname(full_path) else temp_dir, exist_ok=True)
            with open(full_path, 'w') as f:
                f.write(content)
        
        main_file = data.main_file
        if not main_file:
            for pattern in ['main.py', 'app.py', 'index.py', 'main.js', 'index.js']:
                if pattern in data.files:
                    main_file = pattern
                    break
            if not main_file:
                main_file = list(data.files.keys())[0]
        
        steps.append({"step": f"Main file: {main_file}", "status": "success"})
        steps.append({"step": "Executing project", "status": "running"})
        
        cmd = [sys.executable, os.path.join(temp_dir, main_file)] if data.language == "python" else ["node", os.path.join(temp_dir, main_file)]
        env = {**os.environ, 'PYTHONPATH': temp_dir} if data.language == "python" else os.environ
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30, cwd=temp_dir, env=env)
        output = result.stdout + ("\n" + result.stderr if result.stderr else "")
        steps[-1]["status"] = "success" if result.returncode == 0 else "error"
        
        return {"output": output or "Build completed (no output)", "error": result.returncode != 0, "steps": steps}
    except subprocess.TimeoutExpired:
        return {"output": "Build timed out (30s limit)", "error": True, "steps": steps}
    except Exception as e:
        return {"output": str(e), "error": True, "steps": steps}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

# ============== DOWNLOAD & HEALTH ==============

@api_router.get("/download/project")
async def download_project_zip():
    zip_path = "/app/neural-bridge-project.zip"
    if os.path.exists(zip_path):
        return FileResponse(zip_path, media_type="application/zip", filename="neural-bridge-project.zip")
    raise HTTPException(status_code=404, detail="Project ZIP not found")

@api_router.get("/")
async def root():
    return {"message": "Neural Bridge API", "version": "2.0.0", "local_llm": LOCAL_LLM_ENABLED}

@api_router.get("/health")
async def health():
    llm_status = await local_llm.check_health() if LOCAL_LLM_ENABLED else {"status": "disabled"}
    return {"status": "healthy", "local_llm": llm_status}

# Include router and CORS
app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
