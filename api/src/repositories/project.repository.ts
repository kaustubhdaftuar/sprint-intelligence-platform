import { Types } from 'mongoose';

export interface IProject {
  _id: Types.ObjectId;
  memberIds: Types.ObjectId[];
}

export class ProjectRepository {
  async findById(id: Types.ObjectId): Promise<IProject | null> {
    return null; // temporary stub until real model is wired
  }
}

export const projectRepository = new ProjectRepository();

