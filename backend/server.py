from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import bcrypt
import jwt
from emergentintegrations.llm.chat import LlmChat, UserMessage
import asyncio
import json
import subprocess
import tempfile
import sys

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

# LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# Create the main app
app = FastAPI(title="Neural Bridge API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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

class ChatMessage(BaseModel):
    role: str
    content: str
    timestamp: str

class ChatRequest(BaseModel):
    agent_type: str
    message: str
    project_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = None

class CodeExecuteRequest(BaseModel):
    code: str
    language: str = "python"

# Agent configurations with specialized prompts
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
        "system_prompt": "You are a code reviewer. Analyze code for quality, maintainability, performance, and security issues. Provide constructive feedback with specific suggestions for improvement. Follow industry standards and best practices."
    },
    "architect": {
        "name": "Architect Agent",
        "icon": "Building2",
        "color": "#6366F1",
        "description": "System design and architecture",
        "system_prompt": "You are a software architect. Design scalable, maintainable system architectures. Create diagrams (describe in text/mermaid), define APIs, choose appropriate technologies, and plan database schemas. Consider performance, security, and scalability."
    },
    "security": {
        "name": "Security Agent",
        "icon": "Shield",
        "color": "#EF4444",
        "description": "Security analysis and vulnerability detection",
        "system_prompt": "You are a security expert. Identify vulnerabilities (OWASP Top 10, CVEs), suggest secure coding practices, audit authentication/authorization, and recommend security improvements. Perform threat modeling and security reviews."
    },
    "performance": {
        "name": "Performance Agent",
        "icon": "Gauge",
        "color": "#F97316",
        "description": "Performance optimization",
        "system_prompt": "You are a performance engineer. Analyze and optimize code performance. Identify bottlenecks, suggest caching strategies, optimize algorithms, database queries, and network calls. Provide benchmarking approaches."
    },
    "docs": {
        "name": "Documentation Agent",
        "icon": "FileText",
        "color": "#14B8A6",
        "description": "Documentation generation",
        "system_prompt": "You are a technical writer. Create clear, comprehensive documentation including API docs, README files, code comments, and user guides. Use proper formatting (Markdown, JSDoc, docstrings). Make documentation accessible and maintainable."
    },
    "refactor": {
        "name": "Refactor Agent",
        "icon": "RefreshCw",
        "color": "#8B5CF6",
        "description": "Code refactoring and cleanup",
        "system_prompt": "You are a refactoring expert. Improve code structure without changing behavior. Apply design patterns, reduce complexity, improve naming, eliminate duplication. Ensure backward compatibility and maintainability."
    },
    "deploy": {
        "name": "Deploy Agent",
        "icon": "Rocket",
        "color": "#06B6D4",
        "description": "Deployment and CI/CD",
        "system_prompt": "You are a DevOps engineer. Create deployment configurations (Docker, Kubernetes, cloud services). Set up CI/CD pipelines (GitHub Actions, Jenkins, GitLab CI). Handle environment configuration and secrets management."
    },
    "api": {
        "name": "API Agent",
        "icon": "Webhook",
        "color": "#10B981",
        "description": "API design and integration",
        "system_prompt": "You are an API specialist. Design RESTful and GraphQL APIs. Create OpenAPI/Swagger specifications. Handle authentication, rate limiting, versioning. Integrate third-party APIs and create API clients."
    },
    "database": {
        "name": "Database Agent",
        "icon": "Database",
        "color": "#F59E0B",
        "description": "Database design and optimization",
        "system_prompt": "You are a database expert. Design schemas for SQL and NoSQL databases. Write optimized queries, create migrations, handle indexing. Support PostgreSQL, MySQL, MongoDB, Redis. Ensure data integrity and performance."
    },
    "devops": {
        "name": "DevOps Agent",
        "icon": "Container",
        "color": "#EC4899",
        "description": "Infrastructure and operations",
        "system_prompt": "You are a DevOps specialist. Configure infrastructure (AWS, GCP, Azure), set up monitoring and logging, manage containers and orchestration. Handle scaling, disaster recovery, and cost optimization."
    },
    "ux": {
        "name": "UX Agent",
        "icon": "Users",
        "color": "#6366F1",
        "description": "User experience optimization",
        "system_prompt": "You are a UX specialist. Improve user flows, accessibility, and interaction design. Create wireframes (describe in text), user journeys, and personas. Apply usability heuristics and conduct UX audits."
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

async def get_current_user(authorization: str = None):
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

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    user_doc = {
        "id": user_id,
        "email": data.email,
        "name": data.name,
        "password_hash": hash_password(data.password),
        "created_at": now
    }
    
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id)
    user_response = UserResponse(id=user_id, email=data.email, name=data.name, created_at=now)
    
    return TokenResponse(token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"])
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"]
    )
    
    return TokenResponse(token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        created_at=user["created_at"]
    )

# ============== PROJECT ROUTES ==============

@api_router.post("/projects", response_model=ProjectResponse)
async def create_project(data: ProjectCreate, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    project_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Default files based on language
    default_files = {
        "python": {"main.py": "# Neural Bridge Project\n\ndef main():\n    print('Hello, World!')\n\nif __name__ == '__main__':\n    main()\n"},
        "javascript": {"index.js": "// Neural Bridge Project\n\nconsole.log('Hello, World!');\n"},
        "typescript": {"index.ts": "// Neural Bridge Project\n\nconst greeting: string = 'Hello, World!';\nconsole.log(greeting);\n"},
        "java": {"Main.java": "// Neural Bridge Project\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, World!\");\n    }\n}\n"},
        "csharp": {"Program.cs": "// Neural Bridge Project\n\nusing System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine(\"Hello, World!\");\n    }\n}\n"},
        "go": {"main.go": "// Neural Bridge Project\n\npackage main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello, World!\")\n}\n"},
    }
    
    project_doc = {
        "id": project_id,
        "name": data.name,
        "description": data.description,
        "language": data.language,
        "framework": data.framework,
        "files": default_files.get(data.language, {"main.txt": "# Neural Bridge Project\n"}),
        "user_id": user["id"],
        "created_at": now,
        "updated_at": now
    }
    
    await db.projects.insert_one(project_doc)
    
    return ProjectResponse(**{k: v for k, v in project_doc.items() if k != "_id"})

@api_router.get("/projects", response_model=List[ProjectResponse])
async def list_projects(authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    projects = await db.projects.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    return [ProjectResponse(**p) for p in projects]

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one(
        {"id": project_id, "user_id": user["id"]},
        {"_id": 0}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse(**project)

@api_router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    project = await db.projects.find_one({"id": project_id, "user_id": user["id"]})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    update_data = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if data.name:
        update_data["name"] = data.name
    if data.description is not None:
        update_data["description"] = data.description
    if data.files:
        update_data["files"] = data.files
    
    await db.projects.update_one({"id": project_id}, {"$set": update_data})
    
    updated = await db.projects.find_one({"id": project_id}, {"_id": 0})
    return ProjectResponse(**updated)

@api_router.delete("/projects/{project_id}")
async def delete_project(project_id: str, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    result = await db.projects.delete_one({"id": project_id, "user_id": user["id"]})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return {"message": "Project deleted"}

# ============== AGENTS ROUTES ==============

@api_router.get("/agents")
async def list_agents():
    return [
        {
            "id": agent_id,
            "name": agent["name"],
            "icon": agent["icon"],
            "color": agent["color"],
            "description": agent["description"]
        }
        for agent_id, agent in AGENTS.items()
    ]

@api_router.post("/chat")
async def chat_with_agent(data: ChatRequest, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    if data.agent_type not in AGENTS:
        raise HTTPException(status_code=400, detail="Invalid agent type")
    
    agent = AGENTS[data.agent_type]
    
    # Build context message
    context_parts = [f"User: {user['name']}"]
    if data.project_id:
        project = await db.projects.find_one({"id": data.project_id}, {"_id": 0})
        if project:
            context_parts.append(f"Project: {project['name']} ({project['language']})")
            if data.context and data.context.get("current_file"):
                file_name = data.context["current_file"]
                if file_name in project["files"]:
                    context_parts.append(f"Current file ({file_name}):\n```\n{project['files'][file_name]}\n```")
    
    context_message = "\n".join(context_parts)
    full_message = f"{context_message}\n\nRequest: {data.message}"
    
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"{user['id']}-{data.agent_type}-{uuid.uuid4()}",
            system_message=agent["system_prompt"]
        ).with_model("openai", "gpt-5.2")
        
        user_message = UserMessage(text=full_message)
        response = await chat.send_message(user_message)
        
        # Save chat history
        chat_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "agent_type": data.agent_type,
            "project_id": data.project_id,
            "user_message": data.message,
            "agent_response": response,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_history.insert_one(chat_doc)
        
        return {"response": response, "agent": agent["name"]}
    
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/history")
async def get_chat_history(project_id: Optional[str] = None, agent_type: Optional[str] = None, limit: int = 50, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    query = {"user_id": user["id"]}
    if project_id:
        query["project_id"] = project_id
    if agent_type:
        query["agent_type"] = agent_type
    
    history = await db.chat_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return history

# ============== CODE EXECUTION ==============

@api_router.post("/execute")
async def execute_code(data: CodeExecuteRequest, authorization: str = None):
    from fastapi import Header
    user = await get_current_user(authorization)
    
    supported_languages = ["python", "javascript", "typescript"]
    if data.language not in supported_languages:
        return {"output": f"Language '{data.language}' execution not supported. Supported: {', '.join(supported_languages)}", "error": True}
    
    try:
        with tempfile.NamedTemporaryFile(mode='w', suffix=get_file_extension(data.language), delete=False) as f:
            f.write(data.code)
            temp_file = f.name
        
        if data.language == "python":
            result = subprocess.run(
                [sys.executable, temp_file],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=tempfile.gettempdir()
            )
        elif data.language in ["javascript", "typescript"]:
            result = subprocess.run(
                ["node", temp_file],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=tempfile.gettempdir()
            )
        
        os.unlink(temp_file)
        
        output = result.stdout
        if result.stderr:
            output += "\n" + result.stderr
        
        return {"output": output or "Code executed successfully (no output)", "error": result.returncode != 0}
    
    except subprocess.TimeoutExpired:
        return {"output": "Execution timed out (10s limit)", "error": True}
    except Exception as e:
        return {"output": str(e), "error": True}

def get_file_extension(language: str) -> str:
    extensions = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "csharp": ".cs",
        "go": ".go"
    }
    return extensions.get(language, ".txt")

# ============== HEALTH CHECK ==============

@api_router.get("/")
async def root():
    return {"message": "Neural Bridge API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router
app.include_router(api_router)

# CORS middleware
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
