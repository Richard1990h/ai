import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { toast } from 'sonner';
import { 
  Brain, Plus, Folder, MoreVertical, Trash2, LogOut,
  Code2, Clock, ChevronRight, Search, CreditCard, Settings,
  Shield, Key, Coins, Download, Loader2, Check
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const languages = [
  { value: 'python', label: 'Python' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'java', label: 'Java' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
];

const creditPackages = {
  starter: { credits: 500, price: 5.00, name: "Starter Pack" },
  basic: { credits: 1200, price: 10.00, name: "Basic Pack" },
  pro: { credits: 3500, price: 25.00, name: "Pro Pack" },
  enterprise: { credits: 8000, price: 50.00, name: "Enterprise Pack" },
};

const DashboardPage = () => {
  const { user, logout, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creditsDialogOpen, setCreditsDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    language: 'python',
  });
  const [creating, setCreating] = useState(false);
  const [credits, setCredits] = useState(0);
  const [purchasing, setPurchasing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    fetchProjects();
    fetchCredits();
    
    // Check for payment callback
    const sessionId = searchParams.get('session_id');
    const payment = searchParams.get('payment');
    
    if (sessionId && payment === 'success') {
      checkPaymentStatus(sessionId);
    } else if (payment === 'cancelled') {
      toast.info('Payment cancelled');
    }
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await axios.get(`${API}/projects`, getAuthHeader());
      setProjects(response.data);
    } catch (error) {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const fetchCredits = async () => {
    try {
      const response = await axios.get(`${API}/credits/balance`, getAuthHeader());
      setCredits(response.data.credits);
    } catch (error) {
      console.error('Failed to fetch credits');
    }
  };

  const checkPaymentStatus = async (sessionId) => {
    try {
      const response = await axios.get(`${API}/credits/checkout/status/${sessionId}`, getAuthHeader());
      if (response.data.payment_status === 'paid') {
        toast.success(`Payment successful! ${response.data.credits_added} credits added.`);
        fetchCredits();
      }
    } catch (error) {
      console.error('Payment status check failed');
    }
    // Clean URL
    window.history.replaceState({}, '', '/dashboard');
  };

  const createProject = async () => {
    if (!newProject.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setCreating(true);
    try {
      const response = await axios.post(`${API}/projects`, newProject, getAuthHeader());
      setProjects([response.data, ...projects]);
      setDialogOpen(false);
      setNewProject({ name: '', description: '', language: 'python' });
      toast.success('Project created!');
      navigate(`/workspace/${response.data.id}`);
    } catch (error) {
      toast.error('Failed to create project');
    } finally {
      setCreating(false);
    }
  };

  const deleteProject = async (projectId) => {
    try {
      await axios.delete(`${API}/projects/${projectId}`, getAuthHeader());
      setProjects(projects.filter(p => p.id !== projectId));
      toast.success('Project deleted');
    } catch (error) {
      toast.error('Failed to delete project');
    }
  };

  const purchaseCredits = async (packageId) => {
    setPurchasing(true);
    try {
      const response = await axios.post(`${API}/credits/checkout`, {
        package_id: packageId,
        origin_url: window.location.origin
      }, getAuthHeader());
      
      // Redirect to Stripe checkout
      window.location.href = response.data.url;
    } catch (error) {
      toast.error('Failed to initiate checkout');
      setPurchasing(false);
    }
  };

  const resetPassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setResettingPassword(true);
    try {
      await axios.post(`${API}/auth/reset-password`, {
        current_password: currentPassword,
        new_password: newPassword
      }, getAuthHeader());
      toast.success('Password updated successfully');
      setPasswordDialogOpen(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update password');
    } finally {
      setResettingPassword(false);
    }
  };

  const downloadProject = async () => {
    try {
      const response = await axios.get(`${API}/download/project`, {
        ...getAuthHeader(),
        responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'neural-bridge-project.zip');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Download started!');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3" data-testid="dashboard-logo">
            <div className="w-10 h-10 rounded-sm bg-primary flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight" style={{ fontFamily: 'Unbounded' }}>
              NEURAL BRIDGE
            </span>
          </Link>

          <div className="flex items-center gap-4">
            {/* Credits Display */}
            <Button 
              variant="outline" 
              className="gap-2 border-primary/50"
              onClick={() => setCreditsDialogOpen(true)}
              data-testid="credits-btn"
            >
              <Coins className="w-4 h-4 text-primary" />
              <span className="font-bold text-primary">{credits}</span>
              <span className="text-muted-foreground">credits</span>
            </Button>

            {/* Download Button */}
            <Button 
              variant="outline" 
              size="icon"
              onClick={downloadProject}
              title="Download Neural Bridge"
              data-testid="download-btn"
            >
              <Download className="w-4 h-4" />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="user-menu-btn">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.email}</p>
                  </div>
                  <Settings className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card border-border">
                <DropdownMenuItem onClick={() => setCreditsDialogOpen(true)} className="cursor-pointer">
                  <CreditCard className="w-4 h-4 mr-2" /> Buy Credits
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setPasswordDialogOpen(true)} className="cursor-pointer">
                  <Key className="w-4 h-4 mr-2" /> Change Password
                </DropdownMenuItem>
                {user?.is_admin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer text-destructive">
                      <Shield className="w-4 h-4 mr-2" /> Admin Panel
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { logout(); navigate('/'); }} className="cursor-pointer">
                  <LogOut className="w-4 h-4 mr-2" /> Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Unbounded' }}>
              Your Projects
            </h1>
            <p className="text-muted-foreground mt-1">
              {projects.length} project{projects.length !== 1 ? 's' : ''}
            </p>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-muted border-transparent focus:border-primary"
                data-testid="search-projects-input"
              />
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-primary hover:bg-primary/90 btn-glow gap-2" data-testid="new-project-btn">
                  <Plus className="w-4 h-4" />
                  <span className="hidden sm:inline">New Project</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle style={{ fontFamily: 'Unbounded' }}>Create New Project</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Project Name</Label>
                    <Input
                      placeholder="My Awesome Project"
                      value={newProject.name}
                      onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                      className="bg-muted border-transparent focus:border-primary"
                      data-testid="project-name-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description (optional)</Label>
                    <Input
                      placeholder="A brief description..."
                      value={newProject.description}
                      onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                      className="bg-muted border-transparent focus:border-primary"
                      data-testid="project-description-input"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Language</Label>
                    <Select 
                      value={newProject.language} 
                      onValueChange={(value) => setNewProject({ ...newProject, language: value })}
                    >
                      <SelectTrigger className="bg-muted border-transparent" data-testid="project-language-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border">
                        {languages.map(lang => (
                          <SelectItem key={lang.value} value={lang.value}>
                            {lang.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button 
                    onClick={createProject} 
                    className="w-full bg-primary hover:bg-primary/90"
                    disabled={creating}
                    data-testid="create-project-btn"
                  >
                    {creating ? 'Creating...' : 'Create Project'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card border border-border rounded-sm p-6 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/2 mb-4"></div>
                <div className="h-3 bg-muted rounded w-3/4 mb-6"></div>
                <div className="h-3 bg-muted rounded w-1/4"></div>
              </div>
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-20"
          >
            <div className="w-20 h-20 rounded-sm bg-muted flex items-center justify-center mx-auto mb-6">
              <Folder className="w-10 h-10 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ fontFamily: 'Unbounded' }}>
              {searchQuery ? 'No projects found' : 'No projects yet'}
            </h3>
            <p className="text-muted-foreground mb-6">
              {searchQuery ? 'Try a different search term' : 'Create your first project to get started'}
            </p>
            {!searchQuery && (
              <Button 
                onClick={() => setDialogOpen(true)}
                className="bg-primary hover:bg-primary/90 btn-glow gap-2"
                data-testid="empty-new-project-btn"
              >
                <Plus className="w-4 h-4" /> Create Project
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project, i) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group bg-card border border-border rounded-sm p-6 hover:border-primary/50 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-sm bg-secondary/10 flex items-center justify-center">
                      <Code2 className="w-5 h-5 text-secondary" />
                    </div>
                    <div>
                      <h3 className="font-medium group-hover:text-primary transition-colors">
                        {project.name}
                      </h3>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        {project.language}
                      </span>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition-opacity" data-testid={`project-menu-${project.id}`}>
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem 
                        onClick={() => deleteProject(project.id)}
                        className="text-destructive focus:text-destructive cursor-pointer"
                        data-testid={`delete-project-${project.id}`}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {project.description || 'No description'}
                </p>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {formatDate(project.updated_at)}
                  </div>
                  <Link to={`/workspace/${project.id}`}>
                    <Button variant="ghost" size="sm" className="gap-1 text-primary hover:text-primary" data-testid={`open-project-${project.id}`}>
                      Open <ChevronRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>

      {/* Credits Dialog */}
      <Dialog open={creditsDialogOpen} onOpenChange={setCreditsDialogOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Unbounded' }}>Buy Credits</DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <div className="text-center mb-6 p-4 bg-muted rounded-sm">
              <p className="text-sm text-muted-foreground">Current Balance</p>
              <p className="text-3xl font-bold text-primary">{credits}</p>
              <p className="text-sm text-muted-foreground">credits</p>
            </div>

            <div className="space-y-3">
              {Object.entries(creditPackages).map(([id, pkg]) => (
                <div
                  key={id}
                  className="flex items-center justify-between p-4 bg-muted rounded-sm hover:bg-muted/80 transition-colors"
                >
                  <div>
                    <p className="font-medium">{pkg.name}</p>
                    <p className="text-sm text-muted-foreground">{pkg.credits.toLocaleString()} credits</p>
                  </div>
                  <Button
                    onClick={() => purchaseCredits(id)}
                    disabled={purchasing}
                    className="bg-primary hover:bg-primary/90"
                    data-testid={`buy-${id}`}
                  >
                    {purchasing ? <Loader2 className="w-4 h-4 animate-spin" /> : `$${pkg.price.toFixed(2)}`}
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground text-center mt-4">
              Powered by Stripe • Secure payments
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Unbounded' }}>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="bg-muted border-transparent"
                data-testid="current-password-input"
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="bg-muted border-transparent"
                data-testid="new-password-input"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="bg-muted border-transparent"
                data-testid="confirm-password-input"
              />
              {newPassword && confirmPassword && newPassword === confirmPassword && (
                <p className="text-xs text-green-500 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>
            <Button 
              onClick={resetPassword}
              className="w-full bg-primary hover:bg-primary/90"
              disabled={resettingPassword || !currentPassword || !newPassword || !confirmPassword}
              data-testid="reset-password-btn"
            >
              {resettingPassword ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DashboardPage;
