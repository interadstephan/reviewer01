# Contributing to Azure DevOps PR Reviewer

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/reviewer01.git
   cd reviewer01
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a `.env` file based on `.env.example`
5. Build the project:
   ```bash
   npm run build
   ```

## Development Workflow

### Running Locally

1. Start the Azure Functions runtime:
   ```bash
   npm start
   ```

2. The function will be available at:
   ```
   http://localhost:7071/api/PRReviewFunction
   ```

3. Test with a sample webhook payload:
   ```bash
   curl -X POST http://localhost:7071/api/PRReviewFunction \
     -H "Content-Type: application/json" \
     -d @test-payload.json
   ```

### Making Changes

1. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Build and test:
   ```bash
   npm run build
   npm start
   ```

4. Commit your changes:
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

5. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

6. Create a Pull Request

## Code Style

- Use TypeScript for all new code
- Follow existing code formatting
- Use meaningful variable and function names
- Add comments for complex logic
- Keep functions small and focused

## Project Structure

```
reviewer01/
├── PRReviewFunction/       # Azure Function entry point
│   └── index.ts           # HTTP trigger handler
├── src/                   # Core logic
│   ├── devops-client.ts   # Azure DevOps API client
│   ├── openai-client.ts   # OpenAI API client
│   └── review-service.ts  # Review orchestration
├── config.json            # Review configuration
├── host.json             # Function host config
├── tsconfig.json         # TypeScript config
└── package.json          # Dependencies
```

## Testing

Currently, the project focuses on manual testing. Contributions to add automated tests are welcome!

### Manual Testing Checklist

- [ ] Function builds without errors
- [ ] Function starts locally
- [ ] Webhook payload is parsed correctly
- [ ] DevOps API calls work
- [ ] OpenAI API calls work
- [ ] Comments are posted to PR
- [ ] Error handling works
- [ ] Excluded files are skipped

## Feature Ideas

Here are some ideas for contributions:

### High Priority
- [ ] Add unit tests for core logic
- [ ] Add integration tests
- [ ] Improve error handling and retry logic
- [ ] Add support for GitHub (in addition to Azure DevOps)
- [ ] Add support for GitLab

### Medium Priority
- [ ] Add more configuration options
- [ ] Support for custom AI prompts
- [ ] Support for multiple AI providers (Claude, Gemini, etc.)
- [ ] Add metrics and analytics
- [ ] Implement caching to reduce API calls

### Low Priority
- [ ] Add a web dashboard for configuration
- [ ] Support for review templates
- [ ] Integration with code quality tools (ESLint, SonarQube)
- [ ] Support for PR labels based on review results

## Pull Request Guidelines

1. **Description**: Clearly describe what your PR does and why
2. **Testing**: Explain how you tested your changes
3. **Documentation**: Update README or other docs if needed
4. **Breaking Changes**: Clearly mark any breaking changes
5. **Dependencies**: Minimize new dependencies

## Code Review Process

1. Maintainers will review your PR
2. Address any feedback or questions
3. Once approved, your PR will be merged
4. Your contribution will be acknowledged

## Reporting Issues

When reporting issues, please include:

- Description of the problem
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment details (Node version, Azure Functions version, etc.)
- Error messages or logs

## Questions?

Feel free to open an issue for questions or discussions.

## License

By contributing, you agree that your contributions will be licensed under the ISC License.
