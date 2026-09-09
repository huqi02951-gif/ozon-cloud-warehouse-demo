// @vitest-environment jsdom

import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppShell } from '../app/AppShell';
import { APP_ROUTES } from '../app/routes';
import { DemoProvider } from '../state/DemoContext';

const projectFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

function renderDemoAt(routeId: string) {
  window.location.hash = `#/${routeId}`;
  return render(
    <DemoProvider initialRole="admin">
      <AppShell />
    </DemoProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe('release acceptance', () => {
  it('renders every approved route without an empty main region', () => {
    expect(APP_ROUTES).toHaveLength(12);
    for (const route of APP_ROUTES) {
      const view = renderDemoAt(route.id);
      const main = view.getByRole('main');
      expect(main.textContent?.trim().length, route.id).toBeGreaterThan(40);
      expect(view.getByRole('heading', { level: 1 }).textContent).toBe(route.label);
      view.unmount();
    }
  });

  it('ships honest release documentation and four walkthroughs', () => {
    const readme = projectFile('README.md');
    const architecture = projectFile('docs/architecture.md');
    const requirements = projectFile('docs/requirements.md');
    const deployment = projectFile('docs/deployment.md');
    const guide = projectFile('docs/demo-guide.md');

    expect(readme).toContain('本地模拟');
    expect(architecture).toContain('localStorage');
    expect(requirements).toContain('部分取消');
    expect(deployment).toContain('GitHub Pages');
    expect(guide.match(/^## 场景 [一二三四]/gm)).toHaveLength(4);
    for (const label of ['获取面单并下发云仓', '保存并重试', '验货：恢复可售', '确认重置']) {
      expect(guide).toContain(`「${label}」`);
    }
  });

  it('defines the reproducible Pages release pipeline', () => {
    const packageJson = JSON.parse(projectFile('package.json')) as { scripts: Record<string, string> };
    const viteConfig = projectFile('vite.config.ts');
    const workflow = projectFile('.github/workflows/pages.yml');

    expect(packageJson.scripts.typecheck).toBe('tsc --noEmit');
    expect(packageJson.scripts.verify).toBe('node scripts/verify-demo.mjs');
    expect(viteConfig).toMatch(/base:\s*['"]\.\/['"]/);
    for (const step of ['npm ci', 'npm test', 'npm run typecheck', 'npm run build', 'npm run verify']) {
      expect(workflow).toContain(step);
    }
    expect(workflow).toContain('actions/upload-pages-artifact@v3');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });
});
