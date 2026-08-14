# 更新日志

`@rebornix/lean` 的所有重要变更都记录在此文件中。

本文档格式基于[维护更新日志](https://keepachangelog.com/zh-CN/1.1.0/)，
并且本项目遵循[语义化版本](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [未发布]

### 新增

- 首次公开发布。支持身份验证（`auth login` / `status` / `logout`）、
  issue 管理（`list` / `view` / `create` / `edit` / `close` / `comment`）、
  原始 GraphQL 备用接口（`api`）以及受 token 预算限制的功能发现（`usage`）。
- Agent 模式下的结构化 JSON 错误，包含稳定的错误标识符和退出码
  （1 用户错误、2 身份验证错误、3 网络错误、4 内部错误）。
- `issue list` 默认使用 `@me`；可通过 `--all` 选择退出此默认行为。
- 针对 Linear 模拟器分支运行的 48 个可执行文档测试。
- ESLint v9 与 Prettier 3，配置与 `linear/linear` 单体仓库保持一致。
