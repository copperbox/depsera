export interface StatusChangeActivity {
  id: string;
  service_id: string;
  service_name: string;
  dependency_name: string;
  previous_healthy: boolean | null;
  current_healthy: boolean;
  recorded_at: string;
}
