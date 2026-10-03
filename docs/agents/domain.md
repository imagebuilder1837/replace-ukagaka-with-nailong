# Domain Docs

## 布局

采用 single-context：
- 根目录 `CONTEXT.md`：领域术语和上下文。
- `docs/adr/`：架构决策。

## 阅读规则

探索代码前，读取 `CONTEXT.md` 及与任务相关的 ADR。

文件不存在时静默继续，不主动建议补建；
由 domain-modeling skill 在术语或决策明确后按需创建。

命名领域概念时使用 CONTEXT.md 中的术语，避免已明确排除的同义词。
需要的概念尚未定义时，先判断是否偏离现有领域语言；
确有缺口则留给 domain-modeling 处理。

输出与已有 ADR 冲突时，明确指出冲突及重新讨论的理由。
