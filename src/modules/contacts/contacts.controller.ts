import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as contactService from './contacts.service';

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

export async function removeContact(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await contactService.removeContact(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'Contact removed' });
  } catch (error) {
    next(error);
  }
}

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

export async function addContactsBulk(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.addContactsBulk(req.userId!, req.body.userIds as string[]);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getMyContacts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const sort = req.query.sort as string | undefined;
    const search = req.query.search as string | undefined;
    const result = await contactService.getMyContacts(req.userId!, sort, search);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function checkContact(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const isContact = await contactService.checkContact(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, data: { isContact } });
  } catch (error) {
    next(error);
  }
}

export async function getRelationship(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const result = await contactService.getRelationship(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, data: { status: result } });
  } catch (error) {
    next(error);
  }
}
