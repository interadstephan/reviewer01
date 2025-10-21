# Troubleshooting Guide

Common issues and their solutions for the Azure DevOps PR Reviewer.

## Table of Contents

- [Function Not Triggering](#function-not-triggering)
- [Authentication Errors](#authentication-errors)
- [OpenAI Errors](#openai-errors)
- [No Comments Posted](#no-comments-posted)
- [Timeout Errors](#timeout-errors)
- [Build Errors](#build-errors)
- [Deployment Issues](#deployment-issues)

---

## Function Not Triggering

### Symptom
PR is created/updated, but no review comments appear.

### Diagnosis

1. **Check Service Hook Delivery**:
   ```
   Azure DevOps → Project Settings → Service hooks 
   → Click your webhook → History tab
   ```
   Look for delivery status and HTTP response code.

2. **Check Function Logs**:
   ```bash
   func azure functionapp logstream pr-reviewer-func
   ```
   Or in Azure Portal: Function App → Monitor → Logs

### Common Causes & Solutions

#### 1. Webhook URL Incorrect
- **Cause**: Wrong URL or missing function key
- **Solution**: 
  ```bash
  # Get correct URL
  az functionapp function show \
    --name pr-reviewer-func \
    --resource-group pr-reviewer-rg \
    --function-name PRReviewFunction \
    --query invokeUrlTemplate -o tsv
  ```
  Update Service Hook with correct URL.

#### 2. Function Not Deployed
- **Cause**: Code not deployed or deployment failed
- **Solution**:
  ```bash
  # Check deployment status
  az functionapp deployment list-publishing-profiles \
    --name pr-reviewer-func \
    --resource-group pr-reviewer-rg
  
  # Redeploy
  func azure functionapp publish pr-reviewer-func
  ```

#### 3. Event Type Not Matched
- **Cause**: Webhook configured for wrong event
- **Solution**: Verify Service Hook is set for:
  - "Pull request created"
  - "Pull request updated"

#### 4. Function App Stopped
- **Cause**: App service stopped or disabled
- **Solution**:
  ```bash
  az functionapp start \
    --name pr-reviewer-func \
    --resource-group pr-reviewer-rg
  ```

---

## Authentication Errors

### Symptom
Error messages like "401 Unauthorized" or "403 Forbidden" in logs.

### Azure DevOps Authentication

#### Error: "401 Unauthorized" from DevOps API

**Causes & Solutions**:

1. **PAT Expired**:
   - Check expiration: Azure DevOps → User Settings → Personal Access Tokens
   - Create new token with same scopes
   - Update Function App setting:
     ```bash
     az functionapp config appsettings set \
       --name pr-reviewer-func \
       --resource-group pr-reviewer-rg \
       --settings AZURE_DEVOPS_PAT="new-pat-here"
     ```

2. **Insufficient Permissions**:
   - Required scopes:
     - ✅ Code (Read)
     - ✅ Pull Request Threads (Read & Write)
   - Create new PAT with correct scopes

3. **Wrong Organization/Project**:
   - Verify exact names (case-sensitive):
     ```bash
     # Check current settings
     az functionapp config appsettings list \
       --name pr-reviewer-func \
       --resource-group pr-reviewer-rg \
       --query "[?name=='AZURE_DEVOPS_ORG' || name=='AZURE_DEVOPS_PROJECT']"
     ```

### OpenAI Authentication

#### Error: "Incorrect API key provided"

**Solution**:
```bash
# Update API key
az functionapp config appsettings set \
  --name pr-reviewer-func \
  --resource-group pr-reviewer-rg \
  --settings OPENAI_API_KEY="sk-..."
```

#### Error: "You exceeded your current quota"

**Causes**:
- No credits remaining
- Usage limits exceeded

**Solutions**:
1. Add credits to OpenAI account
2. Check usage: https://platform.openai.com/usage
3. Switch to GPT-3.5-turbo (cheaper) in `config.json`

---

## OpenAI Errors

### Error: "The model `gpt-4` does not exist"

**Cause**: No GPT-4 API access

**Solution**: Edit `config.json`:
```json
{
  "openai": {
    "model": "gpt-3.5-turbo"
  }
}
```
Then rebuild and redeploy:
```bash
npm run build
func azure functionapp publish pr-reviewer-func
```

### Error: "Rate limit exceeded"

**Cause**: Too many OpenAI API calls

**Solutions**:

1. **Immediate**: Wait and retry (implements backoff)
2. **Short-term**: Upgrade OpenAI plan
3. **Long-term**: 
   - Add caching
   - Reduce files reviewed
   - Batch process PRs

### Error: "Context length exceeded"

**Cause**: Diff too large for model's context window

**Solutions**:

1. **Exclude large files** in `config.json`:
   ```json
   {
     "review": {
       "excludedFiles": [
         "**/package-lock.json",
         "**/yarn.lock",
         "**/*.min.js",
         "**/*.bundle.js",
         "**/dist/**"
       ]
     }
   }
   ```

2. **Reduce maxTokens**:
   ```json
   {
     "openai": {
       "maxTokens": 1000
     }
   }
   ```

---

## No Comments Posted

### Symptom
Function runs successfully, but no comments appear on PR.

### Diagnosis

Check function logs for:
```
Review completed successfully
```

If present, but still no comments:

### Possible Causes

#### 1. All Files Excluded

**Check**: Look for log message:
```
All changed files are excluded from review
```

**Solution**: Review `excludedFiles` in `config.json`
```json
{
  "review": {
    "excludedFiles": [
      // Remove patterns that are too broad
    ]
  }
}
```

#### 2. PAT Lacks Write Permission

**Solution**: Create new PAT with "Pull Request Threads (Read & Write)"

#### 3. PR Already Has Comments

**Issue**: Duplicate prevention logic (if implemented)

**Solution**: Create a new test PR

#### 4. OpenAI Returns Empty Response

**Check logs** for:
```
No response from OpenAI
```

**Solution**: 
- Verify OpenAI API key
- Check diff isn't empty
- Test with different PR

---

## Timeout Errors

### Symptom
Function execution times out after 5 minutes (or configured timeout).

### Solutions

#### 1. Increase Timeout (Consumption Plan)

Edit `host.json`:
```json
{
  "functionTimeout": "00:10:00"
}
```

⚠️ Note: Max 10 minutes on Consumption plan

#### 2. Upgrade to Premium Plan

```bash
az functionapp plan create \
  --name pr-reviewer-premium \
  --resource-group pr-reviewer-rg \
  --sku EP1

az functionapp update \
  --name pr-reviewer-func \
  --resource-group pr-reviewer-rg \
  --plan pr-reviewer-premium
```

Benefits:
- No timeout limit
- Faster cold starts
- More memory

#### 3. Optimize Processing

**Reduce files reviewed**:
```json
{
  "review": {
    "excludedFiles": [
      "**/tests/**",
      "**/*.test.ts",
      "**/docs/**"
    ]
  }
}
```

**Use faster model**:
```json
{
  "openai": {
    "model": "gpt-3.5-turbo",
    "maxTokens": 1000
  }
}
```

#### 4. Process Files in Parallel

Modify `src/review-service.ts` to use Promise.all():

```typescript
// Instead of sequential processing
for (const change of filesToReview) {
  await reviewFile(change);
}

// Use parallel processing
await Promise.all(
  filesToReview.map(change => reviewFile(change))
);
```

---

## Build Errors

### Error: "Cannot find module '@azure/functions'"

**Solution**:
```bash
npm install
npm run build
```

### Error: "TS2305: Module '@azure/functions' has no exported member 'Context'"

**Cause**: Using old v3 code with v4 package

**Solution**: Code already updated to v4 API. Ensure you're using latest code:
```bash
git pull
npm install
npm run build
```

### Error: TypeScript compilation errors

**Solution**:
```bash
# Clean build
rm -rf dist node_modules package-lock.json
npm install
npm run build
```

---

## Deployment Issues

### Error: "Storage account not found"

**Solution**:
```bash
# Create storage account
az storage account create \
  --name prreviewerstorage \
  --resource-group pr-reviewer-rg \
  --location eastus \
  --sku Standard_LRS
```

### Error: "Function app name already exists"

**Solution**: Choose a different unique name:
```bash
az functionapp create \
  --name pr-reviewer-func-<yourname> \
  ...
```

### Error: "Unable to upload deployment package"

**Solutions**:

1. **Check file size** (limit: 2GB):
   ```bash
   # Create optimized zip
   npm run build
   cd dist
   zip -r ../deploy.zip .
   cd ..
   ```

2. **Use deployment from ZIP**:
   ```bash
   az functionapp deployment source config-zip \
     --resource-group pr-reviewer-rg \
     --name pr-reviewer-func \
     --src deploy.zip
   ```

---

## Getting Help

### Check Logs

**Local**:
```bash
npm start
# Logs appear in console
```

**Azure**:
```bash
# Stream logs
func azure functionapp logstream pr-reviewer-func

# Or download
az webapp log download \
  --resource-group pr-reviewer-rg \
  --name pr-reviewer-func
```

### Enable Detailed Logging

In `host.json`:
```json
{
  "logging": {
    "logLevel": {
      "default": "Debug"
    }
  }
}
```

### Test Components Individually

**Test DevOps API**:
```bash
curl -X GET \
  "https://dev.azure.com/YOUR_ORG/YOUR_PROJECT/_apis/git/repositories?api-version=7.0" \
  -H "Authorization: Basic $(echo -n :YOUR_PAT | base64)"
```

**Test OpenAI API**:
```bash
curl -X POST \
  "https://api.openai.com/v1/chat/completions" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-3.5-turbo",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 50
  }'
```

### Community Support

1. **Check existing issues**: [GitHub Issues](https://github.com/your-repo/issues)
2. **Create new issue** with:
   - Clear description
   - Steps to reproduce
   - Error messages
   - Environment details
   - Relevant logs

### Professional Support

- Azure Support: https://azure.microsoft.com/support/
- Azure DevOps Support: https://developercommunity.visualstudio.com/
- OpenAI Support: https://help.openai.com/

---

## Diagnostic Checklist

Use this checklist to diagnose issues:

- [ ] Function app is running (not stopped)
- [ ] Latest code is deployed
- [ ] All environment variables are set
- [ ] PAT is valid and has correct permissions
- [ ] OpenAI API key is valid and has credits
- [ ] Service Hook is configured correctly
- [ ] Webhook delivery shows success (200 OK)
- [ ] Function logs show execution
- [ ] No errors in Application Insights
- [ ] Config.json is valid JSON
- [ ] Build completed successfully
- [ ] Network connectivity is working

If all checked and still not working, enable debug logging and collect logs for support.
