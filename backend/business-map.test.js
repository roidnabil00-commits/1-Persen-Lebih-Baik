// backend/tests/business-map.test.js

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
      email: 'test-business@example.com',
    },
  });
});

beforeEach(async () => {
  // Bersihkan tabel businessMap sebelum setiap tes
  await prisma.businessMap.deleteMany({ where: { userId: 'user-test-uid-123' } });
});

afterAll(async () => {
  await prisma.businessMap.deleteMany({});
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/business-map
// =================================================================

describe('API /api/v1/business-map (Upsert)', () => {

  // Skenario 1: GET (Read) - Data Kosong
  test('GET /business-map - harus sukses (200) dan mengembalikan objek kosong', async () => {
    const response = await request(app)
      .get('/api/v1/business-map')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({}); // Respons-nya objek kosong {}
  });

  // Skenario 2: POST (Create) - Gagal (Data tidak lengkap)
  test('POST /business-map - harus gagal (400) jika data tidak lengkap', async () => {
    const response = await request(app)
      .post('/api/v1/business-map')
      .set('Authorization', 'Bearer token-valid')
      .send({ skill: 'Jualan' }); // personalStory hilang
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Data Peta Bisnis tidak lengkap');
  });

  // Data Peta Bisnis yang valid untuk tes
  const validBusinessMap = {
    personalStory: 'Cerita saya',
    riskProfile: { activity: 'Karyawan', marital: 'Lajang', fund: '6-12 bulan' },
    skill: 'Digital Marketing',
    capital: '1000000',
    time: '2-4 jam/hari',
    knowledge: 'Sudah ikut kursus',
    connections: [{ name: 'Orang 1', role: 'Mentor' }],
    opportunities: 'Banyak UMKM butuh'
  };

  // Skenario 3: POST (Create / Upsert) - Sukses (Membuat baru)
  test('POST /business-map - harus sukses (200) membuat peta bisnis baru', async () => {
    const response = await request(app)
      .post('/api/v1/business-map')
      .set('Authorization', 'Bearer token-valid')
      .send(validBusinessMap);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.personalStory).toBe('Cerita saya');
    expect(response.body.skill).toBe('Digital Marketing');
    expect(response.body.maritalStatus).toBe('Lajang'); // Cek data nested

    // Cek database
    const mapInDb = await prisma.businessMap.findFirst();
    expect(mapInDb.personalStory).toBe('Cerita saya');
    // Cek data JSON
    expect(mapInDb.connections[0].name).toBe('Orang 1');
  });

  // Skenario 4: POST (Update / Upsert) - Sukses (Mengupdate yang ada)
  test('POST /business-map - harus sukses (200) mengupdate peta bisnis lama', async () => {
    // 1. Buat data lama (disimpan sesuai format DB)
    await prisma.businessMap.create({
      data: {
        userId: 'user-test-uid-123',
        personalStory: 'Cerita LAMA',
        currentActivity: 'Karyawan',
        maritalStatus: 'Lajang',
        emergencyFund: '6-12 bulan',
        skill: 'Skill LAMA',
        capital: '1000000',
        time: '2-4 jam/hari',
        knowledge: 'Sudah ikut kursus',
        connections: [{ name: 'Orang 1', role: 'Mentor' }],
        opportunities: 'Banyak UMKM butuh'
      }
    });

    // 2. Buat data update (dikirim sesuai format API)
    const updatedMap = {
      ...validBusinessMap,
      personalStory: 'Cerita BARU', // Data baru
      skill: 'Skill BARU'
    };

    // 3. Lakukan request upsert
    const response = await request(app)
      .post('/api/v1/business-map')
      .set('Authorization', 'Bearer token-valid')
      .send(updatedMap);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.personalStory).toBe('Cerita BARU');
    expect(response.body.skill).toBe('Skill BARU');

    // 4. Cek database (hanya boleh ada 1 data)
    const mapsInDb = await prisma.businessMap.findMany();
    expect(mapsInDb.length).toBe(1);
    expect(mapsInDb[0].personalStory).toBe('Cerita BARU');
  });

  // Skenario 5: GET (Read) - Ambil data yang sudah dibuat
  test('GET /business-map - harus sukses (200) dan mengembalikan data peta bisnis', async () => {
    // 1. Buat data (sesuai format DB)
     await prisma.businessMap.create({
      data: {
        userId: 'user-test-uid-123',
        personalStory: 'Cerita saya',
        currentActivity: 'Karyawan',
        maritalStatus: 'Lajang',
        emergencyFund: '6-12 bulan',
        skill: 'Digital Marketing',
        capital: '1000000',
        time: '2-4 jam/hari',
        knowledge: 'Sudah ikut kursus',
        connections: [{ name: 'Orang 1', role: 'Mentor' }],
        opportunities: 'Banyak UMKM butuh'
      }
    });
    
    // 2. Lakukan request GET
    const response = await request(app)
      .get('/api/v1/business-map')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body.personalStory).toBe('Cerita saya');
    expect(response.body.skill).toBe('Digital Marketing');
    // Cek data JSON
    expect(response.body.connections[0].name).toBe('Orang 1');
  });

});