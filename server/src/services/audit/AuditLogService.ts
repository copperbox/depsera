import { Request } from 'express';
import { getStores } from '../../stores';
import { AuditAction, AuditResourceType } from '../../db/types';
import logger from '../../utils/logger';

export interface AuditLogInput {
  userId: string;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Extracts the client IP address from an Express request.
 */
function getClientIp(req: Request): string | undefined {
  return req.ip || undefined;
}

/**
 * Logs an admin action to the audit log.
 * Fire-and-forget: errors are logged but never thrown.
 */
export function logAuditEvent(input: AuditLogInput): void {
  try {
    const stores = getStores();
    stores.auditLog.create({
      user_id: input.userId,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId ?? null,
      details: input.details ? JSON.stringify(input.details) : null,
      ip_address: input.ipAddress ?? null,
    });
  } catch (error) {
    logger.error({ err: error, action: input.action }, 'failed to write audit log entry');
  }
}

/**
 * Convenience helper that extracts user ID and IP from the request.
 */
export function auditFromRequest(
  req: Request,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId?: string,
  details?: Record<string, unknown>,
): void {
  // req.user is set by requireAuth middleware (see auth/middleware.ts)
  const userId = req.user?.id
    ?? (req.headers['x-user-id'] as string | undefined);

  if (!userId) {
    logger.warn({ action }, 'audit log skipped — no user ID available');
    return;
  }

  logAuditEvent({
    userId,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress: getClientIp(req),
  });
}
