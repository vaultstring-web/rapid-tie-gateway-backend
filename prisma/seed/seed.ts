import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clear existing data
  console.log('Clearing existing data...');
  await prisma.$transaction([
    prisma.activityLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.session.deleteMany(),
    prisma.disbursementItem.deleteMany(),
    prisma.disbursementBatch.deleteMany(),
    prisma.approval.deleteMany(),
    prisma.dsaRequest.deleteMany(),
    prisma.dsaRate.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.approver.deleteMany(),
    prisma.financeOfficer.deleteMany(),
    prisma.department.deleteMany(),
    prisma.organization.deleteMany(),
    prisma.ticket.deleteMany(),
    prisma.ticketSale.deleteMany(),
    prisma.waitlistEntry.deleteMany(),
    prisma.eventView.deleteMany(),
    prisma.ticketTier.deleteMany(),
    prisma.event.deleteMany(),
    prisma.eventOrganizer.deleteMany(),
    prisma.paymentLink.deleteMany(),
    prisma.product.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.webhookDelivery.deleteMany(),
    prisma.webhook.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.merchantSettings.deleteMany(),
    prisma.merchant.deleteMany(),
    prisma.admin.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  console.log('✅ Existing data cleared');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin@123', 10);
  
  const admin = await prisma.user.create({
    data: {
      email: 'admin@rapidtie.vaultstring.com',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Administrator',
      role: 'ADMIN',
      emailVerified: true,
      admin: {
        create: {
          role: 'super_admin',
          permissions: ['*']
        }
      }
    },
  });
  console.log(`✅ Created admin: ${admin.email}`);

  // Create demo merchant
  const merchantPassword = await bcrypt.hash('Merchant@123', 10);
  
  const merchantUser = await prisma.user.create({
    data: {
      email: 'merchant@example.com',
      password: merchantPassword,
      firstName: 'Demo',
      lastName: 'Merchant',
      role: 'MERCHANT',
      emailVerified: true,
      merchant: {
        create: {
          businessName: 'Demo Store Malawi',
          businessType: 'Retail',
          businessRegNo: 'REG123456',
          taxId: 'TAX789012',
          website: 'https://demostore.mw',
          country: 'Malawi',
          city: 'Lilongwe',
          address: 'Area 47, Shop 5',
          status: 'ACTIVE',
          feePercentage: 3.0,
          settlementPeriod: 'daily',
          settings: {
            create: {
              checkoutBranding: JSON.stringify({ 
                primaryColor: '#448a33',
                logoPosition: 'top',
                accentColor: '#3b5a65'
              }),
              paymentMethods: JSON.stringify(['airtel_money', 'tnm_mpamba', 'card']),
              successUrl: 'https://demostore.mw/success',
              cancelUrl: 'https://demostore.mw/cancel',
            }
          }
        }
      }
    },
    include: {
      merchant: {
        include: {
          settings: true
        }
      }
    }
  });
  console.log(`✅ Created merchant: ${merchantUser.email}`);

  // Create API key for merchant
  await prisma.apiKey.create({
    data: {
      merchantId: merchantUser.merchant!.id,
      name: 'Production API Key',
      key: 'rt_live_' + crypto.randomBytes(16).toString('hex'),
      permissions: JSON.stringify(['read', 'write', 'refund']),
    }
  });

  // Create webhook for merchant
  await prisma.webhook.create({
    data: {
      merchantId: merchantUser.merchant!.id,
      url: 'https://demostore.mw/webhooks/rapidtie',
      events: JSON.stringify(['payment.success', 'payment.failed', 'refund.completed']),
      secret: crypto.randomBytes(32).toString('hex'),
      active: true,
    }
  });

  // Create demo organizer
  const organizerPassword = await bcrypt.hash('Organizer@123', 10);
  
  const organizerUser = await prisma.user.create({
    data: {
      email: 'organizer@example.com',
      password: organizerPassword,
      firstName: 'Demo',
      lastName: 'Organizer',
      role: 'ORGANIZER',
      emailVerified: true,
      organizer: {
        create: {
          organizationName: 'Malawi Events Pro',
          organizationRegNo: 'EVENT789012',
          organizationType: 'company',
          contactPerson: 'Demo Organizer',
          phone: '+265888123456',
          website: 'https://malawievents.mw',
          status: 'ACTIVE',
        }
      }
    },
    include: {
      organizer: true
    }
  });
  console.log(`✅ Created organizer: ${organizerUser.email}`);

  // Create demo organization for DSA
  const org = await prisma.organization.create({
    data: {
      name: 'Ministry of Finance - Malawi',
      registrationNo: 'GOV001',
      type: 'government',
      sector: 'Public Sector',
      address: 'Capital Hill, Lilongwe',
      city: 'Lilongwe',
      country: 'Malawi',
      contactEmail: 'finance@finance.gov.mw',
      contactPhone: '+265888456789',
      status: 'ACTIVE',
      budget: 50000000,
      fiscalYearStart: new Date('2026-07-01'),
      fiscalYearEnd: new Date('2027-06-30'),
    }
  });
  console.log(`✅ Created organization: ${org.name}`);

  // Create departments
  const dept1 = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: 'Finance Department',
      code: 'FIN',
      budget: 15000000,
    }
  });

  const dept2 = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: 'Field Operations',
      code: 'OPS',
      budget: 20000000,
    }
  });
  console.log(`✅ Created departments`);

  // Create DSA rates
  await prisma.dsaRate.createMany({
    data: [
      {
        organizationId: org.id,
        location: 'Lilongwe',
        perDiemRate: 45000,
        accommodationRate: 60000,
        effectiveFrom: new Date('2026-01-01'),
      },
      {
        organizationId: org.id,
        location: 'Blantyre',
        perDiemRate: 40000,
        accommodationRate: 55000,
        effectiveFrom: new Date('2026-01-01'),
      },
      {
        organizationId: org.id,
        location: 'Mzuzu',
        perDiemRate: 38000,
        accommodationRate: 50000,
        effectiveFrom: new Date('2026-01-01'),
      },
      {
        organizationId: org.id,
        location: 'Zomba',
        perDiemRate: 35000,
        accommodationRate: 45000,
        effectiveFrom: new Date('2026-01-01'),
      },
      {
        organizationId: org.id,
        location: 'Mangochi',
        perDiemRate: 42000,
        accommodationRate: 58000,
        effectiveFrom: new Date('2026-01-01'),
      },
    ],
  });
  console.log(`✅ Created DSA rates`);

  // Create budgets
  await prisma.budget.createMany({
    data: [
      {
        organizationId: org.id,
        departmentId: dept1.id,
        fiscalYear: '2026-2027',
        allocated: 15000000,
        spent: 0,
        committed: 0,
      },
      {
        organizationId: org.id,
        departmentId: dept2.id,
        fiscalYear: '2026-2027',
        allocated: 20000000,
        spent: 0,
        committed: 0,
      },
    ],
  });
  console.log(`✅ Created budgets`);

  // Create employee users
  const employee1Password = await bcrypt.hash('Employee@123', 10);
  const employee1 = await prisma.user.create({
    data: {
      email: 'john.doe@finance.gov.mw',
      password: employee1Password,
      firstName: 'John',
      lastName: 'Doe',
      role: 'EMPLOYEE',
      emailVerified: true,
      employee: {
        create: {
          organizationId: org.id,
          departmentId: dept2.id,
          employeeId: 'EMP001',
          jobTitle: 'Field Officer',
          grade: 'Grade 8',
          bankAccount: JSON.stringify({
            bank: 'NBS Bank',
            accountName: 'John Doe',
            accountNumber: '1234567890',
            branch: 'Lilongwe'
          }),
          mobileMoney: JSON.stringify({
            provider: 'Airtel Money',
            phoneNumber: '+265888123456'
          }),
        }
      }
    }
  });

  const employee2 = await prisma.user.create({
    data: {
      email: 'jane.smith@finance.gov.mw',
      password: employee1Password,
      firstName: 'Jane',
      lastName: 'Smith',
      role: 'EMPLOYEE',
      emailVerified: true,
      employee: {
        create: {
          organizationId: org.id,
          departmentId: dept1.id,
          employeeId: 'EMP002',
          jobTitle: 'Accountant',
          grade: 'Grade 6',
          bankAccount: JSON.stringify({
            bank: 'Standard Bank',
            accountName: 'Jane Smith',
            accountNumber: '0987654321',
            branch: 'Blantyre'
          }),
        }
      }
    }
  });
  console.log(`✅ Created employees: ${employee1.email}, ${employee2.email}`);

  // Create approver
  const approverPassword = await bcrypt.hash('Approver@123', 10);
  const approver = await prisma.user.create({
    data: {
      email: 'approver@finance.gov.mw',
      password: approverPassword,
      firstName: 'Approver',
      lastName: 'User',
      role: 'APPROVER',
      emailVerified: true,
      approver: {
        create: {
          organizationId: org.id,
          approvalLevel: 1,
          maxAmount: 500000,
          departments: JSON.stringify([dept1.id, dept2.id]),
        }
      }
    }
  });
  console.log(`✅ Created approver: ${approver.email}`);

  // Create finance officer
  const financePassword = await bcrypt.hash('Finance@123', 10);
  const financeOfficer = await prisma.user.create({
    data: {
      email: 'finance.officer@finance.gov.mw',
      password: financePassword,
      firstName: 'Finance',
      lastName: 'Officer',
      role: 'FINANCE_OFFICER',
      emailVerified: true,
      financeOfficer: {
        create: {
          organizationId: org.id,
          role: 'finance_officer',
        }
      }
    }
  });
  console.log(`✅ Created finance officer: ${financeOfficer.email}`);

  // Create sample events - MAKING SURE ORGANIZER EXISTS
  if (organizerUser.organizer) {
    const event1 = await prisma.event.create({
      data: {
        organizerId: organizerUser.organizer.id,
        name: 'Malawi Music Festival 2026',
        description: 'The biggest music festival in Malawi featuring top local and international artists.',
        shortDescription: '3 days of amazing music and entertainment',
        category: 'Music',
        type: 'concert',
        venue: 'Bingu National Stadium',
        city: 'Lilongwe',
        country: 'Malawi',
        startDate: new Date('2026-08-15T14:00:00Z'),
        endDate: new Date('2026-08-17T23:00:00Z'),
        timezone: 'Africa/Blantyre',
        coverImage: 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3',
        capacity: 5000,
        status: 'PUBLISHED',
        visibility: 'public',
        ticketTiers: {
          create: [
            {
              name: 'VIP',
              description: 'VIP access with backstage passes',
              price: 150000,
              quantity: 200,
              maxPerCustomer: 4,
              startSale: new Date('2026-06-01T00:00:00Z'),
              endSale: new Date('2026-08-14T23:59:59Z'),
            },
            {
              name: 'General Admission',
              description: 'Standard admission ticket',
              price: 45000,
              quantity: 3800,
              maxPerCustomer: 10,
              startSale: new Date('2026-06-01T00:00:00Z'),
              endSale: new Date('2026-08-14T23:59:59Z'),
            },
            {
              name: 'Early Bird',
              description: 'Limited early bird discount',
              price: 35000,
              quantity: 1000,
              maxPerCustomer: 4,
              startSale: new Date('2026-05-01T00:00:00Z'),
              endSale: new Date('2026-05-31T23:59:59Z'),
            },
          ],
        },
      },
    });
    console.log(`✅ Created event: ${event1.name}`);

    const event2 = await prisma.event.create({
      data: {
        organizerId: organizerUser.organizer.id,
        name: 'Business Innovation Summit',
        description: 'Annual conference for business leaders and entrepreneurs in Malawi.',
        shortDescription: 'Connect with Malawi\'s top business minds',
        category: 'Business',
        type: 'conference',
        venue: 'Bingu International Convention Centre',
        city: 'Lilongwe',
        country: 'Malawi',
        startDate: new Date('2026-09-20T08:00:00Z'),
        endDate: new Date('2026-09-22T18:00:00Z'),
        timezone: 'Africa/Blantyre',
        coverImage: 'https://images.unsplash.com/photo-1540575467063-178a50c2df87',
        capacity: 800,
        status: 'PUBLISHED',
        visibility: 'public',
        ticketTiers: {
          create: [
            {
              name: 'Premium Pass',
              description: 'Full access with workshops and networking dinner',
              price: 250000,
              quantity: 100,
              maxPerCustomer: 2,
            },
            {
              name: 'Standard Pass',
              description: 'Conference access only',
              price: 120000,
              quantity: 700,
              maxPerCustomer: 5,
            },
          ],
        },
      },
    });
    console.log(`✅ Created event: ${event2.name}`);
  } else {
    console.log('⚠️ Organizer not found, skipping events creation');
  }

  // Create sample products for merchant
  await prisma.product.createMany({
    data: [
      {
        merchantId: merchantUser.merchant!.id,
        name: 'Premium T-Shirt',
        description: 'High quality cotton t-shirt with logo',
        price: 8500,
        sku: 'TS001',
        inventory: 500,
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab',
        active: true,
      },
      {
        merchantId: merchantUser.merchant!.id,
        name: 'Wireless Headphones',
        description: 'Bluetooth headphones with noise cancellation',
        price: 45000,
        sku: 'HP002',
        inventory: 50,
        image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
        active: true,
      },
      {
        merchantId: merchantUser.merchant!.id,
        name: 'Coffee Mug',
        description: 'Ceramic coffee mug with design',
        price: 3500,
        sku: 'MG003',
        inventory: 1000,
        image: 'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d',
        active: true,
      },
    ],
  });
  console.log(`✅ Created sample products`);

  // Create sample payment links
  await prisma.paymentLink.createMany({
    data: [
      {
        merchantId: merchantUser.merchant!.id,
        title: 'Website Redesign Deposit',
        description: '50% deposit for website redesign project',
        amount: 150000,
        linkToken: crypto.randomBytes(16).toString('hex'),
        linkUrl: `https://pay.rapidtie.mw/link/${crypto.randomBytes(8).toString('hex')}`,
        views: 45,
        conversions: 12,
        singleUse: false,
        expiresAt: new Date('2026-12-31'),
        active: true,
      },
      {
        merchantId: merchantUser.merchant!.id,
        title: 'Monthly Subscription',
        description: 'Premium monthly subscription',
        amount: 25000,
        linkToken: crypto.randomBytes(16).toString('hex'),
        linkUrl: `https://pay.rapidtie.mw/link/${crypto.randomBytes(8).toString('hex')}`,
        views: 128,
        conversions: 45,
        singleUse: false,
        expiresAt: new Date('2026-12-31'),
        active: true,
      },
    ],
  });
  console.log(`✅ Created sample payment links`);

  // Get counts for summary
  const userCount = await prisma.user.count();
  const merchantCount = await prisma.merchant.count();
  const organizerCount = await prisma.eventOrganizer.count();
  const orgCount = await prisma.organization.count();
  const eventCount = await prisma.event.count();
  const tierCount = await prisma.ticketTier.count();
  const productCount = await prisma.product.count();
  const linkCount = await prisma.paymentLink.count();
  const rateCount = await prisma.dsaRate.count();

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📊 Seeded Data Summary:');
  console.log(`   - ${userCount} users`);
  console.log(`   - ${merchantCount} merchants`);
  console.log(`   - ${organizerCount} organizers`);
  console.log(`   - ${orgCount} DSA organizations`);
  console.log(`   - ${eventCount} events`);
  console.log(`   - ${tierCount} ticket tiers`);
  console.log(`   - ${productCount} products`);
  console.log(`   - ${linkCount} payment links`);
  console.log(`   - ${rateCount} DSA rates`);
  
  console.log('\n🔑 Demo Login Credentials:');
  console.log('   Admin: admin@rapidtie.vaultstring.com / Admin@123');
  console.log('   Merchant: merchant@example.com / Merchant@123');
  console.log('   Organizer: organizer@example.com / Organizer@123');
  console.log('   Employee: john.doe@finance.gov.mw / Employee@123');
  console.log('   Approver: approver@finance.gov.mw / Approver@123');
  console.log('   Finance Officer: finance.officer@finance.gov.mw / Finance@123');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });