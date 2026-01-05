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
  File, Folder, FolderOpen, Terminal, MessageSquare, Settings,
  Palette, Code2, TestTube2, Bug, GitPullRequest, Building2,
  Shield, Gauge, FileText, RefreshCw, Rocket, Webhook,
  Database, Container, Users, Loader2, Trash2, ChevronRight,
  ChevronDown, Wand2, Save, FolderPlus, FileCode
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

// File type icons mapping
const getFileIcon = (fileName) => {
  const ext = fileName.split('.').pop().toLowerCase();
  const iconMap = {
    py: '🐍',
    js: '📜',
    jsx: '⚛️',
    ts: '💠',
    tsx: '⚛️',
    html: '🌐',
    css: '🎨',
    json: '📋',
    md: '📝',
    txt: '📄',
    java: '☕',
    cs: '🔷',
    go: '🐹',
    rs: '🦀',
    cpp: '⚙️',
    c: '⚙️',
    sql: '🗃️',
    yaml: '⚙️',
    yml: '⚙️',
    env: '🔐',
    gitignore: '📁',
  };
  return iconMap[ext] || '📄';
};

// Parse files into folder structure
const parseFileTree = (files) => {
  const tree = {};
  
  Object.keys(files).forEach(path => {
    const parts = path.split('/');
    let current = tree;
    
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        // It's a file
        current[part] = { type: 'file', path, content: files[path] };
      } else {
        // It's a folder
        if (!current[part]) {
          current[part] = { type: 'folder', children: {} };
        }
        current = current[part].children;
      }
    });
  });
  
  return tree;
};

// FileTree Component
const FileTreeNode = ({ name, node, level = 0, onSelect, selectedFile, onDelete, onAddFile }) => {
  const [expanded, setExpanded] = useState(level < 2);
  
  if (node.type === 'file') {
    return (
      <div
        className={`group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm transition-colors ${
          selectedFile === node.path ? 'bg-primary/20 text-primary' : 'hover:bg-muted text-muted-foreground hover:text-foreground'
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(node.path)}
        data-testid={`file-${node.path.replace(/\//g, '-')}`}
      >
        <span className="text-sm">{getFileIcon(name)}</span>
        <span className="text-sm truncate flex-1">{name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-5 h-5 opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    );
  }
  
  // Folder
  return (
    <div>
      <div
        className="group flex items-center gap-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {expanded ? <FolderOpen className="w-4 h-4 text-yellow-500" /> : <Folder className="w-4 h-4 text-yellow-500" />}
        <span className="text-sm font-medium flex-1">{name}</span>
        <Button
          variant="ghost"
          size="icon"
          className="w-5 h-5 opacity-0 group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onAddFile(name + '/'); }}
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      {expanded && node.children && (
        <div>
          {Object.entries(node.children)
            .sort(([, a], [, b]) => (a.type === 'folder' ? -1 : 1) - (b.type === 'folder' ? -1 : 1))
            .map(([childName, childNode]) => (
              <FileTreeNode
                key={childName}
                name={childName}
                node={childNode}
                level={level + 1}
                onSelect={onSelect}
                selectedFile={selectedFile}
                onDelete={onDelete}
                onAddFile={onAddFile}
              />
            ))}
        </div>
      )}
    </div>
  );
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
  const [newFilePath, setNewFilePath] = useState('');
  const [showNewFile, setShowNewFile] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState('');

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
    if (!newFilePath.trim()) return;
    let filePath = newFilePath;
    if (!filePath.includes('.')) {
      filePath = `${filePath}.${getDefaultExtension()}`;
    }
    const updatedFiles = { ...project.files, [filePath]: '' };
    setProject({ ...project, files: updatedFiles });
    setCurrentFile(filePath);
    setFileContent('');
    setNewFilePath('');
    setShowNewFile(false);
    toast.success(`Created ${filePath}`);
  };

  const deleteFile = (filePath) => {
    if (Object.keys(project.files).length <= 1) {
      toast.error('Cannot delete the last file');
      return;
    }
    const { [filePath]: _, ...rest } = project.files;
    setProject({ ...project, files: rest });
    const remaining = Object.keys(rest);
    setCurrentFile(remaining[0]);
    setFileContent(rest[remaining[0]]);
    toast.success(`Deleted ${filePath}`);
  };

  const selectFile = (filePath) => {
    if (currentFile && project.files[currentFile] !== fileContent) {
      setProject({ ...project, files: { ...project.files, [currentFile]: fileContent } });
    }
    setCurrentFile(filePath);
    setFileContent(project.files[filePath]);
  };

  const getDefaultExtension = () => {
    const extensions = { python: 'py', javascript: 'js', typescript: 'ts', java: 'java', csharp: 'cs', go: 'go' };
    return extensions[project?.language] || 'txt';
  };

  const executeCode = async () => {
    setExecuting(true);
    setTerminalOutput('🚀 Running...\n\n');
    setActiveTab('terminal');
    
    try {
      const response = await axios.post(`${API}/execute`, {
        code: fileContent,
        language: project.language
      }, getAuthHeader());
      
      const output = response.data.output || 'No output';
      setTerminalOutput(prev => prev + output + '\n\n' + (response.data.error ? '❌ Exit with error' : '✅ Completed successfully'));
      
      if (response.data.error) {
        toast.error('Execution failed');
      } else {
        toast.success('Code executed');
      }
    } catch (error) {
      setTerminalOutput(prev => prev + '❌ Error: ' + (error.response?.data?.detail || error.message));
      toast.error('Execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const buildProject = async () => {
    setBuilding(true);
    setBuildLog('🔨 Building project...\n\n');
    setTerminalOutput('');
    setActiveTab('terminal');
    
    try {
      // Save current file first
      const updatedFiles = { ...project.files };
      if (currentFile) {
        updatedFiles[currentFile] = fileContent;
      }
      
      setBuildLog(prev => prev + '📦 Preparing files...\n');
      
      const response = await axios.post(`${API}/build`, {
        files: updatedFiles,
        language: project.language
      }, getAuthHeader());
      
      // Show build steps
      if (response.data.steps) {
        response.data.steps.forEach(step => {
          const icon = step.status === 'success' ? '✅' : step.status === 'error' ? '❌' : '⏳';
          setBuildLog(prev => prev + `${icon} ${step.step}\n`);
        });
      }
      
      setBuildLog(prev => prev + '\n📤 Output:\n' + (response.data.output || 'No output') + '\n');
      
      if (response.data.error) {
        setBuildLog(prev => prev + '\n❌ Build failed');
        toast.error('Build failed');
      } else {
        setBuildLog(prev => prev + '\n✅ Build completed successfully!');
        toast.success('Build completed');
      }
    } catch (error) {
      setBuildLog(prev => prev + '\n❌ Build error: ' + (error.response?.data?.detail || error.message));
      toast.error('Build failed');
    } finally {
      setBuilding(false);
    }
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    
    // Add all files preserving folder structure
    Object.entries(project.files).forEach(([path, content]) => {
      zip.file(path, content);
    });
    
    // Add README
    const readme = `# ${project.name}

${project.description || 'A Neural Bridge project'}

## Language
${project.language}

## Files
${Object.keys(project.files).map(f => '- ' + f).join('\n')}

## Getting Started
1. Install dependencies for your language
2. Run the main file

Generated by Neural Bridge AI Coding Platform
`;
    zip.file('README.md', readme);
    
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${project.name.toLowerCase().replace(/\s+/g, '-')}.zip`);
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
        context: { 
          current_file: currentFile,
          all_files: Object.keys(project.files),
          language: project.language
        }
      }, getAuthHeader());
      
      const agentMessage = { 
        role: 'assistant', 
        content: response.data.response, 
        agent: selectedAgent.name,
        timestamp: new Date().toISOString() 
      };
      setChatMessages(prev => [...prev, agentMessage]);
      
      // Auto-apply files if agent generated them
      const generatedFiles = extractGeneratedFiles(response.data.response);
      if (generatedFiles.length > 0) {
        toast.info(`${generatedFiles.length} file(s) ready to apply`);
      }
    } catch (error) {
      toast.error('Failed to get response');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
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

  const extractGeneratedFiles = (content) => {
    // Look for file patterns like "filename.ext:" or "# filename.ext"
    const filePattern = /(?:^|\n)(?:#+\s*)?(\S+\.\w+)(?:\s*:|\s*\n```)/g;
    const files = [];
    let match;
    while ((match = filePattern.exec(content)) !== null) {
      files.push(match[1]);
    }
    return files;
  };

  const applyCodeFromChat = (code, fileName = null) => {
    if (fileName) {
      // Create new file with this code
      const updatedFiles = { ...project.files, [fileName]: code };
      setProject({ ...project, files: updatedFiles });
      setCurrentFile(fileName);
      setFileContent(code);
      toast.success(`Created ${fileName}`);
    } else {
      setFileContent(code);
      toast.success('Code applied to editor');
    }
  };

  const applyAllCodeFromMessage = (content) => {
    // Extract all code blocks with their file names
    const fileCodeRegex = /(?:^|\n)(?:#+\s*)?(\S+\.\w+)\s*\n```[\w]*\n([\s\S]*?)```/g;
    let match;
    let count = 0;
    const updatedFiles = { ...project.files };
    
    while ((match = fileCodeRegex.exec(content)) !== null) {
      const fileName = match[1];
      const code = match[2].trim();
      updatedFiles[fileName] = code;
      count++;
    }
    
    if (count > 0) {
      setProject({ ...project, files: updatedFiles });
      toast.success(`Applied ${count} file(s) to project`);
    } else {
      // Just apply first code block to current file
      const blocks = extractCodeBlocks(content);
      if (blocks.length > 0) {
        setFileContent(blocks[0]);
        toast.success('Code applied to current file');
      }
    }
  };

  const getLanguageForMonaco = () => {
    const map = { python: 'python', javascript: 'javascript', typescript: 'typescript', java: 'java', csharp: 'csharp', go: 'go' };
    const ext = currentFile?.split('.').pop();
    const extMap = { py: 'python', js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', java: 'java', cs: 'csharp', go: 'go', json: 'json', html: 'html', css: 'css', md: 'markdown' };
    return extMap[ext] || map[project?.language] || 'plaintext';
  };

  const fileTree = project ? parseFileTree(project.files) : {};

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
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{project?.language} • {Object.keys(project?.files || {}).length} files</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={buildProject}
              disabled={building}
              className="gap-2 border-secondary text-secondary hover:bg-secondary/10"
              data-testid="build-project-btn"
            >
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              Build
            </Button>
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
              <Save className="w-4 h-4" /> Save
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
        <div className="w-64 border-r border-border bg-card shrink-0 flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium">Explorer</span>
            <div className="flex gap-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-6 h-6"
                onClick={() => { setShowNewFile(true); setNewFilePath(''); }}
                data-testid="add-file-btn"
                title="New File"
              >
                <FileCode className="w-4 h-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-6 h-6"
                onClick={() => { setShowNewFile(true); setNewFilePath('newfolder/'); }}
                data-testid="add-folder-btn"
                title="New Folder"
              >
                <FolderPlus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          {showNewFile && (
            <div className="p-2 border-b border-border">
              <div className="flex gap-2">
                <Input
                  placeholder="path/to/file.py"
                  value={newFilePath}
                  onChange={(e) => setNewFilePath(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createFile()}
                  className="h-8 text-xs bg-muted border-transparent"
                  data-testid="new-file-input"
                  autoFocus
                />
                <Button size="sm" className="h-8 px-2" onClick={createFile} data-testid="create-file-btn">
                  <Plus className="w-4 h-4" />
                </Button>
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setShowNewFile(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
          
          <ScrollArea className="flex-1">
            <div className="py-2">
              {Object.entries(fileTree)
                .sort(([, a], [, b]) => (a.type === 'folder' ? -1 : 1) - (b.type === 'folder' ? -1 : 1))
                .map(([name, node]) => (
                  <FileTreeNode
                    key={name}
                    name={name}
                    node={node}
                    onSelect={selectFile}
                    selectedFile={currentFile}
                    onDelete={deleteFile}
                    onAddFile={(prefix) => { setShowNewFile(true); setNewFilePath(prefix); }}
                  />
                ))}
            </div>
          </ScrollArea>
          
          <div className="p-3 border-t border-border text-xs text-muted-foreground">
            {Object.keys(project?.files || {}).length} files
          </div>
        </div>

        {/* Code Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentFile && (
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-2">
              <span className="text-sm">{getFileIcon(currentFile)}</span>
              <span className="text-sm font-medium">{currentFile}</span>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={getLanguageForMonaco()}
              value={fileContent}
              onChange={(value) => setFileContent(value || '')}
              theme="vs-dark"
              options={{
                minimap: { enabled: true },
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                lineHeight: 1.6,
                padding: { top: 16 },
                scrollBeyondLastLine: false,
                automaticLayout: true,
                wordWrap: 'on',
              }}
            />
          </div>
        </div>

        {/* Right Panel - Chat & Terminal */}
        <div className="w-[420px] border-l border-border bg-card shrink-0 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0 h-auto">
              <TabsTrigger 
                value="chat" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3"
                data-testid="chat-tab"
              >
                <MessageSquare className="w-4 h-4 mr-2" /> AI Chat
              </TabsTrigger>
              <TabsTrigger 
                value="terminal" 
                className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent py-3"
                data-testid="terminal-tab"
              >
                <Terminal className="w-4 h-4 mr-2" /> Output
              </TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 overflow-hidden">
              {/* Agent Selector */}
              <div className="p-3 border-b border-border">
                <span className="text-xs uppercase tracking-widest text-muted-foreground font-medium block mb-2">Select Agent</span>
                <ScrollArea className="h-20">
                  <div className="flex flex-wrap gap-1.5">
                    {agents.map((agent) => {
                      const Icon = agentIcons[agent.id] || Code2;
                      return (
                        <button
                          key={agent.id}
                          onClick={() => setSelectedAgent(agent)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs transition-all ${
                            selectedAgent?.id === agent.id 
                              ? 'bg-primary/20 text-primary ring-1 ring-primary/50' 
                              : 'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80'
                          }`}
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
                        <Wand2 className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <p className="text-muted-foreground text-sm mb-2">
                        Chat with {selectedAgent?.name || 'an agent'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Try: "Create a complete REST API" or "Build a calculator app"
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
                      <div className={`max-w-[90%] rounded-sm p-3 ${
                        msg.role === 'user' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted'
                      }`}>
                        {msg.role === 'assistant' && msg.agent && (
                          <span className="text-xs text-secondary block mb-1 font-medium">{msg.agent}</span>
                        )}
                        <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>
                        {msg.role === 'assistant' && extractCodeBlocks(msg.content).length > 0 && (
                          <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-xs gap-1 h-7"
                              onClick={() => applyAllCodeFromMessage(msg.content)}
                              data-testid={`apply-all-code-${i}`}
                            >
                              <Wand2 className="w-3 h-3" /> Apply All
                            </Button>
                            {extractCodeBlocks(msg.content).map((code, ci) => (
                              <Button
                                key={ci}
                                size="sm"
                                variant="ghost"
                                className="text-xs gap-1 h-7"
                                onClick={() => applyCodeFromChat(code)}
                                data-testid={`apply-code-${i}-${ci}`}
                              >
                                <Code2 className="w-3 h-3" /> Block {ci + 1}
                              </Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {sending && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-sm p-3">
                        <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-border pb-16">
                <div className="flex gap-2">
                  <Input
                    placeholder={`Ask ${selectedAgent?.name || 'the agent'} to build something...`}
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

            <TabsContent value="terminal" className="flex-1 m-0 overflow-hidden flex flex-col">
              <ScrollArea className="flex-1">
                <div className="p-4">
                  <pre className="terminal-output text-sm text-accent whitespace-pre-wrap">
                    {terminalOutput || buildLog || '// Run or Build your project to see output here\n\n💡 Tips:\n- Click "Run" to execute the current file\n- Click "Build" to build and run the entire project\n- Use AI agents to generate complete applications'}
                  </pre>
                </div>
              </ScrollArea>
              <div className="p-2 border-t border-border flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setTerminalOutput(''); setBuildLog(''); }}>
                  Clear
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;
