// backend/tests/todos.test.js

// =================================================================
// (A) MOCKING MODUL
// =================================================================

// 1. Mock 'firebase-admin' (Wajib)
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

// Variabel untuk menyimpan ID todo antar tes
let todoId;

// =================================================================
// (C) DATABASE SETUP & CLEANUP
// =================================================================
beforeAll(async () => {
  // Pastikan user tes ada
  await prisma.user.upsert({
    where: { id: 'user-test-uid-123' },
    update: {},
    create: {
      id: 'user-test-uid-123',
      email: 'test-todo@example.com',
    },
  });
});

// Bersihkan tabel todos SEBELUM SETIAP tes
beforeEach(async () => {
  await prisma.todo.deleteMany({ where: { userId: 'user-test-uid-123' } });
});

// Bersihkan user & tutup koneksi SETELAH SEMUA tes
afterAll(async () => {
  await prisma.todo.deleteMany({});
  await prisma.user.deleteMany({ where: { id: 'user-test-uid-123' } });
  await prisma.$disconnect();
});

// =================================================================
// (D) MENULIS TES UNTUK /api/v1/todos
// =================================================================

describe('API /api/v1/todos (CRUD)', () => {

  // Skenario 1: GET (Read) - Data Kosong
  test('GET /todos - harus sukses (200) dan mengembalikan array kosong', async () => {
    const response = await request(app)
      .get('/api/v1/todos')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual([]); // Harusnya array kosong
  });

  // Skenario 2: POST (Create) - Gagal (Data tidak ada)
  test('POST /todos - harus gagal (400) jika "text" kosong', async () => {
    const response = await request(app)
      .post('/api/v1/todos')
      .set('Authorization', 'Bearer token-valid')
      .send({ text: '' }); // Kirim teks kosong
      
    expect(response.statusCode).toBe(400);
    expect(response.body.message).toContain('Teks tidak boleh kosong');
  });

  // Skenario 3: POST (Create) - Sukses
  test('POST /todos - harus sukses (201) membuat todo baru', async () => {
    const newTodo = {
      text: 'Belajar Unit Testing',
    };

    const response = await request(app)
      .post('/api/v1/todos')
      .set('Authorization', 'Bearer token-valid')
      .send(newTodo);
      
    expect(response.statusCode).toBe(201); // Sesuai kode server.js
    expect(response.body.text).toBe('Belajar Unit Testing');
    expect(response.body.completed).toBe(false);
    expect(response.body.userId).toBe('user-test-uid-123');

    // Simpan ID-nya untuk tes update & delete
    todoId = response.body.id; 
  });

  // Skenario 4: GET (Read) - Ambil data yang baru dibuat
  test('GET /todos - harus sukses (200) dan mengembalikan 1 todo', async () => {
    // Kita "seeding" data dulu (tapi kita pakai data dari tes sebelumnya)
    // Untuk memastikan, kita buat satu lagi
    await prisma.todo.create({
      data: { text: 'Todo Tes 1', userId: 'user-test-uid-123' }
    });
    
    const response = await request(app)
      .get('/api/v1/todos')
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBe(1);
    expect(response.body[0].text).toBe('Todo Tes 1');
  });

  // Skenario 5: PUT (Update) - Sukses
  test('PUT /todos/:id - harus sukses (200) mengubah status completed', async () => {
    // 1. Buat data untuk di-update
    const todo = await prisma.todo.create({
      data: { text: 'Todo untuk di-update', userId: 'user-test-uid-123' }
    });
    expect(todo.completed).toBe(false); // Pastikan awalnya false

    // 2. Lakukan request update
    const response = await request(app)
      .put(`/api/v1/todos/${todo.id}`)
      .set('Authorization', 'Bearer token-valid')
      .send({ completed: true }); // Ubah jadi true
      
    expect(response.statusCode).toBe(200);
    expect(response.body.completed).toBe(true);

    // 3. Cek ke database langsung
    const todoInDb = await prisma.todo.findUnique({ where: { id: todo.id } });
    expect(todoInDb.completed).toBe(true);
  });

  // Skenario 6: PUT (Update) - Gagal (Todo tidak ditemukan)
  test('PUT /todos/:id - harus gagal (404) jika todo tidak ditemukan', async () => {
    const response = await request(app)
      .put('/api/v1/todos/99999') // ID yang tidak ada
      .set('Authorization', 'Bearer token-valid')
      .send({ completed: true });
      
    expect(response.statusCode).toBe(404);
  });

  // Skenario 7: DELETE (Delete) - Sukses
  test('DELETE /todos/:id - harus sukses (204) menghapus todo', async () => {
    // 1. Buat data untuk dihapus
    const todo = await prisma.todo.create({
      data: { text: 'Todo untuk dihapus', userId: 'user-test-uid-123' }
    });
    
    // 2. Lakukan request delete
    const response = await request(app)
      .delete(`/api/v1/todos/${todo.id}`)
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(204); // No Content

    // 3. Cek ke database (harus null)
    const todoInDb = await prisma.todo.findUnique({ where: { id: todo.id } });
    expect(todoInDb).toBeNull();
  });

  // Skenario 8: DELETE (Delete) - Gagal (Todo tidak ditemukan)
  test('DELETE /todos/:id - harus gagal (404) jika todo tidak ditemukan', async () => {
    const response = await request(app)
      .delete('/api/v1/todos/99999') // ID yang tidak ada
      .set('Authorization', 'Bearer token-valid');
      
    expect(response.statusCode).toBe(404);
  });

});