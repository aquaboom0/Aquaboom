/**
 * Seed local MongoDB with demo products, a test customer, and a delivery agent.
 * Run: npm run seed (from backend/, with .env and MongoDB running)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import User from '../src/models/User.js';
import Product from '../src/models/Product.js';
import DeliveryAgent from '../src/models/DeliveryAgent.js';

const MONGODB_URI = process.env.MONGODB_URI;

const DEMO_CUSTOMER = {
  name: 'Demo Customer',
  email: 'customer@test.com',
  password: 'test1234',
  role: 'customer',
};

const DEMO_AGENT = {
  name: 'Demo Agent',
  phone: '9876543210',
  email: 'agent@test.com',
  password: 'agent1234',
  vehicleType: 'bike',
  vehicleNumber: 'KA01AB1234',
};

const PRODUCTS = [
  {
    name: '20L Water Can (Bisleri)',
    description: 'Large refill can for home & office',
    pricePerUnit: 85,
    unit: 'can',
    stock: 50,
    category: '20L',
    mrp: 90,
    badge: 'Best Seller',
  },
  {
    name: '5L Pack (3 bottles)',
    description: 'Convenient 5 litre pack',
    pricePerUnit: 120,
    unit: 'pack',
    stock: 80,
    category: '5L',
    mrp: 130,
    badge: 'Popular',
  },
  {
    name: '1L Bottle x 12',
    description: 'Case of twelve 1L bottles',
    pricePerUnit: 480,
    unit: 'pack',
    stock: 40,
    category: '1L',
    mrp: 520,
    badge: 'New',
  },
  {
    name: '500ml Bottle x 24',
    description: 'Small bottles — easy carry',
    pricePerUnit: 360,
    unit: 'bottle',
    stock: 100,
    category: '500ml',
    mrp: 400,
  },
];

async function seed() {
  if (!MONGODB_URI) {
    console.error('Missing MONGODB_URI in .env');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Products — replace demo set each run (idempotent for dev)
  await Product.deleteMany({});
  await Product.insertMany(PRODUCTS);
  console.log(`Seeded ${PRODUCTS.length} products`);

  // Customer (email login)
  let customer = await User.findOne({ email: DEMO_CUSTOMER.email });
  if (!customer) {
    customer = await User.create(DEMO_CUSTOMER);
    console.log('Created demo customer:', DEMO_CUSTOMER.email);
  } else {
    customer.name = DEMO_CUSTOMER.name;
    customer.password = DEMO_CUSTOMER.password;
    customer.role = 'customer';
    await customer.save();
    console.log('Updated demo customer:', DEMO_CUSTOMER.email);
  }

  // Delivery agent (email login in app)
  let agent = await DeliveryAgent.findOne({ email: DEMO_AGENT.email });
  if (!agent) {
    agent = await DeliveryAgent.create(DEMO_AGENT);
    console.log('Created demo agent:', DEMO_AGENT.email);
  } else {
    agent.name = DEMO_AGENT.name;
    agent.password = DEMO_AGENT.password;
    agent.vehicleNumber = DEMO_AGENT.vehicleNumber;
    agent.phone = DEMO_AGENT.phone;
    await agent.save();
    console.log('Updated demo agent:', DEMO_AGENT.email);
  }

  console.log('\n--- Login hints (app on phone, same Wi‑Fi + backend running) ---');
  console.log('Customer:  email', DEMO_CUSTOMER.email, ' password', DEMO_CUSTOMER.password);
  console.log('Admin:     use .env ADMIN_USERNAME / ADMIN_PASSWORD (e.g. admin@aquarush.com / admin123)');
  console.log('Delivery:  email', DEMO_AGENT.email, ' password', DEMO_AGENT.password);
  console.log('---\n');

  await mongoose.disconnect();
  console.log('Seed done.');
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
