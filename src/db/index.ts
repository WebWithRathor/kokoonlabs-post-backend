import mongoose from 'mongoose';
import { config } from '../config/config';
import logger from '../config/logger';

// Database Connection URL
const DB_URL: string = config.databaseUrl;

// Database Connection Function
const connectDB = async () => {
  try {
    // Connect to the database using the database URL from the config file
    const connectionInstance = await mongoose.connect(DB_URL);

    // Handle successful connection to the database and log the DB Hostname
    logger.info(
      `Database Connection Successful 🎉 \nDatabase Host: ${connectionInstance.connection.host}`
    );

    // Handle successful reconnect to the database
    mongoose.connection.on('connected', () => {
      logger.info('Database Reconnected 🎉');
    });

    // Log errors after the first connect. Don't exit: the driver retries and
    // reconnects on its own, and exiting turned any network blip into downtime.
    mongoose.connection.on('error', (err: unknown) => {
      logger.error('Database Connection Error', { err });
    });

    // Handle disconnection from the database
    mongoose.connection.on('disconnected', () => {
      logger.warn('Database Disconnected 🚪');
    });

    // Handle process termination and close the database connection
    process.on('SIGINT', () => {
      void (async () => {
        await mongoose.connection.close();
        logger.warn('Database Connection Closed 🚪');
        process.exit(0);
      })();
    });

    // Handle process termination and close the database connection
    process.on('SIGTERM', () => {
      void (async () => {
        await mongoose.connection.close();
        logger.warn('Database Connection Closed 🚪');
        process.exit(0);
      })();
    });

    // Handle process termination and close the database connection
    process.on('SIGUSR2', () => {
      void (async () => {
        await mongoose.connection.close();
        logger.warn('Database Connection Closed 🚪');
        process.exit(0);
      })();
    });

    // Return the connection instance
    return connectionInstance;
  } catch (error) {
    // Handle connection error and close the process when connection fails while connecting to the database
    logger.error('Database Connection Failed', { error });
    process.exit(1);
  }
};

export default connectDB;
