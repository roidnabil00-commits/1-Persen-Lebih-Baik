// backend/tests/auth.test.js
// backend/tests/auth.test.js

// INI HARUS JADI BARIS PERTAMA
jest.mock('firebase-admin', () => ({
  initializeApp: jest.fn(), // Mock 'initializeApp'
  
  auth: () => ({          // Mock 'auth()'
    verifyIdToken: jest.fn(async (token) => { // Mock 'verifyIdToken'
      if (token === 'token-valid') {
        return {
          uid: 'user-test-uid-123',
          email: 'test@example.com',
        };
      }
      throw new Error('Token palsu tidak valid');
    }),
  }),
  
  // === INI BAGIAN YANG BARU KITA TAMBAHKAN ===
  credential: {
    cert: jest.fn(), // Kita juga palsukan 'credential.cert()'
  },
  // ==========================================

}));

// SEMUA IMPOR LAINNYA DATANG SETELAH BLOK DI ATAS
const request = require('supertest');
const { app } = require('./app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
// ... (sisa file)

// =================================================================
// (A) MOCKING FIREBASE-ADMIN


// =================================================================
// (B) DATABASE SETUP & CLEANUP
// =================================================================

// Bersihkan database SEBELUM SETIAP tes
beforeEach(async () => {
  // Hapus data dari model yang mungkin terisi
  // (Kita hapus dari model anak dulu untuk hindari error relasi)
  await prisma.todo.deleteMany({});
  await prisma.salesNote.deleteMany({});
  await prisma.careerMap.deleteMany({});
  await prisma.businessMap.deleteMany({});
  await prisma.dailyDashboard.deleteMany({});
  // Baru hapus model induk
  await prisma.user.deleteMany({});
});

// Tutup koneksi DB SETELAH SEMUA tes selesai
afterAll(async () => {
  await prisma.$disconnect();
});

// =================================================================
// (C) MENULIS TES
// =================================================================

describe('Autentikasi (Middleware checkAuth)', () => {

  // Kita tes middleware 'checkAuth' menggunakan endpoint '/todos'
  
  test('Harus GAGAL (401) jika tidak ada token', async () => {
    const response = await request(app)
      .get('/api/v1/todos'); // Rute apapun yang dilindungi checkAuth
      
    // Di kode server.js, kamu kirim 401 jika token tidak ada
    expect(response.statusCode).toBe(401); 
    expect(response.body.message).toContain('Token tidak ada');
  });
  
  test('Harus GAGAL (403) jika token tidak valid', async () => {
    const response = await request(app)
      .get('/api/v1/todos')
      .set('Authorization', 'Bearer token-tidak-valid'); // Token ini akan ditolak mock
      
    // Di kode server.js, kamu kirim 403 jika verifikasi gagal
    expect(response.statusCode).toBe(403);
    expect(response.body.message).toContain('Token tidak valid');
  });
  
  test('Harus SUKSES (200) jika token valid', async () => {
    const response = await request(app)
      .get('/api/v1/todos')
      .set('Authorization', 'Bearer token-valid'); // Token ini akan diloloskan mock
      
    // Dia akan lolos 'checkAuth' dan lanjut ke handler '/todos'
    // Handler '/todos' akan mengembalikan 200 dan array kosong (karena DB bersih)
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]); // Membuktikan dia lolos auth
  });

});

describe('API /api/v1/auth/sync', () => {

  test('Harus SUKSES (200) membuat user baru di DB jika user belum ada', async () => {
    const userData = {
      email: 'test@example.com',
      nama: 'Test User'
    };

    // 1. Lakukan request 'sync'
    const response = await request(app)
      .post('/api/v1/auth/sync')
      .set('Authorization', 'Bearer token-valid') // Lolos auth sbg 'user-test-uid-123'
      .send(userData);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe('User tersinkronisasi');
    expect(response.body.user.id).toBe('user-test-uid-123'); // 
    expect(response.body.user.email).toBe('test@example.com');

    // 2. Cek database 'test.db' untuk membuktikan
    const userInDb = await prisma.user.findUnique({
      where: { id: 'user-test-uid-123' }
    });
    
    expect(userInDb).not.toBeNull();
    expect(userInDb.nama).toBe('Test User');
  });

  test('Harus SUKSES (200) meng-update user di DB jika user sudah ada', async () => {
    // 1. Buat user "lama" dulu di DB
    await prisma.user.create({
      data: {
        id: 'user-test-uid-123',
        email: 'email-lama@example.com',
        nama: 'Nama Lama'
      }
    });

    const updatedUserData = {
      email: 'email-baru@example.com',
      nama: 'Nama Baru'
    };

    // 2. Lakukan request 'sync' dengan data baru
    const response = await request(app)
      .post('/api/v1/auth/sync')
      .set('Authorization', 'Bearer token-valid') // Lolos auth sbg user yg sama
      .send(updatedUserData);
      
    expect(response.statusCode).toBe(200);
    expect(response.body.user.nama).toBe('Nama Baru'); // 

    // 3. Cek database 'test.db'
    const userInDb = await prisma.user.findUnique({
      where: { id: 'user-test-uid-123' }
    });
    
    expect(userInDb).not.toBeNull();
    expect(userInDb.email).toBe('email-baru@example.com'); // Pastikan datanya ter-update
    expect(userInDb.nama).toBe('Nama Baru');
  });
});