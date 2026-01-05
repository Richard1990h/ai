import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ScrollArea } from '../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { toast } from 'sonner';
import { Brain, Users, CreditCard, Settings, MessageSquare, TrendingUp, DollarSign, Activity, Clock, Globe, Plus, Minus, Shield, ChevronLeft, RefreshCw, Search, LogOut } from 'lucide-react';

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
  }, []);

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
      await axios.put(`${API}/admin/settings`, { [field]: parseInt(value) }, getAuthHeader());
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

  const filteredUsers = users.filter(u => u.name?.toLowerCase().includes(searchQuery.toLowerCase()) || u.email?.toLowerCase().includes(searchQuery.toLowerCase()));

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse-glow w-16 h-16 rounded-full bg-primary/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background grid-bg">
      <header className="glass sticky top-0 z-50 border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/dashboard">
              <Button variant="ghost" size="icon"><ChevronLeft className="w-5 h-5" /></Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-sm bg-destructive flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-xl">Admin Panel</h1>
                <p className="text-xs text-muted-foreground">Manage users, credits & settings</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="outline" size="sm" onClick={fetchData} className="gap-2">
              <RefreshCw className="w-4 h-4" /> Refresh
            </Button>
            <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/'); }}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-8 bg-card border border-border">
            <TabsTrigger value="dashboard" className="gap-2"><TrendingUp className="w-4 h-4" /> Dashboard</TabsTrigger>
            <TabsTrigger value="users" className="gap-2"><Users className="w-4 h-4" /> Users</TabsTrigger>
            <TabsTrigger value="settings" className="gap-2"><Settings className="w-4 h-4" /> Settings</TabsTrigger>
            <TabsTrigger value="logs" className="gap-2"><Activity className="w-4 h-4" /> Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <div className="bg-card border border-border rounded-sm p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-primary/10 flex items-center justify-center">
                    <Users className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_users || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Users</p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-sm p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-secondary/10 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_chats || 0}</p>
                    <p className="text-sm text-muted-foreground">Total Chats</p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-sm p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-accent/10 flex items-center justify-center">
                    <CreditCard className="w-6 h-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats?.total_payments || 0}</p>
                    <p className="text-sm text-muted-foreground">Payments</p>
                  </div>
                </div>
              </div>
              <div className="bg-card border border-border rounded-sm p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-sm bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="w-6 h-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">${stats?.total_revenue?.toFixed(2) || '0.00'}</p>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="font-bold mb-4">Recent Signups</h3>
              <div className="space-y-3">
                {stats?.recent_users?.map((u) => (
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

          <TabsContent value="users">
            <div className="flex gap-6">
              <div className="flex-1">
                <div className="mb-4 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10 bg-muted border-transparent" />
                </div>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    {filteredUsers.map((u) => (
                      <div key={u.id} onClick={() => viewUserDetails(u.id)} className={`p-4 rounded-sm cursor-pointer transition-colors ${selectedUser === u.id ? 'bg-primary/10 border border-primary/50' : 'bg-card border border-border hover:border-primary/30'}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{u.name}</p>
                              {u.is_admin && <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded">Admin</span>}
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
              {userDetails && (
                <div className="w-96 bg-card border border-border rounded-sm p-6">
                  <h3 className="font-bold mb-4">User Details</h3>
                  <div className="space-y-4">
                    <div><Label className="text-muted-foreground">Name</Label><p className="font-medium">{userDetails.user.name}</p></div>
                    <div><Label className="text-muted-foreground">Email</Label><p className="font-medium">{userDetails.user.email}</p></div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><Label className="text-muted-foreground">Credits</Label><p className="font-medium text-primary">{userDetails.user.credits || 0}</p></div>
                      <div><Label className="text-muted-foreground">Used</Label><p className="font-medium">{userDetails.user.total_credits_used || 0}</p></div>
                    </div>
                    <div><Label className="text-muted-foreground flex items-center gap-2"><Clock className="w-3 h-3" /> Last Login</Label><p className="text-sm">{formatDate(userDetails.user.last_login)}</p></div>
                    <div><Label className="text-muted-foreground flex items-center gap-2"><Globe className="w-3 h-3" /> Last IP</Label><p className="text-sm font-mono">{userDetails.user.last_ip || 'Unknown'}</p></div>
                    <div className="pt-4 border-t border-border space-y-2">
                      <Button onClick={() => setCreditDialog(true)} className="w-full gap-2 bg-primary"><CreditCard className="w-4 h-4" /> Manage Credits</Button>
                      {!userDetails.user.is_admin ? (
                        <Button onClick={() => toggleAdmin(selectedUser, true)} variant="outline" className="w-full gap-2"><Shield className="w-4 h-4" /> Make Admin</Button>
                      ) : (
                        <Button onClick={() => toggleAdmin(selectedUser, false)} variant="outline" className="w-full gap-2 text-destructive"><Shield className="w-4 h-4" /> Remove Admin</Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="max-w-xl bg-card border border-border rounded-sm p-6 space-y-6">
              <h3 className="font-bold">Credit Settings</h3>
              <div className="space-y-2">
                <Label>Credits per 1,000 tokens</Label>
                <div className="flex gap-2">
                  <Input type="number" value={settings?.credits_per_1k_tokens || 10} onChange={(e) => setSettings({ ...settings, credits_per_1k_tokens: e.target.value })} className="bg-muted border-transparent" />
                  <Button onClick={() => updateSettings('credits_per_1k_tokens', settings?.credits_per_1k_tokens)}>Save</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Free credits on signup</Label>
                <div className="flex gap-2">
                  <Input type="number" value={settings?.free_credits_on_signup || 100} onChange={(e) => setSettings({ ...settings, free_credits_on_signup: e.target.value })} className="bg-muted border-transparent" />
                  <Button onClick={() => updateSettings('free_credits_on_signup', settings?.free_credits_on_signup)}>Save</Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Minimum credits for chat</Label>
                <div className="flex gap-2">
                  <Input type="number" value={settings?.min_credits_for_chat || 5} onChange={(e) => setSettings({ ...settings, min_credits_for_chat: e.target.value })} className="bg-muted border-transparent" />
                  <Button onClick={() => updateSettings('min_credits_for_chat', settings?.min_credits_for_chat)}>Save</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="bg-card border border-border rounded-sm p-6">
              <h3 className="font-bold mb-4">Admin Activity Logs</h3>
              <ScrollArea className="h-[500px]">
                <div className="space-y-2">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No admin logs yet</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={log.id || i} className="p-3 bg-muted rounded-sm">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-medium">{log.action}</span>
                          <span className="text-xs text-muted-foreground">{formatDate(log.timestamp)}</span>
                        </div>
                        {log.reason && <p className="text-xs text-muted-foreground mt-1">{log.reason}</p>}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <Dialog open={creditDialog} onOpenChange={setCreditDialog}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Manage Credits</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Operation</Label>
              <Select value={creditOperation} onValueChange={setCreditOperation}>
                <SelectTrigger className="bg-muted border-transparent"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="add"><div className="flex items-center gap-2"><Plus className="w-4 h-4 text-green-500" /> Add Credits</div></SelectItem>
                  <SelectItem value="subtract"><div className="flex items-center gap-2"><Minus className="w-4 h-4 text-red-500" /> Subtract Credits</div></SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input type="number" placeholder="100" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className="bg-muted border-transparent" />
            </div>
            <div className="space-y-2">
              <Label>Reason (optional)</Label>
              <Input placeholder="Admin adjustment" value={creditReason} onChange={(e) => setCreditReason(e.target.value)} className="bg-muted border-transparent" />
            </div>
            <Button onClick={updateCredits} className="w-full bg-primary" disabled={!creditAmount}>
              {creditOperation === 'add' ? 'Add' : 'Subtract'} {creditAmount || 0} Credits
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPage;
