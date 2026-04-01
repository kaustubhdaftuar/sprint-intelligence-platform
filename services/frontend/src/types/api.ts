export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  success: false;
  message?: string;
  error?: { message?: string; code?: string };
}

export interface LoginResponseData {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export interface ProjectListData {
  projects: ProjectSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description?: string;
}

export interface SprintListData {
  sprints: SprintSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SprintSummary {
  id: string;
  name: string;
  status: 'PLANNING' | 'ACTIVE' | 'DONE';
  startDate: string;
  endDate: string;
  goal?: string;
  velocityTarget?: number;
  capacityPoints?: number;
  riskScore?: number;
}

export interface SprintDetail extends SprintSummary {
  projectId: string;
  actualVelocity?: number;
}

export interface AiJobQueued {
  jobId: string | number;
  status: string;
  message?: string;
}

export interface AiJobStatus {
  jobId: string | number;
  status: string;
  result: unknown;
  error: string | null;
}
