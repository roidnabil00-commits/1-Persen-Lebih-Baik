// backend/tests/sales-notes.test.js

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
      email: 'test-sales@example.com',
    },
  });
});

beforeEach(async () => {
  // Bersihkan tabel salesNote sebelum setiap tes
  await prisma.salesNote.deleteMany({ where: { userId: 'user-test-uid-123' } });
});

afterAll(async () => {
  await prisma.salesNote.deleteMany({});
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/sales-notes
// =================================================================

describe('API /api/v1/sales-notes (Upsert)', () => {

  // Skenario 1: GET (Read) - Data Kosong
  test('GET /sales-notes - harus sukses (200) dan mengembalikan objek kosong', async () => {
    const response = await request(app)
      .get('/api/v1/sales-notes')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({}); // Respons-nya objek kosong {}
  });

  // Skenario 2: POST (Create) - Gagal (Data tidak lengkap)
  test('POST /sales-notes - harus gagal (400) jika "moduleId" hilang', async () => {
    const response = await request(app)
      .post('/api/v1/sales-notes')
      .set('Authorization', 'Bearer token-valid')
      .send({ content: 'Ini catatan' }); // moduleId tidak ada
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('moduleId dan content diperlukan');
  });

  // Skenario 3: POST (Create / Upsert) - Sukses (Membuat baru)
  test('POST /sales-notes - harus sukses (200) membuat catatan baru', async () => {
    const newNote = {
      moduleId: '1.1',
      content: 'Ini catatan sales pertama'
    };

    const response = await request(app)
      .post('/api/v1/sales-notes')
      .set('Authorization', 'Bearer token-valid')
      .send(newNote);
      
    expect(response.statusCode).toBe(200); // Kode server.js kamu 200
    expect(response.body.moduleId).toBe('1.1');
    expect(response.body.content).toBe('Ini catatan sales pertama');

    // Cek database
    const noteInDb = await prisma.salesNote.findFirst();
    expect(noteInDb.content).toBe('Ini catatan sales pertama');
  });

  // Skenario 4: POST (Update / Upsert) - Sukses (Mengupdate yang ada)
  test('POST /sales-notes - harus sukses (200) mengupdate catatan lama', async () => {
    // 1. Buat data lama
    await prisma.salesNote.create({
      data: {
        userId: 'user-test-uid-123',
        moduleId: '1.1',
        content: 'Konten LAMA'
      }
    });

    const updatedNote = {
      moduleId: '1.1', // moduleId sama
      content: 'Konten BARU' // content beda
    };

    // 2. Lakukan request upsert
    const response = await request(app)
      .post('/api/v1/sales-notes')
      .set('Authorization', 'Bearer token-valid')
      .send(updatedNote);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.content).toBe('Konten BARU');

    // 3. Cek database (hanya boleh ada 1 data)
    const notesInDb = await prisma.salesNote.findMany();
    expect(notesInDb.length).toBe(1);
    expect(notesInDb[0].content).toBe('Konten BARU');
  });

  // Skenario 5: GET (Read) - Ambil data yang sudah dibuat
  test('GET /sales-notes - harus sukses (200) dan mengembalikan data dalam format map', async () => {
    // 1. Buat 2 data
    await prisma.salesNote.createMany({
      data: [
        { userId: 'user-test-uid-123', moduleId: '1.1', content: 'Catatan A' },
        { userId: 'user-test-uid-123', moduleId: '2.2', content: 'Catatan B' },
      ]
    });
    
    // 2. Lakukan request GET
    const response = await request(app)
      .get('/api/v1/sales-notes')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    // Cek format map (key-value)
    expect(response.body).toEqual({
      '1.1': 'Catatan A',
      '2.2': 'Catatan B'
    });
  });

});