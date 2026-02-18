import { Request, Response, NextFunction } from 'express';
import { ticketService } from '@/services/ticket.service';
import type {
  CreateTicketBody,
  UpdateTicketBody,
  TransitionStatusBody,
  AddCommentBody,
  ListTicketsQuery,
} from '@/validators/ticket.validators';

/**
 * TicketController — HTTP in/out only.
 * No business logic. No DB queries. No Mongoose types.
 */
export const TicketController = {
  create: async (
    req: Request<{ projectId: string }, {}, CreateTicketBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await ticketService.createTicket(
        req._user!.id,
        req.params.projectId,
        req.body,
      );
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  },

  list: async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const result = await ticketService.listTickets(
      req._user!.id,
      req.params.projectId,
      req.query as unknown as ListTicketsQuery,
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }


},

  getById: async (
    req: Request<{ projectId: string; id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await ticketService.getTicket(
        req._user!.id,
        req.params.id,
      );
      res.status(200).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  },

  update: async (
    req: Request<{ projectId: string; id: string }, {}, UpdateTicketBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await ticketService.updateTicket(
        req._user!.id,
        req.params.id,
        req.body,
      );
      res.status(200).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  },

  transitionStatus: async (
    req: Request<{ projectId: string; id: string }, {}, TransitionStatusBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await ticketService.transitionStatus(
        req._user!.id,
        req.params.id,
        req.body,
      );
      res.status(200).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  },

  addComment: async (
    req: Request<{ projectId: string; id: string }, {}, AddCommentBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ticket = await ticketService.addComment(
        req._user!.id,
        req.params.id,
        req.body,
      );
      res.status(201).json({ success: true, data: ticket });
    } catch (err) {
      next(err);
    }
  },

  delete: async (
    req: Request<{ projectId: string; id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await ticketService.deleteTicket(
        req._user!.id,
        req.user!.role,
        req.params.id,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
};