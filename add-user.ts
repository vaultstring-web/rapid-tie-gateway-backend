import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function addUser() {
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
  
  console.log('User created:', user);
}

addUser()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
