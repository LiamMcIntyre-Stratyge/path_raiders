import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // fast, pure, no network — pathfinder etc. (FND-04 first tests)
        test: { name: 'unit', environment: 'node', include: ['test/unit/**/*.test.ts'] },
      },
      {
        // RLS forged-write — needs a running local Supabase stack + jsdom for supabase-js auth
        test: {
          name: 'rls',
          environment: 'jsdom',
          include: ['test/rls/**/*.test.ts'],
          fileParallelism: false,  // run sequentially (Pitfall 4)
        },
      },
    ],
  },
})
