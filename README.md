# Rapid Tie Payment Gateway - Backend

## 🚀 Overview

Welcome to the **Rapid Tie Payment Gateway** backend repository. This service powers the payment processing platform for Malawi, handling e-commerce payments, event ticketing, and DSA disbursements.

**Project:** Rapid Tie Payment Gateway  
**Company:** VaultString  
**Tech Stack:** Node.js, Express, TypeScript, PostgreSQL, Redis, Prisma

---

## 📋 Prerequisites

Before you begin, ensure you have the following installed:

| Requirement | Version | Download |
|-------------|---------|----------|
| **Node.js** | 20.x or higher | [nodejs.org](https://nodejs.org) |
| **PostgreSQL** | 15.x or higher | [postgresql.org](https://www.postgresql.org/download/) |
| **Redis** | 7.x or higher | [redis.io/download](https://redis.io/download/) |
| **Git** | Latest | [git-scm.com](https://git-scm.com/downloads) |
| **npm** | 9.x or higher | (comes with Node.js) |

### Optional (Recommended)
- **Docker Desktop** - For easy database setup
- **Postman** - For API testing
- **PgAdmin** - PostgreSQL GUI
- **Redis Insight** - Redis GUI

---

## 🔧 Installation Steps

### 1. Clone the Repository

```bash
# Clone the repository
git clone [your-repository-url]
cd rapid-tie-backend

# Verify you're in the correct directory
pwd  # Should show: /path/to/rapid-tie-backend

2. Install Dependencies

# Install all required packages
pnpm install

# Verify installation
pnpm list --depth=0

3. Environment Configuration


# Copy environment file

# For Windows
copy .env

4. Database setup
    # Check if PostgreSQL is installed and running (install if you do not have)
Get-Service postgresql*

# Start PostgreSQL if not running
net start postgresql-x64-15

# Access PostgreSQL
psql -U postgres

# In psql prompt, create database
CREATE DATABASE rapid_tie_db;
\q

4. DOCKER SETUP
 # Run PostgreSQL container
docker run -d --name rapid-tie-postgres -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rapid_tie_db -p 5432:5432 postgres:15

# Run Redis container
docker run -d  --name rapid-tie-redis -p 6379:6379  redis:7

# Verify containers are running
docker ps

5. DATABASE MIGRATIONS
# Generate Prisma client
pnpm run prisma:generate

# Run initial migration
pnpm run prisma:migrate

# Seed the database with demo data
pnpm run db:seed

🌱 Starting database seeding...
Clearing existing data...
✅ Existing data cleared
✅ Created admin: admin@rapidtie.vaultstring.com
✅ Created merchant: merchant@example.com
✅ Created organizer: organizer@example.com
✅ Created organization: Ministry of Finance - Malawi
✅ Created departments
✅ Created DSA rates
✅ Created budgets
✅ Created employees
✅ Created approver
✅ Created finance officer
✅ Created sample events
✅ Created sample products
✅ Created sample payment links

🎉 Database seeding completed successfully!

📊 Seeded Data Summary:
   - 9 users
   - 1 merchants
   - 1 organizers
   - 1 DSA organizations
   - 2 events
   - 5 ticket tiers
   - 3 products
   - 2 payment links
   - 5 DSA rates

🔑 Demo Login Credentials:
   Admin: admin@rapidtie.vaultstring.com / Admin@123
   Merchant: merchant@example.com / Merchant@123
   Organizer: organizer@example.com / Organizer@123
   Employee: john.doe@finance.gov.mw / Employee@123
   Approver: approver@finance.gov.mw / Approver@123
   Finance Officer: finance.officer@finance.gov.mw / Finance@123

# (Optional) Open Prisma Studio to view data
pnpm run prisma:studio

**MIGRATION COMMANDS REFERENCE**
# Create a new migration
pnpm prisma migrate dev --name migration_name

# Reset database (caution: deletes all data)
pnpm run db:reset

# View database in browser
npx prisma studio

6. RUN THE APPLICATION
# Start the development server
pnpm run dev

# You should see:
# ╔════════════════════════════════════════════╗
# ║     Rapid Tie Payment Gateway              ║
# ║     Server is running on port 3001         ║
# ║     Environment: development                ║
# ╚════════════════════════════════════════════╝

PRODUCTION MODE
# Build the application
pnpm run build

# Start production server
npm start

✅ Verify Installation
1. Test API Health

# Using curl
curl.exe http://localhost:3001/health

# Expected response:
{
  "status": "OK",
  "timestamp": "2026-03-12T10:30:00.000Z",
  "uptime": 123.45,
  "environment": "development",
  "project": "Rapid Tie Payment Gateway"
}

2. TEST DATABASE CONNECTION
bash
# Check if database is accessible
npx prisma studio
# Should open browser with database tables
3. TEST AUTHENTICATION
bash
# Try to login with demo credentials
Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"merchant@example.com","password":"Merchant@123"'

# Should return success with user data and tokens

📁 PROJECT STRUCTURE

rapid-tie-backend/
├── src/
│   ├── config/           # Configuration files
│   ├── controllers/      # Request handlers
│   ├── middlewares/      # Express middlewares
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   ├── utils/            # Utility functions
│   ├── validators/       # Input validation
│   ├── types/            # TypeScript types
│   ├── jobs/             # Background jobs
│   ├── integrations/     # Third-party integrations
│   └── server.ts         # Entry point
├── prisma/
│   ├── schema.prisma     # Database schema
│   └── seed.ts           # Seed data
├── tests/
│   ├── unit/             # Unit tests
│   ├── integration/      # Integration tests
│   └── e2e/              # End-to-end tests
├── logs/                  # Application logs
├── uploads/               # File uploads
├── .env                   # Environment variables
├── .env.example           # Example environment
├── package.json           # Dependencies
└── README.md              # This file

🧪 TESTING
bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm run test:watch

# Run tests with coverage
pnpm run test:coverage

# Run specific test file
pnpm jest src/controllers/auth.controller.test.ts

📊 Available Scripts
Command	Description
pnpm run dev	Start development server with hot reload
pnpm run build	Build for production
pnpm start	Start production server
pnpm run lint	Run ESLint
pnpm run format	Format code with Prettier
pnpm run type-check	Check TypeScript types
pnpm test	Run tests
pnpm run test:coverage	Run tests with coverage
pnpm run prisma:generate	Generate Prisma client
pnpm run prisma:migrate	Run database migrations
pnpm run prisma:studio	Open Prisma Studio
pnpm run db:seed	Seed database
pnpm run db:reset	Reset database (caution)


### ✅ Backend Authentication AND back-end event Ticketing Platform

### Test Endpoints

#### Backend Auth
- Login: `POST /api/auth/login`
- Register: `POST /api/auth/register`
- Password Reset: `POST /api/auth/forgot-password` and `POST /api/auth/reset-password`
- Email Verification: `POST /api/auth/verify-email`
- 2FA Verification: `POST /api/auth/2fa/verify`

#### Organizer Module
- Get Dashboard: `GET /api/organizer/events`
- Create Event: `POST /api/organizer/events`
- Update Event: `PUT /api/organizer/events/:id`

Headers for authorized requests:
```bash
Authorization: Bearer TOKEN
```

#### 1. Create Event
```bash
POST /api/organizer/events
```
Implemented:
- Organizer authentication check  
- Event data validation  
- Prisma event creation  
- Event visibility: public / merchant-only / all-platform  
- Error handling using AppError  
- Return created event ID

#### 2. Update Event
```bash
PUT /api/organizer/events/:id
```
Implemented:
- Update event fields  
- Validate organizer ownership  
- Track cross-platform engagement metrics  
- Validate status transitions  
- Log all changes  
- Authorization protection  
- Input validation

#### 3. Organizer Dashboard
```bash
GET /api/organizer/events
```
Implemented:
- Return upcoming and past events  
- Calculate total tickets and revenue  
- Cross-platform visibility stats  
- Views by merchants and DSA employees  
- Structure ready for caching

---

### How Team Should Use These Endpoints

#### Get Organizer Dashboard
```bash
GET /api/organizer/events
```
Headers:
```bash
Authorization: Bearer TOKEN
```
Returns: upcoming events, past events, total tickets, revenue, cross-platform stats

#### Create Event
```bash
POST /api/organizer/events
```
Example Body:
```json
{
  "title": "Tech Conference",
  "description": "Annual tech conference",
  "startDate": "2026-04-10",
  "endDate": "2026-04-11",
  "location": "Lilongwe",
  "visibility": "public"
}
```
Visibility: public / merchant-only / all-platform

#### Update Event
```bash
PUT /api/organizer/events/:id
```
Supports: updating fields, status, engagement tracking  
Validation: must own event, organizer-only, status transitions enforced

---

---

### Notes
All organizer routes require:
```bash
Authorization: Bearer TOKEN
```
Only users with **organizer role** can access these endpoints.

---

## 🧪 API Testing (Thunder Client)

The Organizer and Auth endpoints were tested using Thunder Client in VS Code.

### Steps to Test
1. Open Thunder Client  
2. Create new request  
3. Select method (GET / POST / PUT)  
4. Enter endpoint URL  
5. Add Authorization header if required  
6. Send request
## 🎫 Event Ticketing System 
### Architecture Flow
Event Creation → Ticket Tiers → Ticket Validation → Payment Processing → Order Confirmation → Sales Dashboard → Attendee Management → Check-in

---

## 📡 API Endpoints Summary

### Event Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/organizer/events | Organizer dashboard with upcoming/past events |
| POST | /api/organizer/events | Create new event with image uploads |
| PUT | /api/organizer/events/:id | Update event details |
| GET | /api/events/:id/tiers | Get event ticket tiers with availability |

### Ticketing & Checkout
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/public/tickets/validate | Validate tickets, lock inventory, generate session token |
| POST | /api/events/:id/purchase | Purchase tickets, create reservation |
| POST | /api/payments/initiate | Process payment (Airtel/Mpamba/Card) |
| GET | /api/orders/:id | Get order confirmation with QR codes |
| POST | /api/orders/:id/send-email | Send ticket confirmation email |
| POST | /api/orders/:id/update-inventory | Permanently update inventory |

### Sales & Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/organizer/events/:id/sales | Real-time sales dashboard |
| WS | ws://localhost:3001 | WebSocket for live sales updates |

### Attendee Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/organizer/events/:id/attendees?page=1&limit=50 | Paginated attendee list |
| GET | /api/organizer/events/:id/attendees/export | Export attendees to CSV |
| GET | /api/organizer/events/:id/attendees/stats | Attendee statistics |

### Check-in Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/events/checkin | Single ticket check-in with QR validation |
| POST | /api/events/checkin/batch | Batch check-in multiple tickets |
| GET | /api/events/checkin/stats/:eventId | Check-in statistics by role |
| POST | /api/organizer/checkin/offline-sync | Sync offline check-ins |

---

## 🔄 Complete Ticket Purchase Flow

### Step 1: Organizer Creates Event
POST /api/organizer/events
Authorization: Bearer TOKEN

{
  "name": "Tech Conference 2026",
  "description": "Annual technology conference",
  "startDate": "2026-06-10T18:00:00.000Z",
  "endDate": "2026-06-10T22:00:00.000Z",
  "venue": "BICC",
  "city": "Lilongwe",
  "capacity": 500,
  "visibility": "public"
}

### Step 2: Customer Views Available Tickets
GET /api/events/{eventId}/tiers

### Step 3: Customer Validates & Reserves Tickets
POST /api/public/tickets/validate
{
  "tierId": "tier_id",
  "quantity": 2,
  "purchaserRole": "PUBLIC"
}

### Step 4: Customer Initiates Payment
POST /api/payments/initiate
{
  "sessionToken": "abc-123-def",
  "paymentMethod": "airtel_money",
  "provider": "airtel",
  "customerPhone": "0888123456"
}

### Step 5: Get Order Confirmation with QR Codes
GET /api/orders/{orderId}

### Step 6: Send Confirmation Email
POST /api/orders/{orderId}/send-email

### Step 7: Update Inventory Permanently
POST /api/orders/{orderId}/update-inventory

---

## ✅ Check-in Management

### Single Ticket Check-in
POST /api/events/checkin
{
  "qrCode": "345879ca-a0d9-4904-b06b-5c1d832938dd",
  "role": "SECURITY_GUARD",
  "deviceId": "scanner-01"
}

### Batch Check-in
POST /api/events/checkin/batch
{
  "tickets": [
    {"qrCode": "qr-code-1"},
    {"qrCode": "qr-code-2"}
  ],
  "role": "EVENT_STAFF"
}

### Check-in Statistics
GET /api/events/checkin/stats/{eventId}

---

## 🧪 Test Data (After Seeding)

### Test QR Codes
1. 345879ca-a0d9-4904-b06b-5c1d832938dd
2. 40394c9d-fe66-4953-b86d-04aacabc8566
3. 8c8575cd-44d0-4285-891d-4ae1b5a80ff8

### Test Endpoints
GET /api/events/{eventId}/tiers
GET /api/organizer/events/{eventId}/sales
GET /api/organizer/events/{eventId}/attendees
POST /api/events/checkin

---

## ✅ Feature Checklist

| Feature | Status |
|---------|--------|
| Event Creation | ✅ |
| Ticket Tiers | ✅ |
| Ticket Validation | ✅ |
| Inventory Locking | ✅ |
| Payment Processing | ✅ |
| QR Code Generation | ✅ |
| Email Confirmation | ✅ |
| Sales Dashboard | ✅ |
| WebSocket Updates | ✅ |
| Attendee List | ✅ |
| CSV Export | ✅ |
| Check-in System | ✅ |
| Batch Check-in | ✅ |
| Offline Sync | ✅ |

---


# 🚀 P2 – Enhanced Platform Experience

## 📊 Event Analytics Dashboard
Endpoint:
GET /api/analytics/events

Features:
- Cross-platform event metrics aggregation
- Track event views by user role
- Conversion rate calculation
- Demographic breakdown analysis
- Popular location heat maps

---

## 🌍 Universal Events Feed
Endpoint:
GET /api/events/universal

Features:
- Aggregate events from all sources
- Personalized feed by user role
- Relevance scoring algorithm
- Cached personalized feed (5 minutes)

---

## 🎯 Event Recommendations
Endpoint:
GET /api/events/recommended

Features:
- Collaborative filtering recommendations
- Past event attendance analysis
- DSA employee travel destination logic
- Merchant industry matching

---

## 📅 Event Calendar
Endpoint:
GET /api/calendar

Features:
- Aggregate saved & attended events
- Multiple calendar views
- iCal export support
- Google Calendar export
- Upcoming event reminders

---

## 🤝 Event Networking
Endpoint:
GET /api/events/networking

Features:
- Match users attending same events
- Suggest connections by role & interests
- Optional attendee messaging
- Networking success metrics tracking

---

## 🔔 Notification Center
Endpoint:
GET /api/notifications

Features:
- Database-stored notifications
- Event reminders & recommendations
- Read / unread status
- Real-time WebSocket notifications

---

## ⚙️ Notification Preferences
Endpoint:
PUT /api/users/notification-preferences

Features:
- User notification preferences
- Event reminder settings
- Quiet hours configuration
- Digest frequency control

---

## 🎟️ QR Code Management
Endpoint:
POST /api/organizer/qrcodes/regenerate

Features:
- HMAC-signed QR codes
- Role-specific QR codes
- Bulk email queue
- Delivery tracking

---

## 📢 Bulk Messaging
Endpoint:
POST /api/organizer/communications

Features:
- Queue bulk messages
- Filter recipients by role
- Track open rates
- Handle opt-out requests

---

## ✅ P2 Feature Checklist

| Feature | Status |
|--------|--------|
| Event Analytics Dashboard | ✅ |
| Universal Events Feed | ✅ |
| Event Recommendations | ✅ |
| Event Calendar | ✅ |
| Event Networking | ✅ |
| Notification Center | ✅ |
| Notification Preferences | ✅ |
| QR Code Management | ✅ |
| Bulk Messaging | ✅ |

---
