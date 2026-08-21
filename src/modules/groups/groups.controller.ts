/**
 * Controller HTTP modul grup: menguraikan request (termasuk berkas
 * avatar dari Multer), memanggil service grup, dan membungkus hasil
 * ke respons JSON standar { success, message?, data }.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as groupService from './groups.service';
import { groupIdUserIdSchema } from './groups.validator';
import { BadRequestError } from '../../utils/errors';

/** Membuat grup baru; avatar opsional dari unggahan multipart. */
export async function createGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const avatarUrl = req.file ? `/uploads/${req.file.filename}` : null;
    const result = await groupService.createGroup(req.userId!, req.body, avatarUrl);
    res.status(201).json({ success: true, message: 'Group created', data: result });
  } catch (error) {
    next(error);
  }
}

/** Memperbarui nama/deskripsi grup oleh admin. */
export async function updateGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await groupService.updateGroup(req.userId!, req.params.id as string, req.body);
    res.status(200).json({ success: true, message: 'Group updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengganti avatar grup dari berkas unggahan. */
export async function updateAvatar(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new BadRequestError('No file uploaded');
    const result = await groupService.updateAvatar(req.userId!, req.params.id as string, req.file);
    res.status(200).json({ success: true, message: 'Avatar updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Menambahkan banyak anggota baru ke grup sekaligus. */
export async function addMembers(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await groupService.addMembers(
      req.userId!,
      req.params.id as string,
      req.body.userIds,
    );
    res.status(200).json({ success: true, message: 'Members added', data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengeluarkan satu anggota dari grup oleh admin. */
export async function removeMember(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = groupIdUserIdSchema.parse(req.params);
    await groupService.removeMember(req.userId!, req.params.id as string, userId);
    res.status(200).json({ success: true, message: 'Member removed' });
  } catch (error) {
    next(error);
  }
}

/** Mengubah peran anggota (ADMIN/MEMBER) oleh admin. */
export async function changeRole(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = groupIdUserIdSchema.parse(req.params);
    await groupService.changeRole(req.userId!, req.params.id as string, userId, req.body.role);
    res.status(200).json({ success: true, message: 'Role updated' });
  } catch (error) {
    next(error);
  }
}

/** Keluar dari grup sebagai anggota. */
export async function leaveGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await groupService.leaveGroup(req.userId!, req.params.id as string);
    res.status(200).json({ success: true, message: 'Left group' });
  } catch (error) {
    next(error);
  }
}

/** Membubarkan grup sepenuhnya oleh pembuat grup. */
export async function dismissGroup(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await groupService.dismissGroup(req.userId!, req.params.id as string);
    res.status(200).json({ success: true, message: 'Group dismissed' });
  } catch (error) {
    next(error);
  }
}
