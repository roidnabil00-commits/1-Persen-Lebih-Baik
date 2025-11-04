// backend/tests/career-map.test.js

// =================================================================
// (A) MOCKING MODUL
// =================================================================
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(),
  auth: () => ({
    verifyIdToken: jest.fn(async (token) => {
      if (token === 'token-valid') {
        return { uid: 'user-test-uid-123' };
      }
      throw new Error('Token palsu tidak valid');
    }),
  }),
  credential: {
    cert: jest.fn(),
  },
}));

// =================================================================
// (B) IMPOR UTAMA
// =================================================================
const request = require('supertest');
const { app } = require('./app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// (C) DATABASE SETUP & CLEANUP
// =================================================================
beforeAll(async () => {
  await prisma.user.upsert({
    where: { id: 'user-test-uid-123' },
    update: {},
    create: {
      id: 'user-test-uid-123',
      email: 'test-career@example.com',
    },
  });
});

beforeEach(async () => {
  // Bersihkan tabel careerMap sebelum setiap tes
  await prisma.careerMap.deleteMany({ where: { userId: 'user-test-uid-123' } });
});

afterAll(async () => {
  await prisma.careerMap.deleteMany({});
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/career-map
// =================================================================

describe('API /api/v1/career-map (Upsert)', () => {

  // Skenario 1: GET (Read) - Data Kosong
  test('GET /career-map - harus sukses (200) dan mengembalikan objek kosong', async () => {
    const response = await request(app)
      .get('/api/v1/career-map')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({}); // Respons-nya objek kosong {}
  });

  // Skenario 2: POST (Create) - Gagal (Data tidak lengkap)
  test('POST /career-map - harus gagal (400) jika data tidak lengkap', async () => {
    const response = await request(app)
      .post('/api/v1/career-map')
      .set('Authorization', 'Bearer token-valid')
      .send({ goal: 'Jadi Developer' }); // hardSkills, softSkills, skillGap hilang
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe('Semua field (goal, hardSkills, softSkills, skillGap) diperlukan');
  });

  // Data Peta Karir yang valid untuk tes
  const validCareerMap = {
    goal: 'Fullstack Developer',
    hardSkills: 'React, Node.js',
    softSkills: 'Komunikasi',
    skillGap: 'Belajar Testing'
  };

  // Skenario 3: POST (Create / Upsert) - Sukses (Membuat baru)
  test('POST /career-map - harus sukses (200) membuat peta karir baru', async () => {
    const response = await request(app)
      .post('/api/v1/career-map')
      .set('Authorization', 'Bearer token-valid')
      .send(validCareerMap);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.goal).toBe('Fullstack Developer');
    expect(response.body.skillGap).toBe('Belajar Testing');

    // Cek database
    const mapInDb = await prisma.careerMap.findFirst();
    expect(mapInDb.goal).toBe('Fullstack Developer');
  });

  // Skenario 4: POST (Update / Upsert) - Sukses (Mengupdate yang ada)
  test('POST /career-map - harus sukses (200) mengupdate peta karir lama', async () => {
    // 1. Buat data lama
    await prisma.careerMap.create({
      data: {
        userId: 'user-test-uid-123',
        ...validCareerMap,
        goal: 'Goal LAMA' // Ubah satu data
      }
    });

    // 2. Buat data update
    const updatedMap = {
      ...validCareerMap,
      goal: 'Goal BARU' // Data baru
    };

    // 3. Lakukan request upsert
    const response = await request(app)
      .post('/api/v1/career-map')
      .set('Authorization', 'Bearer token-valid')
      .send(updatedMap);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.goal).toBe('Goal BARU');

    // 4. Cek database (hanya boleh ada 1 data)
    const mapsInDb = await prisma.careerMap.findMany();
    expect(mapsInDb.length).toBe(1);
    expect(mapsInDb[0].goal).toBe('Goal BARU');
  });

  // Skenario 5: GET (Read) - Ambil data yang sudah dibuat
  test('GET /career-map - harus sukses (200) dan mengembalikan data peta karir', async () => {
    // 1. Buat data
    await prisma.careerMap.create({
      data: { userId: 'user-test-uid-123', ...validCareerMap }
    });
    
    // 2. Lakukan request GET
    const response = await request(app)
      .get('/api/v1/career-map')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body.goal).toBe('Fullstack Developer');
    expect(response.body.hardSkills).toBe('React, Node.js');
  });

});