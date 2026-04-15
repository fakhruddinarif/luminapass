import type { Channel, ChannelModel } from "amqplib";

import { connectRabbitMQ, publishJson, rabbitMQConfig } from "./rabbitmq";
import { logError, logInfo } from "../utils/logger";

let connectionRef: ChannelModel | null = null;
let channelRef: Channel | null = null;

export async function initRabbitMQRuntime(): Promise<void> {
  if (connectionRef && channelRef) {
    return;
  }

  const { connection, channel } = await connectRabbitMQ();
  connectionRef = connection;
  channelRef = channel;

  logInfo("RabbitMQ runtime connected", {
    exchange: rabbitMQConfig.defaultExchange,
    queue: rabbitMQConfig.defaultQueue,
  });
}

export async function closeRabbitMQRuntime(): Promise<void> {
  if (channelRef) {
    await channelRef.close();
    channelRef = null;
  }

  if (connectionRef) {
    await connectionRef.close();
    connectionRef = null;
  }
}

export async function publishAppEvent(
  routingKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!channelRef) {
    return;
  }

  try {
    const published = await publishJson(channelRef, routingKey, payload);

    if (!published) {
      logError("RabbitMQ publish returned false", {
        routingKey,
      });
    }
  } catch (error) {
    logError("Failed to publish RabbitMQ event", {
      routingKey,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
