// Prosty konsument: odbiera z RabbitMQ zlecenia i symuluje generowanie klucza.
import amqp from "amqplib";
const url = process.env.RABBIT_URL || "amqp://guest:guest@localhost:5672";
const queue = "generate-key";

while (true) {
  try {
    const connection = await amqp.connect(url);
    const channel = await connection.createChannel();
    await channel.assertQueue(queue, { durable: true });
    console.log(`Worker nasłuchuje kolejki "${queue}"...`);
    channel.prefetch(1);
    channel.consume(queue, msg => {
      if (!msg) return;
      try {
        const order = JSON.parse(msg.content.toString());
        console.log("\n[WORKER] Otrzymano zlecenie:", order.orderId);
        console.log("[WORKER] E-mail:", order.email);
        console.log("[WORKER] Produkty:", order.items.map(i => `${i.productName} x${i.quantity}`).join(", "));
        console.log("[WORKER] DEMO: tutaj można podłączyć właściwy system wydawania kluczy.\n");
        channel.ack(msg);
      } catch (err) {
        console.error("Błąd przetwarzania wiadomości:", err);
        channel.nack(msg, false, false);
      }
    });
    await new Promise(resolve => connection.on("close", resolve));
  } catch (err) {
    console.error("Worker: brak połączenia z RabbitMQ:", err.message);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
