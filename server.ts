import app from './src/app';
import { config } from './src/config/config';
import logger from './src/config/logger';
import connectDB from './src/db';
import { startJobs } from './src/jobs/scheduler';

const startServer = async () => {
  // Connect to the database
  await connectDB();
  // Streak reminder (8 PM IST) + email worker; ENABLE_JOBS=false to turn off
  startJobs();
  // Start the server
  const port = config.port;
  app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
  });
};

startServer().catch((err: Error) => {
  logger.error('Error starting server:', { err });
  process.exit(1);
});
