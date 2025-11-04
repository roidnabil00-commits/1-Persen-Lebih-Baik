// backend/tests/dashboard.test.js

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
      email: 'test-dashboard@example.com',
    },
  });
});

beforeEach(async () => {
  // Bersihkan tabel dailyDashboard sebelum setiap tes
  await prisma.dailyDashboard.deleteMany({ where: { userId: 'user-test-uid-123' } });
});

afterAll(async () => {
  await prisma.dailyDashboard.deleteMany({});
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/dashboard
// =================================================================

describe('API /api/v1/dashboard (Upsert)', () => {

  const testDate = '03/11/2025'; // Tanggal palsu untuk tes

  // Skenario 1: GET (Read) - Gagal (Query 'date' tidak ada)
  test('GET /dashboard - harus gagal (400) jika query "date" hilang', async () => {
    const response = await request(app)
      .get('/api/v1/dashboard') // Tidak pakai ?date=...
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Query parameter "date" diperlukan');
  });

  // Skenario 2: GET (Read) - Data Kosong
  test('GET /dashboard - harus sukses (200) dan mengembalikan objek kosong', async () => {
    const response = await request(app)
      .get(`/api/v1/dashboard?date=${testDate}`)
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({}); // Respons-nya objek kosong {}
  });

  // Skenario 3: POST (Create) - Gagal (Data tidak lengkap)
  test('POST /dashboard - harus gagal (400) jika "dateString" hilang', async () => {
    const response = await request(app)
      .post('/api/v1/dashboard')
      .set('Authorization', 'Bearer token-valid')
      .send({ bigWin: 'Menyelesaikan tes' }); // dateString hilang
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('dateString diperlukan');
  });

  // Data Dasbor yang valid untuk tes
  const validDashboard = {
    dateString: testDate,
    bigWin: 'Selesaikan testing',
    schedule: [{ time: '09:00', task: 'Coding' }],
    reviewAchieved: true,
    reviewBest: 'Fokus',
    reviewLesson: 'Jangan menunda'
  };

  // Skenario 4: POST (Create / Upsert) - Sukses (Membuat baru)
  test('POST /dashboard - harus sukses (200) membuat dasbor baru', async () => {
    const response = await request(app)
      .post('/api/v1/dashboard')
      .set('Authorization', 'Bearer token-valid')
      .send(validDashboard);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.bigWin).toBe('Selesaikan testing');
    expect(response.body.reviewBest).toBe('Fokus');

    // Cek database
    const dashInDb = await prisma.dailyDashboard.findFirst();
    expect(dashInDb.bigWin).toBe('Selesaikan testing');
    expect(dashInDb.schedule[0].task).toBe('Coding');
  });

  // Skenario 5: POST (Update / Upsert) - Sukses (Mengupdate yang ada)
  test('POST /dashboard - harus sukses (200) mengupdate dasbor lama', async () => {
    // 1. Buat data lama
    await prisma.dailyDashboard.create({
      data: {
        userId: 'user-test-uid-123',
        ...validDashboard,
        bigWin: 'Big Win LAMA' // Ubah satu data
      }
    });

    // 2. Buat data update
    const updatedDashboard = {
      ...validDashboard,
      bigWin: 'Big Win BARU' // Data baru
    };

    // 3. Lakukan request upsert
    const response = await request(app)
      .post('/api/v1/dashboard')
      .set('Authorization', 'Bearer token-valid')
      .send(updatedDashboard);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.bigWin).toBe('Big Win BARU');

    // 4. Cek database (hanya boleh ada 1 data untuk tanggal itu)
    const dashInDb = await prisma.dailyDashboard.findMany();
    expect(dashInDb.length).toBe(1);
    expect(dashInDb[0].bigWin).toBe('Big Win BARU');
  });

  // Skenario 6: GET (Read) - Ambil data yang sudah dibuat
  test('GET /dashboard - harus sukses (200) dan mengembalikan data dasbor', async () => {
    // 1. Buat data
    await prisma.dailyDashboard.create({
      data: { userId: 'user-test-uid-123', ...validDashboard }
    });
    
    // 2. Lakukan request GET
    const response = await request(app)
      .get(`/api/v1/dashboard?date=${testDate}`)
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body.bigWin).toBe('Selesaikan testing');
    expect(response.body.schedule[0].task).toBe('Coding');
  });

});