const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function addJane() {
  const hashedPassword = await bcrypt.hash('Test@123', 10);
  
  const user = await prisma.user.upsert({
    where: { email: 'jane@email.com' },
    update: {},
    create: {
      email: 'jane@email.com',
      password: hashedPassword,
      firstName: 'Jane',
      lastName: 'Nyirenda',
      role: 'PUBLIC',
      emailVerified: true,
    },
  });
  
  console.log('✅ Jane user created!');
  console.log('   Email: jane@email.com');
  console.log('   Password: Test@123');
  console.log('   User ID:', user.id);
}

addJane()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
