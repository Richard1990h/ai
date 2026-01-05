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
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Brain, ChevronLeft, Play, Download, Send, Plus, X, File, Terminal, MessageSquare, Settings, Palette, Code2, TestTube2, Bug, GitPullRequest, Building2, Shield, Gauge, FileText, RefreshCw, Rocket, Webhook, Database, Container, Users, Loader2, Trash2, Wand2, Save, Cpu, Zap, Server } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const agentIcons = { design: Palette, code: Code2, test: TestTube2, debug: Bug, review: GitPullRequest, architect: Building2, security: Shield, performance: Gauge, docs: FileText, refactor: RefreshCw, deploy: Rocket, api: Webhook, database: Database, devops: Container, ux: Users };

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
  const [building, setBuilding] = useState(false);
  const [buildLog, setBuildLog] = useState('');
  
  // LLM Settings State
  const [useLocalLLM, setUseLocalLLM] = useState(true);
  const [llmStatus, setLlmStatus] = useState(null);
  const [availableModels, setAvailableModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [temperature, setTemperature] = useState(0.7);
  const [showLLMSettings, setShowLLMSettings] = useState(false);

  useEffect(() => {
    fetchProject();
    fetchAgents();
    fetchLLMStatus();
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
      if (response.data.length > 0) setSelectedAgent(response.data[0]);
    } catch (error) {}
  };

  const fetchLLMStatus = async () => {
    try {
      const [statusRes, modelsRes] = await Promise.all([
        axios.get(`${API}/llm/status`),
        axios.get(`${API}/llm/models`)
      ]);
      setLlmStatus(statusRes.data);
      setAvailableModels(modelsRes.data.models || []);
      if (modelsRes.data.default) setSelectedModel(modelsRes.data.default);
    } catch (error) {
      setLlmStatus({ health: { status: 'offline' } });
    }
  };

  const saveProject = async () => {
    if (!project) return;
    const updatedFiles = { ...project.files };
    if (currentFile) updatedFiles[currentFile] = fileContent;
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
    const fileName = newFileName.includes('.') ? newFileName : `${newFileName}.${project?.language === 'python' ? 'py' : 'js'}`;
    const updatedFiles = { ...project.files, [fileName]: '' };
    setProject({ ...project, files: updatedFiles });
    setCurrentFile(fileName);
    setFileContent('');
    setNewFileName('');
    setShowNewFile(false);
  };

  const deleteFile = (fileName) => {
    if (Object.keys(project.files).length <= 1) { toast.error('Cannot delete the last file'); return; }
    const { [fileName]: _, ...rest } = project.files;
    setProject({ ...project, files: rest });
    const remaining = Object.keys(rest);
    setCurrentFile(remaining[0]);
    setFileContent(rest[remaining[0]]);
  };

  const executeCode = async () => {
    setExecuting(true);
    setTerminalOutput('🚀 Running...\n\n');
    setActiveTab('terminal');
    try {
      const response = await axios.post(`${API}/execute`, { code: fileContent, language: project.language }, getAuthHeader());
      setTerminalOutput(prev => prev + response.data.output + '\n\n' + (response.data.error ? '❌ Error' : '✅ Success'));
    } catch (error) {
      setTerminalOutput(prev => prev + '❌ ' + (error.response?.data?.detail || error.message));
    } finally {
      setExecuting(false);
    }
  };

  const buildProject = async () => {
    setBuilding(true);
    setBuildLog('🔨 Building...\n');
    setActiveTab('terminal');
    try {
      const updatedFiles = { ...project.files };
      if (currentFile) updatedFiles[currentFile] = fileContent;
      const response = await axios.post(`${API}/build`, { files: updatedFiles, language: project.language }, getAuthHeader());
      response.data.steps?.forEach(s => setBuildLog(prev => prev + `${s.status === 'success' ? '✅' : '❌'} ${s.step}\n`));
      setBuildLog(prev => prev + '\n📤 Output:\n' + response.data.output + '\n' + (response.data.error ? '\n❌ Failed' : '\n✅ Complete'));
    } catch (error) {
      setBuildLog(prev => prev + '\n❌ ' + error.message);
    } finally {
      setBuilding(false);
    }
  };

  const downloadProject = async () => {
    const zip = new JSZip();
    Object.entries(project.files).forEach(([path, content]) => zip.file(path, content));
    zip.file('README.md', `# ${project.name}\n${project.description || ''}\nLanguage: ${project.language}`);
    const blob = await zip.generateAsync({ type: 'blob' });
    saveAs(blob, `${project.name.toLowerCase().replace(/\s+/g, '-')}.zip`);
    toast.success('Downloaded');
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
        context: { current_file: currentFile, language: project.language },
        use_local_llm: useLocalLLM,
        model: selectedModel || undefined,
        temperature: temperature
      }, getAuthHeader());
      
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: response.data.response, 
        agent: selectedAgent.name,
        model: response.data.model,
        local: response.data.local_llm,
        credits: response.data.credits_used,
        timestamp: new Date().toISOString() 
      }]);
      
      if (response.data.warning) toast.info(response.data.warning);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to get response');
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
    }
  };

  const applyCodeFromChat = (code) => {
    setFileContent(code);
    toast.success('Code applied');
  };

  const extractCodeBlocks = (content) => {
    const regex = /```[\w]*\n([\s\S]*?)```/g;
    const blocks = [];
    let match;
    while ((match = regex.exec(content)) !== null) blocks.push(match[1].trim());
    return blocks;
  };

  const getLanguage = () => {
    const ext = currentFile?.split('.').pop();
    const map = { py: 'python', js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript', json: 'json', html: 'html', css: 'css', md: 'markdown' };
    return map[ext] || 'plaintext';
  };

  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      <header className="glass border-b border-border shrink-0">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard"><Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button></Link>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-sm bg-primary flex items-center justify-center"><Brain className="w-5 h-5 text-white" /></div>
              <div><h1 className="font-bold text-sm">{project?.name}</h1><span className="text-xs text-muted-foreground uppercase">{project?.language} • {Object.keys(project?.files || {}).length} files</span></div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={buildProject} disabled={building} className="gap-2 border-secondary text-secondary">{building ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}Build</Button>
            <Button variant="outline" size="sm" onClick={executeCode} disabled={executing} className="gap-2 border-accent text-accent">{executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}Run</Button>
            <Button variant="outline" size="sm" onClick={saveProject} className="gap-2"><Save className="w-4 h-4" />Save</Button>
            <Button variant="outline" size="sm" onClick={downloadProject} className="gap-2"><Download className="w-4 h-4" />Export</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* File Explorer */}
        <div className="w-56 border-r border-border bg-card shrink-0 flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Files</span>
            <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => setShowNewFile(!showNewFile)}><Plus className="w-4 h-4" /></Button>
          </div>
          {showNewFile && (
            <div className="p-2 border-b border-border flex gap-2">
              <Input placeholder="filename.py" value={newFileName} onChange={(e) => setNewFileName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createFile()} className="h-8 text-xs bg-muted" />
              <Button size="sm" className="h-8 px-2" onClick={createFile}><Plus className="w-4 h-4" /></Button>
            </div>
          )}
          <ScrollArea className="flex-1">
            <div className="p-2">
              {project && Object.keys(project.files).map((fileName) => (
                <div key={fileName} className={`group flex items-center justify-between px-3 py-2 rounded-sm cursor-pointer ${currentFile === fileName ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  onClick={() => { if (currentFile) setProject({ ...project, files: { ...project.files, [currentFile]: fileContent } }); setCurrentFile(fileName); setFileContent(project.files[fileName]); }}>
                  <div className="flex items-center gap-2"><File className="w-4 h-4" /><span className="text-sm truncate">{fileName}</span></div>
                  <Button variant="ghost" size="icon" className="w-6 h-6 opacity-0 group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); deleteFile(fileName); }}><Trash2 className="w-3 h-3" /></Button>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {currentFile && <div className="px-4 py-2 border-b border-border bg-muted/30"><span className="text-sm font-medium">{currentFile}</span></div>}
          <div className="flex-1"><Editor height="100%" language={getLanguage()} value={fileContent} onChange={(v) => setFileContent(v || '')} theme="vs-dark" options={{ minimap: { enabled: false }, fontSize: 14, fontFamily: "'JetBrains Mono', monospace", padding: { top: 16 } }} /></div>
        </div>

        {/* Right Panel */}
        <div className="w-96 border-l border-border bg-card shrink-0 flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-border bg-transparent p-0 h-auto">
              <TabsTrigger value="chat" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-primary py-3"><MessageSquare className="w-4 h-4 mr-2" />Chat</TabsTrigger>
              <TabsTrigger value="terminal" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-secondary py-3"><Terminal className="w-4 h-4 mr-2" />Output</TabsTrigger>
              <TabsTrigger value="settings" className="flex-1 rounded-none border-b-2 border-transparent data-[state=active]:border-accent py-3"><Settings className="w-4 h-4 mr-2" />LLM</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 flex flex-col m-0 overflow-hidden">
              {/* Agent Selector */}
              <div className="p-3 border-b border-border">
                <span className="text-xs uppercase tracking-widest text-muted-foreground block mb-2">Agent</span>
                <ScrollArea className="h-20">
                  <div className="flex flex-wrap gap-1.5">
                    {agents.map((agent) => {
                      const Icon = agentIcons[agent.id] || Code2;
                      return (
                        <button key={agent.id} onClick={() => setSelectedAgent(agent)} className={`flex items-center gap-1.5 px-2 py-1 rounded-sm text-xs ${selectedAgent?.id === agent.id ? 'bg-primary/20 text-primary ring-1 ring-primary/50' : 'bg-muted text-muted-foreground hover:text-foreground'}`}>
                          <Icon className="w-3 h-3" style={{ color: agent.color }} />{agent.name.replace(' Agent', '')}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* LLM Status Indicator */}
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {useLocalLLM ? <Cpu className="w-4 h-4 text-secondary" /> : <Zap className="w-4 h-4 text-primary" />}
                  <span className="text-xs">{useLocalLLM ? `Local: ${selectedModel || 'default'}` : 'Cloud: GPT-5.2'}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${llmStatus?.health?.status === 'online' ? 'bg-green-500' : 'bg-red-500'}`} title={llmStatus?.health?.status} />
              </div>

              {/* Chat Messages */}
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8">
                      <Wand2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground text-sm">Chat with {selectedAgent?.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">Using {useLocalLLM ? 'Local LLM' : 'Cloud AI'}</p>
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] rounded-sm p-3 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs text-secondary font-medium">{msg.agent}</span>
                            <span className="text-xs text-muted-foreground">• {msg.local ? `Local (${msg.model})` : 'Cloud'}</span>
                            {msg.credits > 0 && <span className="text-xs text-muted-foreground">• -{msg.credits} credits</span>}
                          </div>
                        )}
                        <div className="text-sm whitespace-pre-wrap">{msg.content}</div>
                        {msg.role === 'assistant' && extractCodeBlocks(msg.content).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            {extractCodeBlocks(msg.content).map((code, ci) => (
                              <Button key={ci} size="sm" variant="outline" className="text-xs gap-1 mr-1 mt-1" onClick={() => applyCodeFromChat(code)}><Code2 className="w-3 h-3" />Apply</Button>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {sending && <div className="flex justify-start"><div className="bg-muted rounded-sm p-3"><Loader2 className="w-4 h-4 animate-spin" /></div></div>}
                  <div ref={chatEndRef} />
                </div>
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-border pb-16">
                <div className="flex gap-2">
                  <Input placeholder={`Ask ${selectedAgent?.name}...`} value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()} className="bg-muted border-transparent" disabled={sending} />
                  <Button onClick={sendMessage} disabled={sending || !chatInput.trim()} className="bg-primary">{sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="terminal" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full"><div className="p-4"><pre className="text-sm text-accent whitespace-pre-wrap font-mono">{terminalOutput || buildLog || '// Output appears here'}</pre></div></ScrollArea>
            </TabsContent>

            <TabsContent value="settings" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-6">
                  <div>
                    <h3 className="font-bold mb-4 flex items-center gap-2"><Server className="w-4 h-4" /> LLM Configuration</h3>
                    
                    {/* LLM Status Card */}
                    <div className="bg-muted rounded-sm p-4 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">Server Status</span>
                        <span className={`px-2 py-0.5 rounded text-xs ${llmStatus?.health?.status === 'online' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                          {llmStatus?.health?.status || 'Unknown'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Provider: {llmStatus?.provider || 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">Host: {llmStatus?.host || 'N/A'}</p>
                      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={fetchLLMStatus}><RefreshCw className="w-3 h-3 mr-2" />Refresh Status</Button>
                    </div>

                    {/* Use Local LLM Toggle */}
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <Label>Use Local LLM</Label>
                        <p className="text-xs text-muted-foreground">Free, no credits used</p>
                      </div>
                      <Switch checked={useLocalLLM} onCheckedChange={setUseLocalLLM} />
                    </div>

                    {/* Model Selection */}
                    {useLocalLLM && (
                      <div className="space-y-4">
                        <div>
                          <Label>Model</Label>
                          <Select value={selectedModel} onValueChange={setSelectedModel}>
                            <SelectTrigger className="bg-muted border-transparent mt-1"><SelectValue placeholder="Select model" /></SelectTrigger>
                            <SelectContent className="bg-card border-border">
                              {availableModels.map(m => (<SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>))}
                              {availableModels.length === 0 && <SelectItem value="" disabled>No models found</SelectItem>}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Temperature: {temperature.toFixed(1)}</Label>
                          <p className="text-xs text-muted-foreground mb-2">Lower = more focused, Higher = more creative</p>
                          <Slider value={[temperature]} onValueChange={([v]) => setTemperature(v)} min={0} max={2} step={0.1} className="mt-2" />
                        </div>
                      </div>
                    )}

                    {!useLocalLLM && (
                      <div className="bg-primary/10 rounded-sm p-4">
                        <div className="flex items-center gap-2 mb-2"><Zap className="w-4 h-4 text-primary" /><span className="font-medium">Cloud AI (GPT-5.2)</span></div>
                        <p className="text-xs text-muted-foreground">Uses credits per request. More powerful but costs credits.</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-4">
                    <h4 className="font-medium mb-2">Setup Guide</h4>
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p><strong>Ollama:</strong> Install from ollama.ai, run `ollama serve`</p>
                      <p><strong>LM Studio:</strong> Enable local server in settings</p>
                      <p><strong>llama.cpp:</strong> Run with `--server` flag</p>
                      <p className="mt-2">Configure in backend/.env:</p>
                      <code className="block bg-muted p-2 rounded text-xs">
                        LOCAL_LLM_HOST=http://localhost<br/>
                        LOCAL_LLM_PORT=11434<br/>
                        LOCAL_LLM_MODEL=llama3.2
                      </code>
                    </div>
                  </div>
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
