import { Request, Response, NextFunction } from 'express';
import { projectService } from '@/services/project.service';
import type {
  CreateProjectBody,
  UpdateProjectBody,
  ProjectQuery,
  AddMemberBody,
} from '@/validators/project.validators';

/**
 * ProjectController — HTTP in/out mapping only.
 *
 * Rules:
 * - No business logic
 * - No DB queries
 * - No Mongoose types
 * - Always calls next(err) on async failure
 * - req.body, req.query, req.params are pre-validated by middleware
 * - req.user is guaranteed present (authenticate runs first)
 *
 * All methods are arrow functions to avoid `this` binding issues
 * when Express calls them as callbacks.
 */
export const ProjectController = {
  create: async (
    req: Request<{}, {}, CreateProjectBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const project = await projectService.createProject(
        req.user!.id,
        req.user!.role,
        req.body,
      );
      res.status(201).json({ success: true, data: project });
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
      const query = req.query as unknown as ProjectQuery;

      const result = await projectService.listProjects(
        req.user!.id,
        query
      );
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  },

  getById: async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const project = await projectService.getProject(req.user!.id, req.params.id);
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },

  update: async (
    req: Request<{ id: string }, {}, UpdateProjectBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const project = await projectService.updateProject(
        req.user!.id,
        req.user!.role,
        req.params.id,
        req.body,
      );
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },

  delete: async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      await projectService.deleteProject(req.user!.id, req.user!.role, req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  addMember: async (
    req: Request<{ id: string }, {}, AddMemberBody>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const project = await projectService.addMember(
        req.user!.id,
        req.user!.role,
        req.params.id,
        req.body.memberId,
      );
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },

  removeMember: async (
    req: Request<{ id: string; memberId: string }>,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const project = await projectService.removeMember(
        req.user!.id,
        req.user!.role,
        req.params.id,
        req.params.memberId,
      );
      res.status(200).json({ success: true, data: project });
    } catch (err) {
      next(err);
    }
  },
};