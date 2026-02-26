require("dotenv").config();
require("reflect-metadata");

const express = require("express");
const { DataSource, EntitySchema } = require("typeorm");

const app = express();
const fs = require("fs");
const path = require("path");
const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL  ,
  token: process.env.UPSTASH_REDIS_REST_TOKEN ,
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(process.cwd(), "static")));
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
function renderPage(title, content) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
      <title>${title}</title>
      <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
      <style>
        body { padding-top: 50px; }
        .container { max-width: 800px; }
        /* Fireworks animation styles */
        .fireworks-container {
          position: absolute;
          pointer-events: none;
        }
        .firework {
          position: absolute;
          width: 8px;
          height: 8px;
          background: gold;
          border-radius: 50%;
          opacity: 1;
          animation: firework-animation 0.8s ease-out forwards;
        }
        @keyframes firework-animation {
          0% { transform: translate(0, 0); opacity: 1; }
          100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        ${content}
      </div>
      <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js"></script>
      <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
    </body>
  </html>
  `;
}

const localHeroPath = path.join(process.cwd(), "static", "shop.jpg");
// Construct the hero image URL using AWS S3 environment variables.
const heroImageUrl = fs.existsSync(localHeroPath) 
? "/static/shop.jpg" 
: `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/shop.jpg`;
console.log(heroImageUrl);
app.get("/", (req, res) => {
    const content = `
    <div class="hero-banner" style="
      position: relative;
      background: url('${heroImageUrl}') no-repeat center center;
      background-size: cover;
      height: 500px;
    ">
      <div style="
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.5);
      ">
        <div class="d-flex h-100 align-items-center justify-content-center">
          <div class="text-center text-white">
            <h1 class="display-3">Welcome to Susu's Macaroon Market!</h1>
            <p class="lead">Delicious macaroons made with love.</p>
            <a class="btn btn-primary btn-lg" href="/products" role="button">View Our Products</a>
          </div>
        </div>
      </div>
    </div>
  `;
  res.send(renderPage("Susu's Macaroon Market", content));
});

app.get("/products", async (req, res) => {
  await initDB();
  //const repo = AppDataSource.getRepository("Product");
  let products = null; // = await repo.find();
  try {

    //  try {
    // 1️⃣ Check cache first
    const cached = await redis.get("products");

    if (cached) {
      console.log("Serving from Redis cache");
      //return res.json(cached);
      products = cached;
    }
    else {
    // 2️⃣ If not cached → query DB
    const repo = AppDataSource.getRepository("Product");
     products = await repo.find();

    // 3️⃣ Store in Redis (TTL 60 seconds)
    await redis.set("products", products, { ex: 300 });

    console.log("Serving from database");
    //res.json(products);
    }
 // } catch (err) {
 //   console.error("Redis error:", err);
 //   res.status(500).json({ error: "Internal server error" });
 // }
      //const productRepository = AppDataSource.getRepository("Product");
      //const products = await productRepository.find();
  
      // Header with a shopping cart icon and a "Cart" button.
      let html = `
        <div class="d-flex justify-content-end align-items-center mb-3" style="position: relative;">
          <button class="btn btn-secondary" onclick="location.href='/cart'" id="cartButton">
            <span id="cartIcon"><i class="fas fa-shopping-cart"></i></span> Cart (<span id="cartCount">0</span>)
          </button>
        </div>
        <h1 class="mb-4">Our Products</h1>
        <div class="list-group">
      `;
  
      products.forEach(product => {
        // Construct the product image URL using S3 environment variables.
        const localPath = path.join(process.cwd(), "static", product.image);
        const imageUrl = fs.existsSync(localPath) ? `/static/${product.image}` // Serve from local folder 
        : `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${product.image}`;
        html += `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <div class="d-flex align-items-center">
              <img src="${imageUrl}" alt="${product.name}" style="width:250px; height:250px; object-fit:cover; margin-right:15px;" />
              <div>
                <h5 class="mb-1">${product.name}</h5>
                <p class="mb-1">$${product.price.toFixed(2)}</p>
              </div>
            </div>
            <button class="btn btn-success" onclick="addToCart(${product.id}, '${product.name}', ${product.price})">Add to Cart</button>
          </div>`;
      });
      html += `</div>
        <!-- Button at the bottom to go to the shopping cart -->
        <div class="text-center mt-4">
          <button class="btn btn-primary" onclick="location.href='/cart'">Go to Cart</button>
        </div>
        <script>
          function addToCart(id, name, price) {
            let cart = sessionStorage.getItem('cart');
            cart = cart ? JSON.parse(cart) : [];
            const existingItem = cart.find(item => item.id === id);
            if (existingItem) {
              existingItem.quantity += 1;
            } else {
              cart.push({ id, name, price, quantity: 1 });
            }
            sessionStorage.setItem('cart', JSON.stringify(cart));
            updateCartCount();
            showFireworks();
          }
  
          function updateCartCount() {
            let cart = sessionStorage.getItem('cart');
            cart = cart ? JSON.parse(cart) : [];
            const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
            document.getElementById('cartCount').innerText = totalItems;
          }
          
          // Function to create a fireworks effect around the cart button.
          function showFireworks() {
            const cartButton = document.getElementById('cartButton');
            const rect = cartButton.getBoundingClientRect();
            // Create a container for fireworks positioned over the button.
            const container = document.createElement('div');
            container.className = 'fireworks-container';
            container.style.left = rect.left + 'px';
            container.style.top = rect.top + 'px';
            container.style.width = rect.width + 'px';
            container.style.height = rect.height + 'px';
            document.body.appendChild(container);
            
            // Create multiple sparkles.
            for (let i = 0; i < 10; i++) {
              const sparkle = document.createElement('div');
              sparkle.className = 'firework';
              // Random angle and distance.
              const angle = Math.random() * 2 * Math.PI;
              const distance = Math.random() * 30;
              const dx = Math.cos(angle) * distance;
              const dy = Math.sin(angle) * distance;
              sparkle.style.setProperty('--dx', dx + 'px');
              sparkle.style.setProperty('--dy', dy + 'px');
              container.appendChild(sparkle);
            }
            // Remove the container after the animation completes.
            setTimeout(() => {
              container.remove();
            }, 1000);
          }
  
          document.addEventListener('DOMContentLoaded', updateCartCount);
        </script>
      `;
      res.send(renderPage("Products - Susu's Macaroon Market", html));
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).send("Error fetching products");
    }
});
// Cart route: Display current cart items from sessionStorage.
app.get("/cart", (req, res) => {
  const content = `
    <h1>Your Cart</h1>
    <div id="cartContainer"></div>
    <a class="btn btn-primary mt-3" href="/checkout">Proceed to Checkout</a>
    <script>
      function renderCart() {
        let cart = sessionStorage.getItem('cart');
        let container = document.getElementById('cartContainer');
        if (!cart || JSON.parse(cart).length === 0) {
          container.innerHTML = '<p>Your cart is empty.</p>';
          return;
        }
        cart = JSON.parse(cart);
        let html = '<ul class="list-group">';
        cart.forEach(item => {
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' +
                    item.name + ' - $' + item.price.toFixed(2) + ' x ' + item.quantity +
                  '</li>';
        });
        html += '</ul>';
        container.innerHTML = html;
      }
      document.addEventListener('DOMContentLoaded', renderCart);
    </script>
  `;
  res.send(renderPage("Your Cart - Susu's Macaroon Market", content));
});

// Checkout page: Show order form and populate cart details from sessionStorage.
app.get("/checkout", (req, res) => {
  const content = `
    <h1>Checkout</h1>
    <div id="cartSummary"></div>
    <form method="POST" action="/checkout" onsubmit="return prepareOrder()">
      <div class="form-group">
        <label for="name">Name:</label>
        <input type="text" class="form-control" id="name" name="name" required>
      </div>
      <div class="form-group">
        <label for="address">Address:</label>
        <textarea class="form-control" id="address" name="address" rows="3" required></textarea>
      </div>
      <input type="hidden" id="cartData" name="cartData">
      <button type="submit" class="btn btn-success">Place Order</button>
    </form>
    <script>
      function renderCartSummary() {
        let cart = sessionStorage.getItem('cart');
        let summary = document.getElementById('cartSummary');
        if (!cart || JSON.parse(cart).length === 0) {
          summary.innerHTML = '<p>Your cart is empty.</p>';
          return;
        }
        cart = JSON.parse(cart);
        let html = '<ul class="list-group mb-3">';
        let total = 0;
        cart.forEach(item => {
          total += item.price * item.quantity;
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' +
                    item.name + ' - $' + item.price.toFixed(2) + ' x ' + item.quantity +
                  '</li>';
        });
        html += '</ul>';
        html += '<h4>Total: $' + total.toFixed(2) + '</h4>';
        summary.innerHTML = html;
      }
      
      function prepareOrder() {
        let cart = sessionStorage.getItem('cart');
        if (!cart || JSON.parse(cart).length === 0) {
          alert('Your cart is empty!');
          return false;
        }
        document.getElementById('cartData').value = cart;
        return true;
      }
      
      document.addEventListener('DOMContentLoaded', renderCartSummary);
    </script>
  `;
  res.send(renderPage("Checkout - Susu's Macaroon Market", content));
});


app.post("/checkout", async (req, res) => {
  await initDB();
  const { name, address, cartData } = req.body;

  let cartItems;
  try {
    cartItems = JSON.parse(cartData);
  } catch (error) {
    return res.status(400).send("Invalid cart data");
  }

  const total = cartItems.reduce(
    (sum, item) => sum + item.productPrice * item.quantity,
    0
  );
try {
  const repo = AppDataSource.getRepository("Order");

  const order = {
    name,
    address,
    total,
    orderItems: cartItems.map(item => ({
        productName: item.name,
        productPrice: item.price,
        quantity: item.quantity
      }))
  };

  const saved = await repo.save(order);
     const content = `
      <div class="text-center">
        <h1>Thank you for your order!</h1>
        <p>Your order ID is ${saved.id}.</p>
        <p>We appreciate your business. Your delicious macaroons are on their way!</p>
        <a class="btn btn-primary" href="/" onclick="clearCart()">Back to Home</a>
      </div>
      <script>
        function clearCart() {
          sessionStorage.removeItem('cart');
        }
        clearCart();
      </script>
    `;
  //res.json({ success: true, orderId: saved.id });
  await redis.del("products");
  res.send(renderPage("Order Confirmation - Susu's Macaroon Market", content));
  } catch (error) {
    console.error("Error processing order:", error);
    res.status(500).send("Error processing order");
  }
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