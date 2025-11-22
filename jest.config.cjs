module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/__tests__/**/*.test.cjs'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/.history/',
    'backend/strategy/__tests__/upstoxOrderAdapter.test.cjs',
    'backend/strategy/__tests__/liveEngine.test.cjs'
  ]
};
