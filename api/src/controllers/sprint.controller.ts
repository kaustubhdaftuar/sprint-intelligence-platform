import { Request, Response, NextFunction } from 'express';
import { sprintService } from '@/services/sprint.service';
import type {
  CreateSprintBody,
  UpdateSprintBody,
  ListSprintsQuery,
  AssignTicketsBody,
} from '@/validators/sprint.validators';

/**
 * SprintController — HTTP in/out only.
 * No business logic. No DB queries. No Mongoose types.
 * All req.body/query/params are pre-validated by middleware.
 */
export const SprintController = {
  create: async (
    req: Request<{ projectId: string }, {}, CreateSprintBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.createSprint(
        req.user!.id,
        req.user!.role,
        req.params.projectId,
        req.body,
      );
      res.status(201).json({ success: true, data: sprint });
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
    const result = await sprintService.listSprints(
      req.user!.id,
      req.params.projectId,
      req.query as unknown as ListSprintsQuery, // ← cast here instead
    );

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
},


  getById: async (
    req: Request<{ projectId: string; sprintId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.getSprint(
        req.user!.id,
        req.params.sprintId,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },

  update: async (
    req: Request<{ projectId: string; sprintId: string }, {}, UpdateSprintBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.updateSprint(
        req.user!.id,
        req.user!.role,
        req.params.sprintId,
        req.body,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },

  start: async (
    req: Request<{ projectId: string; sprintId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.startSprint(
        req.user!.id,
        req.user!.role,
        req.params.sprintId,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },

  complete: async (
    req: Request<{ projectId: string; sprintId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.completeSprint(
        req.user!.id,
        req.user!.role,
        req.params.sprintId,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },

  assignTickets: async (
    req: Request<{ projectId: string; sprintId: string }, {}, AssignTicketsBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.assignTickets(
        req.user!.id,
        req.params.sprintId,
        req.body,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },

  removeTicket: async (
    req: Request<{ projectId: string; sprintId: string; ticketId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const sprint = await sprintService.removeTicketFromSprint(
        req.user!.id,
        req.params.sprintId,
        req.params.ticketId,
      );
      res.status(200).json({ success: true, data: sprint });
    } catch (err) {
      next(err);
    }
  },
};