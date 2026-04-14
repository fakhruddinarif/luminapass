import amqp, { type Channel, type ChannelModel, type Options } from "amqplib";

import { env } from "./env";

export interface RabbitMQConnectionResult {
  connection: ChannelModel;
  channel: Channel;
}

export const rabbitMQConfig = {
  url: buildRabbitMQUrl(),
  heartbeat: 30,
  reconnectDelayMs: 3_000,
  defaultExchange: "luminapass.events",
  defaultQueue: "luminapass.jobs",
  defaultPrefetchCount: 10,
} as const;

function buildRabbitMQUrl(): string {
  const url = new URL(env.AMQP_URL);
  url.username = env.AMQP_USER;
  url.password = env.AMQP_PASS;
  url.port = String(env.AMQP_PORT);

  return url.toString();
}

export async function createRabbitMQConnection(): Promise<ChannelModel> {
  const connectionOptions: Options.Connect = {
    heartbeat: rabbitMQConfig.heartbeat,
  };

  return amqp.connect(rabbitMQConfig.url, connectionOptions);
}

export async function createRabbitMQChannel(
  connection: ChannelModel,
): Promise<Channel> {
  const channel = await connection.createChannel();

  await channel.prefetch(rabbitMQConfig.defaultPrefetchCount);
  await channel.assertExchange(rabbitMQConfig.defaultExchange, "topic", {
    durable: true,
  });
  await channel.assertQueue(rabbitMQConfig.defaultQueue, {
    durable: true,
    arguments: {
      "x-queue-type": "classic",
    },
  });
  await channel.bindQueue(
    rabbitMQConfig.defaultQueue,
    rabbitMQConfig.defaultExchange,
    "#",
  );

  return channel;
}

export async function connectRabbitMQ(): Promise<RabbitMQConnectionResult> {
  const connection = await createRabbitMQConnection();
  const channel = await createRabbitMQChannel(connection);

  return { connection, channel };
}

export async function publishJson(
  channel: Channel,
  routingKey: string,
  payload: unknown,
  exchange = rabbitMQConfig.defaultExchange,
): Promise<boolean> {
  const buffer = Buffer.from(JSON.stringify(payload));

  return channel.publish(exchange, routingKey, buffer, {
    contentType: "application/json",
    deliveryMode: 2,
  });
}

export function consumerOptions(): Options.Consume {
  return {
    noAck: false,
  };
}
