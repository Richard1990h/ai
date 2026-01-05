import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { toast } from 'sonner';
import {
  Brain, Users, CreditCard, Settings, MessageSquare,
  TrendingUp, DollarSign, Activity, Clock, Globe,
  Plus, Minus, Shield, ChevronLeft, RefreshCw, Eye,
  Search, Download, LogOut
} from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const AdminPage = () => {
  const { user, logout, getAuthHeader } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [userDetails, setUserDetails] = useState(null);
  const [creditDialog, setCreditDialog] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditOperation, setCreditOperation] = useState('add');
  const [creditReason, setCreditReason] = useState('');

  useEffect(() => {
    if (!user?.is_admin) {
      navigate('/dashboard');
      return;
    }
    fetchData();
  }, [user]);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes, settingsRes, logsRes] = await Promise.all([
        axios.get(`${API}/admin/stats`, getAuthHeader()),
        axios.get(`${API}/admin/users`, getAuthHeader()),
        axios.get(`${API}/admin/settings`, getAuthHeader()),
        axios.get(`${API}/admin/logs`, getAuthHeader()),
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setSettings(settingsRes.data);
      setLogs(logsRes.data);
    } catch (error) {
      toast.error('Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  const viewUserDetails = async (userId) => {
    try {
      const response = await axios.get(`${API}/admin/users/${userId}`, getAuthHeader());
      setUserDetails(response.data);
      setSelectedUser(userId);
    } catch (error) {
      toast.error('Failed to load user details');
    }
  };

  const updateCredits = async () => {
    if (!selectedUser || !creditAmount) return;
    try {
      await axios.post(`${API}/admin/users/credits`, {
        user_id: selectedUser,
        credits: parseInt(creditAmount),
        operation: creditOperation,
        reason: creditReason
      }, getAuthHeader());
      toast.success('Credits updated');
      setCreditDialog(false);
      setCreditAmount('');
      setCreditReason('');
      fetchData();
      viewUserDetails(selectedUser);
    } catch (error) {
      toast.error('Failed to update credits');
    }
  };

  const updateSettings = async (field, value) => {
    try {
      await axios.put(`${API}/admin/settings`, {
        [field]: parseInt(value)
      }, getAuthHeader());
      setSettings({ ...settings, [field]: parseInt(value) });
      toast.success('Settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    }
  };

  const toggleAdmin = async (userId, makeAdmin) => {
    try {
      const endpoint = makeAdmin ? 'make-admin' : 'remove-admin';
      await axios.post(`${API}/admin/${endpoint}/${userId}`, {}, getAuthHeader());
      toast.success(makeAdmin ? 'User is now admin' : 'Admin status removed');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update admin status');
    }
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
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
    <div className="min-h-screen bg-background grid-bg">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon" data-testid="back-to-dashboard">
                <ChevronLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-destructive flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight" style={{ fontFamily: 'Unbounded' }}>
                  Admin Panel
                </h1>
                <p className="text-xs text-muted-foreground">Manage users, credits & settings</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/'); }} data-testid="logout-btn">
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8 bg-card border border-border">
            <TabsTrigger value="dashboard" className="gap-2" data-testid="tab-dashboard">
              <TrendingUp className="w-4 h-4" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="users" className="gap-2" data-testid="tab-users">
              <Users className="w-4 h-4" /> Users
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2" data-testid="tab-settings">
              <Settings className="w-4 h-4" /> Settings
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2" data-testid="tab-logs">
              <Activity className="w-4 h-4" /> Logs
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-sm p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-card border border-border rounded-sm p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-secondary/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_chats || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Chats</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-card border border-border rounded-sm p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-accent/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_payments || 0}</p>
                    <p className="text-sm text-muted-foreground">Payments</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-card border border-border rounded-sm p-6"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${stats?.total_revenue?.toFixed(2) || '0.00'}</p>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Recent Users */}
            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="font-bold mb-4" style={{ fontFamily: 'Unbounded' }}>Recent Signups</h3>
              <div className="space-y-3">
                {stats?.recent_users?.map((u, i) => (
                  <div key={u.id} className="flex items-center justify-between p-3 bg-muted rounded-sm">
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{u.credits} credits</p>
                      <p className="text-xs text-muted-foreground">{formatDate(u.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users">
            <div className="flex gap-6">
              {/* User List */}
              <div className="flex-1">
                <div className="mb-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-muted border-transparent"
                      data-testid="search-users"
                    />
                  </div>
                </div>

                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => viewUserDetails(u.id)}
                        className={`p-4 rounded-sm cursor-pointer transition-colors ${
                          selectedUser === u.id ? 'bg-primary/10 border border-primary/50' : 'bg-card border border-border hover:border-primary/30'
                        }`}
                        data-testid={`user-row-${u.id}`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{u.name}</p>
                              {u.is_admin && (
                                <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">Admin</span>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-primary">{u.credits || 0} credits</p>
                            <p className="text-xs text-muted-foreground">Used: {u.total_credits_used || 0}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* User Details */}
              {userDetails && (
                <div className="w-96 bg-card border border-border rounded-sm p-6">
                  <h3 className="font-bold mb-4" style={{ fontFamily: 'Unbounded' }}>User Details</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{userDetails.user.name}</p>
                    </div>
                    
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">{userDetails.user.email}</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-muted-foreground">Credits</Label>
                        <p className="font-medium text-primary">{userDetails.user.credits || 0}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Used</Label>
                        <p className="font-medium">{userDetails.user.total_credits_used || 0}</p>
                      </div>
                    </div>
                    
                    <div>
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Last Login
                      </Label>
                      <p className="text-sm">{formatDate(userDetails.user.last_login)}</p>
                    </div>
                    
                    <div>
                      <Label className="text-muted-foreground flex items-center gap-2">
                        <Globe className="w-3 h-3" /> Last IP
                      </Label>
                      <p className="text-sm font-mono">{userDetails.user.last_ip || 'Unknown'}</p>
                    </div>
                    
                    <div>
                      <Label className="text-muted-foreground">Created</Label>
                      <p className="text-sm">{formatDate(userDetails.user.created_at)}</p>
                    </div>

                    <div className="pt-4 border-t border-border space-y-2">
                      <Button 
                        onClick={() => setCreditDialog(true)}
                        className="w-full gap-2 bg-primary"
                        data-testid="manage-credits-btn"
                      >
                        <CreditCard className="w-4 h-4" /> Manage Credits
                      </Button>
                      
                      {!userDetails.user.is_admin ? (
                        <Button 
                          onClick={() => toggleAdmin(selectedUser, true)}
                          variant="outline"
                          className="w-full gap-2"
                        >
                          <Shield className="w-4 h-4" /> Make Admin
                        </Button>
                      ) : (
                        <Button 
                          onClick={() => toggleAdmin(selectedUser, false)}
                          variant="outline"
                          className="w-full gap-2 text-destructive"
                        >
                          <Shield className="w-4 h-4" /> Remove Admin
                        </Button>
                      )}
                    </div>

                    {/* Conversations */}
                    <div className="pt-4 border-t border-border">
                      <Label className="text-muted-foreground mb-2 block">
                        Recent Conversations ({userDetails.conversations?.length || 0})
                      </Label>
                      <ScrollArea className="h-40">
                        <div className="space-y-2">
                          {userDetails.conversations?.slice(0, 10).map((c, i) => (
                            <div key={c.id || i} className="p-2 bg-muted rounded text-xs">
                              <p className="text-muted-foreground">{c.agent_type} • {formatDate(c.timestamp)}</p>
                              <p className="truncate">{c.user_message}</p>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>

                    {/* Login History */}
                    <div className="pt-4 border-t border-border">
                      <Label className="text-muted-foreground mb-2 block">Login History</Label>
                      <ScrollArea className="h-32">
                        <div className="space-y-1">
                          {userDetails.user.login_history?.slice(0, 10).map((l, i) => (
                            <div key={i} className="flex justify-between text-xs p-1">
                              <span className="font-mono">{l.ip}</span>
                              <span className="text-muted-foreground">{formatDate(l.timestamp)}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <div className="max-w-xl">
              <div className="bg-card border border-border rounded-sm p-6 space-y-6">
                <h3 className="font-bold" style={{ fontFamily: 'Unbounded' }}>Credit Settings</h3>
                
                <div className="space-y-2">
                  <Label>Credits per 1,000 tokens</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={settings?.credits_per_1k_tokens || 10}
                      onChange={(e) => setSettings({ ...settings, credits_per_1k_tokens: e.target.value })}
                      className="bg-muted border-transparent"
                      data-testid="setting-credits-per-token"
                    />
                    <Button onClick={() => updateSettings('credits_per_1k_tokens', settings?.credits_per_1k_tokens)}>
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">How many credits to deduct per 1,000 tokens used</p>
                </div>

                <div className="space-y-2">
                  <Label>Free credits on signup</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={settings?.free_credits_on_signup || 100}
                      onChange={(e) => setSettings({ ...settings, free_credits_on_signup: e.target.value })}
                      className="bg-muted border-transparent"
                      data-testid="setting-free-credits"
                    />
                    <Button onClick={() => updateSettings('free_credits_on_signup', settings?.free_credits_on_signup)}>
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Credits given to new users when they register</p>
                </div>

                <div className="space-y-2">
                  <Label>Minimum credits for chat</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      value={settings?.min_credits_for_chat || 5}
                      onChange={(e) => setSettings({ ...settings, min_credits_for_chat: e.target.value })}
                      className="bg-muted border-transparent"
                      data-testid="setting-min-credits"
                    />
                    <Button onClick={() => updateSettings('min_credits_for_chat', settings?.min_credits_for_chat)}>
                      Save
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Minimum credits required to send a chat message</p>
                </div>
              </div>

              <div className="bg-card border border-border rounded-sm p-6 mt-6">
                <h3 className="font-bold mb-4" style={{ fontFamily: 'Unbounded' }}>Credit Packages</h3>
                <div className="space-y-3">
                  <div className="flex justify-between p-3 bg-muted rounded-sm">
                    <span>Starter Pack</span>
                    <span>500 credits - $5.00</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-sm">
                    <span>Basic Pack</span>
                    <span>1,200 credits - $10.00</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-sm">
                    <span>Pro Pack</span>
                    <span>3,500 credits - $25.00</span>
                  </div>
                  <div className="flex justify-between p-3 bg-muted rounded-sm">
                    <span>Enterprise Pack</span>
                    <span>8,000 credits - $50.00</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="font-bold mb-4" style={{ fontFamily: 'Unbounded' }}>Admin Activity Logs</h3>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No admin logs yet</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={log.id || i} className="p-3 bg-muted rounded-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-sm font-medium">{log.action}</span>
                            {log.target_user_id && (
                              <span className="text-xs text-muted-foreground ml-2">
                                Target: {log.target_user_id.slice(0, 8)}...
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</span>
                        </div>
                        {log.reason && <p className="text-xs text-muted-foreground mt-1">{log.reason}</p>}
                        {log.amount && <p className="text-xs text-primary">Amount: {log.amount}</p>}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Credit Management Dialog */}
      <Dialog open={creditDialog} onOpenChange={setCreditDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: 'Unbounded' }}>Manage Credits</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Operation</Label>
              <Select value={creditOperation} onValueChange={setCreditOperation}>
                <SelectTrigger className="bg-muted border-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="add">
                    <div className="flex items-center gap-2">
                      <Plus className="w-4 h-4 text-green-500" /> Add Credits
                    </div>
                  </SelectItem>
                  <SelectItem value="subtract">
                    <div className="flex items-center gap-2">
                      <Minus className="w-4 h-4 text-red-500" /> Subtract Credits
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount</Label>
              <Input
                type="number"
                placeholder="100"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="bg-muted border-transparent"
                data-testid="credit-amount-input"
              />
            </div>

            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input
                placeholder="Admin adjustment"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                className="bg-muted border-transparent"
              />
            </div>

            <Button 
              onClick={updateCredits}
              className="w-full bg-primary"
              disabled={!creditAmount}
              data-testid="update-credits-btn"
            >
              {creditOperation === 'add' ? 'Add' : 'Subtract'} {creditAmount || 0} Credits
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
