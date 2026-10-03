import { z } from "zod";

export const projectNameSchema = z.string()
  .transform(name => name.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "请输入测评名称").max(120, "测评名称不能超过 120 个字符"));
