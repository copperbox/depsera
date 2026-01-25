import { FailureMode, FailureConfig } from '../failures/types';

export interface InjectFailureRequest {
  mode: FailureMode;
  config?: FailureConfig;
  cascade?: boolean;
}

export interface ResetRequest {
  count?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
