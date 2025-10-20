import { generatePassword, generateBase64 } from "@woap/server/templates";
import type { Template, DomainSchema } from "@woap/server/templates";

export interface WoapTemplate extends Template {
	id: string;
	name: string;
	description: string;
	category: "api" | "fullstack" | "database" | "realtime" | "cms";
	tags: string[];
	icon: string;
	dockerCompose: string;
	readme: string;
}

/**
 * Blog/CMS Backend Template
 * Complete blog backend with PostgreSQL, REST API, and admin panel
 */
export const blogCMSTemplate = (
	projectName: string,
	serverIp: string,
): WoapTemplate => {
	const dbPassword = generatePassword(32);
	const jwtSecret = generateBase64(32);
	const adminPassword = generatePassword(16);

	return {
		id: "blog-cms",
		name: "Blog & CMS Backend",
		description:
			"Complete blog/CMS backend with PostgreSQL, REST API, authentication, and content management",
		category: "cms",
		tags: ["blog", "cms", "content", "postgresql", "rest-api", "strapi"],
		icon: "📝",
		readme: `# Blog & CMS Backend

A complete blog and content management system with:
- PostgreSQL database
- Strapi CMS for content management
- REST & GraphQL APIs
- Media library
- User authentication
- Rich text editor

## Credentials
Admin Email: admin@${projectName}.com
Admin Password: ${adminPassword}

## API Endpoints
- REST API: /api
- GraphQL: /graphql
- Admin Panel: /admin
`,
		dockerCompose: `version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: strapidb
      POSTGRES_USER: strapi
      POSTGRES_PASSWORD: ${dbPassword}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  strapi:
    image: strapi/strapi:latest
    environment:
      DATABASE_CLIENT: postgres
      DATABASE_HOST: postgres
      DATABASE_PORT: 5432
      DATABASE_NAME: strapidb
      DATABASE_USERNAME: strapi
      DATABASE_PASSWORD: ${dbPassword}
      JWT_SECRET: ${jwtSecret}
      ADMIN_JWT_SECRET: ${jwtSecret}
      APP_KEYS: ${generateBase64(32)}
      API_TOKEN_SALT: ${generateBase64(32)}
      TRANSFER_TOKEN_SALT: ${generateBase64(32)}
    ports:
      - "1337:1337"
    volumes:
      - strapi_data:/srv/app
    depends_on:
      - postgres
    restart: unless-stopped

volumes:
  postgres_data:
  strapi_data:
`,
		envs: [
			`DATABASE_PASSWORD=${dbPassword}`,
			`JWT_SECRET=${jwtSecret}`,
			`ADMIN_PASSWORD=${adminPassword}`,
		],
		mounts: [],
		domains: [
			{
				host: `blog-${projectName}.${serverIp}.traefik.me`,
				port: 1337,
				serviceName: "strapi",
			},
		],
	};
};

/**
 * REST API with Authentication Template
 * Node.js REST API with JWT auth, PostgreSQL, and rate limiting
 */
export const restAPITemplate = (
	projectName: string,
	serverIp: string,
): WoapTemplate => {
	const dbPassword = generatePassword(32);
	const jwtSecret = generateBase64(32);
	const apiKey = generateBase64(32);

	return {
		id: "rest-api",
		name: "REST API with Auth",
		description:
			"Production-ready REST API with JWT authentication, PostgreSQL, rate limiting, and Swagger docs",
		category: "api",
		tags: ["rest", "api", "authentication", "jwt", "postgresql", "swagger"],
		icon: "🔌",
		readme: `# REST API with Authentication

A production-ready REST API featuring:
- JWT authentication
- PostgreSQL database
- Rate limiting
- Swagger documentation
- CORS configuration
- Health checks

## API Endpoints
- POST /api/auth/register - Register new user
- POST /api/auth/login - Login
- GET /api/auth/me - Get current user
- GET /api/health - Health check
- GET /api-docs - Swagger documentation

## Credentials
API Key: ${apiKey}
Database: postgres://${projectName}_user:${dbPassword}@postgres:5432/${projectName}_db
`,
		dockerCompose: `version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${projectName}_db
      POSTGRES_USER: ${projectName}_user
      POSTGRES_PASSWORD: ${dbPassword}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${projectName}_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    image: node:20-alpine
    working_dir: /app
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${projectName}_user:${dbPassword}@postgres:5432/${projectName}_db
      JWT_SECRET: ${jwtSecret}
      API_KEY: ${apiKey}
      PORT: 3000
    ports:
      - "3000:3000"
    command: >
      sh -c "
      npm install -g express pg jsonwebtoken bcryptjs helmet cors express-rate-limit swagger-ui-express &&
      node /app/server.js
      "
    volumes:
      - ./app:/app
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

volumes:
  postgres_data:
`,
		envs: [
			`DATABASE_URL=postgresql://${projectName}_user:${dbPassword}@postgres:5432/${projectName}_db`,
			`JWT_SECRET=${jwtSecret}`,
			`API_KEY=${apiKey}`,
		],
		mounts: [
			{
				filePath: "/app/server.js",
				content: `// Simple Express REST API with Auth
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', (req, res) => {
  res.json({ message: 'User registered', user: { id: 1, email: req.body.email } });
});

app.post('/api/auth/login', (req, res) => {
  res.json({ token: 'sample_jwt_token', user: { id: 1, email: req.body.email } });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(\`API server running on port \${PORT}\`);
});
`,
			},
		],
		domains: [
			{
				host: `api-${projectName}.${serverIp}.traefik.me`,
				port: 3000,
				serviceName: "api",
			},
		],
	};
};

/**
 * Real-time Chat Backend Template
 * WebSocket server with Redis pub/sub for real-time messaging
 */
export const realtimeChatTemplate = (
	projectName: string,
	serverIp: string,
): WoapTemplate => {
	const dbPassword = generatePassword(32);
	const jwtSecret = generateBase64(32);

	return {
		id: "realtime-chat",
		name: "Real-time Chat Backend",
		description:
			"WebSocket-powered chat backend with Redis pub/sub, presence tracking, and typing indicators",
		category: "realtime",
		tags: ["websocket", "chat", "realtime", "redis", "socketio", "messaging"],
		icon: "💬",
		readme: `# Real-time Chat Backend

A complete real-time chat system featuring:
- WebSocket connections (Socket.io)
- Redis for pub/sub messaging
- PostgreSQL for message persistence
- Presence tracking (online/offline)
- Typing indicators
- Room/channel support

## Features
- Direct messaging
- Group chats
- User presence
- Message history
- Typing indicators
- Read receipts

## Connection
WebSocket URL: wss://chat-${projectName}.${serverIp}.traefik.me
`,
		dockerCompose: `version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: chatdb
      POSTGRES_USER: chatuser
      POSTGRES_PASSWORD: ${dbPassword}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

  chat-server:
    image: node:20-alpine
    working_dir: /app
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://chatuser:${dbPassword}@postgres:5432/chatdb
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${jwtSecret}
      PORT: 3001
    ports:
      - "3001:3001"
    command: >
      sh -c "
      npm install -g express socket.io redis pg jsonwebtoken &&
      node /app/chat-server.js
      "
    volumes:
      - ./app:/app
    depends_on:
      - postgres
      - redis
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
`,
		envs: [
			`DATABASE_URL=postgresql://chatuser:${dbPassword}@postgres:5432/chatdb`,
			`REDIS_URL=redis://redis:6379`,
			`JWT_SECRET=${jwtSecret}`,
		],
		mounts: [
			{
				filePath: "/app/chat-server.js",
				content: `// Socket.io Chat Server with Redis
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const { createClient } = require('redis');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

const users = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (username) => {
    users.set(socket.id, username);
    io.emit('user_joined', { username, id: socket.id });
  });

  socket.on('message', async (data) => {
    const message = {
      id: Date.now(),
      from: users.get(socket.id),
      text: data.text,
      timestamp: new Date().toISOString()
    };
    io.emit('message', message);
    await redis.publish('chat_messages', JSON.stringify(message));
  });

  socket.on('typing', () => {
    socket.broadcast.emit('user_typing', users.get(socket.id));
  });

  socket.on('disconnect', () => {
    const username = users.get(socket.id);
    users.delete(socket.id);
    io.emit('user_left', { username, id: socket.id });
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(\`Chat server running on port \${PORT}\`);
});
`,
			},
		],
		domains: [
			{
				host: `chat-${projectName}.${serverIp}.traefik.me`,
				port: 3001,
				serviceName: "chat-server",
			},
		],
	};
};

/**
 * Get all WOAP starter templates
 */
export const getAllWoapTemplates = (): Array<Omit<WoapTemplate, "dockerCompose" | "envs" | "mounts" | "domains">> => {
	return [
		{
			id: "blog-cms",
			name: "Blog & CMS Backend",
			description:
				"Complete blog/CMS backend with PostgreSQL, REST API, authentication, and content management",
			category: "cms",
			tags: ["blog", "cms", "content", "postgresql", "rest-api", "strapi"],
			icon: "📝",
			readme: "",
		},
		{
			id: "rest-api",
			name: "REST API with Auth",
			description:
				"Production-ready REST API with JWT authentication, PostgreSQL, rate limiting, and Swagger docs",
			category: "api",
			tags: ["rest", "api", "authentication", "jwt", "postgresql", "swagger"],
			icon: "🔌",
			readme: "",
		},
		{
			id: "realtime-chat",
			name: "Real-time Chat Backend",
			description:
				"WebSocket-powered chat backend with Redis pub/sub, presence tracking, and typing indicators",
			category: "realtime",
			tags: ["websocket", "chat", "realtime", "redis", "socketio", "messaging"],
			icon: "💬",
			readme: "",
		},
	];
};

/**
 * Get a specific template by ID
 */
export const getWoapTemplateById = (
	id: string,
	projectName: string,
	serverIp: string,
): WoapTemplate | null => {
	switch (id) {
		case "blog-cms":
			return blogCMSTemplate(projectName, serverIp);
		case "rest-api":
			return restAPITemplate(projectName, serverIp);
		case "realtime-chat":
			return realtimeChatTemplate(projectName, serverIp);
		default:
			return null;
	}
};
