require("dotenv").config();
require("reflect-metadata");

const express = require("express");
const { DataSource, EntitySchema } = require("typeorm");

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* =========================
   ENTITIES
========================= */

const ProductEntity = new EntitySchema({
  name: "Product",
  tableName: "products",
  columns: {
    id: { primary: true, type: "int", generated: true },
    name: { type: "varchar" },
    price: { type: "float" },
    image: { type: "varchar" }
  }
});

const OrderEntity = new EntitySchema({
  name: "Order",
  tableName: "orders",
  columns: {
    id: { primary: true, type: "int", generated: true },
    name: { type: "varchar" },
    address: { type: "varchar" },
    total: { type: "float" },
    createdAt: { type: "timestamp", createDate: true }
  },
  relations: {
    orderItems: {
      type: "one-to-many",
      target: "OrderItem",
      inverseSide: "order",
      cascade: true
    }
  }
});

const OrderItemEntity = new EntitySchema({
  name: "OrderItem",
  tableName: "order_items",
  columns: {
    id: { primary: true, type: "int", generated: true },
    productName: { type: "varchar" },
    productPrice: { type: "float" },
    quantity: { type: "int", default: 1 }
  },
  relations: {
    order: {
      type: "many-to-one",
      target: "Order",
      joinColumn: true,
      onDelete: "CASCADE"
    }
  }
});

/* =========================
   DATABASE (Railway)
========================= */

const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL, // Railway provides this
  ssl: { rejectUnauthorized: false },
  synchronize: process.env.NODE_ENV !== "production",
  logging: false,
  entities: [ProductEntity, OrderEntity, OrderItemEntity]
});

let initialized = false;

async function initDB() {
  if (!initialized) {
    await AppDataSource.initialize();
    initialized = true;
  }
}

/* =========================
   ROUTES
========================= */

app.get("/", (req, res) => {
  res.send("Susu's Macaroon Market API is running 🚀");
});

app.get("/products", async (req, res) => {
  await initDB();
  const repo = AppDataSource.getRepository("Product");
  const products = await repo.find();
  res.json(products);
});

app.post("/checkout", async (req, res) => {
  await initDB();
  const { name, address, cartItems } = req.body;

  const total = cartItems.reduce(
    (sum, item) => sum + item.productPrice * item.quantity,
    0
  );

  const repo = AppDataSource.getRepository("Order");

  const order = {
    name,
    address,
    total,
    orderItems: cartItems
  };

  const saved = await repo.save(order);
  res.json({ success: true, orderId: saved.id });
});

/* =========================
   EXPORT FOR VERCEL
========================= */
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 3000;
  initDB().then(() => {
    app.listen(port, () => {
      console.log(`Local server running on http://localhost:${port}`);
    });
  });
}

module.exports = app;