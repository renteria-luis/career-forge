/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Explanations belong in the body. Keep the subject scannable in `git log --oneline`.
    'header-max-length': [2, 'always', 72],
    'body-max-line-length': [2, 'always', 100],
    'type-enum': [
      2,
      'always',
      [
        'feat', // user-facing capability
        'fix', // user-facing defect
        'perf',
        'refactor', // behaviour preserved
        'docs',
        'test',
        'build', // toolchain, dependencies
        'ci',
        'chore',
        'revert',
      ],
    ],
  },
}
