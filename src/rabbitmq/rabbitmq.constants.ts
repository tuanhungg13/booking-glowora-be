export const RABBITMQ_QUEUES = {
  NOTIFICATIONS_EMAIL: 'notifications.email',
  NOTIFICATIONS_PUSH: 'notifications.push',
  TELEGRAM_FORWARD: 'telegram.forward',
  BOOKING_REMINDER_TICK: 'booking.reminder-tick',
} as const;

export const RABBITMQ_CLIENT = {
  NOTIFICATIONS_EMAIL: 'RABBITMQ_CLIENT_NOTIFICATIONS_EMAIL',
  NOTIFICATIONS_PUSH: 'RABBITMQ_CLIENT_NOTIFICATIONS_PUSH',
  TELEGRAM_FORWARD: 'RABBITMQ_CLIENT_TELEGRAM_FORWARD',
  BOOKING_REMINDER_TICK: 'RABBITMQ_CLIENT_BOOKING_REMINDER_TICK',
} as const;

export const toDlq = (queue: string) => `${queue}.dlq`;
export const toRetry = (queue: string) => `${queue}.retry`;

// Số lần retry trước khi message bị coi là lỗi thật sự và chuyển vào DLQ.
export const RABBITMQ_MAX_RETRY_ATTEMPTS = 3;

// Delay (ms) trước mỗi lần retry — index 0 = sau lần thử đầu tiên thất bại, v.v.
// Message nằm chờ ở `<queue>.retry` (TTL riêng từng message) rồi RabbitMQ tự
// dead-letter ngược về queue chính, không giữ chỗ prefetch của consumer trong lúc chờ.
export const RABBITMQ_RETRY_BACKOFF_MS = [5000, 15000, 45000];
