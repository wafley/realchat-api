/**
 * Definisi rute notifikasi (dipasang di bawah prefix /notifications).
 * Semua endpoint dilindungi verifyJWT karena hanya untuk user yang login.
 */
import { Router } from 'express';
import { verifyJWT } from '../../middlewares/verifyJWT';
import * as controller from './notifications.controller';

const router = Router();

// Daftar, jumlah belum dibaca, tandai baca (satu/semua), dan hapus (satu/semua).
router.get('/', verifyJWT, controller.getNotifications);
router.get('/unread-count', verifyJWT, controller.getUnreadCount);
router.put('/read-all', verifyJWT, controller.markAllAsRead);
router.put('/:id/read', verifyJWT, controller.markAsRead);
router.delete('/', verifyJWT, controller.deleteAllNotifications);
router.delete('/:id', verifyJWT, controller.deleteNotification);

/** Router Express berisi seluruh endpoint notifikasi. */
export default router;
