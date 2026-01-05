from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Header, Request
from fastapi.responses import StreamingResponse, FileResponse
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
from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionResponse, CheckoutStatusResponse, CheckoutSessionRequest
import asyncio
import json
import subprocess
import tempfile
import sys
import shutil

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

# Stripe Key
STRIPE_API_KEY = os.environ.get('STRIPE_API_KEY', '')

# Create the main app
app = FastAPI(title="Neural Bridge API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============== CREDIT PACKAGES ==============
CREDIT_PACKAGES = {
    "starter": {"credits": 500, "price": 5.00, "name": "Starter Pack"},
    "basic": {"credits": 1200, "price": 10.00, "name": "Basic Pack"},
    "pro": {"credits": 3500, "price": 25.00, "name": "Pro Pack"},
    "enterprise": {"credits": 8000, "price": 50.00, "name": "Enterprise Pack"},
}

# Default system settings
DEFAULT_SETTINGS = {
    "credits_per_1k_tokens": 10,
    "free_credits_on_signup": 100,
    "min_credits_for_chat": 5,
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

class BuildRequest(BaseModel):
    files: Dict[str, str]
    language: str = "python"
    main_file: Optional[str] = None

class PasswordResetRequest(BaseModel):
    current_password: str
    new_password: str

class AdminCreditUpdate(BaseModel):
    user_id: str
    credits: int
    operation: str  # "add" or "subtract"
    reason: str = ""

class AdminSettingsUpdate(BaseModel):
    credits_per_1k_tokens: Optional[int] = None
    free_credits_on_signup: Optional[int] = None
    min_credits_for_chat: Optional[int] = None

class CheckoutRequest(BaseModel):
    package_id: str
    origin_url: str

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

# ============== AUTH ROUTES ==============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(data: UserCreate, request: Request):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    settings = await get_system_settings()
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    
    # Get client IP
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
    user_response = UserResponse(
        id=user_id, 
        email=data.email, 
        name=data.name, 
        credits=user_doc["credits"],
        is_admin=False,
        created_at=now
    )
    
    return TokenResponse(token=token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(data: UserLogin, request: Request):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Get client IP
    client_ip = request.client.host if request.client else "unknown"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
    
    now = datetime.now(timezone.utc).isoformat()
    
    # Update login info
    await db.users.update_one(
        {"id": user["id"]},
        {
            "$set": {"last_login": now, "last_ip": client_ip},
            "$push": {"login_history": {"$each": [{"timestamp": now, "ip": client_ip}], "$slice": -50}}
        }
    )
    
    token = create_token(user["id"])
    user_response = UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        credits=user.get("credits", 0),
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )
    
    return TokenResponse(token=token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: dict = Depends(get_current_user)):
    return UserResponse(
        id=user["id"],
        email=user["email"],
        name=user["name"],
        credits=user.get("credits", 0),
        is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )

@api_router.post("/auth/reset-password")
async def reset_password(data: PasswordResetRequest, user: dict = Depends(get_current_user)):
    if not verify_password(data.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    if len(data.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(data.new_password)}}
    )
    
    return {"message": "Password updated successfully"}

# ============== USER CREDITS & PAYMENTS ==============

@api_router.get("/credits/packages")
async def get_credit_packages():
    return CREDIT_PACKAGES

@api_router.get("/credits/balance")
async def get_credit_balance(user: dict = Depends(get_current_user)):
    return {
        "credits": user.get("credits", 0),
        "total_used": user.get("total_credits_used", 0)
    }

@api_router.post("/credits/checkout")
async def create_checkout(data: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    if data.package_id not in CREDIT_PACKAGES:
        raise HTTPException(status_code=400, detail="Invalid package")
    
    package = CREDIT_PACKAGES[data.package_id]
    
    # Initialize Stripe
    webhook_url = f"{data.origin_url}/api/webhook/stripe"
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url=webhook_url)
    
    success_url = f"{data.origin_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}&payment=success"
    cancel_url = f"{data.origin_url}/dashboard?payment=cancelled"
    
    checkout_request = CheckoutSessionRequest(
        amount=package["price"],
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["id"],
            "package_id": data.package_id,
            "credits": str(package["credits"])
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    await db.payment_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "session_id": session.session_id,
        "user_id": user["id"],
        "package_id": data.package_id,
        "amount": package["price"],
        "currency": "usd",
        "credits": package["credits"],
        "status": "pending",
        "payment_status": "initiated",
        "created_at": datetime.now(timezone.utc).isoformat()
    })
    
    return {"url": session.url, "session_id": session.session_id}

@api_router.get("/credits/checkout/status/{session_id}")
async def check_payment_status(session_id: str, user: dict = Depends(get_current_user)):
    # Check if already processed
    transaction = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    if transaction.get("payment_status") == "paid":
        return {"status": "complete", "payment_status": "paid", "credits_added": transaction.get("credits", 0)}
    
    # Initialize Stripe and check status
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    status = await stripe_checkout.get_checkout_status(session_id)
    
    if status.payment_status == "paid" and transaction.get("payment_status") != "paid":
        # Add credits to user
        credits_to_add = transaction.get("credits", 0)
        await db.users.update_one(
            {"id": transaction["user_id"]},
            {"$inc": {"credits": credits_to_add}}
        )
        
        # Update transaction
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"status": "complete", "payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
        
        return {"status": "complete", "payment_status": "paid", "credits_added": credits_to_add}
    
    return {"status": status.status, "payment_status": status.payment_status}

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    signature = request.headers.get("Stripe-Signature", "")
    
    stripe_checkout = StripeCheckout(api_key=STRIPE_API_KEY, webhook_url="")
    
    try:
        event = await stripe_checkout.handle_webhook(body, signature)
        
        if event.payment_status == "paid":
            transaction = await db.payment_transactions.find_one({"session_id": event.session_id})
            if transaction and transaction.get("payment_status") != "paid":
                credits_to_add = int(event.metadata.get("credits", 0))
                user_id = event.metadata.get("user_id")
                
                await db.users.update_one(
                    {"id": user_id},
                    {"$inc": {"credits": credits_to_add}}
                )
                
                await db.payment_transactions.update_one(
                    {"session_id": event.session_id},
                    {"$set": {"status": "complete", "payment_status": "paid", "completed_at": datetime.now(timezone.utc).isoformat()}}
                )
        
        return {"received": True}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"received": True}

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
    
    # Get user's conversations
    conversations = await db.chat_history.find({"user_id": user_id}, {"_id": 0}).sort("timestamp", -1).to_list(100)
    
    # Get user's payment history
    payments = await db.payment_transactions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(50)
    
    return {
        "user": user,
        "conversations": conversations,
        "payments": payments
    }

@api_router.post("/admin/users/credits")
async def admin_update_credits(data: AdminCreditUpdate, admin: dict = Depends(get_admin_user)):
    user = await db.users.find_one({"id": data.user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    current_credits = user.get("credits", 0)
    
    if data.operation == "add":
        new_credits = current_credits + data.credits
    elif data.operation == "subtract":
        new_credits = max(0, current_credits - data.credits)
    else:
        raise HTTPException(status_code=400, detail="Invalid operation")
    
    await db.users.update_one(
        {"id": data.user_id},
        {"$set": {"credits": new_credits}}
    )
    
    # Log admin action
    await db.admin_logs.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin["id"],
        "action": f"credits_{data.operation}",
        "target_user_id": data.user_id,
        "amount": data.credits,
        "reason": data.reason,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })
    
    return {"message": f"Credits updated. New balance: {new_credits}", "new_credits": new_credits}

@api_router.get("/admin/settings")
async def admin_get_settings(admin: dict = Depends(get_admin_user)):
    settings = await get_system_settings()
    return settings

@api_router.put("/admin/settings")
async def admin_update_settings(data: AdminSettingsUpdate, admin: dict = Depends(get_admin_user)):
    update_fields = {}
    if data.credits_per_1k_tokens is not None:
        update_fields["credits_per_1k_tokens"] = data.credits_per_1k_tokens
    if data.free_credits_on_signup is not None:
        update_fields["free_credits_on_signup"] = data.free_credits_on_signup
    if data.min_credits_for_chat is not None:
        update_fields["min_credits_for_chat"] = data.min_credits_for_chat
    
    if update_fields:
        await db.settings.update_one(
            {"type": "system"},
            {"$set": update_fields},
            upsert=True
        )
    
    return await get_system_settings()

@api_router.get("/admin/stats")
async def admin_get_stats(admin: dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    total_projects = await db.projects.count_documents({})
    total_chats = await db.chat_history.count_documents({})
    total_payments = await db.payment_transactions.count_documents({"payment_status": "paid"})
    
    # Revenue calculation
    payments = await db.payment_transactions.find({"payment_status": "paid"}, {"amount": 1}).to_list(1000)
    total_revenue = sum(p.get("amount", 0) for p in payments)
    
    # Recent signups
    recent_users = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("created_at", -1).limit(5).to_list(5)
    
    return {
        "total_users": total_users,
        "total_projects": total_projects,
        "total_chats": total_chats,
        "total_payments": total_payments,
        "total_revenue": total_revenue,
        "recent_users": recent_users
    }

@api_router.get("/admin/logs")
async def admin_get_logs(admin: dict = Depends(get_admin_user)):
    logs = await db.admin_logs.find({}, {"_id": 0}).sort("timestamp", -1).limit(100).to_list(100)
    return logs

@api_router.post("/admin/make-admin/{user_id}")
async def admin_make_admin(user_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_admin": True}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User is now an admin"}

@api_router.post("/admin/remove-admin/{user_id}")
async def admin_remove_admin(user_id: str, admin: dict = Depends(get_admin_user)):
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")
    result = await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_admin": False}}
    )
    if result.modified_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "Admin status removed"}

# ============== PROJECT ROUTES ==============

@api_router.post("/projects", response_model=ProjectResponse)
async def create_project(data: ProjectCreate, user: dict = Depends(get_current_user)):
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
async def list_projects(user: dict = Depends(get_current_user)):
    projects = await db.projects.find(
        {"user_id": user["id"]},
        {"_id": 0}
    ).sort("updated_at", -1).to_list(100)
    
    return [ProjectResponse(**p) for p in projects]

@api_router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(project_id: str, user: dict = Depends(get_current_user)):
    project = await db.projects.find_one(
        {"id": project_id, "user_id": user["id"]},
        {"_id": 0}
    )
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    return ProjectResponse(**project)

@api_router.put("/projects/{project_id}", response_model=ProjectResponse)
async def update_project(project_id: str, data: ProjectUpdate, user: dict = Depends(get_current_user)):
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
async def delete_project(project_id: str, user: dict = Depends(get_current_user)):
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
async def chat_with_agent(data: ChatRequest, user: dict = Depends(get_current_user)):
    if data.agent_type not in AGENTS:
        raise HTTPException(status_code=400, detail="Invalid agent type")
    
    # Check credits
    settings = await get_system_settings()
    min_credits = settings.get("min_credits_for_chat", 5)
    user_credits = user.get("credits", 0)
    
    if user_credits < min_credits:
        raise HTTPException(status_code=402, detail=f"Insufficient credits. Need at least {min_credits} credits.")
    
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
        
        # Estimate tokens and deduct credits
        tokens_used = len(full_message.split()) + len(response.split())
        credits_per_1k = settings.get("credits_per_1k_tokens", 10)
        credits_used = max(1, int((tokens_used / 1000) * credits_per_1k))
        
        # Deduct credits
        await db.users.update_one(
            {"id": user["id"]},
            {
                "$inc": {"credits": -credits_used, "total_credits_used": credits_used}
            }
        )
        
        # Save chat history
        chat_doc = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "agent_type": data.agent_type,
            "project_id": data.project_id,
            "user_message": data.message,
            "agent_response": response,
            "tokens_used": tokens_used,
            "credits_used": credits_used,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.chat_history.insert_one(chat_doc)
        
        # Get updated credits
        updated_user = await db.users.find_one({"id": user["id"]}, {"credits": 1})
        
        return {
            "response": response, 
            "agent": agent["name"],
            "credits_used": credits_used,
            "remaining_credits": updated_user.get("credits", 0)
        }
    
    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/chat/history")
async def get_chat_history(project_id: Optional[str] = None, agent_type: Optional[str] = None, limit: int = 50, user: dict = Depends(get_current_user)):
    query = {"user_id": user["id"]}
    if project_id:
        query["project_id"] = project_id
    if agent_type:
        query["agent_type"] = agent_type
    
    history = await db.chat_history.find(query, {"_id": 0}).sort("timestamp", -1).limit(limit).to_list(limit)
    
    return history

# ============== CODE EXECUTION ==============

@api_router.post("/execute")
async def execute_code(data: CodeExecuteRequest, user: dict = Depends(get_current_user)):
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

@api_router.post("/build")
async def build_project(data: BuildRequest, user: dict = Depends(get_current_user)):
    """Build and run a complete project with multiple files"""
    supported_languages = ["python", "javascript", "typescript"]
    if data.language not in supported_languages:
        return {"output": f"Language '{data.language}' not supported for building", "error": True, "steps": []}
    
    steps = []
    temp_dir = tempfile.mkdtemp()
    
    try:
        # Step 1: Create all files
        steps.append({"step": "Creating project files", "status": "success"})
        for file_path, content in data.files.items():
            full_path = os.path.join(temp_dir, file_path)
            os.makedirs(os.path.dirname(full_path) if os.path.dirname(full_path) else temp_dir, exist_ok=True)
            with open(full_path, 'w') as f:
                f.write(content)
        
        # Step 2: Find main file
        main_file = data.main_file
        if not main_file:
            for pattern in ['main.py', 'app.py', 'index.py', 'main.js', 'index.js', 'app.js']:
                if pattern in data.files:
                    main_file = pattern
                    break
            if not main_file:
                main_file = list(data.files.keys())[0]
        
        steps.append({"step": f"Main file: {main_file}", "status": "success"})
        
        # Step 3: Execute
        steps.append({"step": "Executing project", "status": "running"})
        
        full_main_path = os.path.join(temp_dir, main_file)
        
        if data.language == "python":
            result = subprocess.run(
                [sys.executable, full_main_path],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=temp_dir,
                env={**os.environ, 'PYTHONPATH': temp_dir}
            )
        elif data.language in ["javascript", "typescript"]:
            result = subprocess.run(
                ["node", full_main_path],
                capture_output=True,
                text=True,
                timeout=30,
                cwd=temp_dir
            )
        
        output = result.stdout
        if result.stderr:
            output += "\n" + result.stderr
        
        steps[-1]["status"] = "success" if result.returncode == 0 else "error"
        
        return {
            "output": output or "Build completed (no output)",
            "error": result.returncode != 0,
            "steps": steps
        }
    
    except subprocess.TimeoutExpired:
        return {"output": "Build timed out (30s limit)", "error": True, "steps": steps}
    except Exception as e:
        return {"output": str(e), "error": True, "steps": steps}
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)

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

# ============== DOWNLOAD ==============

@api_router.get("/download/project")
async def download_project_zip():
    """Generate and serve the Neural Bridge project as a ZIP file"""
    zip_path = "/app/neural-bridge-project.zip"
    if os.path.exists(zip_path):
        return FileResponse(
            zip_path,
            media_type="application/zip",
            filename="neural-bridge-project.zip"
        )
    raise HTTPException(status_code=404, detail="Project ZIP not found")

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
