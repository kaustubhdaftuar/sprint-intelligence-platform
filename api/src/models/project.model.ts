import { Types } from 'mongoose';

export class ProjectRepository {
  async findById(_id: Types.ObjectId): Promise<any> {
    return null; // stub until model is implemented
  }
}

export const projectRepository = new ProjectRepository();
