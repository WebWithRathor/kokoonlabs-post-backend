import { Redis } from "ioredis";
import { config } from "../config/config";
import ErrorHandler from "./error-handler";
import { ERROR_CODES } from "../constants/error-codes";

const redisClient = () => {
  if (config.redisUrl) {
    const client = new Redis(config.redisUrl, {
      maxRetriesPerRequest: null,
    });

    client.on("connect", () => {
      console.warn("Connected to Redis");
    });

    client.on("error", (err) => {
      console.warn("Error connecting to Redis:", { error: err });
    });

    return client;
  }
  throw new ErrorHandler(ERROR_CODES.REDIS_CONNECTION_ERROR);
};

export const redis = redisClient();
