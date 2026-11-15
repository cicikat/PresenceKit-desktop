# 57 失败后历史尾注兼容补漏

主工单见手机仓 cc-tasks/57-failed-message-and-send-feedback.md。

- [x] 兼容紧贴 > 的 speaker 尾注、空正文尾注及尾部空行，保留普通引用。验收：chatHistory 单测先红后绿及构建。

证据：新用例修复前失败，修复后13文件81项通过；TypeScript/Vite构建通过。不改网络、鉴权、重试、消息身份或设置；普通正文引用保留。真实安装包与线上验收未运行。
