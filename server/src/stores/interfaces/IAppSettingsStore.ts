export interface IAppSettingsStore {
  get(key: string): string | undefined;
  set(key: string, value: string, updatedBy?: string): void;
}
