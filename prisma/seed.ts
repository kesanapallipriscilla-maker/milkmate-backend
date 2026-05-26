import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const vendorUser = await prisma.user.upsert({
    where: { phone: '+919999900001' },
    update: {},
    create: {
      firebaseUid: 'dev-vendor-uid-001',
      phone: '+919999900001',
      name: 'Ramu Milk Depot',
      role: 'VENDOR',
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { userId: vendorUser.id },
    update: {},
    create: {
      userId: vendorUser.id,
      name: 'Ramu Milk Depot',
      phone: '+919999900001',
      description: 'Fresh cow and buffalo milk delivered daily',
      location: 'Hitech City, Hyderabad',
      lat: 17.385,
      lng: 78.4867,
    },
  });

  await prisma.milkProduct.createMany({
    data: [
      { vendorId: vendor.id, type: 'Cow Milk', pricePerLitre: 55 },
      { vendorId: vendor.id, type: 'Buffalo Milk', pricePerLitre: 70 },
      { vendorId: vendor.id, type: 'A2 Milk', pricePerLitre: 90 },
    ],
    skipDuplicates: true,
  });

  const customerUser = await prisma.user.upsert({
    where: { phone: '+919999900002' },
    update: {},
    create: {
      firebaseUid: 'dev-customer-uid-001',
      phone: '+919999900002',
      name: 'Priya Sharma',
      role: 'CUSTOMER',
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'seed-customer-001' },
    update: {},
    create: {
      id: 'seed-customer-001',
      userId: customerUser.id,
      vendorId: vendor.id,
      name: 'Priya Sharma',
      phone: '+919999900002',
      address: 'Flat 4B, Hitech City, Hyderabad',
    },
  });

  await prisma.deliverySchedule.upsert({
    where: { customerId: customer.id },
    update: {},
    create: {
      customerId: customer.id,
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      quantityLitres: 1.5,
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
