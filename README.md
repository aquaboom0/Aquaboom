# AquaRush - Water Bottle Delivery Platform

A complete water bottle delivery platform with **one mobile app** (React Native + Expo) where users pick **Customer**, **Admin**, or **Delivery** at login, plus a **web Admin Panel** (React.js) and **Backend** (Node.js + Express + MongoDB).

---

## Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 18+ | Backend runtime |
| MongoDB | Atlas | Cloud database |
| Android Studio | Latest | Build Android APKs |
| Java JDK | 17 | Android build tools |
| Expo CLI | Latest | React Native development |

---

## Project Structure

```
Aquaboom/
├── backend/           # Node.js + Express API
├── customer-app/      # Unified mobile app: customer + admin + delivery partner (Expo)
└── admin-panel/       # Admin dashboard (React.js)
```

---

## Step 1: Backend Setup

### 1.1 Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your values:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/aquarush
JWT_SECRET=your-super-secret-jwt-key
```

### 1.2 Install & Run

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Backend runs at: **http://localhost:5000**

---

## Step 2: Mobile App (Android APK — customer, admin, delivery)

### 2.1 Install Dependencies

```bash
cd customer-app
npm install
```

### 2.2 Prebuild Android Project

```bash
npx expo prebuild --platform android
```

This creates the `android/` folder.

### 2.3 Build Debug APK

```bash
cd android
./gradlew assembleDebug
```

**APK Location:** `android/app/build/outputs/apk/debug/app-debug.apk`

### 2.4 Build Release APK (Signed)

```bash
# Generate signing key (one time)
keytool -genkey -v -keystore app-release.keystore -alias aquarush -keyalg RSA -keysize 2048 -validity 10000

# Configure signing in android/app/build.gradle
# Then build:
./gradlew assembleRelease
```

Partner and admin UIs live in the **same** `customer-app` build: sign in on the login screen with the **Delivery** or **Admin** role.

---

## Step 3: Admin Panel (React.js)

### 3.1 Install & Run

```bash
cd admin-panel
npm install
npm start
```

Admin Panel runs at: **http://localhost:3000**

### 3.2 Build for Production

```bash
npm run build
```

Production files in: `build/`

---

## Quick Start Commands

### Start All Services

```bash
# Terminal 1 - Backend
cd backend && npm run dev

# Terminal 2 - Admin Panel
cd admin-panel && npm start

# Terminal 3 - Unified mobile app (customer / admin / delivery)
cd customer-app && npx expo start
```

### Build mobile APK

```bash
cd customer-app
npx expo prebuild --platform android
cd android && ./gradlew assembleDebug
```

---

## Default Login Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@aquarush.com | admin123 |
| Customer | (Register via app) | - |
| Delivery Agent | (Created by admin) | - |

---

## API Endpoints

### Authentication
- `POST /api/auth/register` - Customer registration
- `POST /api/auth/login` - User login
- `GET /api/auth/profile` - Get profile

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders
- `GET /api/orders/:id` - Order details
- `PATCH /api/orders/:id/status` - Update status

### Products
- `GET /api/products` - List products
- `POST /api/admin/products` - Create product (Admin)
- `PATCH /api/admin/products/:id` - Update product (Admin)
- `DELETE /api/admin/products/:id` - Delete product (Admin)

### Delivery Agents
- `GET /api/agents` - List agents
- `PATCH /api/agents/:id/status` - Toggle agent status

### Analytics (Admin)
- `GET /api/admin/analytics/dashboard` - Dashboard stats
- `GET /api/admin/analytics/revenue` - Revenue data
- `GET /api/admin/analytics/orders` - Order analytics

---

## Troubleshooting

### Metro Bundler Issues
```bash
npx expo start --clear
```

### Android Build Issues
```bash
cd android
./gradlew clean
cd ..
npx expo prebuild --platform android --clean
```

### MongoDB Connection Error
- Check your `.env` MONGODB_URI
- Ensure IP whitelist in MongoDB Atlas

### APK Not Installing
- Enable "Install from unknown sources" on Android device
- Sign the APK for production use

---

## Technology Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js, Express.js, MongoDB, Mongoose |
| Mobile App (customer + admin + delivery) | React Native, Expo, Redux Toolkit |
| Admin Panel | React.js, Redux Toolkit, Recharts |
| Real-time | Socket.IO |
| Maps | React Native Maps, Expo Location |

---

## License

MIT License