// Synthetic writing fixtures, not real product tests or publishable evidence.
export const productId = '11111111-1111-4111-8111-111111111111';
export const testCaseId = '22222222-2222-4222-8222-222222222222';
export const artifactId = '33333333-3333-4333-8333-333333333333';
const finding = (id, category, title, observation, impact) => ({ id, productId, testCaseId, category, title, observation, impact, evidenceArtifactIds: [artifactId], confidence: 0.9 });

export const sceneFindings = [
  finding('scene-light', 'good', '镜前画面层次清楚', '镜前人物、前景珠串和后台走廊同时保留，人物的脸没有被前景遮住。', '这个画面可以作为片段开头。'),
  finding('scene-route', 'problem', '侧方上台路线偏离', '要求人物从侧方上台，生成片段里人物直接走向了舞台正面。', '这个长动作镜头不能直接接进原先的分镜。'),
  finding('scene-short', 'good', '转身短镜头完成动作', '只要求人物转身时，片段里人物完成转身，衣服颜色没有变化。', '这次单动作片段可以保留。'),
];
export const dimensionFindings = [
  finding('dimension-space', 'good', '场景层次', '桌子在前、人物在中间、窗户在后方，三者的位置在片段中没有交换。', '空间关系可以保持。'),
  finding('dimension-motion', 'problem', '动作衔接', '挥剑之后直接切到倒地，片段里没有保留剑与身体接触的过程。', '剪辑时需要补接触镜头。'),
  finding('dimension-identity', 'neutral', '人物外观', '近景中衣服颜色保持一致，转到远景后袖口的花纹消失。', '远近景拼接时需要检查服装细节。'),
];
export const reviewPassed = { concreteScenes: true, boundedInterpretation: true, nonRepetitive: true, usefulConclusion: true, issues: [] };
export function planFor(findings) {
  return {
    centralQuestion: '这些片段能直接接进成片吗？', targetReader: '制作短片的创作者', testScope: '仅本次存档片段，不含多轮成功率或成本统计',
    coreConclusion: '有些镜头可以保留，复杂动作仍需检查。', openingAngle: '一个镜头能否留下，取决于具体动作有没有完成。', closingTakeaway: '先保留通过检查的镜头，再考虑拆分复杂动作。',
    highlights: findings.filter(f => f.category === 'good').map(f => f.observation), neutralPoints: findings.filter(f => f.category === 'neutral').map(f => f.observation), painPoints: findings.filter(f => f.category === 'problem').map(f => f.observation),
    structure: ['先说结论', ...findings.map(f => f.title), '适用边界'], avoidClaims: ['未统计成功率', '未测试其他版本', '未验证模型内部机制'], materialGaps: ['没有复试数据，拆分建议尚未验证'], personalRating: { enabled: false },
    sections: findings.map(f => ({ heading: f.title, findingIds: [f.id], evidenceArtifactIds: f.evidenceArtifactIds, observationQuote: f.observation, readerBenefit: f.impact, boundary: '只适用于本次片段', advice: f.category === 'problem' ? { kind: 'suggestion', text: '可以尝试把动作拆成短镜头，但本次没有验证效果。', supportingFindingIds: [f.id] } : null })),
  };
}
export function postFor(findings) {
  const plan = planFor(findings);
  return {
    title: '视频片段测试：哪些镜头可以留下',
    body: [plan.openingAngle, '先说结论\n' + plan.coreConclusion, ...plan.sections.map((s, i) => `## ${String(i + 1).padStart(2, '0')} ${s.heading}\n\n${s.observationQuote}${s.readerBenefit}${s.advice?.text ?? ''}`), '适用边界\n' + plan.closingTakeaway].join('\n\n'),
    tags: ['视频创作'], interactionQuestion: '', editorialPlan: plan, articleReview: reviewPassed,
    factCheck: { status: 'passed', revisedClaimCount: 0, notes: [] }, screenshotRecommendations: [],
  };
}
