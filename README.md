<div align="center">
  <h1>WOAP</h1>
  <h3>AI-Powered No-Code Backend Platform</h3>
  <p><strong>Build production backends with conversation</strong></p>
  </br>
  <p>Chat with AI to deploy apps, create databases, and manage infrastructure - no DevOps knowledge required.</p>
</div>
<br />

## What is WOAP?

**WOAP** is an **AI-first, no-code backend platform** that makes backend development accessible to everyone. Simply describe what you need in plain English, and WOAP's AI assistant will configure, deploy, and manage your entire backend infrastructure.

Built on top of [Dokploy](https://github.com/Dokploy/dokploy) (Apache 2.0), WOAP extends the powerful self-hosted PaaS with:
- **AI Chat Interface**: Conversational backend building
- **Visual Builders**: Drag-and-drop database schemas and API design
- **Smart Templates**: Pre-built backends that AI customizes for you
- **Zero DevOps**: AI handles all infrastructure configuration

## ✨ Core Features

### AI-Powered Development
- **Conversational Building**: "Create a blog backend with user auth" → Done
- **Smart Configuration**: AI optimizes your infrastructure automatically
- **Instant Deployment**: From chat to production in minutes
- **Intelligent Suggestions**: AI recommends best practices and improvements

### Visual Tools
- **Database Designer**: Drag-and-drop schema builder
- **API Builder**: Visual REST/GraphQL endpoint creator
- **Service Architecture**: See your entire backend as a diagram
- **Real-time Preview**: Watch your backend come to life

### Inherited from Dokploy
- **Applications**: Deploy any type of application (Node.js, PHP, Python, Go, Ruby, etc.)
- **Databases**: MySQL, PostgreSQL, MongoDB, MariaDB, Redis
- **Docker Support**: Full Docker and Docker Compose integration
- **Multi-Node**: Scale with Docker Swarm clustering
- **Monitoring**: Real-time CPU, memory, storage, network metrics
- **Backups**: Automated database backups
- **SSL/TLS**: Automatic HTTPS with Let's Encrypt
- **Multi-Server**: Deploy to remote servers

## 🚀 Quick Start

### Installation

Run this on your VPS:

```bash
curl -sSL https://woap.dev/install.sh | sh
```

### First Steps

1. **Open WOAP** in your browser
2. **Chat with AI**: "I need a REST API with user authentication"
3. **Review & Deploy**: AI shows you what it will create
4. **Done**: Your backend is live and ready

### Example Conversations

```
You: "Create a blog backend"
WOAP AI: I'll set up:
  - PostgreSQL database with posts, users, comments tables
  - Node.js API with CRUD endpoints
  - JWT authentication
  - SSL certificate
  Proceed? [Yes/Customize]

You: "Add real-time comments with WebSockets"
WOAP AI: Adding Socket.io server and Redis for pub/sub...
  ✓ WebSocket server created
  ✓ Redis connected
  ✓ Real-time events configured
  Live at wss://your-domain.com
```

## 🎯 Use Cases

### For Frontend Developers
"I can build amazing UIs, but backend is overwhelming"
→ Chat your backend into existence

### For Entrepreneurs
"I have a SaaS idea but can't hire a backend team"
→ Get a production backend in 10 minutes

### For Agencies
"We need to ship client backends fast"
→ Use templates + AI customization

### For Students
"I'm learning web dev and need a backend"
→ Learn by building with AI guidance

## 📦 Smart Templates

One-click deployable backends that AI can customize:

- **Blog/CMS**: Posts, media, comments, SEO
- **E-commerce**: Products, cart, checkout, inventory
- **SaaS**: Teams, billing, workspaces, permissions
- **Social Network**: Posts, followers, likes, messaging
- **REST API**: Full CRUD with auth and rate limiting
- **Real-time Chat**: WebSockets, presence, typing indicators
- **And many more...**

## 🧠 AI Capabilities

WOAP's AI understands:
- Infrastructure setup ("add Redis for caching")
- Database design ("create a many-to-many relationship")
- Security ("enable rate limiting on auth endpoints")
- Performance ("optimize this slow query")
- Debugging ("why is my deployment failing?")
- Best practices ("make this production-ready")

## 🛠️ Technology Stack

- **Frontend**: Next.js 15 + React 18 + TypeScript
- **Backend**: Node.js + Express + tRPC
- **Database**: PostgreSQL + Drizzle ORM
- **Containers**: Docker + Docker Compose
- **Proxy**: Traefik
- **AI**: Claude (Anthropic), OpenAI, Ollama support
- **Real-time**: WebSockets + Socket.io
- **Authentication**: Better-auth + 2FA

## 📖 Documentation

Full documentation at: [docs.woap.dev](https://docs.woap.dev)

- [Getting Started Guide](https://docs.woap.dev/getting-started)
- [AI Chat Commands](https://docs.woap.dev/ai-commands)
- [Visual Builders](https://docs.woap.dev/visual-builders)
- [Templates Library](https://docs.woap.dev/templates)
- [API Reference](https://docs.woap.dev/api)

## 🤝 Contributing

WOAP is built on top of Dokploy's solid foundation. We welcome contributions!

Check out the [Contributing Guide](CONTRIBUTING.md) for more information.

## 📜 License

WOAP is licensed under Apache 2.0, same as Dokploy.

## 🙏 Attribution

WOAP is built on [Dokploy](https://github.com/Dokploy/dokploy) by [Mauricio Siu](https://github.com/Siumauricio).

We extend our deep gratitude to the Dokploy team and community for creating such a powerful foundation. WOAP aims to make their excellent platform even more accessible through AI-powered interfaces.

## 🌟 What's Next?

We're actively developing:
- Advanced visual database designer
- GraphQL API builder
- Serverless function support
- Multi-cloud deployment
- AI-powered cost optimization
- Collaborative team features

---

<div align="center">
  <p><strong>Built with Dokploy | Enhanced with AI | Made for Developers</strong></p>
  <p>Transform ideas into production backends through conversation</p>
</div>
