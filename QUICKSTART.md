# Quick Start Guide

Get your AI PR Reviewer up and running in 10 minutes!

## Prerequisites Checklist

- [ ] Node.js 20.x or higher installed
- [ ] Azure subscription
- [ ] Azure DevOps organization with a project
- [ ] OpenAI API key
- [ ] Azure DevOps Personal Access Token (PAT)

## Step 1: Clone and Install (2 minutes)

```bash
git clone <repository-url>
cd reviewer01
npm install
```

## Step 2: Configure Locally (2 minutes)

Copy the example settings:

```bash
cp local.settings.json.example local.settings.json
```

Edit `local.settings.json` with your credentials:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "AZURE_DEVOPS_ORG": "your-org-name",
    "AZURE_DEVOPS_PROJECT": "your-project-name",
    "AZURE_DEVOPS_PAT": "your-pat-here",
    "OPENAI_API_KEY": "sk-..."
  }
}
```

### Getting Your Credentials

#### Azure DevOps PAT:
1. Go to https://dev.azure.com/your-org
2. Click User Settings (icon) > Personal access tokens
3. Click "New Token"
4. Give it a name, set expiration
5. Select scopes: **Code (Read)** and **Pull Request Threads (Read & Write)**
6. Copy the token

#### OpenAI API Key:
1. Go to https://platform.openai.com/api-keys
2. Click "Create new secret key"
3. Copy the key (starts with "sk-")

## Step 3: Build and Test Locally (2 minutes)

Build the project:

```bash
npm run build
```

Start the function locally:

```bash
npm start
```

You should see:

```
Azure Functions Core Tools
...
Functions:
  PRReviewFunction: [POST] http://localhost:7071/api/PRReviewFunction
```

Keep this running and open a new terminal for the next step.

## Step 4: Test with Sample Payload (1 minute)

In a new terminal, test the function:

```bash
curl -X POST http://localhost:7071/api/PRReviewFunction \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "git.pullrequest.created",
    "resource": {
      "pullRequestId": 1,
      "repository": {
        "id": "test-repo-id"
      }
    }
  }'
```

Note: This will try to fetch a real PR, so use a real PR ID from your repository.

## Step 5: Deploy to Azure (3 minutes)

### Option A: Quick Deploy with Azure CLI

```bash
# Login
az login

# Create resource group
az group create --name pr-reviewer-rg --location eastus

# Create storage account (required)
STORAGE_NAME="prreviewer$(date +%s)"
az storage account create \
  --name $STORAGE_NAME \
  --resource-group pr-reviewer-rg \
  --location eastus \
  --sku Standard_LRS

# Create function app
az functionapp create \
  --resource-group pr-reviewer-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name pr-reviewer-func \
  --storage-account $STORAGE_NAME \
  --os-type Linux

# Set environment variables
az functionapp config appsettings set \
  --name pr-reviewer-func \
  --resource-group pr-reviewer-rg \
  --settings \
    AZURE_DEVOPS_ORG="your-org" \
    AZURE_DEVOPS_PROJECT="your-project" \
    AZURE_DEVOPS_PAT="your-pat" \
    OPENAI_API_KEY="your-key"

# Deploy
func azure functionapp publish pr-reviewer-func
```

### Option B: Deploy via VS Code

1. Install Azure Functions extension
2. Press F1 > "Azure Functions: Deploy to Function App"
3. Follow prompts

## Step 6: Get Function URL (1 minute)

```bash
# Get the function key
az functionapp keys list \
  --resource-group pr-reviewer-rg \
  --name pr-reviewer-func \
  --query "functionKeys.default" -o tsv

# Your URL is:
# https://pr-reviewer-func.azurewebsites.net/api/PRReviewFunction?code=<key-from-above>
```

Or in Azure Portal:
1. Go to Function App > Functions > PRReviewFunction
2. Click "Get Function Url"

## Step 7: Configure Azure DevOps Webhook (2 minutes)

1. Go to your Azure DevOps project
2. Click ⚙️ (Project Settings) at bottom left
3. Click "Service hooks" under General
4. Click "+ Create subscription"
5. Select "Web Hooks" > Next
6. Select event: "Pull request created" > Next
7. Enter URL from Step 6 > Test > Finish
8. Repeat for "Pull request updated" event

## Test It!

Create a pull request in your Azure DevOps repository and watch the magic happen! 🎉

The AI will:
1. Detect the PR creation
2. Analyze the code changes
3. Post review comments within ~30 seconds

## Troubleshooting

### Function not triggering?

Check the service hook delivery status:
1. Project Settings > Service hooks
2. Click on your webhook
3. View "Delivery Results"

### Authentication error?

- Verify your PAT has correct permissions
- Check organization and project names are exact
- Ensure PAT hasn't expired

### OpenAI error?

- Verify API key is valid
- Check you have credits available
- Try switching to "gpt-3.5-turbo" in config.json

### Still stuck?

1. Check Function App logs:
   ```bash
   func azure functionapp logstream pr-reviewer-func
   ```

2. See detailed guides:
   - [Full README](README.md)
   - [Deployment Guide](DEPLOYMENT.md)
   - [Contributing](CONTRIBUTING.md)

## Customization

Edit `config.json` to customize:

```json
{
  "review": {
    "depth": "detailed",      // or "brief"
    "tone": "constructive",   // or "strict", "friendly"
    "maxComments": 10,        // max comments per file
    "excludedFiles": [
      "*.min.js",
      "**/dist/**"
    ]
  },
  "openai": {
    "model": "gpt-4",         // or "gpt-3.5-turbo"
    "maxTokens": 2000,
    "temperature": 0.3
  }
}
```

After changes, rebuild and redeploy:

```bash
npm run build
func azure functionapp publish pr-reviewer-func
```

## Cost Estimates

- **Azure**: ~$0.20 per million executions (Consumption plan)
- **OpenAI**: ~$0.05-0.10 per PR review with GPT-4
- **Total**: < $1 per month for typical small team usage

To reduce costs:
1. Use GPT-3.5-turbo instead of GPT-4 (20x cheaper)
2. Set `depth: "brief"` in config.json
3. Add more patterns to `excludedFiles`

## Next Steps

- Configure review settings in `config.json`
- Add more excluded file patterns
- Join us in improving the project! See [CONTRIBUTING.md](CONTRIBUTING.md)

---

**Questions?** Open an issue on GitHub!
