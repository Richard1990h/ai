#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime
import uuid

class NeuralBridgeAPITester:
    def __init__(self, base_url="https://llm-dev-companion.preview.emergentagent.com/api"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.project_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=30)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=30)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=30)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=30)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json() if response.content else {}
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                print(f"   Response: {response.text[:200]}...")
                return False, {}

        except requests.exceptions.Timeout:
            print(f"❌ Failed - Request timeout")
            return False, {}
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_health_check(self):
        """Test health endpoint"""
        return self.run_test("Health Check", "GET", "health", 200)

    def test_agents_list(self):
        """Test agents listing"""
        success, response = self.run_test("List Agents", "GET", "agents", 200)
        if success and isinstance(response, list) and len(response) == 15:
            print(f"   Found {len(response)} agents as expected")
            return True
        elif success:
            print(f"   Warning: Expected 15 agents, found {len(response) if isinstance(response, list) else 'invalid response'}")
        return success

    def test_register_user(self, email, password, name):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data={"email": email, "password": password, "name": name}
        )
        if success and 'token' in response and 'user' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            print(f"   Registered user: {response['user']['email']}")
            return True
        return False

    def test_login_user(self, email, password):
        """Test user login"""
        success, response = self.run_test(
            "User Login",
            "POST",
            "auth/login",
            200,
            data={"email": email, "password": password}
        )
        if success and 'token' in response and 'user' in response:
            self.token = response['token']
            self.user_id = response['user']['id']
            print(f"   Logged in user: {response['user']['email']}")
            return True
        return False

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test("Get Current User", "GET", "auth/me", 200)
        if success and 'email' in response:
            print(f"   Current user: {response['email']}")
            return True
        return False

    def test_create_project(self, name, description, language):
        """Test project creation"""
        success, response = self.run_test(
            "Create Project",
            "POST",
            "projects",
            200,
            data={"name": name, "description": description, "language": language}
        )
        if success and 'id' in response:
            self.project_id = response['id']
            print(f"   Created project: {response['name']} ({response['language']})")
            return True
        return False

    def test_list_projects(self):
        """Test project listing"""
        success, response = self.run_test("List Projects", "GET", "projects", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} projects")
            return True
        return False

    def test_get_project(self):
        """Test get specific project"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
        
        success, response = self.run_test("Get Project", "GET", f"projects/{self.project_id}", 200)
        if success and 'files' in response:
            print(f"   Project has {len(response['files'])} files")
            return True
        return False

    def test_update_project(self):
        """Test project update"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
        
        updated_files = {"main.py": "print('Updated Neural Bridge Project')"}
        success, response = self.run_test(
            "Update Project",
            "PUT",
            f"projects/{self.project_id}",
            200,
            data={"files": updated_files}
        )
        return success

    def test_code_execution(self):
        """Test code execution"""
        test_code = "print('Hello from Neural Bridge!')\nprint(2 + 2)"
        success, response = self.run_test(
            "Execute Code",
            "POST",
            "execute",
            200,
            data={"code": test_code, "language": "python"}
        )
        if success and 'output' in response:
            print(f"   Execution output: {response['output'][:50]}...")
            return True
        return False

    def test_chat_with_agent(self):
        """Test chat with AI agent"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
        
        success, response = self.run_test(
            "Chat with Agent",
            "POST",
            "chat",
            200,
            data={
                "agent_type": "code",
                "message": "Hello, can you help me with Python?",
                "project_id": self.project_id,
                "context": {"current_file": "main.py"}
            }
        )
        if success and 'response' in response:
            print(f"   Agent response: {response['response'][:50]}...")
            return True
        return False

    def test_chat_history(self):
        """Test chat history retrieval"""
        success, response = self.run_test("Get Chat History", "GET", "chat/history", 200)
        if success and isinstance(response, list):
            print(f"   Found {len(response)} chat messages")
            return True
        return False

    def test_delete_project(self):
        """Test project deletion"""
        if not self.project_id:
            print("❌ No project ID available for testing")
            return False
        
        success, response = self.run_test("Delete Project", "DELETE", f"projects/{self.project_id}", 200)
        return success

def main():
    print("🚀 Starting Neural Bridge API Tests")
    print("=" * 50)
    
    tester = NeuralBridgeAPITester()
    
    # Test basic endpoints
    tester.test_health_check()
    tester.test_agents_list()
    
    # Test user registration with new user
    test_email = "newuser2@test.com"
    test_password = "TestPass123"
    test_name = "Test User 2"
    
    print(f"\n📝 Testing with new user: {test_email}")
    if not tester.test_register_user(test_email, test_password, test_name):
        print("❌ Registration failed, trying with existing user")
        # Try with existing user
        existing_email = "test@example.com"
        existing_password = "Test123!"
        if not tester.test_login_user(existing_email, existing_password):
            print("❌ Both registration and login failed, stopping tests")
            return 1
    
    # Test authenticated endpoints
    tester.test_get_me()
    
    # Test project management
    project_name = f"Test Project {datetime.now().strftime('%H%M%S')}"
    if tester.test_create_project(project_name, "Test project for API testing", "python"):
        tester.test_list_projects()
        tester.test_get_project()
        tester.test_update_project()
        
        # Test code execution
        tester.test_code_execution()
        
        # Test chat functionality
        tester.test_chat_with_agent()
        tester.test_chat_history()
        
        # Clean up
        tester.test_delete_project()
    
    # Print results
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {tester.tests_passed}/{tester.tests_run} passed")
    
    if tester.tests_passed == tester.tests_run:
        print("🎉 All tests passed!")
        return 0
    else:
        print(f"⚠️  {tester.tests_run - tester.tests_passed} tests failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())