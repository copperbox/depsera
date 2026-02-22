import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..');
const docsDir = path.join(repoRoot, 'docs');

describe('Health endpoint spec documentation', () => {
  let healthDoc: string;

  beforeAll(() => {
    healthDoc = fs.readFileSync(
      path.join(docsDir, 'health-endpoint-spec.md'),
      'utf-8'
    );
  });

  describe('file exists', () => {
    it('health-endpoint-spec.md exists in docs/', () => {
      expect(
        fs.existsSync(path.join(docsDir, 'health-endpoint-spec.md'))
      ).toBe(true);
    });
  });

  describe('required top-level sections', () => {
    const requiredSections = [
      'Default Format (proactive-deps)',
      'Custom Schema Mapping',
      'Examples',
      'Testing Schema Mappings',
      'Troubleshooting',
    ];

    it.each(requiredSections)('has section for %s', (section) => {
      expect(healthDoc).toContain(`## ${section}`);
    });
  });

  describe('default format documentation', () => {
    it('documents response structure as a JSON array', () => {
      expect(healthDoc).toContain('JSON array');
    });

    it('documents the required name field', () => {
      expect(healthDoc).toContain('`name`');
      expect(healthDoc).toMatch(/name.*string.*Yes/);
    });

    it('documents the required healthy field', () => {
      expect(healthDoc).toContain('`healthy`');
      expect(healthDoc).toMatch(/healthy.*boolean.*Yes/);
    });

    it('documents the health object with state, code, latency', () => {
      expect(healthDoc).toContain('`health.state`');
      expect(healthDoc).toContain('`health.code`');
      expect(healthDoc).toContain('`health.latency`');
    });

    it('documents health states (0=OK, 1=WARNING, 2=CRITICAL)', () => {
      expect(healthDoc).toMatch(/0.*OK/);
      expect(healthDoc).toMatch(/1.*WARNING/);
      expect(healthDoc).toMatch(/2.*CRITICAL/);
    });

    it('documents all dependency types from the codebase', () => {
      const types = [
        'database',
        'rest',
        'soap',
        'grpc',
        'graphql',
        'message_queue',
        'cache',
        'file_system',
        'smtp',
        'other',
      ];
      for (const type of types) {
        expect(healthDoc).toContain(`\`${type}\``);
      }
    });

    it('documents optional fields (description, impact, type, lastChecked)', () => {
      expect(healthDoc).toContain('`description`');
      expect(healthDoc).toContain('`impact`');
      expect(healthDoc).toContain('`type`');
      expect(healthDoc).toContain('`lastChecked`');
    });

    it('documents the flat format alternative', () => {
      expect(healthDoc).toContain('Flat Format');
      expect(healthDoc).toContain('healthCode');
      expect(healthDoc).toContain('latencyMs');
    });

    it('documents a minimal example', () => {
      expect(healthDoc).toContain('Minimal Example');
      expect(healthDoc).toContain('"name": "database"');
      expect(healthDoc).toContain('"healthy": true');
    });
  });

  describe('custom schema mapping documentation', () => {
    it('documents when to use custom schema mappings', () => {
      expect(healthDoc).toContain('### When to Use');
    });

    it('documents schema configuration structure', () => {
      expect(healthDoc).toContain('### Schema Configuration');
      expect(healthDoc).toContain('`root`');
      expect(healthDoc).toContain('`fields.name`');
      expect(healthDoc).toContain('`fields.healthy`');
      expect(healthDoc).toContain('`fields.latency`');
      expect(healthDoc).toContain('`fields.impact`');
      expect(healthDoc).toContain('`fields.description`');
    });

    it('documents that root and fields.name/healthy are required', () => {
      // root is required
      expect(healthDoc).toMatch(/root.*string.*Yes/);
      // fields.name is required
      expect(healthDoc).toMatch(/fields\.name.*Yes/);
      // fields.healthy is required
      expect(healthDoc).toMatch(/fields\.healthy.*Yes/);
    });

    it('documents that latency, impact, description are optional', () => {
      expect(healthDoc).toMatch(/fields\.latency.*No/);
      expect(healthDoc).toMatch(/fields\.impact.*No/);
      expect(healthDoc).toMatch(/fields\.description.*No/);
    });

    it('documents field mappings as string paths or boolean comparisons', () => {
      expect(healthDoc).toContain('### Field Mappings');
      expect(healthDoc).toContain('string path');
      expect(healthDoc).toContain('boolean comparison');
    });

    it('documents boolean comparison structure with field and equals', () => {
      expect(healthDoc).toContain('### Boolean Comparisons');
      expect(healthDoc).toContain('"field"');
      expect(healthDoc).toContain('"equals"');
    });

    it('documents that boolean comparison is case-insensitive', () => {
      expect(healthDoc).toMatch(/case-insensitive/i);
    });

    it('documents dot-notation path resolution', () => {
      expect(healthDoc).toContain('### Dot-Notation Paths');
      expect(healthDoc).toContain('dot notation');
    });

    it('provides dot-notation path examples', () => {
      expect(healthDoc).toContain('"health.state"');
    });
  });

  describe('healthy value coercion', () => {
    it('documents string-to-boolean coercion', () => {
      expect(healthDoc).toContain('### Healthy Value Coercion');
    });

    it('documents all true coercion values', () => {
      expect(healthDoc).toContain('"true"');
      expect(healthDoc).toContain('"ok"');
      expect(healthDoc).toContain('"healthy"');
      expect(healthDoc).toContain('"up"');
    });

    it('documents all false coercion values', () => {
      expect(healthDoc).toContain('"false"');
      expect(healthDoc).toContain('"error"');
      expect(healthDoc).toContain('"unhealthy"');
      expect(healthDoc).toContain('"down"');
      expect(healthDoc).toContain('"critical"');
    });

    it('notes that coercion is case-insensitive', () => {
      expect(healthDoc).toMatch(/case-insensitive/i);
    });
  });

  describe('examples section', () => {
    it('documents Spring Boot Actuator example', () => {
      expect(healthDoc).toContain('### Spring Boot Actuator');
      expect(healthDoc).toContain('actuator');
    });

    it('documents ASP.NET Health Checks example', () => {
      expect(healthDoc).toContain('### ASP.NET Health Checks');
    });

    it('provides schema mapping JSON for each example', () => {
      // Check that examples include actual schema_config JSON
      expect(healthDoc).toContain('"root"');
      expect(healthDoc).toContain('"fields"');
    });

    it('documents at least one boolean comparison example', () => {
      expect(healthDoc).toContain('"equals": "UP"');
    });

    it('documents at least one nested path example', () => {
      // e.g., metrics.latencyMs or response.time
      expect(healthDoc).toMatch(/"[a-z]+\.[a-z]+[A-Za-z]*"/);
    });
  });

  describe('testing schema mappings section', () => {
    it('documents the UI-based testing flow', () => {
      expect(healthDoc).toContain('### Using the UI');
      expect(healthDoc).toContain('Test mapping');
    });

    it('documents the API-based testing flow', () => {
      expect(healthDoc).toContain('### Using the API');
      expect(healthDoc).toContain('POST /api/services/test-schema');
    });

    it('includes a curl example for the test-schema endpoint', () => {
      expect(healthDoc).toContain('curl');
      expect(healthDoc).toContain('test-schema');
    });

    it('documents the test response format', () => {
      expect(healthDoc).toContain('"success"');
      expect(healthDoc).toContain('"dependencies"');
      expect(healthDoc).toContain('"warnings"');
    });

    it('documents authentication requirement', () => {
      expect(healthDoc).toMatch(/[Aa]uthenticat/);
      expect(healthDoc).toContain('team lead');
    });

    it('documents SSRF validation', () => {
      expect(healthDoc).toContain('SSRF');
    });

    it('documents that nothing is stored', () => {
      expect(healthDoc).toMatch(/not.*store|dry run|nothing.*store/i);
    });
  });

  describe('troubleshooting section', () => {
    it('covers common error: expected array', () => {
      expect(healthDoc).toContain('expected array');
    });

    it('covers common error: root path did not resolve', () => {
      expect(healthDoc).toContain('Root path did not resolve');
    });

    it('covers no dependencies parsed', () => {
      expect(healthDoc).toContain('No dependencies parsed');
    });

    it('covers latency shows as 0', () => {
      expect(healthDoc).toContain('Latency shows as 0');
    });

    it('covers boolean comparison not matching', () => {
      expect(healthDoc).toContain('Boolean comparison');
    });
  });

  describe('cross-references to codebase types', () => {
    it('documents BooleanComparison structure matching server types', () => {
      // Read the server types to verify documentation accuracy
      const typesFile = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'db', 'types.ts'),
        'utf-8'
      );
      expect(typesFile).toContain('interface BooleanComparison');
      expect(typesFile).toContain('field: string');
      expect(typesFile).toContain('equals: string');
      // Doc should match — field and equals documented
      expect(healthDoc).toContain('"field"');
      expect(healthDoc).toContain('"equals"');
    });

    it('documents SchemaMapping fields matching server types', () => {
      const typesFile = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'db', 'types.ts'),
        'utf-8'
      );
      expect(typesFile).toContain('interface SchemaMapping');
      expect(typesFile).toContain('root: string');
      expect(typesFile).toContain('name: FieldMapping');
      expect(typesFile).toContain('healthy: FieldMapping');
      // Doc should match
      expect(healthDoc).toContain('`root`');
      expect(healthDoc).toContain('`fields.name`');
      expect(healthDoc).toContain('`fields.healthy`');
    });

    it('documents all dependency types matching DEPENDENCY_TYPES array', () => {
      const typesFile = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'db', 'types.ts'),
        'utf-8'
      );
      const typeMatch = typesFile.match(
        /DEPENDENCY_TYPES.*?=\s*\[([\s\S]*?)\]/
      );
      expect(typeMatch).not.toBeNull();
      const types = typeMatch![1].match(/'([^']+)'/g)?.map((t) => t.slice(1, -1)) || [];
      expect(types.length).toBeGreaterThan(0);
      for (const type of types) {
        expect(healthDoc).toContain(`\`${type}\``);
      }
    });

    it('documents healthy coercion values matching SchemaMapper', () => {
      const mapperFile = fs.readFileSync(
        path.join(
          repoRoot,
          'server',
          'src',
          'services',
          'polling',
          'SchemaMapper.ts'
        ),
        'utf-8'
      );
      // Verify the true values from SchemaMapper are documented
      const trueValues = ['true', 'ok', 'healthy', 'up'];
      const falseValues = ['false', 'error', 'unhealthy', 'down', 'critical'];

      for (const val of trueValues) {
        expect(mapperFile.toLowerCase()).toContain(`'${val}'`);
        expect(healthDoc).toContain(`"${val}"`);
      }
      for (const val of falseValues) {
        expect(mapperFile.toLowerCase()).toContain(`'${val}'`);
        expect(healthDoc).toContain(`"${val}"`);
      }
    });

    it('documents ProactiveDepsStatus fields matching server types', () => {
      const typesFile = fs.readFileSync(
        path.join(repoRoot, 'server', 'src', 'db', 'types.ts'),
        'utf-8'
      );
      expect(typesFile).toContain('interface ProactiveDepsStatus');
      // Required fields from the interface
      expect(typesFile).toContain('name: string');
      expect(typesFile).toContain('healthy: boolean');
      // Doc should document these as required
      expect(healthDoc).toMatch(/`name`.*string.*Yes/);
      expect(healthDoc).toMatch(/`healthy`.*boolean.*Yes/);
    });
  });

  describe('links from other docs', () => {
    it('api-reference.md links to health-endpoint-spec.md', () => {
      const apiDoc = fs.readFileSync(
        path.join(docsDir, 'api-reference.md'),
        'utf-8'
      );
      expect(apiDoc).toContain('health-endpoint-spec.md');
    });
  });
});
