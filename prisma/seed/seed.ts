import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');
  
  console.log('Clearing existing data...');
  
  try {
    // Networking related (depends on events, users)
    await prisma.message.deleteMany();
    await prisma.connection.deleteMany();
    await prisma.networkingProfile.deleteMany();
    await prisma.networkingMetric.deleteMany();
    
    // Ticket/Event related
    await prisma.ticket.deleteMany();
    await prisma.ticketSale.deleteMany();
    await prisma.waitlistEntry.deleteMany();
    await prisma.eventView.deleteMany();
    await prisma.ticketTier.deleteMany();
    await prisma.paymentSession.deleteMany();
    await prisma.event.deleteMany();
    await prisma.eventOrganizer.deleteMany();
    
    // Payment/Transaction related (Refund depends on Transaction)
    await prisma.refund.deleteMany();
    await prisma.transaction.deleteMany();
    await prisma.auditLog.deleteMany();
    
    // DSA related
    await prisma.disbursementItem.deleteMany();
    await prisma.disbursementBatch.deleteMany();
    await prisma.approval.deleteMany();
    await prisma.dsaRequest.deleteMany();
    await prisma.dsaRate.deleteMany();
    await prisma.budget.deleteMany();
    await prisma.employee.deleteMany();
    await prisma.approver.deleteMany();
    await prisma.financeOfficer.deleteMany();
    await prisma.department.deleteMany();
    await prisma.organization.deleteMany();
    
    // Communication related
    await prisma.communicationRecipient.deleteMany();
    await prisma.communicationOptOut.deleteMany();
    await prisma.communication.deleteMany();
    
    // Fraud related
    await prisma.flaggedTransaction.deleteMany();
    await prisma.fraudAlert.deleteMany();
    await prisma.fraudRule.deleteMany();
    
    // Merchant/E-commerce related
    await prisma.orderItem.deleteMany();
    await prisma.order.deleteMany();
    await prisma.product.deleteMany();
    await prisma.paymentLink.deleteMany();
    await prisma.settlement.deleteMany();
    await prisma.webhookDelivery.deleteMany();
    await prisma.webhook.deleteMany();
    await prisma.apiKey.deleteMany();
    await prisma.merchantSettings.deleteMany();
    await prisma.merchant.deleteMany();
    
    // Notifications and preferences
    await prisma.notification.deleteMany();
    await prisma.notificationPreferences.deleteMany();
    
    // Activity and sessions
    await prisma.activityLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.admin.deleteMany();
    
    // Users last
    await prisma.user.deleteMany();
    
  } catch (error) {
    console.error('Error clearing data:', error);
  }

  console.log('✅ Existing data cleared');
  
  // ======================
  // 1. Create ADMIN User
  // ======================
  console.log('\n📝 Creating ADMIN user...');
  
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

  // ======================
  // 2. Create Demo Merchant
  // ======================
  console.log('\n📝 Creating merchant...');
  
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

  // ======================
  // 3. Create Demo Organizer
  // ======================
  console.log('\n📝 Creating organizer...');
  
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

  // ======================
  // 4. Create DSA Organization
  // ======================
  console.log('\n📝 Creating DSA organization...');
  
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

  // ======================
  // 5. Create Departments
  // ======================
  console.log('\n📝 Creating departments...');
  
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
  
  const dept3 = await prisma.department.create({
    data: {
      organizationId: org.id,
      name: 'Administration',
      code: 'ADMIN',
      budget: 15000000,
    }
  });
  
  console.log(`✅ Created departments: ${dept1.name}, ${dept2.name}, ${dept3.name}`);

  // ======================
  // 6. Create DSA Rates (Enhanced with grade-based rates)
  // ======================
  console.log('\n📝 Creating DSA rates...');
  
  await prisma.dsaRate.createMany({
    data: [
      // Lilongwe rates
      { organizationId: org.id, location: 'Lilongwe', grade: null, perDiemRate: 45000, accommodationRate: 60000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Lilongwe', grade: 'Grade 8', perDiemRate: 50000, accommodationRate: 65000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Lilongwe', grade: 'Grade 7', perDiemRate: 55000, accommodationRate: 70000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Lilongwe', grade: 'Grade 6', perDiemRate: 60000, accommodationRate: 75000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Blantyre rates
      { organizationId: org.id, location: 'Blantyre', grade: null, perDiemRate: 40000, accommodationRate: 55000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Blantyre', grade: 'Grade 8', perDiemRate: 45000, accommodationRate: 60000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Blantyre', grade: 'Grade 7', perDiemRate: 50000, accommodationRate: 65000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Mzuzu rates
      { organizationId: org.id, location: 'Mzuzu', grade: null, perDiemRate: 38000, accommodationRate: 50000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Mzuzu', grade: 'Grade 8', perDiemRate: 42000, accommodationRate: 55000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Zomba rates
      { organizationId: org.id, location: 'Zomba', grade: null, perDiemRate: 35000, accommodationRate: 45000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Mangochi rates
      { organizationId: org.id, location: 'Mangochi', grade: null, perDiemRate: 42000, accommodationRate: 58000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Karonga rates
      { organizationId: org.id, location: 'Karonga', grade: null, perDiemRate: 50000, accommodationRate: 70000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      { organizationId: org.id, location: 'Karonga', grade: 'Grade 7', perDiemRate: 55000, accommodationRate: 75000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
      // Salima rates
      { organizationId: org.id, location: 'Salima', grade: null, perDiemRate: 35000, accommodationRate: 45000, effectiveFrom: new Date('2026-01-01'), effectiveTo: null },
    ],
  });
  console.log(`✅ Created 14 DSA rates`);

  // ======================
  // 7. Create Budgets
  // ======================
  console.log('\n📝 Creating budgets...');
  
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
      {
        organizationId: org.id,
        departmentId: dept3.id,
        fiscalYear: '2026-2027',
        allocated: 15000000,
        spent: 0,
        committed: 0,
      },
    ],
  });
  console.log(`✅ Created 3 budget records`);

  // ======================
  // 8. Create Employees
  // ======================
  console.log('\n📝 Creating employees...');
  
  const employeePassword = await bcrypt.hash('Employee@123', 10);
  
  const employee1 = await prisma.user.create({
    data: {
      email: 'john.doe@finance.gov.mw',
      password: employeePassword,
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
      password: employeePassword,
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

  // ======================
  // 9. Create Approver
  // ======================
  console.log('\n📝 Creating approver...');
  
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
          departments: JSON.stringify([dept1.id, dept2.id, dept3.id]),
        }
      }
    }
  });
  console.log(`✅ Created approver: ${approver.email}`);

  // ======================
  // 10. Create Finance Officer
  // ======================
  console.log('\n📝 Creating finance officer...');
  
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

  // ======================
  // 11. Create Networking Test Users
  // ======================
  console.log('\n📝 Creating networking test users...');
  
  const janePassword = await bcrypt.hash('Test@123', 10);
  const jane = await prisma.user.upsert({
    where: { email: 'jane@email.com' },
    update: {},
    create: {
      email: 'jane@email.com',
      password: janePassword,
      firstName: 'Jane',
      lastName: 'Nyirenda',
      role: 'PUBLIC',
      emailVerified: true,
    },
  });
  console.log(`✅ Created user: ${jane.email} (has ticket purchases)`);

  const johnPassword = await bcrypt.hash('Test@123', 10);
  const john = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      password: johnPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'PUBLIC',
      emailVerified: true,
    },
  });
  console.log(`✅ Created user: ${john.email}`);

  // ======================
  // 12. Create Events and Tickets
  // ======================
  let testEvent: any = null;
  
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

    // Test event for ticketing system
    console.log('\n📝 Creating test event for ticketing system...');
    
    testEvent = await prisma.event.create({
      data: {
        organizerId: organizerUser.organizer.id,
        name: 'Updated Tech Event',
        description: 'Official Opening of the company',
        shortDescription: 'Official launch',
        category: 'Gala',
        type: 'Public',
        venue: 'BICC',
        city: 'Lilongwe',
        amount: 100,
        country: 'Malawi',
        startDate: new Date('2026-06-10T18:00:00.000Z'),
        endDate: new Date('2026-06-10T22:00:00.000Z'),
        timezone: 'Central Africa',
        coverImage: 'https://example.com/cover.jpg',
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        capacity: 100,
        status: 'COMPLETED',
        visibility: 'public',
      },
    });
    console.log(`✅ Created test event: ${testEvent.name} (ID: ${testEvent.id})`);

    // Create ticket tiers for test event
    const vipTier = await prisma.ticketTier.create({
      data: {
        eventId: testEvent.id,
        name: 'VIP',
        description: 'VIP Access',
        price: 20000,
        quantity: 50,
        sold: 10,
        maxPerCustomer: 5,
        startSale: new Date('2026-04-10T08:00:00.000Z'),
        endSale: new Date('2026-06-10T18:00:00.000Z'),
        rolePricing: {
          student: 15000,
          vip_member: 12000
        },
      },
    });

    await prisma.ticketTier.create({
      data: {
        eventId: testEvent.id,
        name: 'Regular',
        description: 'Regular Access',
        price: 10000,
        quantity: 100,
        sold: 0,
        maxPerCustomer: 10,
        startSale: new Date('2026-04-10T08:00:00.000Z'),
        endSale: new Date('2026-06-10T18:00:00.000Z'),
        rolePricing: {
          student: 8000,
          vip_member: 7000
        },
      },
    });

    console.log(`✅ Created ticket tiers: VIP (MWK 20,000), Regular (MWK 10,000)`);

    // Create test orders and tickets
    console.log('Creating test orders and tickets...');
    
    // Order 1 - Jane Nyirenda (2 VIP tickets)
    const order1 = await prisma.ticketSale.create({
      data: {
        organizerId: organizerUser.organizer.id,
        eventId: testEvent.id,
        orderNumber: 'ORD-1775739339792',
        customerName: 'Jane Nyirenda',
        customerEmail: 'jane@email.com',
        customerPhone: '0991234567',
        totalAmount: 40000,
        feeAmount: 1200,
        netAmount: 38800,
        status: 'COMPLETED',
        paymentMethod: 'airtel_money',
        transactionId: 'cmnrhgoey0009rcyj0wko2eq7',
      },
    });

    await prisma.ticket.createMany({
      data: [
        {
          id: 'd2539793-9478-40f2-bd82-68f4c4487773',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order1.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: '345879ca-a0d9-4904-b06b-5c1d832938dd',
          qrCodeData: JSON.stringify({ ticketId: 'd2539793-9478-40f2-bd82-68f4c4487773', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
        {
          id: '5af3d2f3-16a0-4987-b33f-54258605c08a',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order1.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: '40394c9d-fe66-4953-b86d-04aacabc8566',
          qrCodeData: JSON.stringify({ ticketId: '5af3d2f3-16a0-4987-b33f-54258605c08a', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
      ],
    });

    // Order 2 - Test Failure (1 VIP ticket)
    const order2 = await prisma.ticketSale.create({
      data: {
        organizerId: organizerUser.organizer.id,
        eventId: testEvent.id,
        orderNumber: 'ORD-1775744584154',
        customerName: 'Test Failure',
        customerEmail: 'fail@test.com',
        customerPhone: '0999999999',
        totalAmount: 20000,
        feeAmount: 600,
        netAmount: 19400,
        status: 'COMPLETED',
        paymentMethod: 'airtel_money',
      },
    });

    await prisma.ticket.create({
      data: {
        id: 'f8dc62cc-c3e4-4f0e-9d4a-3b5e8c9d7a2b',
        eventId: testEvent.id,
        tierId: vipTier.id,
        orderId: order2.id,
        attendeeName: 'Test Failure',
        attendeeEmail: 'fail@test.com',
        attendeePhone: '0999999999',
        qrCode: '8c8575cd-44d0-4285-891d-4ae1b5a80ff8',
        qrCodeData: JSON.stringify({ ticketId: 'f8dc62cc-c3e4-4f0e-9d4a-3b5e8c9d7a2b', eventId: testEvent.id, tierId: vipTier.id }),
        status: 'ACTIVE',
      },
    });

    // Order 3 - Another test order (2 VIP tickets) for Jane
    const order3 = await prisma.ticketSale.create({
      data: {
        organizerId: organizerUser.organizer.id,
        eventId: testEvent.id,
        orderNumber: 'ORD-1775736840178',
        customerName: 'Jane Nyirenda',
        customerEmail: 'jane@email.com',
        customerPhone: '0991234567',
        totalAmount: 40000,
        feeAmount: 1200,
        netAmount: 38800,
        status: 'COMPLETED',
        paymentMethod: 'airtel_money',
      },
    });

    await prisma.ticket.createMany({
      data: [
        {
          id: '3c23a844-1b2d-4e5f-8a9b-0c1d2e3f4a5b',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order3.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: '3c6608f1-f0ae-44e6-8542-c9bec15377cf',
          qrCodeData: JSON.stringify({ ticketId: '3c23a844-1b2d-4e5f-8a9b-0c1d2e3f4a5b', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
        {
          id: '4d34b955-2c3e-5f6g-9b0c-1d2e3f4g5b6c',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order3.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: '2384a6bf-5a61-4363-be3e-7ff7e223e23a',
          qrCodeData: JSON.stringify({ ticketId: '4d34b955-2c3e-5f6g-9b0c-1d2e3f4g5b6c', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
      ],
    });

    // Order 4 - John's ticket (so he attends the same event)
    const order4 = await prisma.ticketSale.create({
      data: {
        organizerId: organizerUser.organizer.id,
        eventId: testEvent.id,
        orderNumber: 'ORD-1775724032346',
        customerName: 'John Doe',
        customerEmail: 'john@example.com',
        customerPhone: '0999111222',
        totalAmount: 20000,
        feeAmount: 600,
        netAmount: 19400,
        status: 'COMPLETED',
        paymentMethod: 'airtel_money',
      },
    });

    await prisma.ticket.create({
      data: {
        id: '9i89g499-7h8j-0k1l-4g5h-6i7j8k9l0g1h',
        eventId: testEvent.id,
        tierId: vipTier.id,
        orderId: order4.id,
        attendeeName: 'John Doe',
        attendeeEmail: 'john@example.com',
        attendeePhone: '0999111222',
        qrCode: '9a8b7c6d-5e4f-3g2h-1i0j-9k8l7m6n5o4p',
        qrCodeData: JSON.stringify({ ticketId: '9i89g499-7h8j-0k1l-4g5h-6i7j8k9l0g1h', eventId: testEvent.id, tierId: vipTier.id }),
        status: 'ACTIVE',
      },
    });

    // Order 5 - More tickets for Jane
    const order5 = await prisma.ticketSale.create({
      data: {
        organizerId: organizerUser.organizer.id,
        eventId: testEvent.id,
        orderNumber: 'ORD-1775722943271',
        customerName: 'Jane Nyirenda',
        customerEmail: 'jane@email.com',
        customerPhone: '0991234567',
        totalAmount: 40000,
        feeAmount: 1200,
        netAmount: 38800,
        status: 'COMPLETED',
        paymentMethod: 'airtel_money',
      },
    });

    await prisma.ticket.createMany({
      data: [
        {
          id: '7g67e288-5f6h-8i9j-2e3f-4g5h6i7j8e9f',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order5.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: 'ac52eb75-2832-46b7-8750-f7ed62f947c3',
          qrCodeData: JSON.stringify({ ticketId: '7g67e288-5f6h-8i9j-2e3f-4g5h6i7j8e9f', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
        {
          id: '8h78f399-6g7i-9j0k-3f4g-5h6i7j8k9f0g',
          eventId: testEvent.id,
          tierId: vipTier.id,
          orderId: order5.id,
          attendeeName: 'Jane Nyirenda',
          attendeeEmail: 'jane@email.com',
          attendeePhone: '0991234567',
          qrCode: '6ca6a31e-d2e8-4873-b3c3-246d9dfe0e10',
          qrCodeData: JSON.stringify({ ticketId: '8h78f399-6g7i-9j0k-3f4g-5h6i7j8k9f0g', eventId: testEvent.id, tierId: vipTier.id }),
          status: 'ACTIVE',
        },
      ],
    });

    // Create transaction record
    await prisma.transaction.create({
      data: {
        transactionRef: 'TXN-1775739522193-20ed1e01',
        amount: 40000,
        fee: 1200,
        netAmount: 38800,
        currency: 'MWK',
        status: 'SUCCESS',
        paymentMethod: 'airtel_money',
        provider: 'airtel',
        providerRef: 'AIR-1775739522195',
        organizerId: organizerUser.organizer.id,
        orderId: order1.id,
        metadata: {
          tierId: vipTier.id,
          eventId: testEvent.id,
          quantity: 2,
          sessionToken: '9390f903-6e3e-4f60-a312-ee557264e0eb'
        },
      },
    });

    console.log(`✅ Created test orders with tickets for "Updated Tech Event"`);
    console.log(`   - Jane has 8 tickets`);
    console.log(`   - John has 1 ticket`);

    // ============================================
    // 13. Create Payment Sessions for Testing Authentication
    // ============================================
    console.log('\n📝 Creating payment sessions for authentication testing...');

    const vipTierExisting = await prisma.ticketTier.findFirst({
      where: { eventId: testEvent.id, name: 'VIP' }
    });

    if (jane && john && vipTierExisting) {
      // Create payment session for Jane
      await prisma.paymentSession.create({
        data: {
          sessionToken: 'jane-test-session-123',
          userId: jane.id,
          eventId: testEvent.id,
          tierId: vipTierExisting.id,
          quantity: 2,
          totalAmount: 40000,
          currency: 'MWK',
          status: 'PENDING',
          paymentMethod: 'airtel_money',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: JSON.stringify({ test: true, user: 'jane' })
        }
      });
      console.log('✅ Created payment session for Jane: jane-test-session-123');

      // Create payment session for Jane (completed)
      await prisma.paymentSession.create({
        data: {
          sessionToken: 'jane-completed-session-789',
          userId: jane.id,
          eventId: testEvent.id,
          tierId: vipTierExisting.id,
          quantity: 1,
          totalAmount: 20000,
          currency: 'MWK',
          status: 'COMPLETED',
          paymentMethod: 'card',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: JSON.stringify({ test: true, user: 'jane', completed: true })
        }
      });
      console.log('✅ Created completed payment session for Jane: jane-completed-session-789');

      // Create payment session for John
      await prisma.paymentSession.create({
        data: {
          sessionToken: 'john-test-session-456',
          userId: john.id,
          eventId: testEvent.id,
          tierId: vipTierExisting.id,
          quantity: 1,
          totalAmount: 20000,
          currency: 'MWK',
          status: 'COMPLETED',
          paymentMethod: 'airtel_money',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          metadata: JSON.stringify({ test: true, user: 'john' })
        }
      });
      console.log('✅ Created payment session for John: john-test-session-456');

      console.log('\n📋 Payment Sessions Created for Authentication Testing:');
      console.log(`   Jane's pending session: jane-test-session-123 (User: ${jane.email})`);
      console.log(`   Jane's completed session: jane-completed-session-789 (User: ${jane.email})`);
      console.log(`   John's session: john-test-session-456 (User: ${john.email})`);
    } else {
      console.log('⚠️ Could not create payment sessions - missing users or ticket tiers');
    }

    // ============================================
    // 14. Create Networking Profiles and Connections
    // ============================================
    console.log('\n📝 Creating networking profiles...');

    // Create networking profile for Jane
    await prisma.networkingProfile.upsert({
      where: { userId: jane.id },
      update: {},
      create: {
        userId: jane.id,
        eventId: testEvent.id,
        optIn: true,
        interests: ["Technology", "Music", "Business", "Networking"],
        jobTitle: "Senior Software Engineer",
        company: "Tech Innovations Malawi",
        bio: "Passionate about connecting tech professionals in Malawi",
      },
    });
    console.log(`✅ Created networking profile for Jane`);

    // Create networking profile for John
    await prisma.networkingProfile.upsert({
      where: { userId: john.id },
      update: {},
      create: {
        userId: john.id,
        eventId: testEvent.id,
        optIn: true,
        interests: ["Technology", "Business", "Startups", "Innovation"],
        jobTitle: "Product Manager",
        company: "Startup Malawi",
        bio: "Looking to connect with tech innovators and entrepreneurs",
      },
    });
    console.log(`✅ Created networking profile for John`);

    // Create a connection between Jane and John
    const existingConnection = await prisma.connection.findFirst({
      where: {
        OR: [
          { fromUserId: jane.id, toUserId: john.id, eventId: testEvent.id },
          { fromUserId: john.id, toUserId: jane.id, eventId: testEvent.id }
        ]
      }
    });

    if (!existingConnection) {
      const connection = await prisma.connection.create({
        data: {
          fromUserId: jane.id,
          toUserId: john.id,
          eventId: testEvent.id,
          status: 'accepted',
          connectedAt: new Date(),
          connectionScore: 85,
        },
      });
      console.log(`✅ Created connection between Jane and John (ID: ${connection.id})`);

      // Create a sample message from Jane to John
      await prisma.message.create({
        data: {
          connectionId: connection.id,
          fromUserId: jane.id,
          toUserId: john.id,
          eventId: testEvent.id,
          content: "Hi John! Looking forward to meeting you at the Tech Event. Let's connect!",
          isRead: true,
          readAt: new Date(),
        },
      });
      console.log(`✅ Created sample message from Jane to John`);

      // Create a reply from John to Jane
      await prisma.message.create({
        data: {
          connectionId: connection.id,
          fromUserId: john.id,
          toUserId: jane.id,
          eventId: testEvent.id,
          content: "Hi Jane! Thanks for reaching out. I'm excited to meet you too! What sessions are you planning to attend?",
          isRead: false,
        },
      });
      console.log(`✅ Created sample reply from John to Jane`);
    }

    console.log(`\n📋 Test QR Codes for Check-in:`);
    console.log(`   1. 345879ca-a0d9-4904-b06b-5c1d832938dd`);
    console.log(`   2. 40394c9d-fe66-4953-b86d-04aacabc8566`);
    console.log(`   3. 8c8575cd-44d0-4285-891d-4ae1b5a80ff8`);
    console.log(`   4. 3c6608f1-f0ae-44e6-8542-c9bec15377cf`);
    console.log(`   5. 2384a6bf-5a61-4363-be3e-7ff7e223e23a`);
  } else {
    console.log('⚠️ Organizer not found, skipping test event creation');
  }

  // ======================
  // 15. Create Sample Products for Merchant
  // ======================
  console.log('\n📝 Creating sample products...');
  
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
  console.log(`✅ Created 3 sample products`);

  // ======================
  // 16. Create Sample Payment Links
  // ======================
  console.log('\n📝 Creating sample payment links...');
  
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
  console.log(`✅ Created 2 sample payment links`);

  // ======================
  // 17. Summary
  // ======================
  const userCount = await prisma.user.count();
  const merchantCount = await prisma.merchant.count();
  const organizerCount = await prisma.eventOrganizer.count();
  const orgCount = await prisma.organization.count();
  const eventCount = await prisma.event.count();
  const tierCount = await prisma.ticketTier.count();
  const productCount = await prisma.product.count();
  const linkCount = await prisma.paymentLink.count();
  const rateCount = await prisma.dsaRate.count();
  const ticketCount = await prisma.ticket.count();
  const orderCount = await prisma.ticketSale.count();
  const profileCount = await prisma.networkingProfile.count();
  const connectionCount = await prisma.connection.count();
  const messageCount = await prisma.message.count();
  const paymentSessionCount = await prisma.paymentSession.count();

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\n📊 Seeded Data Summary:');
  console.log(`   - ${userCount} users`);
  console.log(`   - ${merchantCount} merchants`);
  console.log(`   - ${organizerCount} organizers`);
  console.log(`   - ${orgCount} DSA organizations`);
  console.log(`   - ${eventCount} events`);
  console.log(`   - ${tierCount} ticket tiers`);
  console.log(`   - ${ticketCount} tickets created`);
  console.log(`   - ${orderCount} orders created`);
  console.log(`   - ${paymentSessionCount} payment sessions created`);
  console.log(`   - ${productCount} products`);
  console.log(`   - ${linkCount} payment links`);
  console.log(`   - ${rateCount} DSA rates`);
  console.log(`   - ${profileCount} networking profiles`);
  console.log(`   - ${connectionCount} connections`);
  console.log(`   - ${messageCount} messages`);
  
  console.log('\n🔑 Demo Login Credentials:');
  console.log('   Admin: admin@rapidtie.vaultstring.com / Admin@123');
  console.log('   Merchant: merchant@example.com / Merchant@123');
  console.log('   Organizer: organizer@example.com / Organizer@123');
  console.log('   Employee (Grade 8): john.doe@finance.gov.mw / Employee@123');
  console.log('   Employee (Grade 6): jane.smith@finance.gov.mw / Employee@123');
  console.log('   Approver: approver@finance.gov.mw / Approver@123');
  console.log('   Finance Officer: finance.officer@finance.gov.mw / Finance@123');
  console.log('   👥 Networking Test Users:');
  console.log('   Jane: jane@email.com / Test@123');
  console.log('   John: john@example.com / Test@123');

  console.log('\n💰 DSA Rates by Location:');
  console.log('   Lilongwe: MWK 45,000 - 60,000 (Grade-based variations up to MWK 75,000)');
  console.log('   Blantyre: MWK 40,000 - 55,000');
  console.log('   Mzuzu: MWK 38,000 - 50,000');
  console.log('   Zomba: MWK 35,000 - 45,000');
  console.log('   Mangochi: MWK 42,000 - 58,000');
  console.log('   Karonga: MWK 50,000 - 70,000');
  console.log('   Salima: MWK 35,000 - 45,000');

  console.log('\n📋 Budget Summary:');
  console.log(`   Finance Department: MWK 15,000,000`);
  console.log(`   Field Operations: MWK 20,000,000`);
  console.log(`   Administration: MWK 15,000,000`);
  console.log(`   Total Budget: MWK 50,000,000`);

  if (testEvent) {
    console.log('\n🎫 Test Event Details:');
    console.log(`   Event ID: ${testEvent.id}`);
    console.log(`   Event Name: Updated Tech Event`);
    
    console.log('\n💳 Payment Sessions for Testing:');
    console.log(`   Jane's pending session: jane-test-session-123`);
    console.log(`   Jane's completed session: jane-completed-session-789`);
    console.log(`   John's session: john-test-session-456`);
    
    console.log('\n📝 Test Endpoints:');
    console.log(`   POST /api/auth/login (jane@email.com / Test@123)`);
    console.log(`   GET /api/payments/status/jane-test-session-123 (requires auth)`);
    console.log(`   GET /api/payments/status/john-test-session-456 (should return 403 for Jane)`);
    console.log(`   GET /api/events/${testEvent.id}/tiers`);
    console.log(`   GET /api/organizer/events/${testEvent.id}/sales`);
    console.log(`   GET /api/organizer/events/${testEvent.id}/attendees`);
    console.log(`   POST /api/events/checkin`);
    
    console.log('\n🔗 Networking Endpoints:');
    console.log(`   GET /api/events/networking?eventId=${testEvent.id}`);
    console.log(`   POST /api/events/networking/profile`);
    console.log(`   GET /api/events/networking/connections`);
    console.log(`   POST /api/events/networking/messages`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });