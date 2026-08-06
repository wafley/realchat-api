import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/verifyJWT';
import * as contactService from './contacts.service';

export async function addContact(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    await contactService.addContact(req.userId!, req.params.userId as string);
    res.status(200).json({ success: true, message: 'Contact added' });
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
    const result = await contactService.getMyContacts(req.userId!, sort);
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
