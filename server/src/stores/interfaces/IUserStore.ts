import { User, UserRole } from '../../db/types';
import { UserCreateInput, UserUpdateInput, ListOptions } from '../types';

/**
 * Store interface for User entity operations
 */
export interface IUserStore {
  // Find operations
  findById(id: string): User | undefined;
  findByEmail(email: string): User | undefined;
  findByOidcSubject(oidcSubject: string): User | undefined;
  findAll(options?: ListOptions): User[];
  findActive(options?: ListOptions): User[];

  // Write operations
  create(input: UserCreateInput): User;
  update(id: string, input: UserUpdateInput): User | undefined;
  delete(id: string): boolean;

  // Utility
  exists(id: string): boolean;
  existsByEmail(email: string): boolean;
  count(): number;
  countActiveAdmins(): number;
}
