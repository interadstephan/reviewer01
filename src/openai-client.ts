import OpenAI from "openai";
import config from "../config.json";

export interface CodeReviewResult {
  summary: string;
  comments: Array<{
    filePath: string;
    lineNumber?: number;
    comment: string;
    severity: "info" | "warning" | "critical";
  }>;
}

export class OpenAIClient {
  private client: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(apiKey: string) {
    this.client = new OpenAI({
      apiKey: apiKey,
    });

    this.model = config.openai.model || "gpt-4";
    this.maxTokens = config.openai.maxTokens || 2000;
    this.temperature = config.openai.temperature || 0.3;
  }

  /**
   * Analyze code changes using OpenAI
   */
  async analyzeCode(
    filePath: string,
    diff: string,
    changeType: string
  ): Promise<CodeReviewResult> {
    try {
      const reviewDepth = config.review.depth || "detailed";
      const reviewTone = config.review.tone || "constructive";
      const focusAreas = config.review.focusAreas || [];

      const systemPrompt = `You are an expert code reviewer. Your task is to review code changes and provide ${reviewDepth} feedback in a ${reviewTone} tone.

Focus on the following areas: ${focusAreas.join(", ")}.

Provide your review in the following JSON format:
{
  "summary": "Brief overall assessment of the changes",
  "comments": [
    {
      "filePath": "path/to/file",
      "lineNumber": 10,
      "comment": "Your specific feedback",
      "severity": "info|warning|critical"
    }
  ]
}

Rules:
- Be specific and actionable in your feedback
- Focus on significant issues rather than style preferences
- Highlight security vulnerabilities and performance issues
- Suggest improvements where applicable
- Keep comments concise and professional
- If the code is good, acknowledge it
- Limit to maximum ${config.review.maxComments || 10} comments per file`;

      const userPrompt = `Review the following code changes:

File: ${filePath}
Change Type: ${changeType}

Diff:
${diff}

Provide your code review in the specified JSON format.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error("No response from OpenAI");
      }

      const result: CodeReviewResult = JSON.parse(content);

      // Ensure filePath is set for all comments
      result.comments = result.comments.map((comment) => ({
        ...comment,
        filePath: comment.filePath || filePath,
      }));

      return result;
    } catch (error: any) {
      throw new Error(`Failed to analyze code: ${error.message}`);
    }
  }

  /**
   * Generate a summary review for the entire PR
   */
  async generatePRSummary(
    fileReviews: CodeReviewResult[]
  ): Promise<string> {
    try {
      const allComments = fileReviews.flatMap((review) => review.comments);
      const criticalCount = allComments.filter(
        (c) => c.severity === "critical"
      ).length;
      const warningCount = allComments.filter(
        (c) => c.severity === "warning"
      ).length;
      const infoCount = allComments.filter((c) => c.severity === "info").length;

      const summaries = fileReviews.map((r) => r.summary).join("\n");

      const prompt = `Based on the following individual file reviews, provide a concise overall summary of the pull request:

${summaries}

Statistics:
- Critical issues: ${criticalCount}
- Warnings: ${warningCount}
- Info comments: ${infoCount}

Provide a brief summary (2-3 sentences) highlighting the most important findings.`;

      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: this.temperature,
      });

      return response.choices[0]?.message?.content || "Review completed.";
    } catch (error: any) {
      throw new Error(`Failed to generate PR summary: ${error.message}`);
    }
  }
}
