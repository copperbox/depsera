import { DependencyAlias } from '../../db/types';

export interface IDependencyAliasStore {
  findAll(): DependencyAlias[];
  findById(id: string): DependencyAlias | undefined;
  findByAlias(alias: string): DependencyAlias | undefined;
  getCanonicalNames(): string[];
  create(alias: string, canonicalName: string): DependencyAlias;
  update(id: string, canonicalName: string): DependencyAlias | undefined;
  delete(id: string): boolean;
  resolveAlias(name: string): string | null;
}
