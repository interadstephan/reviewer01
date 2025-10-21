# Deployment Guide

## Prerequisites

Before deploying the AI PR Reviewer, ensure you have:

1. **Azure Account** with an active subscription
2. **Azure CLI** installed ([Install Guide](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli))
3. **Node.js 20.x** or higher
4. **Azure Functions Core Tools** ([Install Guide](https://docs.microsoft.com/en-us/azure/azure-functions/functions-run-local))
5. **Azure DevOps Organization** with at least one project
6. **OpenAI API Key** ([Get one here](https://platform.openai.com/api-keys))
7. **Azure DevOps Personal Access Token (PAT)** with:
   - Code (Read)
   - Pull Request Threads (Read & Write)

## Step 1: Create Azure Resources

### Option A: Using Azure Portal

1. Sign in to the [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** > **Function App**
3. Fill in the details:
   - **Subscription**: Choose your subscription
   - **Resource Group**: Create new or use existing
   - **Function App name**: Choose a unique name (e.g., `pr-reviewer-func`)
   - **Runtime stack**: Node.js
   - **Version**: 20 LTS
   - **Region**: Choose the closest region
   - **Operating System**: Linux (recommended)
   - **Plan type**: Consumption (Serverless) or Premium
4. Click **Review + create** > **Create**

### Option B: Using Azure CLI

```bash
# Login to Azure
az login

# Create a resource group
az group create --name pr-reviewer-rg --location eastus

# Create a storage account (required for Azure Functions)
az storage account create \
  --name prreviewerstorage \
  --resource-group pr-reviewer-rg \
  --location eastus \
  --sku Standard_LRS

# Create the Function App
az functionapp create \
  --resource-group pr-reviewer-rg \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 20 \
  --functions-version 4 \
  --name pr-reviewer-func \
  --storage-account prreviewerstorage \
  --os-type Linux
```

## Step 2: Configure Application Settings

Add the required environment variables to your Function App:

### Using Azure Portal

1. Navigate to your Function App in the Azure Portal
2. Go to **Configuration** under Settings
3. Click **New application setting** for each:
   - `AZURE_DEVOPS_ORG`: Your Azure DevOps organization name
   - `AZURE_DEVOPS_PROJECT`: Your project name
   - `AZURE_DEVOPS_PAT`: Your Personal Access Token
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Click **Save**

### Using Azure CLI

```bash
az functionapp config appsettings set \
  --name pr-reviewer-func \
  --resource-group pr-reviewer-rg \
  --settings \
    AZURE_DEVOPS_ORG="your-org" \
    AZURE_DEVOPS_PROJECT="your-project" \
    AZURE_DEVOPS_PAT="your-pat-token" \
    OPENAI_API_KEY="your-openai-key"
```

## Step 3: Deploy the Function

### Build the project

```bash
npm install
npm run build
```

### Deploy using Azure Functions Core Tools

```bash
func azure functionapp publish pr-reviewer-func
```

### Deploy using Azure CLI

```bash
# Create a deployment package
zip -r deploy.zip . -x "*.git*" "node_modules/*" "dist/*" "*.log"

# Deploy
az functionapp deployment source config-zip \
  --resource-group pr-reviewer-rg \
  --name pr-reviewer-func \
  --src deploy.zip
```

## Step 4: Get the Function URL

After deployment, get the function URL with authentication key:

### Using Azure Portal

1. Navigate to your Function App
2. Go to **Functions** > **PRReviewFunction**
3. Click **Get Function Url**
4. Copy the URL (includes the authentication code)

### Using Azure CLI

```bash
# Get the default host key
az functionapp keys list \
  --resource-group pr-reviewer-rg \
  --name pr-reviewer-func \
  --query "functionKeys.default" -o tsv

# The URL format is:
# https://<function-app-name>.azurewebsites.net/api/PRReviewFunction?code=<function-key>
```

## Step 5: Configure Azure DevOps Service Hook

1. Navigate to your Azure DevOps project
2. Go to **Project Settings** (gear icon at bottom left)
3. Click **Service hooks** under General
4. Click **Create subscription**
5. Select **Web Hooks** as the service > **Next**
6. Configure the trigger:
   - **Event**: Pull request created
   - **Repository**: All repositories (or select specific ones)
   - Click **Next**
7. Configure the action:
   - **URL**: Paste your Function URL from Step 4
   - **HTTP headers**: Leave empty (or add custom headers if needed)
   - Click **Test** to verify the connection
   - Click **Finish**
8. Repeat steps 4-7 for **Pull request updated** event

## Step 6: Test the Setup

1. Create a test pull request in your Azure DevOps repository
2. Check the Function App logs to see if it was triggered:
   ```bash
   func azure functionapp logstream pr-reviewer-func
   ```
3. Or view logs in Azure Portal:
   - Navigate to your Function App
   - Go to **Monitor** > **Logs**
4. The AI should post review comments on your PR within a minute

## Step 7: Monitor and Maintain

### View Logs

```bash
# Stream live logs
func azure functionapp logstream pr-reviewer-func

# Or use Azure CLI
az webapp log tail \
  --resource-group pr-reviewer-rg \
  --name pr-reviewer-func
```

### Monitor Performance

1. In Azure Portal, navigate to your Function App
2. Click **Application Insights** (if enabled)
3. View metrics like:
   - Execution count
   - Execution duration
   - Failures

### Update Configuration

To update review settings, modify `config.json` and redeploy:

```bash
npm run build
func azure functionapp publish pr-reviewer-func
```

## Troubleshooting

### Function not triggering

- Check Service Hook delivery history in Azure DevOps
- Verify the webhook URL is correct and includes the function key
- Check Function App logs for errors

### Authentication failures

- Verify PAT has correct permissions and is not expired
- Check that organization and project names match exactly
- Ensure environment variables are set correctly in Function App

### OpenAI errors

- Verify API key is valid and has available credits
- Check that the model (GPT-4) is accessible with your API key
- Consider switching to "gpt-3.5-turbo" if GPT-4 access is limited

### Timeout issues

- Consider upgrading from Consumption plan to Premium plan
- Increase the function timeout in `host.json`
- Optimize the review by reducing `maxComments` in `config.json`

## Cost Considerations

### Azure Costs

- **Consumption Plan**: Pay per execution (~$0.20 per million executions)
- **Storage**: Minimal cost for logs and state
- **Bandwidth**: Typically negligible

### OpenAI Costs

- **GPT-4**: ~$0.03 per 1K tokens input, ~$0.06 per 1K tokens output
- **GPT-3.5-turbo**: ~$0.0015 per 1K tokens (20x cheaper)
- Estimate: 5-10 cents per PR review with GPT-4

**Cost Optimization Tips**:
1. Use GPT-3.5-turbo instead of GPT-4 in `config.json`
2. Reduce `maxTokens` to limit response size
3. Exclude more file patterns to reduce files reviewed
4. Set `depth: "brief"` for faster, cheaper reviews

## Security Best Practices

1. **Use Azure Key Vault** for secrets in production:
   ```bash
   # Create Key Vault
   az keyvault create \
     --name pr-reviewer-vault \
     --resource-group pr-reviewer-rg \
     --location eastus
   
   # Store secrets
   az keyvault secret set --vault-name pr-reviewer-vault \
     --name "AzureDevOpsPAT" --value "your-pat"
   
   # Grant Function App access
   az functionapp identity assign \
     --name pr-reviewer-func \
     --resource-group pr-reviewer-rg
   ```

2. **Enable Application Insights** for better monitoring
3. **Rotate tokens regularly** (PAT and API keys)
4. **Use IP restrictions** if possible
5. **Enable HTTPS only** (default in Azure Functions)

## Scaling

For high-volume scenarios:

1. **Upgrade to Premium Plan** for:
   - Faster cold starts
   - Virtual network integration
   - Unlimited execution duration

2. **Use Durable Functions** for long-running reviews:
   - Better handling of timeouts
   - Retry logic
   - Status monitoring

3. **Implement caching** for repeated file analysis

## Updating

To update the function with new code:

```bash
# Pull latest changes
git pull

# Install dependencies
npm install

# Build
npm run build

# Deploy
func azure functionapp publish pr-reviewer-func
```

## Cleanup

To remove all resources:

```bash
# Delete the resource group (includes all resources)
az group delete --name pr-reviewer-rg --yes
```
