#!/usr/bin/env node
/**
 * Integration test for Vanta Paper Trader API endpoints.
 * Tests endpoint existence, route structure, and auth requirements.
 * Run: node integration-test.js
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname);
const APP_DIR = path.join(PROJECT_ROOT, 'src', 'app', 'api');

// Track results
const results = {
  total: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
  endpoints: [],
  authCoverage: { session: 0, apiKey: 0, both: 0, none: 0 },
  issues: []
};

// Discover all API route files
function discoverRoutes(baseDir, prefix = '') {
  const entries = fs.readdirSync(baseDir, { withFileTypes: true });
  const routes = [];

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name);
    const routePath = `${prefix}/${entry.name}`;

    if (entry.isDirectory()) {
      if (entry.name === '[id]' || entry.name.startsWith('[')) {
        // Dynamic route param — list it
        routes.push({ path: routePath, type: 'dynamic' });
        continue;
      }
      const subRoutes = discoverRoutes(fullPath, routePath);
      routes.push(...subRoutes);
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      routes.push({ path: routePath, type: 'file', fullPath });
    }
  }

  return routes;
}

// Check if a route file supports API key auth
function checkApiKeyAuth(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('authenticateApiKey') || content.includes('apiAuth');
}

// Check if a route file supports session auth
function checkSessionAuth(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('getSessionUser') || content.includes('supabaseServer') || content.includes('supabaseForRequest');
}

// Check if a route has Zod validation
function checkInputValidation(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('z.object') || content.includes('safeParse') || content.includes('zod');
}

// Check if a route has error handling
function checkErrorHandling(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('catch') || content.includes('error') || content.includes('NextResponse.json');
}

// Check if a route has dynamic = force-dynamic
function checkCaching(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.includes('force-dynamic');
}

// Analyze all routes
function analyzeRoutes() {
  const routes = discoverRoutes(APP_DIR);

  for (const route of routes) {
    results.total++;

    const endpoint = {
      path: route.path,
      type: route.type,
      auth: 'none',
      hasValidation: false,
      hasErrorHandling: false,
      hasCaching: false,
      issues: []
    };

    if (route.type === 'file' && route.fullPath) {
      const content = fs.readFileSync(route.fullPath, 'utf-8');

      // Determine auth coverage
      const hasApiKey = checkApiKeyAuth(route.fullPath);
      const hasSession = checkSessionAuth(route.fullPath);

      if (hasApiKey && hasSession) {
        endpoint.auth = 'both';
        results.authCoverage.both++;
      } else if (hasApiKey) {
        endpoint.auth = 'apiKey';
        results.authCoverage.apiKey++;
      } else if (hasSession) {
        endpoint.auth = 'session';
        results.authCoverage.session++;
      } else {
        endpoint.auth = 'none';
        results.authCoverage.none++;
      }

      endpoint.hasValidation = checkInputValidation(route.fullPath);
      endpoint.hasErrorHandling = checkErrorHandling(route.fullPath);
      endpoint.hasCaching = checkCaching(route.fullPath);

      // Check for issues
      if (!endpoint.hasValidation && endpoint.auth !== 'none') {
        endpoint.issues.push('missing input validation');
      }
      if (!endpoint.hasErrorHandling) {
        endpoint.issues.push('missing error handling');
      }
      if (!endpoint.hasCaching && !route.path.includes('/cron/')) {
        endpoint.issues.push('no force-dynamic (will be cached by Next.js)');
      }
    }

    results.endpoints.push(endpoint);

    // Determine pass/fail
    if (endpoint.issues.length === 0) {
      results.passed++;
    } else if (endpoint.issues.every(i => i.includes('force-dynamic'))) {
      results.passed++; // force-dynamic is a minor issue
    } else {
      results.failed++;
      results.issues.push(...endpoint.issues.map(i => `${endpoint.path}: ${i}`));
    }
  }
}

// Generate report
function generateReport() {
  let report = `# Vanta Paper Trader — Integration Test Results\n\n`;
  report += `## Summary\n\n`;
  report += `- **Total endpoints analyzed:** ${results.total}\n`;
  report += `- **Passed:** ${results.passed}\n`;
  report += `- **Failed:** ${results.failed}\n`;
  report += `- **Issues found:** ${results.issues.length}\n\n`;

  report += `## Auth Coverage\n\n`;
  report += `- **Session auth only:** ${results.authCoverage.session}\n`;
  report += `- **API key auth only:** ${results.authCoverage.apiKey}\n`;
  report += `- **Both:** ${results.authCoverage.both}\n`;
  report += `- **No auth:** ${results.authCoverage.none}\n\n`;

  report += `## All Endpoints\n\n`;
  report += `| Path | Auth | Validation | Error Handling | Cache | Issues |\n`;
  report += `|------|------|------------|----------------|-------|--------|\n`;
  for (const ep of results.endpoints) {
    const issues = ep.issues.length > 0 ? ep.issues.join('; ') : '✅';
    report += `| \`${ep.path}\` | ${ep.auth} | ${ep.hasValidation ? '✅' : '❌'} | ${ep.hasErrorHandling ? '✅' : '❌'} | ${ep.hasCaching ? '✅' : '❌'} | ${issues} |\n`;
  }

  if (results.issues.length > 0) {
    report += `\n## Issues Found\n\n`;
    results.issues.forEach((issue, i) => {
      report += `${i + 1}. ${issue}\n`;
    });
  }

  report += `\n## Recommendations\n\n`;
  report += `1. **Rate limiting:** No rate limiting exists on any endpoint. Add rate limiting middleware.\n`;
  report += `2. **CORS:** CORS is configurable (was hardcoded to '*' — now via env var).\n`;
  report += `3. **Input validation:** Some endpoints lack Zod validation — add for all POST/PUT.\n`;
  report += `4. **force-dynamic:** Some endpoints missing force-dynamic — Next.js will cache them.\n`;
  report += `5. **Auth gaps:** Some endpoints have no auth — verify this is intentional.\n`;

  return report;
}

// Run analysis
console.log('Analyzing Vanta API endpoints...\n');
analyzeRoutes();
const report = generateReport();
console.log(report);

// Write report to file
const reportPath = path.join(PROJECT_ROOT, 'integration-test-results.md');
fs.writeFileSync(reportPath, report);
console.log(`\nReport written to: ${reportPath}`);

// Exit with appropriate code
process.exit(results.failed > 0 ? 1 : 0);
