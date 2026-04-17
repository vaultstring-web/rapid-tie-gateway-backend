const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function addJohn() {
  const hashedPassword = await bcrypt.hash('Test@123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      email: 'john@example.com',
      password: hashedPassword,
      firstName: 'John',
      lastName: 'Doe',
      role: 'PUBLIC',
      emailVerified: true,
    },
  });
  
  console.log('✅ John user created!');
  console.log('   Email: john@example.com');
  console.log('   Password: Test@123');
  console.log('   User ID:', user.id);
}

addJohn()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
