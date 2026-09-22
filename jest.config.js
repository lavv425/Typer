module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Floors, not targets. The README badge claims 97% line coverage, and
  // nothing enforced it: coverage slipped to 95.98% during the 5.0 module
  // split — the tests stayed put while the code they covered moved — and the
  // run still passed. These are set just under the current numbers
  // (97.62 / 92.34 / 97.80 / 98.18), so a real regression fails while ordinary
  // churn does not.
  //
  // Branches sits lower than the rest on purpose: the `return p` statements in
  // `Core/Checkers` are unreachable for built-in aliases, because the
  // predicate answers before the checker is consulted. That is the
  // long-standing TODO in that file, not a gap in the suite.
  coverageThreshold: {
    global: {
      statements: 97,
      branches: 89,
      functions: 97,
      lines: 97,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 10000,
  verbose: true
};