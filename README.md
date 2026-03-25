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