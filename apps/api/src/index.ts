import express from 'express';
import mongoose from 'mongoose';
import organizationRoutes from './routes/organization';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(bodyParser.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/dokploy', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Mount organization routes
app.use('/api/organizations', organizationRoutes);

// Basic health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
