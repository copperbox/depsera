export interface StatusChangeActivity {
  id: string;
  service_id: string;
  service_name: string;
  dependency_name: string;
  previous_healthy: boolean | null;
  current_healthy: boolean;
  recorded_at: string;
}

export interface UnstableDependency {
  dependency_name: string;
  service_name: string;
  service_id: string;
  change_count: number;
  current_healthy: boolean;
  last_change_at: string;
}
