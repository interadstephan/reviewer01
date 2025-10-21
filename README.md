# Azure DevOps PR Reviewer - AI Agent

An AI-powered Azure Function App that automatically analyzes pull requests in Azure DevOps projects and provides intelligent code review comments using OpenAI.

## Features

- 🤖 **Automated Code Review**: Automatically triggered when PRs are created or updated in Azure DevOps
- 🔍 **Deep Analysis**: Uses OpenAI GPT-4 to analyze code changes for security, performance, and best practices
- 💬 **Contextual Comments**: Posts review comments directly on specific lines in the PR
- ⚙️ **Configurable**: Customize review depth, tone, and excluded files
- 🎯 **Focus Areas**: Configurable focus on security, performance, best practices, and code quality

## Architecture

The solution consists of:
- **Azure Function**: HTTP-triggered function that processes Azure DevOps webhooks
- **DevOps Client**: Handles communication with Azure DevOps REST APIs
- **OpenAI Client**: Analyzes code changes using OpenAI GPT models
- **Review Service**: Orchestrates the review process and filters files

## Prerequisites

- Node.js 20.x or higher
- Azure Functions Core Tools (for local development)
- Azure DevOps organization and project
- OpenAI API key
- Azure DevOps Personal Access Token (PAT) with permissions:
  - Code (Read)
  - Pull Request Threads (Read & Write)

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd reviewer01
npm install
```

### 2. Configure Environment Variables

Copy `local.settings.json.example` to `local.settings.json` and update with your values:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_DEVOPS_ORG": "your-organization",
    "AZURE_DEVOPS_PROJECT": "your-project",
    "AZURE_DEVOPS_PAT": "your-personal-access-token",
    "OPENAI_API_KEY": "your-openai-api-key"
  }
}
```

### 3. Configure Review Settings

Edit `config.json` to customize the review behavior:

```json
{
  "review": {
    "depth": "detailed",
    "tone": "constructive",
    "excludedFiles": [
      "*.min.js",
      "*.min.css",
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/*.generated.*",
      "**/package-lock.json",
      "**/yarn.lock"
    ],
    "focusAreas": [
      "security",
      "performance",
      "best-practices",
      "code-quality"
    ],
    "maxComments": 10
  },
  "openai": {
    "model": "gpt-4",
    "maxTokens": 2000,
    "temperature": 0.3
  }
}
```

### 4. Build the Project

```bash
npm run build
```

### 5. Test Locally

```bash
npm start
```

The function will be available at `http://localhost:7071/api/PRReviewFunction`

## Deployment

### Deploy to Azure

1. Create an Azure Function App in the Azure Portal
2. Configure Application Settings with the same environment variables from `local.settings.json`
3. Deploy using Azure Functions Core Tools:

```bash
func azure functionapp publish <your-function-app-name>
```

### Configure Azure DevOps Service Hook

1. In Azure DevOps, go to Project Settings > Service Hooks
2. Create a new subscription for "Pull Request Created" and "Pull Request Updated"
3. Set the webhook URL to your Azure Function URL:
   ```
   https://<your-function-app-name>.azurewebsites.net/api/PRReviewFunction?code=<function-key>
   ```
4. Test the hook to ensure it's working

## Configuration Options

### Review Settings

- **depth**: `"brief"` or `"detailed"` - Controls how thorough the review is
- **tone**: `"constructive"`, `"strict"`, or `"friendly"` - Sets the tone of comments
- **excludedFiles**: Array of glob patterns for files to skip
- **focusAreas**: Areas to focus on (security, performance, best-practices, code-quality)
- **maxComments**: Maximum number of comments per file

### OpenAI Settings

- **model**: OpenAI model to use (e.g., "gpt-4", "gpt-3.5-turbo")
- **maxTokens**: Maximum tokens for AI response
- **temperature**: Controls randomness (0.0-1.0)

## How It Works

1. **Webhook Trigger**: Azure DevOps sends a webhook when a PR is created/updated
2. **Get Changes**: Function fetches PR iterations and changes via DevOps REST API
3. **Filter Files**: Excludes files based on configuration patterns
4. **Analyze Code**: Sends diffs to OpenAI for analysis
5. **Post Comments**: Creates review threads with AI-generated feedback
6. **Summary**: Posts an overall summary comment on the PR

## API Reference

### DevOps REST APIs Used

- `GET /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations`
- `GET /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/iterations/{iterationId}/changes`
- `GET /git/repositories/{repositoryId}/diffs/commits`
- `POST /git/repositories/{repositoryId}/pullRequests/{pullRequestId}/threads`

### OpenAI API

- Uses Chat Completions API with structured JSON output
- GPT-4 model for best results (configurable)

## Development

### Project Structure

```
reviewer01/
├── PRReviewFunction/          # Azure Function
│   ├── function.json         # Function binding configuration
│   └── index.ts              # Function entry point
├── src/                      # Source code
│   ├── devops-client.ts     # Azure DevOps API client
│   ├── openai-client.ts     # OpenAI API client
│   └── review-service.ts    # Review orchestration
├── config.json              # Review configuration
├── host.json               # Function host configuration
├── tsconfig.json           # TypeScript configuration
├── package.json            # Dependencies
└── README.md              # This file
```

### Build and Watch

```bash
npm run watch
```

### Testing Webhook Locally

Use a tool like ngrok to expose your local function:

```bash
ngrok http 7071
```

Then configure the Azure DevOps webhook to point to the ngrok URL.

## Troubleshooting

### Function not triggering
- Check Azure DevOps Service Hook delivery history
- Verify the function URL and authentication code
- Check function logs in Azure Portal or local console

### Authentication errors
- Verify PAT has correct permissions
- Ensure PAT is not expired
- Check that organization and project names are correct

### OpenAI errors
- Verify API key is valid and has credits
- Check model availability (GPT-4 requires API access)
- Review rate limits and quotas

## Security Considerations

- Store PAT and API keys securely (use Azure Key Vault in production)
- Use function-level authentication (included in function URL)
- Restrict network access to the function if possible
- Regularly rotate access tokens

## License

ISC

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.