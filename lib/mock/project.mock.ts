import type { BenchmarkProjectRecord, ProjectDraft } from "@/lib/types/project";

export const MOCK_PROJECT_ID = "demo";

export const mockProjectRecord: BenchmarkProjectRecord = {
  id: "demo",
  name: "AI PPT 产品横向测评",
  status: "testing",
  createdAt: "2026-08-12",
  updatedAt: "2026-08-14",
  intent: "我想知道哪款 AI PPT 最适合没有设计经验的产品经理快速制作商业汇报。",
  products: [
    { id: "gamma", name: "Gamma", officialUrl: "https://gamma.app", initials: "G", color: "bg-blue-600" },
    { id: "canva", name: "Canva", officialUrl: "https://canva.com", initials: "C", color: "bg-slate-700" },
    { id: "beautiful", name: "Beautiful.ai", officialUrl: "https://beautiful.ai", initials: "B", color: "bg-slate-400" },
  ],
};

export const mockNewProjectDraft: ProjectDraft = {
  name: mockProjectRecord.name,
  intent: mockProjectRecord.intent,
  products: mockProjectRecord.products.map(({ name, officialUrl }) => ({ name, officialUrl })),
};

export const mockWorkflow = [
  { label: "产品调研", href: "/projects/demo/research" },
  { label: "测评方案", href: "/projects/demo/protocol" },
  { label: "测试执行", href: "/projects/demo/test" },
  { label: "盲评", href: "/projects/demo/review" },
  { label: "结果", href: "/projects/demo/results" },
  { label: "报告", href: "/projects/demo/report" },
  { label: "发布包", href: "/projects/demo/publish" },
];
