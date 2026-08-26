/**
 * Controller endpoint kontak: tambah per username/massal, hapus, ubah nama
 * kustom, daftar kontak, cek status kontak, dan relasi dua arah. Meneruskan
 * pekerjaan ke contacts.service dan mengirim respons JSON.
 */
import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as contactService from './contacts.service';
import { contactListQuerySchema } from './contacts.validator';

/** Menambahkan kontak berdasarkan username yang dikirim di body. */
export async function addContactByUsername(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.addContactByUsername(
      req.userId!,
      req.body.username as string,
      req.body.customName as string | undefined,
    );
    res.status(201).json({ success: true, message: 'Contact added', data: result });
  } catch (error) {
    next(error);
  }
}

/** Menghapus kontak berdasarkan userId di parameter rute. */
export async function removeContact(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await contactService.removeContact(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'Contact removed' });
  } catch (error) {
    next(error);
  }
}

/** Memperbarui nama kustom kontak di parameter rute. */
export async function updateCustomName(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.updateContactCustomName(
      req.userId!,
      req.params.userId as string,
      req.body.customName as string,
    );
    res.status(200).json({ success: true, message: 'Custom name updated', data: result });
  } catch (error) {
    next(error);
  }
}

/** Menambahkan banyak kontak sekaligus dari daftar userIds di body. */
export async function addContactsBulk(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.addContactsBulk(req.userId!, req.body.userIds as string[]);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Mengembalikan daftar kontak dengan dukungan query sort dan search. */
export async function getMyContacts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sort, search } = contactListQuerySchema.parse(req.query);
    const result = await contactService.getMyContacts(req.userId!, sort, search);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/** Memeriksa apakah pengguna di parameter rute adalah kontak milik sendiri. */
export async function checkContact(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const isContact = await contactService.checkContact(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, data: { isContact } });
  } catch (error) {
    next(error);
  }
}

/** Mengembalikan status relasi kontak dua arah dengan pengguna di parameter. */
export async function getRelationship(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.getRelationship(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, data: { status: result } });
  } catch (error) {
    next(error);
  }
}
