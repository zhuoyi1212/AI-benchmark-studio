import type { ProductResearch } from "@/lib/types/research";

export type ProtocolInputConstraints = {
  maxPromptCharacters: number | null;
  supportsFileUpload: boolean;
  productConstraints: Array<{
    productId: string;
    productName: string;
    maxPromptCharacters: number | null;
    supportsFileUpload: boolean;
  }>;
};

export type ProtocolFeasibilityIssue = {
  testCaseIndex: number;
  code: "prompt_too_long" | "file_upload_unsupported";
  message: string;
};

type FeasibilityTestCase = {
  prompt: string;
  inputArtifacts?: Array<unknown>;
};

const fileFormatPattern = /(?:文件|附件|上传|导入|pdf|docx?|txt|csv|markdown|表格|演示文稿|图片|image|document|file|spreadsheet)/i;
const noFileUploadPattern = /(?:不支持|无法|不能|不可|暂不支持|没有).{0,10}(?:上传|导入).{0,6}(?:文件|附件|文档)|(?:文件|附件|文档).{0,8}(?:不支持|无法|不能|不可).{0,6}(?:上传|导入)/i;

export function deriveProtocolInputConstraints(products: ProductResearch[]): ProtocolInputConstraints {
  const productConstraints = products.map((product) => {
    const researchText = [
      ...(product.limitations ?? []),
      ...(product.officialBestPractices ?? []),
      ...product.inputFormats,
      ...product.capabilities,
      ...product.keyFeatures,
    ].join("\n");
    const maxPromptCharacters = extractPromptCharacterLimit(researchText);
    const explicitlyRejectsFiles = noFileUploadPattern.test(researchText);
    const explicitlySupportsFiles = product.inputFormats.some((format) => fileFormatPattern.test(format))
      || [...product.capabilities, ...product.keyFeatures].some((value) => /(?:上传|导入).{0,6}(?:文件|附件|文档)|(?:文件|附件|文档).{0,6}(?:上传|导入)/i.test(value));
    return {
      productId: product.productId,
      productName: product.name,
      maxPromptCharacters,
      // Unknown support is treated conservatively. A protocol must not require a
      // file unless every tested product was researched as accepting one.
      supportsFileUpload: !explicitlyRejectsFiles && explicitlySupportsFiles,
    };
  });
  const knownLimits = productConstraints
    .map((constraint) => constraint.maxPromptCharacters)
    .filter((limit): limit is number => limit !== null);
  return {
    maxPromptCharacters: knownLimits.length ? Math.min(...knownLimits) : null,
    supportsFileUpload: productConstraints.length > 0 && productConstraints.every((constraint) => constraint.supportsFileUpload),
    productConstraints,
  };
}

export function validateProtocolFeasibility(
  testCases: FeasibilityTestCase[],
  constraints: ProtocolInputConstraints,
): ProtocolFeasibilityIssue[] {
  return testCases.flatMap((testCase, testCaseIndex) => {
    const issues: ProtocolFeasibilityIssue[] = [];
    if (constraints.maxPromptCharacters !== null && countCharacters(testCase.prompt) > constraints.maxPromptCharacters) {
      issues.push({
        testCaseIndex,
        code: "prompt_too_long",
        message: `Prompt 共 ${countCharacters(testCase.prompt)} 字符，超过产品可输入的 ${constraints.maxPromptCharacters} 字符上限`,
      });
    }
    if ((testCase.inputArtifacts?.length ?? 0) > 0 && !constraints.supportsFileUpload) {
      issues.push({
        testCaseIndex,
        code: "file_upload_unsupported",
        message: "任务要求上传文件，但并非所有被测产品都支持文件上传",
      });
    }
    return issues;
  });
}

function extractPromptCharacterLimit(text: string): number | null {
  const candidates: number[] = [];
  const patterns = [
    /(?:提示词|prompt|输入|单次消息|消息)[^。；\n]{0,40}?(?:上限|最多|限制(?:为|在)?|不得超过|不能超过|不超过|少于|以内)?[^\d\n]{0,12}(\d{2,7})\s*(?:个)?(?:汉字|中文字|中文字符|字符|字)/gi,
    /(?:上限|最多|不得超过|不能超过|不超过|少于|以内)[^。；\n]{0,20}?(\d{2,7})\s*(?:个)?(?:汉字|中文字|中文字符|字符|字)[^。；\n]{0,30}?(?:提示词|prompt|输入|单次消息|消息)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = Number(match[1]);
      if (Number.isInteger(value) && value > 0) candidates.push(value);
    }
  }
  return candidates.length ? Math.min(...candidates) : null;
}

function countCharacters(value: string) {
  return Array.from(value).length;
}
