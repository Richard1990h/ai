import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '../components/ui/button';
import { 
  Code2, Palette, Bug, TestTube2, Shield, Rocket, 
  Database, Users, GitPullRequest, FileText, Gauge,
  RefreshCw, Webhook, Building2, Container, ArrowRight,
  Zap, Brain, Terminal
} from 'lucide-react';

const agents = [
  { icon: Palette, name: "Design", color: "#8B5CF6" },
  { icon: Code2, name: "Code", color: "#06B6D4" },
  { icon: TestTube2, name: "Test", color: "#10B981" },
  { icon: Bug, name: "Debug", color: "#F59E0B" },
  { icon: GitPullRequest, name: "Review", color: "#EC4899" },
  { icon: Building2, name: "Architect", color: "#6366F1" },
  { icon: Shield, name: "Security", color: "#EF4444" },
  { icon: Gauge, name: "Performance", color: "#F97316" },
  { icon: FileText, name: "Docs", color: "#14B8A6" },
  { icon: RefreshCw, name: "Refactor", color: "#8B5CF6" },
  { icon: Rocket, name: "Deploy", color: "#06B6D4" },
  { icon: Webhook, name: "API", color: "#10B981" },
  { icon: Database, name: "Database", color: "#F59E0B" },
  { icon: Container, name: "DevOps", color: "#EC4899" },
  { icon: Users, name: "UX", color: "#6366F1" },
];

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background grid-bg">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="nav-logo">
            <div className="w-10 h-10 rounded-sm bg-primary flex items-center justify-center">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight" style={{ fontFamily: 'Unbounded' }}>
              NEURAL BRIDGE
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground" data-testid="nav-login-btn">
                Login
              </Button>
            </Link>
            <Link to="/register">
              <Button className="bg-primary hover:bg-primary/90 btn-glow" data-testid="nav-register-btn">
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="text-xs uppercase tracking-widest text-primary font-medium mb-4 block">
                AI-Powered Development Platform
              </span>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight leading-none mb-6" style={{ fontFamily: 'Unbounded' }}>
                Build Complete
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">
                  Projects with AI
                </span>
              </h1>
              <p className="text-lg text-muted-foreground mb-8 max-w-lg leading-relaxed">
                15 specialized AI agents work together to design, code, test, debug, 
                and deploy your projects. Like having a full development team at your fingertips.
              </p>
              <div className="flex flex-wrap gap-4">
                <Link to="/register">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 btn-glow gap-2" data-testid="hero-cta-btn">
                    Start Building <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <Button size="lg" variant="outline" className="border-border hover:bg-muted gap-2" data-testid="hero-demo-btn">
                  <Terminal className="w-4 h-4" /> Watch Demo
                </Button>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-sm overflow-hidden border border-border">
                <img 
                  src="https://images.unsplash.com/photo-1605764949006-10d0e9e1437c?crop=entropy&cs=srgb&fm=jpg&q=85&w=800"
                  alt="Neural Network"
                  className="w-full h-auto opacity-80"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent"></div>
                <div className="absolute bottom-6 left-6 right-6">
                  <div className="glass rounded-sm p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-3 h-3 rounded-full bg-accent animate-pulse"></div>
                      <span className="text-sm text-accent font-medium">AI Agents Active</span>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {agents.slice(0, 6).map((agent, i) => (
                        <div 
                          key={i}
                          className="w-8 h-8 rounded-sm flex items-center justify-center"
                          style={{ backgroundColor: `${agent.color}20` }}
                        >
                          <agent.icon className="w-4 h-4" style={{ color: agent.color }} />
                        </div>
                      ))}
                      <div className="w-8 h-8 rounded-sm bg-muted flex items-center justify-center text-xs text-muted-foreground">
                        +9
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Agents Grid */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-xs uppercase tracking-widest text-secondary font-medium mb-4 block">
              Meet Your Team
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight" style={{ fontFamily: 'Unbounded' }}>
              15 Specialized AI Agents
            </h2>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-5 gap-4">
            {agents.map((agent, i) => (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.05 }}
                className="group relative bg-card border border-border rounded-sm p-4 hover:border-primary/50 transition-all duration-300 cursor-pointer"
                data-testid={`agent-card-${agent.name.toLowerCase()}`}
              >
                <div 
                  className="w-12 h-12 rounded-sm flex items-center justify-center mb-3 transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${agent.color}15` }}
                >
                  <agent.icon className="w-6 h-6" style={{ color: agent.color }} />
                </div>
                <h3 className="font-medium text-sm">{agent.name}</h3>
                <div 
                  className="absolute inset-0 rounded-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                  style={{ boxShadow: `0 0 30px ${agent.color}20` }}
                />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-3 gap-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="bg-card border border-border rounded-sm p-8"
            >
              <div className="w-14 h-14 rounded-sm bg-primary/10 flex items-center justify-center mb-6">
                <Zap className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Unbounded' }}>Real-Time Execution</h3>
              <p className="text-muted-foreground leading-relaxed">
                Run and test your code directly in the browser. See results instantly with our sandboxed execution environment.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="bg-card border border-border rounded-sm p-8"
            >
              <div className="w-14 h-14 rounded-sm bg-secondary/10 flex items-center justify-center mb-6">
                <Users className="w-7 h-7 text-secondary" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Unbounded' }}>Multi-User Support</h3>
              <p className="text-muted-foreground leading-relaxed">
                Collaborate with your team in real-time. Multiple users can work on projects simultaneously.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="bg-card border border-border rounded-sm p-8"
            >
              <div className="w-14 h-14 rounded-sm bg-accent/10 flex items-center justify-center mb-6">
                <Code2 className="w-7 h-7 text-accent" />
              </div>
              <h3 className="text-xl font-bold mb-3" style={{ fontFamily: 'Unbounded' }}>All Languages</h3>
              <p className="text-muted-foreground leading-relaxed">
                Support for Python, JavaScript, TypeScript, Java, C#, Go, and more. Build in any language you prefer.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-6" style={{ fontFamily: 'Unbounded' }}>
            Ready to Build?
          </h2>
          <p className="text-lg text-muted-foreground mb-8">
            Join developers who are building faster with AI-powered development.
          </p>
          <Link to="/register">
            <Button size="lg" className="bg-primary hover:bg-primary/90 btn-glow gap-2" data-testid="cta-get-started-btn">
              Get Started Free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-sm text-muted-foreground">
          <span>© 2024 Neural Bridge. All rights reserved.</span>
          <div className="flex items-center gap-1">
            <span>Powered by</span>
            <Brain className="w-4 h-4 text-primary" />
            <span className="text-primary">GPT-5.2</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
