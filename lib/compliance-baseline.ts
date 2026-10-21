// Behaviour that a product is required to show by law or platform rules is a
// usage condition for readers, never a product defect. Shared by protocol,
// findings, story planning and writing so each stage applies the same boundary.
export const complianceBaselineVersion = "compliance-baseline.v1";

export const complianceBaselineRules = `合规基线：以下行为是法规或平台强制要求，不是产品缺陷。
- AI 生成的图片、视频、音频按《人工智能生成合成内容标识办法》（2025-09-01 施行）须带显式标识，下载和导出的文件也要带；用户可按平台协议申请无显式标识版本，但发布时仍须声明是 AI 生成，且不得恶意删除标识。
- 医疗、法律、金融类回答里的风险提示或免责声明，同样属于合规要求。
设计测试时，不把“不得出现平台生成标识/水印”这类与合规冲突的要求写成成功标准；可以改测标识是否影响画面使用、无标识版本怎么申请。
提炼发现和写文章时，合规标识不归入问题或缺点，不扣分，不作为文章主线；需要时用一句话作为使用须知说明，不写成“需要开会员去掉”。`;
