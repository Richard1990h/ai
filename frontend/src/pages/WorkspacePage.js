import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import Editor from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { toast } from 'sonner';
import {
  Brain, ChevronLeft, Play, Download, Send, Plus, X,
  File, FolderOpen, Terminal, MessageSquare, Settings,
  Palette, Code2, TestTube2, Bug, GitPullRequest, Building2,
  Shield, Gauge, FileText, RefreshCw, Rocket, Webhook,
  Database, Container, Users, Loader2, Trash2
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const agentIcons = {
  design: Palette,
  code: Code2,
  test: TestTube2,
  debug: Bug,
  review: GitPullRequest,
  architect: Building2,
  security: Shield,
  performance: Gauge,
  docs: FileText,
  refactor: RefreshCw,
  deploy: Rocket,
  api: Webhook,
  database: Database,
  devops: Container,
  ux: Users,
};

const WorkspacePage = () => {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { getAuthHeader } = useAuth();
  const chatEndRef = useRef(null);
  
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [currentFile, setCurrentFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [newFileName, setNewFileName] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);

  useEffect(() => {
    fetchProject();
    fetchAgents();
  }, [projectId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const fetchProject = async () => {
    try {
      const response = await axios.get(`${API}/projects/${projectId}`, getAuthHeader());
      setProject(response.data);
      const files = Object.keys(response.data.files);
      if (files.length > 0) {
        setCurrentFile(files[0]);
        setFileContent(response.data.files[files[0]]);
      }
    } catch (error) {
      toast.error('Failed to load project');
      navigate('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchAgents = async () => {
    try {
      const response = await axios.get(`${API}/agents`);
      setAgents(response.data);
      if (response.data.length > 0) {
        setSelectedAgent(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to load agents');
    }
  };

  const saveProject = async () => {
    if (!project) return;
    
    const updatedFiles = { ...project.files };
    if (currentFile) {
      updatedFiles[currentFile] = fileContent;
    }
    
    try {
      await axios.put(`${API}/projects/${projectId}`, { files: updatedFiles }, getAuthHeader());
      setProject({ ...project, files: updatedFiles });
      toast.success('Project saved');
    } catch (error) {
      toast.error('Failed to save project');
    }
  };

  const createFile = () => {
    if (!newFileName.trim()) return;
    const fileName = newFileName.includes('.') ? newFileName : `${newFileName}.${getDefaultExtension()}`;
    const updatedFiles = { ...project.files, [fileName]: '' };
    setProject({ ...project, files: updatedFiles });
    setCurrentFile(fileName);
    setFileContent('');
    setNewFileName('');
    setShowNewFile(false);
  };

  const deleteFile = (fileName) => {
    if (Object.keys(project.files).length <= 1) {
      toast.error('Cannot delete the last file');
      return;
    }
    const { [fileName]: _, ...rest } = project.files;
    setProject({ ...project, files: rest });
    const remaining = Object.keys(rest);
    setCurrentFile(remaining[0]);
    setFileContent(rest[remaining[0]]);
  };

  const getDefaultExtension = () => {
    const extensions = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', csharp: 'cs', go: 'go' };
    return extensions[project?.language] || 'txt';
  };

  const executeCode = async () => {
    setExecuting(true);
    setTerminalOutput('Running...\n');
    setActiveTab('terminal');
    
    try {
      const response = await axios.post(`${API}/execute`, {
        code: fileContent,
        language: project.language
      }, getAuthHeader());
      
      setTerminalOutput(response.data.output);
      if (response.data.error) {
        toast.error('Execution failed');
      } else {
        toast.success('Code executed');
      }
    } catch (error) {
      setTerminalOutput('Execution error: ' + (error.response?.data?.detail || error.message));
      toast.error('Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    Object.entries(project.files).forEach(([name, content]) => {
      zip.file(name, content);
    });
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${project.name}.zip`);
    toast.success('Project downloaded');
  };

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedAgent) return;
    
    const userMessage = { role: 'user', content: chatInput, timestamp: new Date().toISOString() };
    setChatMessages([...chatMessages, userMessage]);
    setChatInput('');
    setSending(true);
    
    try {
      const response = await axios.post(`${API}/chat`, {
        agent_type: selectedAgent.id,
        message: chatInput,
        project_id: projectId,
        context: { current_file: currentFile }
      }, getAuthHeader());
      
      const agentMessage = { 
        role: 'assistant', 
        content: response.data.response, 
        agent: selectedAgent.name,
        timestamp: new Date().toISOString() 
      };
      setChatMessages(prev => [...prev, agentMessage]);
    } catch (error) {
      toast.error('Failed to get response');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const applyCodeFromChat = (code) => {
    setFileContent(code);
    toast.success('Code applied to editor');
  };

  const extractCodeBlocks = (content) => {
    const codeBlockRegex = /```[\w]*\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = codeBlockRegex.exec(content)) !== null) {
      blocks.push(match[1].trim());
    }
    return blocks;
  };

  const getLanguageForMonaco = () => {
    const map = { python: 'python', javascript: 'javascript', typescript: 'typescript', java: 'java', csharp: 'csharp', go: 'go' };
    return map[project?.language] || 'plaintext';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse-glow w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full bg-primary/40"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="glass border-b border-border shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground" data-testid="back-to-dashboard">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-sm" style={{ fontFamily: 'Unbounded' }}>{project?.name}</h1>
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{project?.language}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={executeCode}
              disabled={executing}
              className="gap-2 border-accent text-accent hover:bg-accent/10"
              data-testid="run-code-btn"
            >
              {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Run
            </Button>
            <Button variant="outline" size="sm" onClick={saveProject} className="gap-2" data-testid="save-project-btn">
              <Settings className="w-4 h-4" /> Save
            </Button>
            <Button variant="outline" size="sm" onClick={downloadProject} className="gap-2" data-testid="download-project-btn">
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Explorer */}
        <div className="w-56 border-r border-border bg-card shrink-0 flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Files</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="w-6 h-6"
              onClick={() => setShowNewFile(!showNewFile)}
              data-testid="add-file-btn"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          
          {showNewFile && (
            <div className="p-2 border-b border-border flex gap-2">
              <Input
                placeholder="filename.py"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createFile()}
                className="h-8 text-xs bg-muted border-transparent"
                data-testid="new-file-input"
              />
              <Button size="sm" className="h-8 px-2" onClick={createFile} data-testid="create-file-btn">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          )}
          
          <ScrollArea className="flex-1">
            <div className="p-2">
              {project && Object.keys(project.files).map((fileName) => (
                <div
                  key={fileName}
                  className={`group flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer transition-colors ${
                    currentFile === fileName ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => {
                    if (currentFile) {
                      setProject({ ...project, files: { ...project.files, [currentFile]: fileContent } });
                    }
                    setCurrentFile(fileName);
                    setFileContent(project.files[fileName]);
                  }}
                  data-testid={`file-${fileName}`}
                >
                  <div className="flex items-center gap-2">
                    <File className="w-4 h-4" />
                    <span className="text-sm truncate">{fileName}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-6 h-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => { e.stopPropagation(); deleteFile(fileName); }}
                    data-testid={`delete-file-${fileName}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={getLanguageForMonaco()}
              value={fileContent}
              onChange={(value) => setFileContent(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.6,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* Right Panel - Chat & Terminal */}
        <div className="w-96 border-l border-border bg-card shrink-0 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="chat" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
                data-testid="chat-tab"
              >
                <MessageSquare className="w-4 h-4 mr-2" /> Chat
              </TabsTrigger>
              <TabsTrigger 
                value="terminal" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent py-3"
                data-testid="terminal-tab"
              >
                <Terminal className="w-4 h-4 mr-2" /> Terminal
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 overflow-hidden">
              {/* Agent Selector */}
              <div className="p-3 border-b border-border">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium block mb-2">Select Agent</span>
                <ScrollArea className="h-24">
                  <div className="flex flex-wrap gap-2">
                    {agents.map((agent) => {
                      const Icon = agentIcons[agent.id] || Code2;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(agent)}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-sm text-xs transition-all ${
                            selectedAgent?.id === agent.id 
                              ? 'bg-primary/20 text-primary' 
                              : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                          style={selectedAgent?.id === agent.id ? { boxShadow: `0 0 10px ${agent.color}40` } : {}}
                          data-testid={`select-agent-${agent.id}`}
                        >
                          <Icon className="w-3 h-3" style={{ color: agent.color }} />
                          {agent.name.replace(' Agent', '')}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <MessageSquare className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-sm">
                        Start a conversation with {selectedAgent?.name || 'an agent'}
                      </p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] rounded-sm p-3 ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        {msg.role === 'assistant' && msg.agent && (
                          <span className="text-xs text-secondary block mb-1">{msg.agent}</span>
                        )}
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        {msg.role === 'assistant' && extractCodeBlocks(msg.content).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            {extractCodeBlocks(msg.content).map((code, ci) => (
                              <Button
                                key={ci}
                                size="sm"
                                variant="outline"
                                className="text-xs gap-1 mt-1 mr-1"
                                onClick={() => applyCodeFromChat(code)}
                                data-testid={`apply-code-${i}-${ci}`}
                              >
                                <Code2 className="w-3 h-3" /> Apply Code
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-border">
                <div className="flex gap-2">
                  <Input
                    placeholder={`Ask ${selectedAgent?.name || 'the agent'}...`}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    className="bg-muted border-transparent focus:border-primary"
                    disabled={sending}
                    data-testid="chat-input"
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={sending || !chatInput.trim()}
                    className="bg-primary hover:bg-primary/90"
                    data-testid="send-message-btn"
                  >
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="terminal" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <pre className="terminal-output text-sm text-accent">
                    {terminalOutput || '// Terminal output will appear here after running code'}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
