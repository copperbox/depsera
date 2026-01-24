import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { initializeDatabase } from './db';
import healthRouter from './routes/health';
import servicesRouter from './routes/services';
import teamsRouter from './routes/teams';
import usersRouter from './routes/users';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/health', healthRouter);
app.use('/api/services', servicesRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/users', usersRouter);

// Initialize database and start server
initializeDatabase();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
