# RabbitMQ — cấu hình, đăng ký, publish, consume, xử lý lỗi

Tài liệu giải thích cách RabbitMQ được tích hợp vào dự án: tại sao cấu hình như hiện tại, điều gì xảy ra nếu cấu hình khác, luồng chạy từ lúc 1 service publish message đến lúc consumer xử lý xong, và lỗi được lưu/hiển thị ở đâu.

## 0. Vì sao cần RabbitMQ — ví dụ đời thường

Nhà hàng không để khách đứng chờ đầu bếp nấu xong mới ghi order tiếp. Nhân viên order chỉ **ghi phiếu, dán lên giá, rồi phục vụ khách khác ngay**. Đầu bếp rảnh lúc nào thì lấy phiếu ra nấu.

Áp vào code:

| Ẩn dụ | Trong code | Vai trò |
|---|---|---|
| Giá dán phiếu | **Queue** (hàng đợi) | Nơi tạm chứa các message chờ xử lý |
| Nhân viên ghi phiếu | **Producer** (`ClientProxy.emit()`) | Nơi trong code "thả việc cần làm" vào hàng đợi, không chờ kết quả |
| Đầu bếp | **Consumer** (`@EventPattern` handler) | Tiến trình riêng, liên tục lấy phiếu và xử lý thật |
| Xé phiếu khi xong | **`ack`** | Báo cho RabbitMQ: đã xử lý xong, xoá khỏi hàng đợi |
| Từ chối phiếu bị cháy | **`nack`** | Báo lỗi, không xử lý được — không được tự ý vứt |
| Góc để phiếu lỗi riêng | **DLQ** (Dead Letter Queue) | Hàng đợi phụ chứa các message bị `nack`, chờ xử lý thủ công |

**Trước khi có RabbitMQ**, các service gọi thẳng `await mailService.send(...)`, `await telegram.sendXxx(...)` — request của user phải **chờ** cho tới khi gửi mail/Telegram xong mới trả kết quả về, và nếu gửi lỗi thì code chỉ `catch` rồi log, **message mất vĩnh viễn, không ai biết**.

**Sau khi có RabbitMQ**, các service chỉ "thả phiếu vào hàng đợi" rồi trả response ngay — việc gửi mail/push/Telegram thật sự được xử lý ở "hậu trường" bởi consumer, độc lập với tốc độ phản hồi của user.

## 1. Vị trí file

```
src/rabbitmq/
  rabbitmq.constants.ts        # định nghĩa tên queue + token DI + cấu hình retry
  rabbitmq.options.ts          # cấu hình connection, queue, consumer/producer
  rabbitmq-topology.service.ts # tự tạo sẵn DLQ + retry queue lúc app khởi động, expose publishRetry()
  rabbitmq.module.ts           # đăng ký 4 ClientProxy (producer) dùng toàn app

src/main.ts                    # mở 4 consumer lúc app khởi động

# Producer (nơi gọi .emit() để publish):
src/mail/mail-producer.service.ts
src/features/notifications/notifications/notifications.service.ts
src/features/messaging/conversations/conversations.service.ts
src/features/booking/bookings/booking-reminder.service.ts

# Consumer (nơi @EventPattern nhận và xử lý message):
src/mail/mail.consumer.ts
src/features/notifications/web-push/web-push.consumer.ts
src/telegram/telegram.consumer.ts
src/features/booking/bookings/booking-reminder.consumer.ts
```

## 2. Danh sách queue

| Queue | Producer | Consumer | Các `pattern` mang trong queue |
|---|---|---|---|
| `notifications.email` | `MailProducerService` | `MailConsumer` | `mail.otp-verification`, `mail.password-reset-otp`, `mail.booking-event`, `mail.staff-notification`, `mail.staff-invite`, `mail.booking-reminder` |
| `notifications.push` | `NotificationsService` | `WebPushConsumer` | `push.send-to-user`, `push.send-to-users` |
| `telegram.forward` | `ConversationsService` | `TelegramConsumer` | `telegram.send-to-group-topic`, `telegram.send-photo-to-group-topic`, `telegram.send-video-to-group-topic` |
| `booking.reminder-tick` | `BookingReminderService` | `BookingReminderConsumer` | `booking.reminder-tick` |

**Lưu ý quan trọng**: 1 queue có thể mang **nhiều pattern khác nhau** — ví dụ `notifications.email` chứa cả 6 loại việc gửi mail. `pattern` chỉ là 1 nhãn dán trên message để consumer biết gọi hàm xử lý nào, **không phải** mỗi loại việc có 1 queue riêng.

## 3. Cấu hình (`rabbitmq.options.ts`)

```ts
function buildQueueOptions(queue, config) {
  return {
    urls: [buildRabbitmqUrl(config)],
    queue,
    queueOptions: {
      durable: true,
      arguments: {
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': toDlq(queue),
      },
    },
    persistent: true,
  };
}
```

### `durable: true` — hàng đợi được ghi ra ổ đĩa

Queue tồn tại kể cả khi RabbitMQ restart (deploy lại, sập điện...).

- **Nếu để `false`**: mỗi lần RabbitMQ container restart, toàn bộ queue biến mất — kể cả những message chưa kịp xử lý. Các email/push/Telegram đang chờ gửi sẽ mất trắng, không dấu vết.

### `persistent: true` — từng message được ghi ra ổ đĩa

Khác với `durable` (thuộc tính của cái queue), `persistent` là thuộc tính của **từng message**. Cần bật cả hai — có queue bền mà message không bền (hoặc ngược lại) vẫn mất dữ liệu khi restart.

- **Nếu để `false`**: message chỉ nằm trong RAM của RabbitMQ, restart là mất dù queue vẫn còn đó (rỗng).

### `x-dead-letter-exchange` / `x-dead-letter-routing-key` — khai trước "nơi chuyển đến khi bị từ chối"

Đây là cấu hình dặn **RabbitMQ tự làm việc này**, code không cần tự viết logic "nếu lỗi thì chuyển sang đâu". Khi consumer `nack` một message, RabbitMQ tự động đẩy nó sang queue `<tên-queue>.dlq` (hàm `toDlq()` trong `rabbitmq.constants.ts`).

- **Nếu không khai**: khi consumer `nack` một message lỗi, RabbitMQ **xoá thẳng nó luôn**, không cảnh báo — coi như mất, y hệt hành vi `catch(e) { log }` của code cũ.

### Vì sao tách riêng `buildRmqConsumerOptions` và `buildRmqProducerOptions`

```ts
export function buildRmqConsumerOptions(queue, config) {
  return { transport: Transport.RMQ, options: { ...buildQueueOptions(queue, config), prefetchCount: 5, noAck: false } };
}
export function buildRmqProducerOptions(queue, config) {
  return { transport: Transport.RMQ, options: buildQueueOptions(queue, config) };
}
```

| Option | Chỉ set ở | Ý nghĩa | Nếu cấu hình khác |
|---|---|---|---|
| `noAck: false` | Consumer | Đầu bếp phải tự báo "xong" (`ack`) sau khi xử lý, không tự động coi như xong ngay khi nhận | Nếu để `true` (mặc định của Nest): RabbitMQ coi message đã xử lý xong **ngay khi vừa gửi cho consumer**, dù xử lý có thành công hay không. Nếu server crash giữa chừng (ví dụ đang gửi mail), message coi như mất — không có cơ hội `nack`/vào DLQ |
| `prefetchCount: 5` | Consumer | Mỗi consumer chỉ nhận tối đa 5 message chưa xử lý xong cùng lúc | Nếu không set (mặc định = không giới hạn): RabbitMQ có thể dồn hàng nghìn message cho 1 consumer đang chạy chậm, tràn bộ nhớ tiến trình đó, các worker khác bị đói việc |

Producer **không được set `noAck`**: bên gửi phiếu không "nhận và xử lý" phiếu nên không có khái niệm ack/nack. Nếu vẫn set, sẽ đụng độ với 1 cơ chế nội bộ của Nest (reply-queue tự tạo khi `ClientProxy` connect, dùng cho `.send()` dù ở đây chỉ dùng `.emit()`) — gây lỗi `PRECONDITION_FAILED`, đóng connection.

### Vì sao producer và consumer phải dùng chung `buildQueueOptions()`

Nếu 2 bên assert cùng 1 queue nhưng khác `arguments` (ví dụ 1 bên có dead-letter, 1 bên không), RabbitMQ trả lỗi `PRECONDITION_FAILED` và đóng connection ngay. Dùng chung 1 hàm đảm bảo cấu hình luôn khớp nhau.

## 4. Topology — tạo trước DLQ + retry queue (`rabbitmq-topology.service.ts`)

```ts
async onModuleInit() {
  const connection = amqp.connect([buildRabbitmqUrl(this.config)]);
  this.channelWrapper = connection.createChannel({
    setup: (channel) =>
      Promise.all([
        ...Object.values(RABBITMQ_QUEUES).map((queue) =>
          channel.assertQueue(toDlq(queue), { durable: true }),
        ),
        ...Object.values(RABBITMQ_QUEUES).map((queue) =>
          channel.assertQueue(toRetry(queue), {
            durable: true,
            arguments: {
              'x-dead-letter-exchange': '',
              'x-dead-letter-routing-key': queue, // trỏ NGƯỢC lại queue chính
            },
          }),
        ),
      ]),
  });
  await this.channelWrapper.waitForConnect();
}
```

`ClientsModule` (producer) và `connectMicroservice` (consumer) chỉ tự tạo **queue chính** (`notifications.email`...), **không** tự tạo `notifications.email.dlq` hay `notifications.email.retry`. Nếu các queue này chưa tồn tại lúc cần dùng, RabbitMQ sẽ **âm thầm drop** message thay vì lưu lại/định tuyến lại. `RabbitmqTopologyService` chạy lúc app khởi động (`OnModuleInit`), dùng thư viện `amqp-connection-manager` độc lập với `ClientProxy` của Nest, để đảm bảo cả DLQ lẫn retry queue luôn tồn tại trước khi app nhận traffic.

### Retry queue khác DLQ ở đâu

- **DLQ** (`<queue>.dlq`): không có `x-dead-letter-*` — là điểm dừng cuối, message nằm im cho tới khi dev xử lý thủ công.
- **Retry queue** (`<queue>.retry`): có `x-dead-letter-exchange`/`x-dead-letter-routing-key` trỏ **ngược lại queue chính** — không khai TTL cố định ở cấp queue, mà set **TTL riêng theo từng message** (`expiration`) lúc publish, để lần thử sau delay lâu hơn lần trước (backoff tăng dần). Hết TTL, RabbitMQ tự dead-letter message về queue chính — consumer nhận lại y hệt message ban đầu, không cần cron hay logic chờ tự viết.

`RabbitmqTopologyService.publishRetry(queue, content, attempt)` (dùng bởi các consumer, xem mục 7) đọc `RABBITMQ_RETRY_BACKOFF_MS` (`rabbitmq.constants.ts`, mặc định `[5000, 15000, 45000]` ms) để tính TTL theo `attempt`, và ghi số lần đã thử vào header `x-retry-count` của message.

## 5. Đăng ký (`rabbitmq.module.ts`)

```ts
@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      { name: RABBITMQ_CLIENT.NOTIFICATIONS_EMAIL, useFactory: (config) => buildRmqProducerOptions('notifications.email', config) },
      // ... 3 client còn lại tương tự, mỗi client gắn 1 queue
    ]),
  ],
  providers: [RabbitmqTopologyService],
  exports: [ClientsModule],
})
export class RabbitmqModule {}
```

Đoạn này tạo ra **4 "cái loa gọi phiếu"** (gọi là `ClientProxy`), mỗi cái gắn cứng với 1 queue. Service nào muốn publish vào queue nào chỉ cần "xin" đúng cái loa đó qua dependency injection:

```ts
constructor(
  @Inject(RABBITMQ_CLIENT.NOTIFICATIONS_EMAIL) private readonly client: ClientProxy,
) {}
```

`@Global()` — module này được import **1 lần duy nhất** ở `AppModule`, nhưng 4 `ClientProxy` dùng được ở **mọi** module khác trong app mà không cần import lại `RabbitmqModule`.

- **Nếu không dùng `@Global()`**: mỗi module muốn publish message phải tự `imports: [RabbitmqModule]` — không sai logic, chỉ rườm rà hơn và dễ quên khi thêm module mới.

## 6. Publish — 1 message được gửi đi như thế nào

```ts
// mail-producer.service.ts
sendOtpVerification(email, otp, fullName) {
  this.publish('mail.otp-verification', { email, otp, fullName });
}
private publish(pattern, payload) {
  this.client.emit(pattern, payload).subscribe({
    error: (err) => this.logger.error(`Publish "${pattern}" failed: ${err.message}`, err.stack),
  });
}
```

Từng bước xảy ra khi dòng này chạy:

1. `this.client` = cái loa đã xin được ở mục 5, gắn với queue `notifications.email`.
2. `.emit(pattern, payload)` — gói `payload` thành 1 message, dán nhãn `pattern` lên, thả vào queue.
3. **`.emit()` trả về 1 RxJS Observable "lazy"** — nếu không gọi `.subscribe()` ngay sau, message **sẽ không được gửi**. Đây là lý do mọi nơi publish trong code đều có `.subscribe({ error: ... })`, kể cả khi không cần xử lý kết quả thành công — thiếu `.subscribe()` là bug, message không bao giờ rời khỏi service.
4. Hàm publish **không `await`** — chạy xong `.emit()` là return ngay, đây chính là lý do request của user không phải chờ việc gửi mail/push/Telegram xong.
5. Message được gửi với `deliveryMode = persistent` (nhờ `persistent: true` ở mục 3) — ghi xuống đĩa ở broker, không mất nếu RabbitMQ crash sau khi nhận.

## 7. Consume — message được xử lý như thế nào

`main.ts` mở sẵn 4 consumer lúc app khởi động, chạy song song với HTTP server:

```ts
for (const queue of Object.values(RABBITMQ_QUEUES)) {
  app.connectMicroservice(buildRmqConsumerOptions(queue, configService));
}
await app.startAllMicroservices();
```

Khi có message mới trong queue, handler tương ứng được gọi:

```ts
// mail.consumer.ts
@EventPattern('mail.otp-verification')
async handleOtpVerification(@Payload() data, @Ctx() ctx) {
  await this.ack(ctx, () => this.mail.sendOtpVerification(data.email, data.otp, data.fullName));
}

private async ack(ctx, fn) {
  const channel = ctx.getChannelRef();
  const originalMsg = ctx.getMessage();
  try {
    await fn();
    channel.ack(originalMsg);                    // xử lý xong -> xoá khỏi queue
  } catch (err) {
    const attempt = (originalMsg.properties.headers?.['x-retry-count'] ?? 0) + 1;
    if (attempt <= RABBITMQ_MAX_RETRY_ATTEMPTS) {
      this.logger.warn(`Handler failed (attempt ${attempt}/${RABBITMQ_MAX_RETRY_ATTEMPTS}), retrying: ${err?.message}`);
      await this.rabbitmqTopology.publishRetry(RABBITMQ_QUEUES.NOTIFICATIONS_EMAIL, originalMsg.content, attempt);
      channel.ack(originalMsg);                   // đã đẩy sang retry queue -> xoá bản gốc khỏi queue chính
    } else {
      this.logger.error(`Handler failed after ${RABBITMQ_MAX_RETRY_ATTEMPTS} attempts, routing to DLQ: ${err?.message}`, err?.stack);
      channel.nack(originalMsg, false, false);    // hết lượt retry -> KHÔNG requeue -> RabbitMQ tự chuyển sang DLQ
    }
  }
}
```

1. RabbitMQ lấy 1 message ra, đọc nhãn `pattern`, tìm đúng hàm `@EventPattern` khớp trong consumer của queue đó.
2. Hàm chạy `fn()` — nơi thật sự gọi việc gửi mail/push/Telegram.
3. Thành công → `channel.ack(originalMsg)` — RabbitMQ xoá message khỏi queue.
4. Lỗi, còn lượt retry (`attempt <= RABBITMQ_MAX_RETRY_ATTEMPTS`, mặc định 3) → publish message **y hệt nội dung gốc** (`originalMsg.content`, không cần dựng lại payload) sang `<queue>.retry` kèm header `x-retry-count`, rồi `ack` bản gốc — coi như đã "chuyển giao" trách nhiệm cho retry queue. Message chờ ở đó theo TTL backoff rồi RabbitMQ tự dead-letter ngược về queue chính, consumer nhận lại và thử `fn()` lần nữa.
5. Lỗi, đã hết lượt retry → `channel.nack(originalMsg, false, false)` — 2 tham số `false` cuối nghĩa là "không gộp với message khác, không đưa lại vào queue để thử ngay". RabbitMQ áp dụng cấu hình dead-letter đã khai ở mục 3, tự chuyển message sang `<queue>.dlq`.

**Vì sao không `nack` kèm requeue = `true` để tự thử lại ngay?** Nếu lỗi do bug trong code (không phải do mạng tạm thời), message sẽ lỗi lại ngay lập tức, requeue lại, lỗi lại... lặp vô hạn, tốn CPU và làm nghẽn queue — đây chính là lý do dùng retry queue có backoff (delay tăng dần) thay vì requeue ngay lập tức. Sau khi hết số lần retry cấu hình, đưa vào DLQ để dev kiểm tra thủ công vẫn là lựa chọn an toàn cho lỗi dai dẳng (bug code, dữ liệu sai...).

**Vì sao retry không giữ "chỗ" trong `prefetchCount: 5`?** Vì lúc retry, message được `ack` khỏi queue chính ngay (chuyển hẳn sang retry queue) — không phải giữ message ở trạng thái "chưa ack" trong lúc chờ. Nhờ vậy 1 loạt message lỗi cùng lúc (vd SMTP tạm down) không làm nghẽn 5 "chỗ" prefetch của worker, các message khác trong queue vẫn được xử lý bình thường trong lúc chờ retry.

## 8. Vì sao không lo trùng lặp khi chạy nhiều worker (cluster)

`main.ts` fork nhiều worker process (mỗi worker chạy cả app Nest riêng, xem `main.ts` phần `cluster.fork`). Mỗi worker cũng tự `connectMicroservice()` cho 4 queue → có N worker thì có N kết nối consumer cùng đọc 1 queue.

RabbitMQ tự làm **competing consumers**: 1 message chỉ giao cho đúng 1 trong các consumer đang kết nối tới queue đó, không tự nhân bản. Vì vậy phần tiêu thụ message **không cần** cờ `IS_SINGLETON_WORKER`.

Cờ `IS_SINGLETON_WORKER` chỉ cần cho phần **trigger** cron (`BookingReminderService.onModuleInit`) — vì `Cron(expr, ...)` chạy độc lập trong RAM của từng process, không qua broker. Nếu không chặn, N worker sẽ tạo N cron timer riêng, mỗi lần fire sẽ publish N tick trùng nhau vào `booking.reminder-tick`. Còn việc **xử lý** tick đó (trong `BookingReminderConsumer`) thì chạy ở bất kỳ worker nào nhận được message — không cần singleton vì RabbitMQ đã đảm bảo chỉ 1 worker nhận mỗi tick.

## 9. Lỗi được lưu / hiển thị ở đâu

Có 2 nơi khác nhau, tuỳ loại thông tin:

### a) Log chữ (mô tả lỗi) — console/stdout, KHÔNG lưu DB

`this.logger.error(...)` (dùng `Logger` của NestJS) chỉ in ra console/stdout của tiến trình Node. Trong môi trường thật, xem bằng:

```
docker logs <container_name>
```

hoặc terminal trực tiếp nếu chạy `npm run start:dev`.

Các file liên quan RabbitMQ (`*.consumer.ts`, `*-producer.service.ts`) **không dùng** `SystemLogService` (dịch vụ ghi log lỗi HTTP vào database mà project có sẵn cho `HttpExceptionFilter`/`PrismaExceptionFilter`). Vì vậy lỗi publish/consume RabbitMQ **chỉ nằm trong log console**, không tra cứu được qua API hay bảng nào trong DB.

### b) Dữ liệu message lỗi thật sự — trong chính RabbitMQ (DLQ/retry queue), xem qua Management UI

Message gốc bị `nack` (hết lượt retry) nằm trong queue `<tên-queue>.dlq` **ngay trong RabbitMQ**, không phải trong code hay DB của app. Message đang trong lúc chờ retry (chưa hết lượt) nằm tạm ở `<tên-queue>.retry`.

`docker-compose.yml` dùng image `rabbitmq:4-management-alpine` (có kèm giao diện quản lý web), truy cập tại:

```
http://localhost:15672
```

(port khai trong `.env` là `RABBITMQ_MGMT_PORT`, mặc định `15672`) — đăng nhập bằng `RABBITMQ_USER` / `RABBITMQ_PASSWORD`, vào tab **Queues**, xem các queue `*.dlq`/`*.retry` và nội dung từng message.

### Tóm lại

- **Log console** trả lời: *"cái gì đã lỗi, vì sao"* (thông báo lỗi + stack trace, kèm số lần đã thử).
- **RabbitMQ Management UI** trả lời: *"dữ liệu gốc bị lỗi đó là gì"* — với message đang ở DLQ thì cần xử lý lại thủ công; với message đang ở `.retry` thì không cần làm gì, hệ thống tự thử lại.

**Retry tự động**: mỗi message được thử tối đa `RABBITMQ_MAX_RETRY_ATTEMPTS` lần (mặc định 3, xem `rabbitmq.constants.ts`), delay tăng dần theo `RABBITMQ_RETRY_BACKOFF_MS` (mặc định 5s → 15s → 45s) trước khi bị coi là lỗi thật và chuyển vào DLQ. Sau khi vào DLQ, vẫn **không có cơ chế tự động** xử lý lại nữa, cũng **không có UI trong app** để xem DLQ — muốn xử lý lại phải vào thẳng RabbitMQ Management UI, xem message, rồi tự publish lại thủ công (hoặc sửa bug rồi move message sang queue chính).

## 10. Sơ đồ tổng hợp

```
[Service] --emit(pattern, payload)--> [Queue notifications.email] --nhận-->
                                                                    [Consumer]
                                                                       |
                                                          xử lý xong? -+- lỗi?
                                                                |            |
                                                            ack()      còn lượt retry?
                                                                |        |         |
                                                        xoá khỏi queue  còn        hết
                                                                         |         |
                                                            publishRetry()      nack()
                                                            -> <queue>.retry   (không requeue)
                                                            (TTL backoff) -+        |
                                                                           |        |
                                                            hết TTL -> tự dead-letter
                                                            NGƯỢC về [Queue] (thử lại)
                                                                                    |
                                                                         RabbitMQ tự
                                                                         chuyển sang
                                                                         *.dlq (nhờ
                                                                         x-dead-letter-*
                                                                         khai ở producer)
```

## 11. Cấu hình liên quan (`.env`)

```
RABBITMQ_HOST=localhost
RABBITMQ_PORT=5672
RABBITMQ_USER=
RABBITMQ_PASSWORD=
RABBITMQ_MGMT_PORT=15672
```

`RABBITMQ_USER`/`RABBITMQ_PASSWORD` dùng cho cả kết nối AMQP (app ↔ broker) lẫn đăng nhập Management UI — phải khớp với biến `RABBITMQ_DEFAULT_USER`/`RABBITMQ_DEFAULT_PASS` khai trong `docker-compose.yml`.
