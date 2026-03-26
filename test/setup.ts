import { execSync } from 'node:child_process';

/**
 * Ensure schema exists on the test database (requires Postgres reachable).
 * CI: uses service container. Local: `docker compose up -d` first.
 */
beforeAll(() => {
  try {
    execSync('npx prisma db push --skip-generate', {
      stdio: 'pipe',
      env: { ...process.env },
    });
  } catch {
    console.warn(
      '[e2e setup] prisma db push failed — is DATABASE_URL / Postgres up?',
    );
  }
});
