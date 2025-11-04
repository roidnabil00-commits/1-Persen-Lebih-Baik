// backend/tests/cv.test.js

// =================================================================
// (A) MOCKING MODUL
// =================================================================

// 1. Mock 'firebase-admin' (Sama seperti auth.test.js)
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

// 2. Mock 'axios' (Agar tidak panggil Google AI sungguhan)
const axios = require('axios');
jest.mock('axios');
const mockedAxios = axios; // Beri nama lain agar mudah dipakai

// 3. Mock 'pdf-parse' (Agar tidak mem-parsing PDF sungguhan)
jest.mock('pdf-parse', () => jest.fn()); // 1. Bilang Jest untuk memalsukan modul ini
const pdfParse = require('pdf-parse'); // 2. Sekarang impor (kita akan dapat versi palsunya)

// =================================================================
// (B) IMPOR UTAMA
// =================================================================
const request = require('supertest');
const { app } = require('./app');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// =================================================================
// (C) DATABASE SETUP & CLEANUP (Opsional untuk tes ini, tapi best practice)
// =================================================================
beforeAll(async () => {
  // Pastikan user tes ada
  await prisma.user.upsert({
    where: { id: 'user-test-uid-123' },
    update: {},
    create: {
      id: 'user-test-uid-123',
      email: 'test-cv@example.com',
    },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// Reset mock sebelum setiap tes
beforeEach(() => {
  mockedAxios.post.mockClear();
  pdfParse.mockClear();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/process-cv
// =================================================================

describe('API /api/v1/process-cv', () => {

  // Skenario 1: Gagal karena tidak login
  test('Harus GAGAL (401) jika tidak ada token', async () => {
    const response = await request(app)
      .post('/api/v1/process-cv');
      
    expect(response.statusCode).toBe(401);
  });

  // Skenario 2: Gagal karena tidak ada file
  test('Harus GAGAL (400) jika tidak ada file di-upload', async () => {
    const response = await request(app)
      .post('/api/v1/process-cv')
      .set('Authorization', 'Bearer token-valid'); // Login sukses
      // Tapi tidak melampirkan file
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Tidak ada file');
  });

  // Skenario 3: Gagal karena file bukan PDF (pdf-parse gagal)
  test('Harus GAGAL (400) jika file bukan PDF valid', async () => {
    // 1. Setup mock pdf-parse untuk GAGAL
    pdfParse.mockRejectedValue(new Error('Invalid PDF'));

    const response = await request(app)
      .post('/api/v1/process-cv')
      .set('Authorization', 'Bearer token-valid') // Login sukses
      .attach('cv-upload', Buffer.from('ini bukan pdf'), 'filepalsu.txt'); // Lampirkan file palsu
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('bukan PDF valid');
  });

  // Skenario 4: SUKSES (Happy Path)
  test('Harus SUKSES (200) memproses CV dan mengembalikan respons AI', async () => {
    
    // 1. Setup mock pdf-parse untuk SUKSES
    pdfParse.mockResolvedValue({
      text: 'Ini adalah isi CV saya yang berhasil diparsing.'
    });

    // 2. Setup mock axios (panggilan ke Google AI) untuk SUKSES
    const mockAIResponse = {
      candidates: [{
        content: {
          parts: [{ text: '{"feedback_cv": "CV kamu bagus!"}' }]
        }
      }]
    };
    mockedAxios.post.mockResolvedValue({ data: mockAIResponse });

    // 3. Jalankan request
    const response = await request(app)
      .post('/api/v1/process-cv')
      .set('Authorization', 'Bearer token-valid') // Login sukses
      .attach('cv-upload', Buffer.from('ini pdf palsu'), 'cv.pdf'); // Lampirkan file PDF palsu
      
    // 4. Verifikasi hasil
    expect(response.statusCode).toBe(200);
    
    // 5. Cek apakah pdf-parse dipanggil
    expect(pdfParse).toHaveBeenCalledTimes(1);

    // 6. Cek apakah axios (Google AI) dipanggil
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    
    // 7. Cek apakah prompt yang dikirim ke AI berisi teks CV
    const axiosCallPayload = mockedAxios.post.mock.calls[0][1]; // Ambil payload dari panggilan axios
    expect(axiosCallPayload.contents[0].parts[0].text).toContain('Ini adalah isi CV saya');

    // 8. Cek apakah respons akhir ke user adalah respons dari AI
    expect(response.body).toEqual(mockAIResponse);
  });
});