import express from "express";
import cors from "cors";
import amqp from "amqplib";

const app = express();
const PORT = process.env.PORT || 3001;
const RABBIT_URL = process.env.RABBIT_URL || "amqp://guest:guest@localhost:5672";
const QUEUE = "generate-key";

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

let channel;
async function connectRabbit() {
  while (!channel) {
    try {
      const connection = await amqp.connect(RABBIT_URL);
      channel = await connection.createChannel();
      await channel.assertQueue(QUEUE, { durable: true });
      console.log("Połączono z RabbitMQ; kolejka:", QUEUE);
      connection.on("close", () => { channel = undefined; });
    } catch (err) {
      console.log("RabbitMQ jeszcze niegotowy, ponawiam za 3 sekundy:", err.message);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}
connectRabbit();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, rabbitConnected: Boolean(channel) });
});

app.post("/api/orders", async (req, res) => {
  const { email, items } = req.body || {};
  if (!email || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Podaj e-mail i co najmniej jeden produkt." });
  }
  if (!channel) return res.status(503).json({ error: "RabbitMQ nie jest jeszcze gotowy. Spróbuj ponownie za chwilę." });

  const message = {
    orderId: crypto.randomUUID(),
    email,
    items: items.map(item => ({
      productId: String(item.productId),
      productName: String(item.productName),
      quantity: Math.max(1, Math.min(10, Number(item.quantity) || 1))
    })),
    createdAt: new Date().toISOString()
  };
  channel.sendToQueue(QUEUE, Buffer.from(JSON.stringify(message)), { persistent: true });
  console.log("Wysłano zamówienie do RabbitMQ:", message.orderId);
  res.status(202).json({ ok: true, orderId: message.orderId, message: "Zamówienie wysłane do kolejki." });
});

app.listen(PORT, () => console.log(`Backend działa: http://localhost:${PORT}`));
