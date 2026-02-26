import { Request, Response } from 'express';
import { getStores } from '../../stores';
import { validateSchemaConfig } from '../../utils/validation';
import { validateUrlNotPrivate, validateUrlHostname } from '../../utils/ssrf';
import { DependencyParser } from '../../services/polling/DependencyParser';
import { SchemaMapping } from '../../db/types';
import { ValidationError, ForbiddenError, sendErrorResponse } from '../../utils/errors';

const TEST_SCHEMA_TIMEOUT_MS = 10_000;

/**
 * POST /api/services/test-schema
 *
 * Tests a schema mapping against a live health endpoint URL.
 * Returns parsed dependency results and any warnings.
 * Does NOT store anything — purely a preview/test operation.
 */
export async function testSchema(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;

    // Check authorization: must be admin or team lead of at least one team
    if (user.role !== 'admin') {
      const stores = getStores();
      const memberships = stores.teams.getMembershipsByUserId(user.id);
      const isTeamLead = memberships.some((m) => m.role === 'lead');
      if (!isTeamLead) {
        throw new ForbiddenError('Requires team lead or admin role');
      }
    }

    const { url, schema_config } = req.body;

    // Validate URL is provided
    if (!url || typeof url !== 'string') {
      throw new ValidationError('url is required and must be a string', 'url');
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      throw new ValidationError('url must be a valid URL', 'url');
    }

    // Validate schema_config is provided
    if (schema_config === undefined || schema_config === null) {
      throw new ValidationError('schema_config is required', 'schema_config');
    }

    // Validate schema_config structure (returns JSON string)
    const validatedSchemaJson = validateSchemaConfig(schema_config);
    const schemaConfig: SchemaMapping = JSON.parse(validatedSchemaJson);

    // SSRF validation — sync hostname check + async DNS resolution
    validateUrlHostname(url);
    await validateUrlNotPrivate(url);

    // Fetch the health endpoint
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TEST_SCHEMA_TIMEOUT_MS);

    let responseData: unknown;
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        throw new ValidationError(
          `Health endpoint returned HTTP ${response.status}`,
          'url'
        );
      }

      responseData = await response.json();
    } catch (error) {
      if (error instanceof ValidationError) throw error;

      const message = error instanceof Error ? error.message : 'Unknown error';
      const name = error instanceof Error ? error.name : '';
      if (name === 'AbortError' || message.includes('abort')) {
        throw new ValidationError('Health endpoint request timed out (10s)', 'url');
      }
      throw new ValidationError(`Failed to fetch health endpoint: ${message}`, 'url');
    } finally {
      clearTimeout(timeout);
    }

    // Parse using the schema mapping
    const parser = new DependencyParser();
    const warnings: string[] = [];

    let dependencies;
    try {
      dependencies = parser.parse(responseData, schemaConfig);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.json({
        success: false,
        dependencies: [],
        warnings: [message],
      });
      return;
    }

    // Include any schema mapping warnings (skipped items, etc.)
    warnings.push(...parser.lastWarnings);

    // Collect warnings about missing optional fields
    if (!schemaConfig.fields.latency) {
      warnings.push('No latency field mapping configured — latency data will not be captured');
    }
    if (!schemaConfig.fields.impact) {
      warnings.push('No impact field mapping configured — impact data will not be captured');
    }
    if (!schemaConfig.fields.description) {
      warnings.push('No description field mapping configured — description data will not be captured');
    }
    if (!schemaConfig.fields.checkDetails) {
      warnings.push('No checkDetails field mapping configured — check details data will not be captured');
    }
    if (!schemaConfig.fields.contact) {
      warnings.push('No contact field mapping configured — contact data will not be captured');
    }

    // Check for entries with missing optional data
    for (const dep of dependencies) {
      if (schemaConfig.fields.latency && dep.health.latency === 0) {
        warnings.push(`Dependency "${dep.name}": latency field resolved to 0 or was not found`);
      }
    }

    if (dependencies.length === 0) {
      warnings.push('No dependencies were parsed from the response');
    }

    res.json({
      success: true,
      dependencies: dependencies.map((dep) => ({
        name: dep.name,
        healthy: dep.healthy,
        latency_ms: dep.health.latency,
        impact: dep.impact || null,
        description: dep.description || null,
        check_details: dep.checkDetails || null,
        contact: dep.contact || null,
        type: dep.type || 'other',
        skipped: dep.health.skipped ?? false,
      })),
      warnings,
    });
  } catch (error) {
    sendErrorResponse(res, error, 'testing schema mapping');
  }
}
