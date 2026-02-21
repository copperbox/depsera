import { Setting } from '../../db/types';

export interface ISettingsStore {
  findAll(): Setting[];
  findByKey(key: string): Setting | undefined;
  upsert(key: string, value: string | null, updatedBy: string): Setting;
  upsertMany(entries: Array<{ key: string; value: string | null }>, updatedBy: string): Setting[];
  delete(key: string): boolean;
}
