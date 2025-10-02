# Contributing to Typer

Thank you for your interest in contributing to Typer! 🎉

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Coding Standards](#coding-standards)
- [Release Process](#release-process)

## 📜 Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## 🤝 How to Contribute

### 🐛 Reporting Bugs

- Use our [Bug Report template](.github/ISSUE_TEMPLATE/bug_report.yml)
- Search existing issues first to avoid duplicates
- Include a minimal reproduction case
- Provide all requested information

### ✨ Suggesting Features

- Use our [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml)
- Explain the use case and benefits
- Consider backwards compatibility
- Provide API design suggestions

### 📚 Improving Documentation

- Use our [Documentation Issue template](.github/ISSUE_TEMPLATE/documentation.yml)
- Fix typos, improve examples, or add missing information
- Ensure examples are tested and work correctly

### ❓ Asking Questions

- Use our [Question template](.github/ISSUE_TEMPLATE/question.yml)
- Check existing documentation and issues first
- Provide context about what you're trying to achieve

## 🛠️ Development Setup

### Prerequisites

- Node.js 16.x or higher
- npm 7.x or higher
- TypeScript 5.x knowledge

### Setup Steps

1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Typer.git
   cd Typer
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Build the Project**
   ```bash
   npm run build
   ```

4. **Run Tests**
   ```bash
   npm test
   npm run test:coverage
   ```

### Project Structure

```
typer/
├── src/
│   ├── Typer.ts              # Main class
│   └── Types/                # Type definitions
├── tests/                    # Comprehensive test suite
├── docs/                     # Generated documentation
├── dist/                     # Built files
└── .github/                  # GitHub templates
```

## 🧪 Testing

We maintain **96.97% test coverage**. All contributions must include tests.

### Running Tests

```bash
# Run all tests
npm test

# Watch mode during development
npm run test:watch

# Coverage report
npm run test:coverage
```

### Writing Tests

- Place tests in the `tests/` directory
- Follow the existing naming convention: `feature.test.ts`
- Include both positive and negative test cases
- Test edge cases and error conditions
- Use descriptive test names

Example test structure:
```typescript
describe('Typer - Feature Name', () => {
    let typer: Typer;

    beforeEach(() => {
        typer = new Typer();
    });

    describe('method name', () => {
        it('should handle valid input', () => {
            // Test implementation
        });

        it('should throw for invalid input', () => {
            // Error case testing
        });
    });
});
```

## 📝 Submitting Changes

### Pull Request Process

1. **Create a Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

2. **Make Changes**
   - Follow our coding standards
   - Add tests for new functionality
   - Update documentation if needed
   - Ensure all tests pass

3. **Commit Changes**
   ```bash
   git commit -m "feat: add new validation method"
   # or
   git commit -m "fix: resolve issue with type checking"
   ```

4. **Push and Create PR**
   ```bash
   git push origin your-branch-name
   ```

### Commit Message Convention

We use [Conventional Commits](https://conventionalcommits.org/):

- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions/modifications
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

### Pull Request Template

Please use our [Pull Request template](.github/pull_request_template.md) and:

- Link to related issues
- Describe what changes were made
- Include screenshots for UI changes
- List any breaking changes
- Confirm tests pass and coverage is maintained

## 🎨 Coding Standards

### TypeScript Guidelines

- Use strict TypeScript configuration
- Prefer explicit types over `any`
- Use generics for type safety
- Follow existing code patterns

### Code Style

- Use Prettier for formatting (configuration in `.prettierrc`)
- Follow ESLint rules (configuration in `.eslintrc`)
- Use meaningful variable and function names
- Add JSDoc comments for public methods

### API Design Principles

- **Backwards Compatibility**: Avoid breaking changes
- **Type Safety**: Leverage TypeScript's type system
- **Performance**: Consider performance implications
- **Usability**: Keep APIs simple and intuitive
- **Consistency**: Follow existing patterns

## 🚀 Release Process

Releases are managed by maintainers:

1. **Version Bump**: Following [Semantic Versioning](https://semver.org/)
   - `MAJOR`: Breaking changes
   - `MINOR`: New features (backwards compatible)
   - `PATCH`: Bug fixes

2. **Release Notes**: Generated from conventional commits

3. **NPM Publish**: Automated through GitHub Actions

## 🏷️ Issue Labels

- `bug` - Something isn't working
- `enhancement` - New feature or request
- `documentation` - Documentation improvements
- `good first issue` - Good for newcomers
- `help wanted` - Extra attention needed
- `performance` - Performance related
- `question` - Further information requested
- `needs-triage` - Needs initial review

## 💡 Getting Help

- 📖 Read the [documentation](https://lavv425.github.io/Typer/)
- 💬 Join [GitHub Discussions](https://github.com/lavv425/Typer/discussions)
- ❓ Create a [Question issue](.github/ISSUE_TEMPLATE/question.yml)

## 🙏 Recognition

Contributors will be:
- Listed in our README
- Mentioned in release notes
- Added to the contributor graph

Thank you for contributing to Typer! 🎉