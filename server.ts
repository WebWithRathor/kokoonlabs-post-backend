import app from './src/app';
import { config } from './src/config/config';
// Checks the IoT Studio settings now: a bad one stops the server here
import './src/config/iot-studio.config';
import logger from './src/config/logger';
import connectDB from './src/db';
import { startJobs } from './src/jobs/scheduler';
import { iotStudioSelfCheck } from './src/services/public/iot-studio.service';

const startServer = async () => {
  // Connect to the database
  await connectDB();
  // Streak reminder (8 PM IST) + email worker; ENABLE_JOBS=false to turn off
  startJobs();
  // Start the server
  const port = config.port;
  app.listen(port, () => {
    logger.info(`Server is running on port ${port}`);
    // Logs whether IoT Studio's URL and secret work; never blocks or stops the start
    iotStudioSelfCheck().catch(() => undefined);
  });
};

startServer().catch((err: Error) => {
  logger.error('Error starting server:', { err });
  process.exit(1);
});
